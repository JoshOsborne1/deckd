/*
 * Pass veil visual proof at the two cleanup target widths.
 * Usage: node qa/deckd-pass-veil-qa.cjs
 * Optional: DECKD_QA_URL=https://deckd-app.roxai.click
 *          PASS_VEIL_PREFIX=.qa-pass-after
 *          PASS_VEIL_EXPECT_REWRITE=0 (baseline capture)
 */
const { chromium } = require('playwright');
const path = require('path');

const BASE_URL = process.env.DECKD_QA_URL ?? 'http://127.0.0.1:8085';
const PREFIX = process.env.PASS_VEIL_PREFIX ?? '.qa-pass-after';
const EXPECT_REWRITE = process.env.PASS_VEIL_EXPECT_REWRITE !== '0';

async function visibleButton(page, selector) {
  const buttons = page.locator(selector);
  const count = await buttons.count();
  for (let index = count - 1; index >= 0; index -= 1) {
    const button = buttons.nth(index);
    const box = await button.boundingBox().catch(() => null);
    if (!box || box.width <= 0 || box.height <= 0) continue;
    const visible = await button.isVisible().catch(() => false);
    if (!visible) continue;
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const hit = await page.evaluate(({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      return Boolean(element?.closest('button'));
    }, point);
    if (hit) return button;
  }
  return null;
}

async function visibleText(page, text, exact = true) {
  const matches = page.getByText(text, { exact });
  const count = await matches.count();
  for (let index = count - 1; index >= 0; index -= 1) {
    const match = matches.nth(index);
    const box = await match.boundingBox().catch(() => null);
    if (!box || box.width <= 0 || box.height <= 0) continue;
    if (await match.isVisible().catch(() => false)) return match;
  }
  return null;
}

async function loadFresh(page) {
  await page.goto(BASE_URL, { waitUntil: 'commit', timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'commit', timeout: 60000 });
  await page.waitForTimeout(5000);
}

async function runViewport(browser, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await loadFresh(page);
  const tableNav = await visibleButton(page, 'button[aria-label="Table, Deckd logo button"]');
  if (!tableNav) throw new Error(`${viewport.width}: visible Table nav missing`);
  await tableNav.click();
  const heading = await visibleText(page, 'Choose a recipe');
  if (!heading) throw new Error(`${viewport.width}: visible Choose a recipe heading missing`);

  const recipe = await visibleButton(page, 'button[aria-label^="Freeplay."]');
  if (!recipe) throw new Error(`${viewport.width}: visible Freeplay recipe missing`);
  await recipe.click();
  const deal = await visibleButton(page, 'button[aria-label="Deal now"]');
  if (!deal) throw new Error(`${viewport.width}: visible Deal now missing`);
  await deal.click();
  await page.waitForTimeout(900);
  const turnReady = await visibleText(page, 'PASS TURN', false);
  if (!turnReady) throw new Error(`${viewport.width}: PASS TURN did not appear`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.resolve(`${PREFIX}-table-${viewport.width}.png`), fullPage: false });

  const passButton = await visibleText(page, 'PASS TURN', false);
  const passBox = passButton ? await passButton.boundingBox().catch(() => null) : null;
  if (!passButton || !passBox) throw new Error(`${viewport.width}: PASS TURN is not visible`);
  await passButton.click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.resolve(`${PREFIX}-veil-${viewport.width}.png`), fullPage: false });

  const bodyText = await page.locator('body').innerText();
  const widths = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  const result = {
    viewport,
    tableScreenshot: path.resolve(`${PREFIX}-table-${viewport.width}.png`),
    veilScreenshot: path.resolve(`${PREFIX}-veil-${viewport.width}.png`),
    hasPassTo: bodyText.includes('PASS TO'),
    hasRecipient: bodyText.includes('Player 2'),
    hasHoldCopy: bodyText.includes('Hold to reveal'),
    hasHoldHint: bodyText.includes('HOLD FOR 0.6s'),
    hasNextPlayer: bodyText.includes('NEXT PLAYER'),
    hasOldHeadline: bodyText.includes('PASS DEVICE TO'),
    hasOldPhase: bodyText.includes('PASSING PHASE'),
    hasTutorialCopy: bodyText.includes('Pass the phone over.') || bodyText.includes('Your hand stays private'),
    hasOverflow: widths.scrollWidth !== viewport.width || widths.bodyScrollWidth !== viewport.width,
    widths,
    errors,
  };
  await page.close();
  return result;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const viewport of [
      { width: 375, height: 812 },
      { width: 1440, height: 900 },
    ]) {
      results.push(await runViewport(browser, viewport));
    }
  } finally {
    await browser.close();
  }
  process.stdout.write(JSON.stringify({ baseUrl: BASE_URL, expectRewrite: EXPECT_REWRITE, results }, null, 2));
  const failed = results.some((result) => (
    result.errors.length > 0 ||
    result.hasOverflow ||
    (EXPECT_REWRITE && (!result.hasPassTo || !result.hasRecipient || !result.hasHoldCopy || !result.hasHoldHint || !result.hasNextPlayer || result.hasOldHeadline || result.hasOldPhase || result.hasTutorialCopy))
  ));
  if (failed) process.exitCode = 2;
})();
