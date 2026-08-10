const { chromium } = require('playwright');

const baseUrl = process.env.DECKD_QA_URL ?? 'https://deckd-app.roxai.click/';

async function exactButton(page, name, last = false) {
  const locator = page.getByRole('button', { name, exact: true });
  await locator.first().waitFor({ state: 'attached', timeout: 30000 });
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
    await Promise.all([
      host.goto(baseUrl, { waitUntil: 'commit', timeout: 30000 }),
      guest.goto(baseUrl, { waitUntil: 'commit', timeout: 30000 }),
    ]);
    // Fresh state: the live origin persists sessions in localStorage. A stale
    // ended session from a previous run makes text waits see the wrong layer.
    await Promise.all([
      host.evaluate(() => localStorage.clear()),
      guest.evaluate(() => localStorage.clear()),
    ]);
    await Promise.all([
      host.reload({ waitUntil: 'commit' }),
      guest.reload({ waitUntil: 'commit' }),
    ]);
    await host.waitForTimeout(1500);
    await guest.waitForTimeout(1500);
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

    // Host starts a Blackjack table
    await (await exactButton(host, 'Start the table')).click();
    await waitForText(host, 'Choose a recipe');
    await host.getByRole('button', { name: /Blackjack/i }).first().click();
    await (await exactButton(host, 'Deal now')).click();
    await waitForBody(host, () => document.body.innerText.includes('TWIST'));
    await host.waitForTimeout(700);

    // Host sticks: turn passes to the guest
    await (await exactButton(host, 'STICK')).click();
    await waitForBody(host, () => document.body.innerText.includes('YOUR TURN') === false);
    await host.waitForTimeout(700);

    // Guest resumes into the table and should have TWIST/STICK
    await (await exactButton(guest, 'Start the table')).click();
    await waitForText(guest, 'Resume');
    await (await exactButton(guest, 'Resume')).click();
    await waitForBody(guest, () => document.body.innerText.includes('TWIST'));
    await guest.waitForTimeout(700);
    const guestPreBody = await body(guest);
    await guest.screenshot({ path: '.qa-lobby-bj-guest-turn.png', fullPage: false });

    // Guest TWISTs via game_action; both sides must see the new card count
    await (await exactButton(guest, 'TWIST')).click();
    await guest.waitForTimeout(1200);
    await host.waitForTimeout(1200);
    const guestPostBody = await body(guest);
    const hostPostBody = await body(host);
    await guest.screenshot({ path: '.qa-lobby-bj-guest-twisted.png', fullPage: false });
    await host.screenshot({ path: '.qa-lobby-bj-host-after-guest-twist.png', fullPage: false });

    // The guest's own hand grew (a third card). The local hand has no count
    // label (only opponents do), so verify by the hand-value readout changing
    // away from the pre-twist value, or a bust marker.
    const preValue = guestPreBody.match(/HAND (\d+)/)?.[1] ?? null;
    const postValue = guestPostBody.match(/HAND (\d+)/)?.[1] ?? null;
    const guestBusted = guestPostBody.includes('BUST');

    const result = {
      roomCode,
      guestHadActions: guestPreBody.includes('TWIST') && guestPreBody.includes('STICK'),
      guestHandChanged: preValue !== null && (postValue !== preValue || guestBusted),
      guestBusted,
      hostSeesSync: hostPostBody.includes('3 CARDS') || hostPostBody.includes('4 CARDS') || hostPostBody.includes('5 CARDS'),
      preValue,
      postValue,
      guestPreBodyTail: guestPreBody.slice(-600),
      guestPostBodyTail: guestPostBody.slice(-600),
      hostPostBodyTail: hostPostBody.slice(-600),
      errors,
    };
    process.stdout.write(JSON.stringify(result, null, 2));
    await browser.close();
    if (
      !result.guestHadActions || !result.guestHandChanged || !result.hostSeesSync ||
      errors.length > 0
    ) process.exitCode = 2;
  } catch (error) {
    await host.screenshot({ path: '.qa-lobby-bj-host-failure.png', fullPage: false }).catch(() => {});
    await guest.screenshot({ path: '.qa-lobby-bj-guest-failure.png', fullPage: false }).catch(() => {});
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
