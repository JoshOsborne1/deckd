/**
 * Deckd lobby E2E — the three live two-client proof suites merged into one
 * command (Slice 5 consolidation: 6 QA scripts to 2).
 *
 * Runs three sequential phases against the live relay:
 *   1. Deal-2 sync   — host draw broadcasts (guest sees the deck decrement +
 *                      filtered hand counts; from deckd-lobby-two-client).
 *   2. Blackjack     — guest TWISTs via game_action, both sides sync
 *                      (from deckd-lobby-blackjack).
 *   3. Hold'em poker — host street progression BURN → FLOP → TURN → RIVER →
 *                      SHOWDOWN plus WebSocket privacy analysis (no real
 *                      host hole-card IDs or rngSeed reaching the guest;
 *                      from deckd-holdem-live).
 *
 * Usage: node qa/deckd-lobby-e2e.cjs
 * Optional: DECKD_QA_URL=http://127.0.0.1:8085 (default public)
 *
 * Exit 0 = every phase passed. Exit 2 = any phase hard-failed (JS errors,
 * privacy leaks, or a missing core assertion). Poker gaps (engine
 * limitations) are documented per-phase and do NOT fail the run — that
 * contract carries over from the holdem suite.
 */
const { chromium } = require('playwright');

const baseUrl = process.env.DECKD_QA_URL ?? 'https://deckd-app.roxai.click/';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function exactButton(page, name, last = false) {
  const locator = page.getByRole('button', { name, exact: true });
  // Wait for visible (not just attached): the home layer's buttons exist in
  // the DOM immediately but can be covered by a splash/loading overlay until
  // hydration completes against the live CDN. Attached-only waits flake.
  await locator.first().waitFor({ state: 'visible', timeout: 30000 });
  return last ? locator.last() : locator.first();
}

/** True-visible text gate: zero-size / hidden / opacity<=0.01 ancestors fail. */
async function waitForText(page, text, timeout = 30000) {
  await page.waitForFunction((expected) => [...document.querySelectorAll('*')].some((element) => {
    if (element.childElementCount !== 0) return false;
    if ((element.textContent || '').trim() !== expected) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    let current = element;
    let opacity = 1;
    while (current instanceof HTMLElement) {
      const style = getComputedStyle(current);
      if (style.visibility === 'hidden' || style.display === 'none') return false;
      opacity *= Number(style.opacity);
      if (opacity <= 0.01) return false;
      current = current.parentElement;
    }
    return true;
  }), text, { timeout });
}

async function waitForBody(page, predicate, timeout = 30000, arg = null) {
  await page.waitForFunction(predicate, arg, { timeout });
}

async function body(page) {
  return page.locator('body').innerText();
}

function roomCodeFrom(text) {
  const match = text.match(/ROOM CODE\s+([A-Z0-9]{6})/);
  if (!match) throw new Error(`Room code missing from body: ${text.slice(-1200)}`);
  return match[1];
}

/** Wait until elementFromPoint at the button center resolves INSIDE the
 *  button's own subtree — the only clickable-now proof on layered surfaces.
 *  Returns the first such button locator. */
async function topmostButton(page, ariaPrefix, timeout = 30000) {
  await page.waitForFunction((prefix) => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      (b.getAttribute('aria-label') || '').startsWith(prefix));
    if (!btn) return false;
    const r = btn.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return btn === hit || btn.contains(hit);
  }, ariaPrefix, { timeout });
  return page.locator(`[aria-label^="${ariaPrefix}"]`).first();
}

/** Raw mouse click at the center of a topmost button (Playwright actionability
 *  clicks get intercepted by always-mounted surfaces; force:true would mask
 *  real interception — never use force here). */
async function clickTopmost(page, ariaPrefix, timeout = 30000) {
  const btn = await topmostButton(page, ariaPrefix, timeout);
  const box = await btn.boundingBox();
  if (!box || box.width <= 0 || box.height <= 0) throw new Error(`no usable box for ${ariaPrefix}`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/** Rule-rail buttons (TWIST/STICK/FOLD/CHECK/CALL/RAISE/BURN/FLOP) render
 *  through CardButton with innerText only — no aria-label. Click the first
 *  visible, topmost button whose NORMALIZED innerText matches (visibleButtons
 *  collapses \n + trims to 30 chars, so match the same shape). */
async function clickTopmostText(page, text, timeout = 30000) {
  await page.waitForFunction((t) => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      (b.innerText || '').replace(/\s+/g, ' ').trim() === t);
    if (!btn) return false;
    const r = btn.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return btn === hit || btn.contains(hit);
  }, text, { timeout });
  const box = await page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      (b.innerText || '').replace(/\s+/g, ' ').trim() === t);
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, text);
  if (!box || box.w <= 0 || box.h <= 0) throw new Error(`no usable box for ${text}`);
  await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
}

/** Visible stat pills: 'N CARDS', 'N LEFT', 'HAND N'. The pill text is
 *  split across leaf nodes ('2' + 'CARDS'), so leaf-walking misses counts —
 *  read normalized innerText of any visible container instead. */
async function visibleStats(page) {
  return page.evaluate(() => {
    const out = [];
    const seen = new Set();
    for (const el of [...document.querySelectorAll('div, span')]) {
      const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
      if (!t || t.length > 24) continue;
      if (!/^(\d+ (CARDS|LEFT)|HAND \d+)$/.test(t)) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      let cur = el, op = 1, ok = true;
      while (cur instanceof HTMLElement) {
        const s = getComputedStyle(cur);
        if (s.display === 'none' || s.visibility === 'hidden') { ok = false; break; }
        op *= Number(s.opacity);
        if (op <= 0.1) { ok = false; break; }
        cur = cur.parentElement;
      }
      if (!ok) continue;
      const key = `${t}@${Math.round(r.x)},${Math.round(r.y)}`;
      if (!seen.has(key)) { seen.add(key); out.push(t); }
    }
    return out;
  });
}

/** All visible button labels (aria-label || innerText). */
async function visibleButtons(page) {
  return page.evaluate(() => [...document.querySelectorAll('button')].map((b) => {
    const r = b.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    let el = b;
    let op = 1;
    while (el instanceof HTMLElement) {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') { op = 0; break; }
      op *= Number(s.opacity);
      el = el.parentElement;
    }
    if (op <= 0.1) return null;
    return b.getAttribute('aria-label') || b.innerText.replace(/\n/g, ' ').trim().slice(0, 30);
  }).filter(Boolean));
}

/** Visible leaf text lines (opacity chain > 0.1). */
async function visibleLines(page) {
  return page.evaluate(() => {
    const lines = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const t = (node.textContent || '').trim();
      if (!t || t.length < 2) continue;
      let el = node.parentElement;
      let op = 1;
      let ok = true;
      while (el instanceof HTMLElement) {
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') { ok = false; break; }
        op *= Number(s.opacity);
        if (op <= 0.1) { ok = false; break; }
        el = el.parentElement;
      }
      if (ok) lines.add(t);
    }
    return [...lines];
  });
}

/** Collects all incoming WebSocket frames on a page into `frames`. */
function captureWebSocket(page, label, frames) {
  page.on('websocket', (ws) => {
    ws.on('framereceived', (data) => {
      frames.push({ label, payload: data.payload });
    });
  });
}

/** Privacy analysis of every relay event batch the guest received.
 *  The relay sends batched payloads shaped {kind:'events', batchId,
 *  firstSeq, lastSeq, events:[...]}; the legacy direct-array shape is also
 *  handled for compat. */
function analyzeGuestFrames(frames, guestClientId, hostClientId) {
  const allEvents = [];
  for (const f of frames) {
    let msg;
    try {
      msg = JSON.parse(f.payload);
    } catch {
      continue; // non-JSON frame (ping/pong)
    }
    if (msg.type !== 'relay' || typeof msg.payload !== 'string') continue;
    let payload;
    try {
      payload = JSON.parse(msg.payload);
    } catch {
      continue;
    }
    if (Array.isArray(payload)) {
      allEvents.push(...payload);
    } else if (payload && Array.isArray(payload.events)) {
      allEvents.push(...payload.events);
    }
  }

  const hostHandZone = `hand:${hostClientId}`;
  const guestHandZone = `hand:${guestClientId}`;

  const hostHandCardIdsInGuestView = [];
  const guestHandCardIdsInGuestView = [];
  const realCardPattern = /^[CDHSJK]-/; // C/D/H/S + rank, or JK-RED/JK-BLACK

  for (const ev of allEvents) {
    if (ev.type === 'card/deal' || ev.type === 'card/move') {
      if (ev.toZoneId === hostHandZone) hostHandCardIdsInGuestView.push(ev.cardId);
      if (ev.toZoneId === guestHandZone) guestHandCardIdsInGuestView.push(ev.cardId);
    }
    if (ev.type === 'session/start' && ev.zones) {
      for (const zone of ev.zones) {
        if (zone.id === hostHandZone) hostHandCardIdsInGuestView.push(...zone.cardIds);
        if (zone.id === guestHandZone) guestHandCardIdsInGuestView.push(...zone.cardIds);
      }
    }
  }

  const hostRealCardLeaks = hostHandCardIdsInGuestView.filter(
    (id) => id && realCardPattern.test(id),
  );
  const guestRealCardIds = guestHandCardIdsInGuestView.filter(
    (id) => id && realCardPattern.test(id),
  );

  const startEvents = allEvents.filter((e) => e.type === 'session/start');
  const rngSeedLeak = startEvents.some(
    (e) => e.meta && typeof e.meta.rngSeed === 'string' && e.meta.rngSeed !== '',
  );

  return {
    totalRelayPayloads: allEvents.length,
    hostHandCardIdsInGuestView,
    guestHandCardIdsInGuestView,
    hostRealCardLeaks,
    guestRealCardIds,
    rngSeedLeak,
  };
}

// ---------------------------------------------------------------------------
// Phase scaffolding
// ---------------------------------------------------------------------------

/** Fresh host+guest pages with listeners; localStorage cleared. */
async function makePhasePages(hostCtx, guestCtx, wantFrames) {
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  const errors = [];
  const frames = wantFrames ? [] : null;
  for (const [label, page] of [['host', host], ['guest', guest]]) {
    page.on('pageerror', (error) => errors.push(`${label} pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`${label} console: ${message.text()}`);
    });
  }
  if (wantFrames) captureWebSocket(guest, 'guest', frames);

  // Stale sessions persist in localStorage and make text waits land on the
  // wrong layer ('GAME IN PROGRESS / Resume', 'SESSION OVER' ghosts).
  await Promise.all([
    host.goto(baseUrl, { waitUntil: 'commit', timeout: 30000 }),
    guest.goto(baseUrl, { waitUntil: 'commit', timeout: 30000 }),
  ]);
  await Promise.all([
    host.evaluate(() => localStorage.clear()),
    guest.evaluate(() => localStorage.clear()),
  ]);
  // 'domcontentloaded' fires reliably (networkidle hangs on the persistent
  // relay WebSocket); the visible-button waits below gate on hydration.
  await Promise.all([
    host.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }),
    guest.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }),
  ]);
  await host.waitForTimeout(3000);
  await guest.waitForTimeout(3000);
  // Slice 4f/4g home: the WITH FRIENDS entry is "Host a lobby" directly.
  await Promise.all([
    exactButton(host, 'Host a lobby'),
    exactButton(guest, 'Host a lobby'),
  ]);
  return { host, guest, errors, frames };
}

/** Host creates a lobby, guest joins by code, both see Players: 2. */
async function createLobby(host, guest) {
  // Slice 4f/4g home: the WITH FRIENDS entry is the home "Host a lobby"
  // card, which opens the lobby landing. The room is created by the
  // landing's own primary "Host a lobby" button.
  await (await exactButton(host, 'Host a lobby')).click();
  await waitForBody(host, () => document.body.innerText.includes('Play with friends'));
  await (await exactButton(host, 'Host a lobby', true)).click();
  await waitForText(host, 'Relay: connected');
  const roomCode = roomCodeFrom(await body(host));

  await (await exactButton(guest, 'Host a lobby')).click();
  await waitForBody(guest, () => document.body.innerText.includes('Play with friends'));
  await (await exactButton(guest, 'Join with a code')).click();
  const codeInput = guest.getByRole('textbox').last();
  await codeInput.fill(roomCode);
  await (await exactButton(guest, 'Join room')).click();
  await waitForText(guest, 'Relay: connected');
  await waitForBody(guest, () => document.body.innerText.includes('Players: 2'));
  await waitForBody(host, () => document.body.innerText.includes('Players: 2'));
  return roomCode;
}

/** Host starts a table with the given recipe (aria prefix, e.g. 'Deal 2 each'
 *  or 'Blackjack' or 'Poker') and waits for the play marker (visible text
 *  such as 'PASS TURN' / 'TWIST' / 'POT'). Recipe cards deeper in the list
 *  are scrolled into view first: the hub gates pointer events until its
 *  enter morph completes, so a premature click falls through to a lower
 *  layer and never selects the preset. */
async function startTable(host, ariaPrefix, marker) {
  const err = (m) => process.stderr.write(`[startTable ${ariaPrefix}] ${m}\n`);
  await (await exactButton(host, 'Start the table')).click();
  await waitForText(host, 'Choose a recipe');
  err('hub open');
  const recipeBtn = host.locator(`[aria-label^="${ariaPrefix}"]`).first();
  await recipeBtn.scrollIntoViewIfNeeded();
  err('recipe scrolled into view');
  await clickTopmost(host, ariaPrefix);
  err('recipe clicked');
  // Preset selection must register before 'Deal now' fires, else the store
  // creates a Freeplay session instead (TWIST/STICK missing later).
  await host.waitForTimeout(1000);
  const dealBtn = host.getByRole('button', { name: 'Deal now', exact: true }).last();
  await dealBtn.waitFor({ state: 'visible', timeout: 30000 });
  const dealBox = await dealBtn.boundingBox();
  if (!dealBox || dealBox.width <= 0 || dealBox.height <= 0) {
    throw new Error('Deal now has no usable box');
  }
  err(`deal now at ${Math.round(dealBox.x)},${Math.round(dealBox.y)}`);
  await host.mouse.click(dealBox.x + dealBox.width / 2, dealBox.y + dealBox.height / 2);
  // Marker texts are substrings of live labels ('PASS TURN »', 'TWIST',
  // 'POT 15') — wait on body includes, not exact leaf equality.
  await waitForBody(host, (expected) => document.body.innerText.includes(expected), 30000, marker);
  err(`marker ${marker} reached`);
  await host.waitForTimeout(1500);
}

/** Guest enters the shared table (no Resume step since the rebuild: the
 *  lobby 'Start the table' lands directly on the live surface). Wait for
 *  the button to be topmost first — the guest's hub is morph-gated like the
 *  host's, and a premature click falls through to a lower layer. */
async function guestEnterTable(guest, markers) {
  // No aria-label on this button (CardButton, innerText only) — text match.
  await clickTopmostText(guest, 'Start the table');
  for (const marker of markers) {
    await waitForBody(guest, (expected) => document.body.innerText.includes(expected), 30000, marker);
  }
  await guest.waitForTimeout(1500);
}

// ---------------------------------------------------------------------------
// Phase 1: Deal-2 lobby sync (two-client suite)
// ---------------------------------------------------------------------------

async function phaseDealTwo(hostCtx, guestCtx) {
  const err = (m) => process.stderr.write(`[deal2] ${m}\n`);
  const { host, guest, errors } = await makePhasePages(hostCtx, guestCtx, false);
  const roomCode = await createLobby(host, guest);
  err(`lobby ${roomCode}`);

  await startTable(host, 'Deal 2 each', 'PASS TURN');
  err('host table PASS TURN');
  const hostTableBody = await body(host);
  await host.screenshot({ path: '.qa-lobby-host-table.png', fullPage: false });

  // The guest enters the shared table once the host's filtered
  // session/start stream is present. Rebuild surface: the sync marker is
  // TableShell 'Live' + the PASS TURN dock (the pre-rebuild 'SYNCED' pill
  // is gone).
  await guestEnterTable(guest, ['Live', 'PASS TURN']);
  err('guest entered table Live+PASS TURN');
  const guestTableBody = await body(guest);
  await guest.screenshot({ path: '.qa-lobby-guest-table.png', fullPage: false });

  // Host draws from the deck; both sides must see the pile drop to 47.
  await clickTopmost(host, 'Draw pile, ');
  err('host clicked draw pile');
  await waitForBody(host, () =>
    [...document.querySelectorAll('button')].some((b) =>
      (b.getAttribute('aria-label') || '').startsWith('Draw pile, 47')));
  err('host sees 47');
  await waitForBody(guest, () =>
    [...document.querySelectorAll('button')].some((b) =>
      (b.getAttribute('aria-label') || '').startsWith('Draw pile, 47')));
  err('guest sees 47');
  await host.waitForTimeout(500);
  await guest.waitForTimeout(500);
  await host.screenshot({ path: '.qa-lobby-host-after-draw.png', fullPage: false });
  await guest.screenshot({ path: '.qa-lobby-guest-after-draw.png', fullPage: false });

  // Opponent hand-count pills ('2 CARDS' / '3 CARDS') sit on the
  // opponent avatar row; '48 LEFT' style deck counts are split leaf nodes
  // (number + 'LEFT' in separate <Text>s), so the draw gate above uses the
  // aria-label instead, and pill counts are read via visibleStats (container
  // innerText, not leaf-walk).
  const hostStats = await visibleStats(host);
  const guestStats = await visibleStats(guest);
  const hostSeesGuestTwoCards = hostStats.includes('2 CARDS');
  const guestSeesHostThreeCards = guestStats.includes('3 CARDS');

  const result = {
    phase: 'deal2',
    roomCode,
    hostRoom: {
      relayConnected: hostTableBody.includes('Relay: connected'),
      playersTwo: hostTableBody.includes('Players: 2'),
    },
    guestRoom: {
      relayConnected: guestTableBody.includes('Relay: connected'),
      playersTwo: guestTableBody.includes('Players: 2'),
    },
    hostTable: {
      relayConnected: hostTableBody.includes('Relay: connected'),
      hasPassTurn: hostTableBody.includes('PASS TURN'),
      hasTwoCardHand: hostSeesGuestTwoCards,
    },
    guestTable: {
      relayConnected: guestTableBody.includes('Relay: connected'),
      syncedLive: guestTableBody.includes('Live'),
      hasPassTurn: guestTableBody.includes('PASS TURN'),
    },
    drawSync: {
      hostPile47: (await host.locator('body').innerText()).includes('47'),
      guestPile47: (await guest.locator('body').innerText()).includes('47'),
      hostSeesGuestTwoCards,
      guestSeesHostThreeCards,
    },
    errors,
  };
  await host.close();
  await guest.close();
  const hardFailed =
    !result.hostRoom.relayConnected || !result.hostRoom.playersTwo ||
    !result.guestRoom.relayConnected || !result.guestRoom.playersTwo ||
    !result.hostTable.relayConnected || !result.hostTable.hasPassTurn || !result.hostTable.hasTwoCardHand ||
    !result.guestTable.relayConnected || !result.guestTable.syncedLive ||
    !result.guestTable.hasPassTurn ||
    !result.drawSync.hostPile47 || !result.drawSync.guestPile47 ||
    !result.drawSync.hostSeesGuestTwoCards || !result.drawSync.guestSeesHostThreeCards ||
    errors.length > 0;
  return { result, hardFailed };
}

// ---------------------------------------------------------------------------
// Phase 2: Online blackjack (guest TWIST via game_action)
// ---------------------------------------------------------------------------

async function phaseBlackjack(hostCtx, guestCtx) {
  const err = (m) => process.stderr.write(`[bj] ${m}\n`);
  const { host, guest, errors } = await makePhasePages(hostCtx, guestCtx, false);
  const roomCode = await createLobby(host, guest);
  err(`lobby ${roomCode}`);

  await startTable(host, 'Blackjack', 'TWIST');
  err('host blackjack table TWIST');

  // Host sticks: turn passes to the guest.
  await clickTopmostText(host, 'STICK');
  err('host stuck');
  // STICK gone from the host's rail once the turn passes.
  await host.waitForTimeout(1200);
  const hostAfterStick = await visibleButtons(host);
  if (hostAfterStick.includes('STICK')) {
    throw new Error('Host STICK did not pass the turn (STICK still visible)');
  }
  await host.waitForTimeout(700);
  err('host STICK gone');

  // Guest enters the shared table — the rebuild lands directly on the
  // live table with the guest's turn (no Resume handoff anymore).
  await guestEnterTable(guest, ['Live', 'TWIST']);
  err('guest entered table Live+TWIST');
  const guestPreBody = await body(guest);
  await guest.screenshot({ path: '.qa-lobby-bj-guest-turn.png', fullPage: false });
  // Read the pre-twist hand value BEFORE clicking.
  const guestStatsPre = await visibleStats(guest);
  const preValue = (guestStatsPre.find((l) => /^HAND \d+$/.test(l)) || '').match(/HAND (\d+)/)?.[1] ?? null;

  // Guest TWISTs; both sides must see the new hand value.
  await clickTopmostText(guest, 'TWIST');
  await guest.waitForTimeout(1500);
  await host.waitForTimeout(1500);
  const guestPostBody = await body(guest);
  await guest.screenshot({ path: '.qa-lobby-bj-guest-twisted.png', fullPage: false });
  await host.screenshot({ path: '.qa-lobby-bj-host-after-guest-twist.png', fullPage: false });

  const guestStatsPost = await visibleStats(guest);
  const postValue = (guestStatsPost.find((l) => /^HAND \d+$/.test(l)) || '').match(/HAND (\d+)/)?.[1] ?? null;
  const guestBusted = guestPostBody.includes('BUST');
  if (preValue === null || postValue === null) {
    process.stderr.write(`[bj] stats pre=${JSON.stringify(guestStatsPre)} post=${JSON.stringify(guestStatsPost)}\n`);
  }

  const result = {
    phase: 'blackjack',
    roomCode,
    guestHadActions: guestPreBody.includes('TWIST') && guestPreBody.includes('STICK'),
    guestHandChanged: (preValue !== null && postValue !== null && postValue !== preValue) || guestBusted,
    guestBusted,
    hostSeesGuestMoreCards: (await visibleStats(host)).some((l) => /^[3-5] CARDS$/.test(l)),
    preValue,
    postValue,
    errors,
  };
  await host.close();
  await guest.close();
  const hardFailed =
    !result.guestHadActions || !result.guestHandChanged || !result.hostSeesGuestMoreCards ||
    errors.length > 0;
  return { result, hardFailed };
}

// ---------------------------------------------------------------------------
// Phase 3: Hold'em poker + WebSocket privacy analysis (holdem suite)
// ---------------------------------------------------------------------------

async function phaseHoldem(hostCtx, guestCtx) {
  const { host, guest, errors, frames } = await makePhasePages(hostCtx, guestCtx, true);
  const gaps = [];
  const steps = {};
  const roomCode = await createLobby(host, guest);
  steps.guestJoined = true;

  // Stable client ids (persisted in localStorage under 'deckd.clientId').
  const hostClientId = await host.evaluate(() => localStorage.getItem('deckd.clientId') || '');
  const guestClientId = await guest.evaluate(() => localStorage.getItem('deckd.clientId') || '');

  await startTable(host, 'Poker', 'POT');
  await host.waitForTimeout(2000);
  await host.screenshot({ path: '.qa-holdem-host-dealt.png', fullPage: false });
  steps.hostTableDealt = true;

  // Host bet rail (visible controls only — raw body text includes hidden
  // layered buttons and can falsely pass a dead rail).
  const hostBtnNames = await visibleButtons(host);
  const hostHasFold = hostBtnNames.includes('FOLD');
  const hostHasCheck = hostBtnNames.includes('CHECK');
  const hostHasCall = hostBtnNames.some((n) => n.startsWith('CALL'));
  const hostHasRaise = hostBtnNames.some((n) => n.startsWith('RAISE'));
  const hostHasBetRail = hostHasFold || hostHasCheck || hostHasCall || hostHasRaise;
  steps.hostActions = { FOLD: hostHasFold, CHECK: hostHasCheck, CALL: hostHasCall, RAISE: hostHasRaise, BET_RAIL: hostHasBetRail };

  if (!hostHasBetRail) {
    gaps.push({
      file: 'components/layers/TableLayer.tsx',
      symptom: 'Host poker table shows no bet rail (FOLD/CHECK/CALL/RAISE) after deal. Same viewerId/mode class as online blackjack TWIST/STICK.',
    });
  }

  // Guest enters the shared table. Sync = TableShell 'Live' + the POT
  // ledger (the pre-rebuild 'SYNCED' pill is gone).
  await guestEnterTable(guest, ['Live', 'POT']);
  // The guest's enter morph gates subscriptions; a host action landing inside
  // that window can be missed (rail never renders). Give the settle a beat
  // before the host acts (probe-verified: rail appears t+1s after a settled
  // guest; a mid-morph action is intermittently dropped).
  await guest.waitForTimeout(2500);
  await guest.screenshot({ path: '.qa-holdem-guest-dealt.png', fullPage: false });
  steps.guestTableDealt = true;

  // Guest action bar is TURN-AWARE: in Hold'em the host acts first, so the
  // guest typically has NO bet rail at the deal — expected, not a gap.
  const guestBtnNames0 = await visibleButtons(guest);
  const guestHasBurnButton = guestBtnNames0.includes('BURN');
  const guestHasFlopButton = guestBtnNames0.includes('FLOP');
  steps.guestActions = { BURN_button: guestHasBurnButton, FLOP_button: guestHasFlopButton, railNames: guestBtnNames0 };

  if (guestHasBurnButton || guestHasFlopButton) {
    gaps.push({
      file: 'src/engine/rules.ts (pokerActions)',
      symptom: 'Guest sees host-only street action buttons (BURN/FLOP). pokerActions should only return host actions when isHost is true.',
    });
  }

  /** Close a betting round: act for whoever has the turn (CHECK first,
   *  CALL if facing a bet) until neither side shows a turn label. The turn
   *  header can flip a beat before the action dock re-renders, so re-read
   *  the rail once before giving up on a turn holder.
   *
   *  Round-closed detection: when a round completes, the turn indicator can
   *  linger on the last actor ('YOUR TURN' with NO bet rail) while the
   *  street controls (BURN/FLOP/...) appear on the HOST's rail. That is a
   *  closed round awaiting the host's street move — not a deadlock. If the
   *  turn holder shows no bet actions but the other side shows street
   *  controls, return and let the street progression loop proceed. */
  const hasBetActions = (rail) => rail.some((n) => n === 'FOLD' || n === 'CHECK' || n.startsWith('CALL') || n.startsWith('RAISE'));
  const hasStreetControls = (rail) => rail.some((n) => ['BURN', 'FLOP', 'TURN', 'RIVER', 'SHOWDOWN'].includes(n));

  const closeBettingRound = async (label) => {
    let guards = 10;
    while (guards-- > 0) {
      const hTurn = (await visibleLines(host)).some((l) => l === 'YOUR TURN');
      const gTurn = (await visibleLines(guest)).some((l) => l === 'YOUR TURN');
      const hostRail = await visibleButtons(host);
      const guestRail = await visibleButtons(guest);
      if (!hTurn && !gTurn) return;
      if (hTurn && !hasBetActions(hostRail) && hasStreetControls(hostRail)) return; // host drives the next street
      if (gTurn && !hasBetActions(guestRail) && hasStreetControls(hostRail)) return; // closed round, host holds BURN/FLOP
      let rail = null;
      if (hTurn) {
        rail = hostRail;
        if (rail.some((n) => n === 'CHECK')) { await clickTopmostText(host, 'CHECK', 8000); }
        else if (rail.some((n) => n.startsWith('CALL'))) { await clickTopmostText(host, rail.find((n) => n.startsWith('CALL')), 8000); }
        else {
          await host.waitForTimeout(1000);
          rail = await visibleButtons(host);
          if (!hasBetActions(rail) && !hasStreetControls(rail)) {
            throw new Error(`host turn at ${label} but no CHECK/CALL (rail: ${rail.join(', ')})`);
          }
          continue;
        }
      } else if (gTurn) {
        rail = guestRail;
        if (rail.some((n) => n === 'CHECK')) { await clickTopmostText(guest, 'CHECK', 8000); }
        else if (rail.some((n) => n.startsWith('CALL'))) { await clickTopmostText(guest, rail.find((n) => n.startsWith('CALL')), 8000); }
        else {
          // The turn header can beat the remote rail render by a beat; poll
          // up to ~12s before declaring the rail dead (probe-verified rail:
          // FOLD / CHECK / RAISE TO 20 arrives within ~3.5s of entry; a
          // mid-morph action can add a few more seconds).
          let appeared = false;
          for (let p = 0; p < 12; p += 1) {
            await guest.waitForTimeout(1000);
            guestRail = await visibleButtons(guest);
            if (hasBetActions(guestRail)) { appeared = true; break; }
            const hostRailNow = await visibleButtons(host);
            if (hasStreetControls(hostRailNow)) { appeared = true; break; } // round closed, host holds the streets
          }
          if (!appeared) {
            steps[`guestStuckAt_${label}`] = guestRail;
            await guest.screenshot({ path: `.qa-holdem-guest-stuck-${label}.png`, fullPage: false });
            process.stderr.write(`[holdem] GUEST STUCK at ${label} — last relay frames:\n${frames.slice(-14).map((f) => (typeof f.payload === 'string' ? f.payload : JSON.stringify(f.payload)).slice(0, 500)).join('\n')}\n`);
            throw new Error(`guest turn at ${label} but no CHECK/CALL (rail: ${guestRail.join(', ')})`);
          }
          continue;
        }
      }
      await host.waitForTimeout(1500);
      await guest.waitForTimeout(1500);
    }
    throw new Error(`betting round ${label} did not close after 10 guards`);
  };

  // Preflop: host is the big blind — close with the host CALL, then the
  // guest acts (CHECK unless facing a raise).
  await closeBettingRound('preflop');
  steps.preflopClosed = true;

  // Host street progression. With blinds the host drives BURN/FLOP/TURN/
  // RIVER/SHOWDOWN; a betting round closes per street (heads-up: guest
  // first postflop, then host).
  const streetProgression = [
    'BURN', 'FLOP', 'BURN', 'TURN', 'BURN', 'RIVER', 'SHOWDOWN',
  ];

  for (const street of streetProgression) {
    try {
      if (!(await visibleButtons(host)).includes(street)) {
        // A betting round must close before the next street appears.
        await closeBettingRound(street.toLowerCase());
        await host.waitForTimeout(1500);
        if (!(await visibleButtons(host)).includes(street)) {
          gaps.push({ file: 'components/layers/TableLayer.tsx', symptom: `Host does not see ${street} after closing the betting round.` });
          break;
        }
      }
      await clickTopmostText(host, street);
      await host.waitForTimeout(1500);
      await guest.waitForTimeout(1500);
      steps[`host${street}`] = true;
      if (street === 'FLOP' || street === 'TURN' || street === 'RIVER') {
        await closeBettingRound(street.toLowerCase());
      }
    } catch (e) {
      gaps.push({ file: 'components/layers/TableLayer.tsx', symptom: `Host ${street} click failed: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}` });
      break;
    }
  }

  await host.waitForTimeout(1000);
  const finalHostBody = await body(host);
  const finalGuestBody = await body(guest);
  await host.screenshot({ path: '.qa-holdem-host-showdown.png', fullPage: false });
  await guest.screenshot({ path: '.qa-holdem-guest-showdown.png', fullPage: false });

  const showdownReached =
    finalHostBody.includes('SESSION OVER') || finalHostBody.includes('takes the table') ||
    (await visibleLines(host)).some((l) => l === 'SHOWDOWN' || /WINS/.test(l));
  steps.showdownReached = showdownReached;
  if (!showdownReached) {
    gaps.push({
      file: 'src/engine/rules.ts (pokerApply / reveal)',
      symptom: 'Showdown not reached after RIVER + SHOWDOWN. The session/end event or winner banner did not appear.',
    });
  }

  const privacy = analyzeGuestFrames(frames, guestClientId || 'guest', hostClientId || 'host');
  steps.privacy = privacy;

  if (privacy.hostRealCardLeaks.length > 0) {
    gaps.push({
      file: 'src/store/syncLogic.ts (filterEventsForViewer)',
      symptom: `PRIVACY LEAK: guest received ${privacy.hostRealCardLeaks.length} real host hole-card IDs (${privacy.hostRealCardLeaks.slice(0, 5).join(', ')}).`,
    });
  }
  if (privacy.rngSeedLeak) {
    gaps.push({
      file: 'src/store/syncLogic.ts (filterEventsForViewer)',
      symptom: 'PRIVACY LEAK: guest received the rngSeed in session/start meta.',
    });
  }
  if (privacy.guestRealCardIds.length === 0 && steps.guestTableDealt) {
    gaps.push({
      file: 'src/store/syncLogic.ts (filterEventsForViewer)',
      symptom: 'Guest received no real card IDs for their own hand.',
    });
  }

  const result = {
    phase: 'holdem',
    roomCode,
    hostClientId: hostClientId || '(not found)',
    guestClientId: guestClientId || '(not found)',
    steps,
    gaps,
    errors,
    hostBodyTail: finalHostBody.slice(-800),
    guestBodyTail: finalGuestBody.slice(-800),
  };
  process.stdout.write(JSON.stringify({ phase: 'holdem', ...result }, null, 2));
  await host.close();
  await guest.close();

  // Gaps (engine limitations) do NOT fail — only errors and privacy leaks.
  const hardFailed =
    errors.length > 0 || privacy.hostRealCardLeaks.length > 0 || privacy.rngSeedLeak;
  return { result, hardFailed };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
  const browser = await chromium.launch({ headless: true });
  const hostCtx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });
  const guestCtx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });
  // clientId persists per-context localStorage; each phase makes fresh pages
  // so WebSocket captures and error listeners stay per-phase.

  const phases = [];
  const failedPhases = [];

  const runPhase = async (name, fn) => {
    try {
      const { result, hardFailed } = await fn();
      phases.push(result);
      if (hardFailed) failedPhases.push(name);
      if (name !== 'holdem') process.stdout.write(JSON.stringify({ phase: name, ...result }, null, 2));
    } catch (error) {
      phases.push({ phase: name, error: error instanceof Error ? error.message : String(error) });
      failedPhases.push(name);
      process.stdout.write(JSON.stringify({ phase: name, error: error instanceof Error ? error.message : String(error) }, null, 2));
    }
  };

  await runPhase('deal2', () => phaseDealTwo(hostCtx, guestCtx));
  await runPhase('blackjack', () => phaseBlackjack(hostCtx, guestCtx));
  await runPhase('holdem', () => phaseHoldem(hostCtx, guestCtx));

  await hostCtx.close();
  await guestCtx.close();
  await browser.close();

  console.log(`LOBBY-E2E phases=${phases.length} failed=[${failedPhases.join(', ')}]`);
  if (failedPhases.length > 0) process.exitCode = 2;
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 2;
});
