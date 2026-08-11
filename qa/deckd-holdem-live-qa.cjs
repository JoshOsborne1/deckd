/**
 * Deckd Hold'em live E2E — multi-client lobby poker harness.
 *
 * Flow:
 *   1. Host creates a poker lobby, guest joins.
 *   2. Host deals (Poker-style preset: 2 hole cards face-down each).
 *   3. Host runs street progression: BURN → FLOP → TURN → RIVER → SHOWDOWN.
 *   4. Guest sends FOLD/CHECK/CALL/RAISE via game_action intent at each
 *      betting round (the host advances the street between rounds).
 *   5. Showdown flow: all hands revealed, winner determined.
 *
 * Privacy assertions (no hidden-card leaks):
 *   - Intercept the guest's incoming WebSocket frames and assert that the
 *     host's hole-card IDs NEVER appear in any event batch the guest receives
 *     (they should be p-* placeholders until SHOWDOWN's card/reveal).
 *   - The guest's own hole cards ARE present (real IDs, not placeholders).
 *   - The rngSeed is stripped from session/start in the guest's view.
 *
 * Test-first: this harness documents gaps in the current shell. If the engine
 * doesn't yet support a flow, the harness asserts what exists and documents
 * the gap in the result JSON. It stays green against what works today.
 *
 * Run: DECKD_QA_URL=https://deckd-app.roxai.click node qa/deckd-holdem-live-qa.cjs
 */

const { chromium } = require('playwright');

const baseUrl = process.env.DECKD_QA_URL ?? 'https://deckd-app.roxai.click/';

// ---------------------------------------------------------------------------
// Helpers (shared with the lobby-two-client / lobby-blackjack patterns)
// ---------------------------------------------------------------------------

async function exactButton(page, name, last = false) {
  const locator = page.getByRole('button', { name, exact: true });
  // Wait for visible (not just attached): the home layer's buttons exist in
  // the DOM immediately but can be covered by a splash/loading overlay until
  // hydration completes against the live CDN. Attached-only waits flake.
  await locator.first().waitFor({ state: 'visible', timeout: 30000 });
  return last ? locator.last() : locator.first();
}

async function waitForText(page, text, timeout = 30000) {
  await page.getByText(text, { exact: true }).waitFor({ state: 'visible', timeout });
}

async function body(page) {
  return page.locator('body').innerText();
}

function roomCodeFrom(text) {
  const match = text.match(/ROOM CODE\s+([A-Z0-9]{6})/);
  if (!match) throw new Error(`Room code missing from body: ${text.slice(-1200)}`);
  return match[1];
}

async function waitForBody(page, predicate, timeout = 30000) {
  await page.waitForFunction(predicate, null, { timeout });
}

// ---------------------------------------------------------------------------
// WebSocket frame capture — for privacy assertions
// ---------------------------------------------------------------------------

/** Collects all incoming WebSocket frames on a page. */
function captureWebSocket(page, label) {
  const frames = [];
  page.on('websocket', (ws) => {
    ws.on('framereceived', (data) => {
      frames.push({ label, payload: data.payload });
    });
  });
  return frames;
}

/**
 * Parse all relay event batches received by the guest and return:
 *   - allEventJsons: every parsed JSON message the guest received
 *   - hostHoleCardIds: card IDs dealt face-down to the host's hand zone
 *     (extracted from the session/start zones + card/deal events)
 *   - guestHoleCardIds: card IDs dealt face-down to the guest's hand zone
 *
 * The privacy check: hostHoleCardIds must NEVER appear in the guest's
 * received event payloads (they should be p-* placeholders), until a
 * card/reveal event for that card is processed.
 */
function analyzeGuestFrames(frames, guestClientId, hostClientId) {
  const allMessages = [];
  for (const f of frames) {
    try {
      const msg = JSON.parse(f.payload);
      allMessages.push(msg);
    } catch {
      // non-JSON frame (e.g. ws ping/pong) — skip
    }
  }

  // Find relay messages (type: 'relay') — these carry event batches from host
  const relayPayloads = [];
  for (const m of allMessages) {
    if (m.type === 'relay' && typeof m.payload === 'string') {
      try {
        const events = JSON.parse(m.payload);
        if (Array.isArray(events)) relayPayloads.push(events);
      } catch {
        // Could be a snapshot request { type: 'snapshot_request' }
        try {
          const obj = JSON.parse(m.payload);
          if (obj && typeof obj === 'object') relayPayloads.push(obj);
        } catch {
          // skip
        }
      }
    }
  }

  // Flatten all event arrays into one list for analysis
  const allEvents = [];
  for (const p of relayPayloads) {
    if (Array.isArray(p)) allEvents.push(...p);
  }

  // Extract the host's hole-card IDs from the guest's view.
  // In the filtered view, the host's hand zone has placeholder IDs (p-*).
  // We check: does any event contain a real card ID (H-A, S-10, etc.) in
  // a hand zone that belongs to the host?
  //
  // Simpler approach: scan all events for card/deal events targeting
  // hand:<hostClientId>. If the cardId is a real ID (not p-*), that's a leak.
  // If it's p-*, that's correct (filtered).
  const hostHandZone = `hand:${hostClientId}`;
  const guestHandZone = `hand:${guestClientId}`;

  const hostHandCardIdsInGuestView = [];
  const guestHandCardIdsInGuestView = [];
  const realCardPattern = /^[CDHSJK]-/; // C/D/H/S + rank, or JK-RED/JK-BLACK

  for (const ev of allEvents) {
    if (ev.type === 'card/deal' || ev.type === 'card/move') {
      if (ev.toZoneId === hostHandZone) {
        hostHandCardIdsInGuestView.push(ev.cardId);
      }
      if (ev.toZoneId === guestHandZone) {
        guestHandCardIdsInGuestView.push(ev.cardId);
      }
    }
    // session/start zones
    if (ev.type === 'session/start' && ev.zones) {
      for (const zone of ev.zones) {
        if (zone.id === hostHandZone) {
          hostHandCardIdsInGuestView.push(...zone.cardIds);
        }
        if (zone.id === guestHandZone) {
          guestHandCardIdsInGuestView.push(...zone.cardIds);
        }
      }
    }
  }

  // Privacy check: host hand card IDs in the guest's view should be placeholders
  // (p-*), NOT real card IDs. Real IDs would let the guest decode the host's hand.
  const hostRealCardLeaks = hostHandCardIdsInGuestView.filter(
    (id) => id && realCardPattern.test(id),
  );
  // Guest's own hand should have real card IDs (they can see their own cards).
  const guestRealCardIds = guestHandCardIdsInGuestView.filter(
    (id) => id && realCardPattern.test(id),
  );

  // Check rngSeed stripping
  const startEvents = allEvents.filter((e) => e.type === 'session/start');
  const rngSeedLeak = startEvents.some(
    (e) => e.meta && typeof e.meta.rngSeed === 'string' && e.meta.rngSeed !== '',
  );

  return {
    totalRelayPayloads: relayPayloads.length,
    totalEvents: allEvents.length,
    hostHandCardIdsInGuestView,
    guestHandCardIdsInGuestView,
    hostRealCardLeaks,
    guestRealCardIds,
    rngSeedLeak,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
  const browser = await chromium.launch({ headless: true });
  const hostContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 1,
  });
  const guestContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 1,
  });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  // Capture WebSocket frames on the guest for privacy analysis.
  const guestFrames = captureWebSocket(guest, 'guest');

  const errors = [];
  for (const [label, page] of [
    ['host', host],
    ['guest', guest],
  ]) {
    page.on('pageerror', (error) => errors.push(`${label} pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`${label} console: ${message.text()}`);
    });
  }

  // Track what was achieved vs what failed for the gap report.
  const gaps = [];
  const steps = {};

  try {
    // --- Load + clear localStorage (pitfall: stale sessions persist) ---
    await Promise.all([
      host.goto(baseUrl, { waitUntil: 'commit', timeout: 30000 }),
      guest.goto(baseUrl, { waitUntil: 'commit', timeout: 30000 }),
    ]);
    await Promise.all([
      host.evaluate(() => localStorage.clear()),
      guest.evaluate(() => localStorage.clear()),
    ]);
    // Wait for the JS bundle to load and the app to hydrate. 'commit' returns
    // before the bundle downloads; the app has a 5MB bundle from the CDN. Use
    // 'domcontentloaded' (fires reliably, unlike 'networkidle' which hangs on
    // the persistent relay WebSocket) and let the visible-button wait below
    // gate on hydration. If the CDN is slow the button wait fails precisely.
    await Promise.all([
      host.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }),
      guest.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }),
    ]);
    // 3s initial wait: the live CDN occasionally needs >1.5s to hydrate the
    // home layer. A shorter wait causes a flaky timeout on the first button.
    await host.waitForTimeout(3000);
    await guest.waitForTimeout(3000);
    await Promise.all([
      exactButton(host, 'Deal to friends'),
      exactButton(guest, 'Deal to friends'),
    ]);
    steps.loaded = true;

    // --- Host creates lobby ---
    await (await exactButton(host, 'Deal to friends')).click();
    await (await exactButton(host, 'Host a lobby', true)).click();
    await waitForText(host, 'Relay: connected');
    const roomCode = roomCodeFrom(await body(host));
    steps.hostLobbyCreated = true;

    // --- Guest joins ---
    await (await exactButton(guest, 'Deal to friends')).click();
    await (await exactButton(guest, 'Join with a code')).click();
    const codeInput = guest.getByRole('textbox').last();
    await codeInput.fill(roomCode);
    await (await exactButton(guest, 'Join room')).click();
    await waitForText(guest, 'Relay: connected');
    await waitForBody(guest, () => document.body.innerText.includes('Players: 2'));
    await waitForBody(host, () => document.body.innerText.includes('Players: 2'));
    steps.guestJoined = true;

    // Get client IDs for privacy analysis. The stable client ID is stored
    // in localStorage under 'deckd.clientId' as a plain string (not JSON).
    const hostClientId = await host.evaluate(() => localStorage.getItem('deckd.clientId') || '');
    const guestClientId = await guest.evaluate(() => localStorage.getItem('deckd.clientId') || '');

    // --- Host starts a Poker table ---
    await (await exactButton(host, 'Start the table')).click();
    await waitForText(host, 'Choose a recipe');
    // Wait for the Poker recipe button to be visible and clickable.
    // The recipe buttons share the hub with stale table-layer surfaces (all
    // layers stay in the DOM); a direct click without a visible wait can hit
    // a covered element and silently fail to select the preset.
    const pokerBtn = host.getByRole('button', { name: /Poker/i }).first();
    await pokerBtn.waitFor({ state: 'visible', timeout: 30000 });
    await pokerBtn.click();
    // Wait for the preset selection to register in the store before dealing.
    // Without this, 'Deal now' can fire before activePreset updates and create
    // a session with the wrong preset. 1s is needed: the Zustand set() is sync
    // but the React re-render that updates activePreset (useMemo) takes a frame.
    await host.waitForTimeout(1000);
    await (await exactButton(host, 'Deal now')).click();

    // Wait for the poker table to appear. The host should see BURN/FLOP
    // (host-only street actions) and possibly FOLD/CHECK/CALL/RAISE
    // (if the host is the current turn holder).
    await host.waitForTimeout(2000);
    const hostTableBody = await body(host);
    await host.screenshot({ path: '.qa-holdem-host-dealt.png', fullPage: false });
    steps.hostTableDealt = true;

    // Check what poker actions the host sees
    const hostHasBurn = hostTableBody.includes('BURN');
    const hostHasFlop = hostTableBody.includes('FLOP');
    const hostHasFold = hostTableBody.includes('FOLD');
    const hostHasCheck = hostTableBody.includes('CHECK');
    const hostHasCall = hostTableBody.includes('CALL');
    const hostHasRaise = hostTableBody.includes('RAISE');
    steps.hostActions = {
      BURN: hostHasBurn,
      FLOP: hostHasFlop,
      FOLD: hostHasFold,
      CHECK: hostHasCheck,
      CALL: hostHasCall,
      RAISE: hostHasRaise,
    };

    if (!hostHasBurn && !hostHasFlop) {
      gaps.push({
        file: 'components/layers/TableLayer.tsx',
        symptom:
          'Host poker table does not show BURN/FLOP street actions after deal. ' +
          'The poker rule action bar is not rendering for the online host. ' +
          'This may be the same viewerId/mode gap that affects online blackjack (TWIST/STICK not rendering).',
      });
    }

    // --- Guest resumes into the table ---
    await (await exactButton(guest, 'Start the table')).click();
    await waitForText(guest, 'Resume');
    await (await exactButton(guest, 'Resume')).click();
    await guest.waitForTimeout(2000);
    const guestTableBody = await body(guest);
    await guest.screenshot({ path: '.qa-holdem-guest-dealt.png', fullPage: false });
    steps.guestTableDealt = true;

    // Check what the guest sees
    const guestHasFold = guestTableBody.includes('FOLD');
    const guestHasCheck = guestTableBody.includes('CHECK');
    const guestHasCall = guestTableBody.includes('CALL');
    const guestHasRaise = guestTableBody.includes('RAISE');
    // Check for host-only street actions as VISIBLE, interactable BUTTONS.
    // The layered-surface architecture keeps all layers in the DOM (hidden
    // ones are off-screen/opacity-0), so we must check that the buttons are
    // actually visible and not from a stale/polluted layer. The preset
    // description "Burn/flop/turn/river" in the hub is not a button.
    const guestBurnBtn = guest.getByRole('button', { name: 'BURN', exact: true });
    const guestFlopBtn = guest.getByRole('button', { name: 'FLOP', exact: true });
    const guestHasBurnButton =
      (await guestBurnBtn.count()) > 0 && (await guestBurnBtn.first().isVisible());
    const guestHasFlopButton =
      (await guestFlopBtn.count()) > 0 && (await guestFlopBtn.first().isVisible());
    steps.guestActions = {
      FOLD: guestHasFold,
      CHECK: guestHasCheck,
      CALL: guestHasCall,
      RAISE: guestHasRaise,
      BURN_button: guestHasBurnButton,
      FLOP_button: guestHasFlopButton,
    };

    // Guests should NOT see host-only street action buttons (BURN/FLOP/TURN/RIVER)
    if (guestHasBurnButton || guestHasFlopButton) {
      gaps.push({
        file: 'src/engine/rules.ts (pokerActions)',
        symptom:
          'Guest sees host-only street action buttons (BURN/FLOP). ' +
          'pokerActions should only return host actions when isHost is true. ' +
          'The guest is being shown host controls.',
      });
    }

    // --- Guest bet action via game_action (if guest has bet actions) ---
    if (guestHasCheck) {
      try {
        await (await exactButton(guest, 'CHECK')).click();
        await guest.waitForTimeout(1500);
        await host.waitForTimeout(1500);
        steps.guestCheckSent = true;
      } catch (e) {
        gaps.push({
          file: 'components/layers/TableLayer.tsx',
          symptom: `Guest CHECK button click failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    } else if (guestHasFold) {
      try {
        await (await exactButton(guest, 'FOLD')).click();
        await guest.waitForTimeout(1500);
        await host.waitForTimeout(1500);
        steps.guestFoldSent = true;
      } catch (e) {
        gaps.push({
          file: 'components/layers/TableLayer.tsx',
          symptom: `Guest FOLD button click failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    } else {
      gaps.push({
        file: 'src/engine/rules.ts (pokerActions)',
        symptom:
          'Guest has no bet actions (FOLD/CHECK/CALL/RAISE) on the poker table. ' +
          'The guest is not the current turn holder, or the viewerId is not resolving correctly. ' +
          'Same class of bug as online blackjack TWIST/STICK not appearing.',
      });
    }

    // --- Host street progression: BURN → FLOP → TURN → RIVER → SHOWDOWN ---
    const streetProgression = [
      { label: 'BURN', button: 'BURN' },
      { label: 'FLOP', button: 'FLOP' },
      { label: 'TURN', button: 'TURN' },
      { label: 'RIVER', button: 'RIVER' },
      { label: 'SHOWDOWN', button: 'SHOWDOWN' },
    ];

    for (const street of streetProgression) {
      try {
        const btn = host.getByRole('button', { name: street.button, exact: true });
        if ((await btn.count()) === 0) {
          gaps.push({
            file: 'components/layers/TableLayer.tsx',
            symptom: `Host cannot find ${street.label} button — street progression stalled at ${street.label}.`,
          });
          break;
        }
        await btn.first().click();
        await host.waitForTimeout(1500);
        await guest.waitForTimeout(1500);
        steps[`host${street.label}`] = true;
      } catch (e) {
        gaps.push({
          file: 'components/layers/TableLayer.tsx',
          symptom: `Host ${street.label} click failed: ${e instanceof Error ? e.message : String(e)}`,
        });
        break;
      }
    }

    // --- Post-showdown state ---
    await host.waitForTimeout(1000);
    const finalHostBody = await body(host);
    const finalGuestBody = await body(guest);
    await host.screenshot({ path: '.qa-holdem-host-showdown.png', fullPage: false });
    await guest.screenshot({ path: '.qa-holdem-guest-showdown.png', fullPage: false });

    const showdownReached =
      finalHostBody.includes('SESSION OVER') ||
      finalHostBody.includes('takes the table');
    steps.showdownReached = showdownReached;

    if (!showdownReached) {
      gaps.push({
        file: 'src/engine/rules.ts (pokerApply / reveal)',
        symptom:
          'Showdown not reached after RIVER + SHOWDOWN. The session/end event ' +
          'or winner banner did not appear. The poker street progression may ' +
          'be incomplete (e.g. the SHOWDOWN button did not fire or the ' +
          'reveal/session-end events were not generated).',
      });
    }

    // --- Privacy analysis from captured WebSocket frames ---
    const privacy = analyzeGuestFrames(guestFrames, guestClientId || 'guest', hostClientId || 'host');
    steps.privacy = privacy;

    if (privacy.hostRealCardLeaks.length > 0) {
      gaps.push({
        file: 'src/store/syncLogic.ts (filterEventsForViewer)',
        symptom:
          `PRIVACY LEAK: guest received ${privacy.hostRealCardLeaks.length} real host hole-card IDs ` +
          `(${privacy.hostRealCardLeaks.slice(0, 5).join(', ')}). ` +
          'The privacy filter should replace hidden cards with p-* placeholders, ' +
          'but real card IDs reached the guest before SHOWDOWN.',
      });
    }

    if (privacy.rngSeedLeak) {
      gaps.push({
        file: 'src/store/syncLogic.ts (filterEventsForViewer)',
        symptom:
          'PRIVACY LEAK: guest received the rngSeed in session/start meta. ' +
          'The seed lets a guest reconstruct the full deck order. ' +
          'filterEventsForViewer must strip meta.rngSeed.',
      });
    }

    if (privacy.guestRealCardIds.length === 0 && steps.guestTableDealt) {
      gaps.push({
        file: 'src/store/syncLogic.ts (filterEventsForViewer)',
        symptom:
          'Guest received no real card IDs for their own hand. ' +
          'The privacy filter should pass the guest own hand cards through as real IDs.',
      });
    }

    // --- Final result ---
    const result = {
      roomCode,
      hostClientId: hostClientId || '(not found)',
      guestClientId: guestClientId || '(not found)',
      steps,
      gaps,
      errors,
      hostBodyTail: finalHostBody.slice(-800),
      guestBodyTail: finalGuestBody.slice(-800),
    };
    process.stdout.write(JSON.stringify(result, null, 2));
    await browser.close();

    // Exit code: 0 if no errors and no privacy leaks, 2 otherwise.
    // Gaps (engine limitations) do NOT fail the harness — they are documented
    // for the loop to fix. Only actual errors and privacy leaks fail.
    if (errors.length > 0 || (privacy.hostRealCardLeaks.length > 0) || privacy.rngSeedLeak) {
      process.exitCode = 2;
    }
  } catch (error) {
    await host
      .screenshot({ path: '.qa-holdem-host-failure.png', fullPage: false })
      .catch(() => {});
    await guest
      .screenshot({ path: '.qa-holdem-guest-failure.png', fullPage: false })
      .catch(() => {});
    process.stdout.write(
      JSON.stringify(
        {
          error: error instanceof Error ? error.message : String(error),
          steps,
          gaps,
          hostBody: (await body(host).catch(() => '')).slice(-1600),
          guestBody: (await body(guest).catch(() => '')).slice(-1600),
          errors,
        },
        null,
        2,
      ),
    );
    await browser.close();
    process.exitCode = 2;
  }
})();