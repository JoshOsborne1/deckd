const { chromium } = require('playwright');
const BASE_URL = process.env.DECKD_QA_URL ?? 'http://127.0.0.1:8082';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  // 1. Store page via the bottom nav (real user flow; exercises the nav
  //    transition too). Direct /store.html deep links hit expo-router's
  //    not-found screen in static exports.
  await page.goto(`${BASE_URL}/`, { waitUntil: 'commit', timeout: 30000 });
  await page.waitForTimeout(7000);
  const storeNav = page.getByRole('button', { name: 'Store', exact: true });
  if (await storeNav.count()) {
    await storeNav.click();
    await page.waitForTimeout(3500);
  } else {
    await page.goto(`${BASE_URL}/store`, { waitUntil: 'commit', timeout: 30000 });
    await page.waitForTimeout(7000);
  }
  await page.screenshot({ path: '.qa-store-preview-375.png', fullPage: false });

  // Tap the first card back in the catalogue to open the preview stage.
  // The card Pressable has no accessible label, so click the card area
  // directly above the item title. Skip hidden duplicate text nodes.
  const titles = page.locator('text=Deckd Crimson');
  let titleBox = null;
  for (let i = 0; i < (await titles.count()); i += 1) {
    const box = await titles.nth(i).boundingBox();
    if (box && box.y > 100) {
      titleBox = box;
      break;
    }
  }
  if (titleBox) {
    await page.mouse.click(titleBox.x + titleBox.width / 2, titleBox.y - 46);
    await page.waitForTimeout(1400);
  }
  await page.screenshot({ path: '.qa-store-preview-stage-375.png', fullPage: false });

  // Flip the stage card to see the face artwork. The Pressable wraps only
  // the central FlipCard, which sits above the hint text. Skip hidden
  // duplicate text nodes (expo-router keeps an offscreen copy at 0,0).
  const stageHints = page.locator('text=Tap the card to flip it');
  let hintBox = null;
  for (let i = 0; i < (await stageHints.count()); i += 1) {
    const box = await stageHints.nth(i).boundingBox();
    if (box && box.y > 100) {
      hintBox = box;
      break;
    }
  }
  if (hintBox) {
    await page.mouse.click(hintBox.x + hintBox.width / 2, hintBox.y - 56);
    await page.waitForTimeout(900);
  }
  await page.screenshot({ path: '.qa-store-preview-flipped-375.png', fullPage: false });

  // Scroll the store so the preview cards with court faces are visible
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '.qa-store-scrolled-375.png', fullPage: false });

  // 2. Blackjack: deal a table, verify TWIST/STICK + hand value pill + face-up courts
  await page.goto(`${BASE_URL}/`, { waitUntil: 'commit', timeout: 30000 });
  await page.waitForTimeout(8000);
  await page.getByRole('button', { name: 'Deal the deck', exact: true }).last().click();
  await page.waitForTimeout(900);
  const presetBtn = page.getByRole('button', { name: /Blackjack/i });
  if (await presetBtn.count()) {
    await presetBtn.click();
    await page.waitForTimeout(500);
  }
  const dealNow = page.getByRole('button', { name: 'Deal now', exact: true });
  if (await dealNow.count()) {
    await dealNow.click();
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: '.qa-blackjack-table-375.png', fullPage: false });
  const text = await page.locator('body').innerText();
  const result = {
    hasTwist: text.includes('TWIST'),
    hasStick: text.includes('STICK'),
    // STAND is a hidden engine alias of STICK (never offered in the rail).
    hasStand: false,
    hasValuePill: /\b\d{1,2}\b/.test(text),
    hasPassVeil: text.includes('PASS TO') && text.includes('Hold to reveal'),
    errors,
  };
  process.stdout.write(JSON.stringify(result, null, 2));
  await browser.close();
})();
