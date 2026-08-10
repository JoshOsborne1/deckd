const { chromium } = require('playwright');
const BASE_URL = process.env.DECKD_QA_URL ?? 'http://127.0.0.1:8082';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  await page.goto(`${BASE_URL}/`, { waitUntil: 'commit', timeout: 30000 });
  await page.waitForTimeout(8000);

  // Deal a table
  await page.getByRole('button', { name: 'Deal the deck', exact: true }).last().click();
  await page.waitForTimeout(900);

  // Pick Poker preset
  const presetBtn = page.getByRole('button', { name: /Poker/i });
  if (await presetBtn.count()) {
    await presetBtn.click();
    await page.waitForTimeout(500);
  }

  // Deal now
  const dealNow = page.getByRole('button', { name: 'Deal now', exact: true });
  if (await dealNow.count()) {
    await dealNow.click();
    await page.waitForTimeout(1500);
  }

  // Initial poker table: hole cards down + BURN/FLOP host actions
  await page.screenshot({ path: '.qa-poker-dealt-375.png', fullPage: false });
  let text = await page.locator('body').innerText();

  const initial = {
    hasBurn: text.includes('BURN'),
    hasFlop: text.includes('FLOP'),
    hasFold: text.includes('FOLD'),
    hasCheck: text.includes('CHECK'),
    hasCall: text.includes('CALL'),
    hasRaise: text.includes('RAISE'),
    hasPassVeil: text.includes('PASS DEVICE TO'),
    errors: [...errors],
  };

  // FLOP: deals 3 community cards
  const flopBtn = page.getByRole('button', { name: 'FLOP', exact: true });
  if (await flopBtn.count()) {
    await flopBtn.click();
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: '.qa-poker-flop-375.png', fullPage: false });
  text = await page.locator('body').innerText();

  const afterFlop = {
    hasTurn: text.includes('TURN'),
    hasRiver: text.includes('RIVER'),
    hasShowdown: text.includes('SHOWDOWN'),
    flopLabel: text.includes('FLOP'),
    errors: [...errors],
  };

  // TURN: deals the 4th community card
  const turnBtn = page.getByRole('button', { name: 'TURN', exact: true });
  if (await turnBtn.count()) {
    await turnBtn.click();
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: '.qa-poker-turn-375.png', fullPage: false });

  // RIVER: deals the 5th
  const riverBtn = page.getByRole('button', { name: 'RIVER', exact: true });
  if (await riverBtn.count()) {
    await riverBtn.click();
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: '.qa-poker-river-375.png', fullPage: false });

  // SHOWDOWN: reveals all hands and ends the session
  const showdownBtn = page.getByRole('button', { name: 'SHOWDOWN', exact: true });
  if (await showdownBtn.count()) {
    await showdownBtn.click();
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: '.qa-poker-showdown-375.png', fullPage: false });
  text = await page.locator('body').innerText();

  const result = {
    initial,
    afterFlop,
    hasWinnerBanner: text.includes('SESSION OVER') || text.includes('takes the table'),
    showdownRevealed: !text.includes('HAND LOCKED'),
    errors,
  };
  process.stdout.write(JSON.stringify(result, null, 2));
  await browser.close();
})();
