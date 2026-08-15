/* Visual sweep: open every game on the local preview and screenshot at 375x812.
   Usage: node qa/deckd-visual-sweep.cjs
   Screenshots land in .vischeck-sweep/ */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.DECKD_QA_URL ?? 'http://127.0.0.1:8085';
const OUT_DIR = path.join(__dirname, '..', '.vischeck-sweep');
fs.mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORT = { width: 375, height: 812, deviceScaleFactor: 2 };

const GAMES = [
  { name: 'War', preset: /^War\./, solo: false },
  { name: 'Go Fish', preset: /^Go Fish\./, solo: false },
  { name: 'Old Maid', preset: /^Old Maid\./, solo: false },
  { name: 'Crazy Eights', preset: /^Crazy Eights\./, solo: false },
  { name: 'Sevens', preset: /^Sevens\./, solo: false },
  { name: 'Blackjack', preset: /^Blackjack\./, solo: false },
  { name: 'Poker', preset: /^Poker\./, solo: false },
  { name: 'Klondike', preset: /^Klondike\./, solo: true },
  { name: 'FreeCell', preset: /^FreeCell\./, solo: true },
  { name: 'Pyramid', preset: /^Pyramid\./, solo: true },
  { name: 'Golf', preset: /^Golf\./, solo: true },
];

async function shot(page, tag) {
  await page.screenshot({ path: path.join(OUT_DIR, `${tag}.png`), fullPage: false });
  console.log(`saved ${tag}.png`);
}

async function visibleButton(page, name) {
  const loc = page.getByRole('button', { name, exact: true });
  const count = await loc.count();
  for (let i = count - 1; i >= 0; i--) {
    if (await loc.nth(i).isVisible().catch(() => false)) return loc.nth(i);
  }
  return null;
}

async function startGame(page, game) {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'commit', timeout: 30000 });
  await page.waitForTimeout(7000);
  await page.evaluate(() => localStorage.clear()).catch(() => {});
  await page.reload({ waitUntil: 'commit', timeout: 30000 });
  await page.waitForTimeout(8000);
  const deck = await visibleButton(page, 'Deal the deck');
  if (!deck) throw new Error('no Deal the deck');
  await deck.click();
  await page.waitForTimeout(1500);
  const preset = page.getByRole('button', { name: game.preset }).last();
  await preset.waitFor({ state: 'visible', timeout: 20000 });
  await preset.click();
  await page.waitForTimeout(900);
  const deal = await visibleButton(page, 'Deal now');
  if (!deal) throw new Error('no Deal now');
  await deal.click();
  await page.waitForTimeout(2200);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });

  // Home + hub baseline
  await page.goto(`${BASE_URL}/`, { waitUntil: 'commit', timeout: 30000 });
  await page.waitForTimeout(7000);
  await page.evaluate(() => localStorage.clear()).catch(() => {});
  await page.reload({ waitUntil: 'commit', timeout: 30000 });
  await page.waitForTimeout(8000);
  await shot(page, '00-home');
  await (await visibleButton(page, 'Deal the deck')).click();
  await page.waitForTimeout(1500);
  await shot(page, '01-hub');

  for (const game of GAMES) {
    try {
      await startGame(page, game);
      await shot(page, `game-${game.name.toLowerCase().replace(/ /g, '-')}`);
    } catch (err) {
      console.log(`FAIL ${game.name}: ${err.message}`);
    }
  }

  // Freeplay pass veil (the pass ritual)
  try {
    await startGame(page, { preset: /^Freeplay\./, solo: false });
    await shot(page, 'game-freeplay');
    const pass = page.getByRole('button', { name: /PASS TURN/ }).last();
    if (await pass.isVisible().catch(() => false)) {
      await pass.click();
      await page.waitForTimeout(1400);
      await shot(page, 'game-freeplay-pass');
    }
  } catch (err) {
    console.log(`FAIL freeplay-pass: ${err.message}`);
  }

  await browser.close();
  console.log('SWEEP_DONE');
})();
