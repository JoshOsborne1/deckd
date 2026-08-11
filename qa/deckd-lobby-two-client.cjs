const { chromium } = require('playwright');

const baseUrl = process.env.DECKD_QA_URL ?? 'https://deckd-app.roxai.click/';

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

(async () => {
  const browser = await chromium.launch({ headless: true });
  const hostContext = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });
  const guestContext = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const errors = [];
  for (const [label, page] of [['host', host], ['guest', guest]]) {
    page.on('pageerror', (error) => errors.push(`${label} pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`${label} console: ${message.text()}`);
    });
  }

  try {
    // Wait for the JS bundle to load and the app to hydrate. 'commit' returns
    // before the bundle downloads; the app has a 5MB bundle from the CDN. Use
    // 'domcontentloaded' (fires reliably, unlike 'networkidle' which hangs on
    // the persistent relay WebSocket) and let the visible-button wait below
    // gate on hydration. If the CDN is slow the button wait fails precisely.
    await Promise.all([
      host.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }),
      guest.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }),
    ]);
    // Clear localStorage: the live origin persists stale sessions that pollute
    // the AX tree and make text waits land on the wrong layer.
    await Promise.all([
      host.evaluate(() => localStorage.clear()),
      guest.evaluate(() => localStorage.clear()),
    ]);
    await Promise.all([
      exactButton(host, 'Deal to friends'),
      exactButton(guest, 'Deal to friends'),
    ]);

    await (await exactButton(host, 'Deal to friends')).click();
    await (await exactButton(host, 'Host a lobby', true)).click();
    await waitForText(host, 'Relay: connected');
    const roomCode = roomCodeFrom(await body(host));

    await (await exactButton(guest, 'Deal to friends')).click();
    await (await exactButton(guest, 'Join with a code')).click();
    const codeInput = guest.getByRole('textbox').last();
    await codeInput.fill(roomCode);
    await (await exactButton(guest, 'Join room')).click();
    await waitForText(guest, 'Relay: connected');
    await waitForBody(guest, () => document.body.innerText.includes('Players: 2'));
    await waitForBody(host, () => document.body.innerText.includes('Players: 2'));
    await host.screenshot({ path: '.qa-lobby-host-room.png', fullPage: false });
    await guest.screenshot({ path: '.qa-lobby-guest-room.png', fullPage: false });

    const hostRoom = {
      relayConnected: (await body(host)).includes('Relay: connected'),
      playersTwo: (await body(host)).includes('Players: 2'),
    };
    const guestRoom = {
      relayConnected: (await body(guest)).includes('Relay: connected'),
      playersTwo: (await body(guest)).includes('Players: 2'),
    };

    await (await exactButton(host, 'Start the table')).click();
    await waitForText(host, 'Choose a recipe');
    await host.getByRole('button', { name: /Deal 2 each\./ }).first().click();
    await (await exactButton(host, 'Deal now')).click();
    await waitForBody(host, () => document.body.innerText.includes('PASS TURN'));
    await host.waitForTimeout(700);
    const hostTableBody = await body(host);
    await host.screenshot({ path: '.qa-lobby-host-table.png', fullPage: false });

    // force:true — the table layer underneath intercepts the pointer (deckd
    // layered-surface pitfall); the button is confirmed visible by exactButton.
    await (await exactButton(guest, 'Start the table')).click({ force: true });
    await waitForText(guest, 'Resume');
    await (await exactButton(guest, 'Resume')).click({ force: true });
    await waitForBody(guest, () => document.body.innerText.includes('PASS TURN'));
    await guest.waitForTimeout(700);
    const guestTableBody = await body(guest);
    await guest.screenshot({ path: '.qa-lobby-guest-table.png', fullPage: false });

    const hostDeckLabel = host.getByText(/LEFT$/).last();
    await hostDeckLabel.locator('..').click();
    await waitForBody(host, () => document.body.innerText.includes('47 LEFT'));
    await waitForBody(guest, () => document.body.innerText.includes('47 LEFT'));
    await host.waitForTimeout(500);
    await guest.waitForTimeout(500);
    const hostAfterDrawBody = await body(host);
    const guestAfterDrawBody = await body(guest);
    await host.screenshot({ path: '.qa-lobby-host-after-draw.png', fullPage: false });
    await guest.screenshot({ path: '.qa-lobby-guest-after-draw.png', fullPage: false });

    const result = {
      roomCode,
      hostRoom,
      guestRoom,
      hostTable: {
        relayConnected: hostTableBody.includes('Relay: connected'),
        hasPassTurn: hostTableBody.includes('PASS TURN'),
        hasTwoCardHand: hostTableBody.includes('2 CARDS'),
      },
      guestTable: {
        relayConnected: guestTableBody.includes('Relay: connected'),
        hasPassTurn: guestTableBody.includes('PASS TURN'),
        hasTwoCardHand: guestTableBody.includes('2 CARDS'),
      },
      drawSync: {
        hostHas47Left: hostAfterDrawBody.includes('47 LEFT'),
        guestHas47Left: guestAfterDrawBody.includes('47 LEFT'),
        hostSeesGuestTwoCards: hostAfterDrawBody.includes('2 CARDS'),
        guestSeesHostThreeCards: guestAfterDrawBody.includes('3 CARDS'),
        hostTail: hostAfterDrawBody.slice(-900),
        guestTail: guestAfterDrawBody.slice(-900),
      },
      errors,
    };
    process.stdout.write(JSON.stringify(result, null, 2));
    await browser.close();
    if (
      !result.hostRoom.relayConnected || !result.hostRoom.playersTwo ||
      !result.guestRoom.relayConnected || !result.guestRoom.playersTwo ||
      !result.hostTable.relayConnected || !result.hostTable.hasPassTurn || !result.hostTable.hasTwoCardHand ||
      !result.guestTable.relayConnected || !result.guestTable.hasPassTurn || !result.guestTable.hasTwoCardHand ||
      !result.drawSync.hostHas47Left || !result.drawSync.guestHas47Left ||
      !result.drawSync.hostSeesGuestTwoCards || !result.drawSync.guestSeesHostThreeCards ||
      errors.length > 0
    ) process.exitCode = 2;
  } catch (error) {
    await host.screenshot({ path: '.qa-lobby-host-failure.png', fullPage: false }).catch(() => {});
    await guest.screenshot({ path: '.qa-lobby-guest-failure.png', fullPage: false }).catch(() => {});
    process.stdout.write(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      hostBody: (await body(host).catch(() => '')).slice(-1600),
      guestBody: (await body(guest).catch(() => '')).slice(-1600),
      errors,
    }, null, 2));
    await browser.close();
    process.exitCode = 2;
  }
})();
