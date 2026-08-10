const { chromium } = require('playwright');
const BASE_URL = process.env.DECKD_QA_URL ?? 'http://127.0.0.1:8082';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });
  const errors = [];
  const cacheBust = process.env.DECKD_QA_CACHEBUST;
  if (cacheBust) {
    const baseOrigin = new URL(BASE_URL).origin;
    await page.route('**/*', async (route) => {
      const requestUrl = new URL(route.request().url());
      if (
        requestUrl.origin === baseOrigin &&
        (requestUrl.pathname.startsWith('/_expo/') || requestUrl.pathname.startsWith('/assets/'))
      ) {
        requestUrl.searchParams.set('qa', cacheBust);
        await route.continue({ url: requestUrl.toString() });
        return;
      }
      await route.continue();
    });
  }
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await page.goto(`${BASE_URL}/`, { waitUntil: 'commit', timeout: 30000 });
  await page.waitForTimeout(12000);
  const initialBody = await page.locator('body').innerText().catch(() => '');
  if (!initialBody.includes('Home')) {
    await page.screenshot({ path: '.qa-current-load-failure.png', fullPage: false });
    process.stdout.write(JSON.stringify({ url: page.url(), body: initialBody.slice(0, 1000), errors }, null, 2));
    await browser.close();
    process.exit(2);
  }
  await page.screenshot({ path: '.qa-current-home-375.png', fullPage: false });
  const homeNavCount = await page.getByRole('button', { name: 'Home', exact: true }).count();
  const navDealCount = await page.getByRole('button', { name: 'Deal the deck', exact: true }).count();

  const navDeal = page.getByRole('button', { name: 'Deal the deck', exact: true }).last();
  await navDeal.click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: '.qa-current-hub-375.png', fullPage: false });
  const hubText = await page.locator('body').innerText();

  // Setup keeps its action dock fixed to the table edge. Scroll the real
  // setup surface before asserting that the token controls can get above it;
  // a visible top edge alone is not enough touch proof at 375px.
  const tokenLabels = [
    'Jokers: 52 cards',
    'Wide fan: hand layout',
    'Tight fan: hand layout',
    'Stack: hand layout',
    'Reshuffle: when empty',
  ];
  const tokenButtons = tokenLabels.map((label) =>
    page.getByRole('button', { name: label, exact: true }),
  );
  const setupScroll = tokenButtons[0].locator(
    'xpath=ancestor::div[contains(@class, "r-150rngu")]',
  ).first();
  await setupScroll.hover();
  await page.mouse.wheel(0, 220);
  await page.waitForTimeout(220);
  const tokenBoxes = await Promise.all(tokenButtons.map((button) => button.boundingBox()));
  const dockButton = page.getByRole('button', { name: 'Deal now', exact: true });
  const dockBox = await dockButton.boundingBox();
  const tokensAboveDock = tokenBoxes.every(
    (box) => Boolean(box && dockBox && box.y + box.height <= dockBox.y),
  );
  await page.mouse.wheel(0, -220);
  await page.waitForTimeout(220);

  const dealPreset = page.getByRole('button', { name: /Deal 2 each/ });
  const dealPresetCount = await dealPreset.count();
  if (dealPresetCount) {
    await dealPreset.click();
    await page.waitForTimeout(250);
  }

  const dealNow = page.getByRole('button', { name: 'Deal now', exact: true });
  const dealNowCount = await dealNow.count();
  if (dealNowCount) {
    await dealNow.click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: '.qa-current-table-375.png', fullPage: false });

    // Draw eight more cards so the bounded fan is exercised at a phone-sized
    // width, not only in the two-card preset state.
    for (let index = 0; index < 8; index += 1) {
      await page.getByText(/LEFT$/).locator('..').click();
      await page.waitForTimeout(220);
    }
    await page.screenshot({ path: '.qa-current-table-10cards-375.png', fullPage: false });
  }

  const bodyText = await page.locator('body').innerText();
  const passButton = page.getByRole('button', { name: /PASS TURN/ });
  const passCount = await passButton.count();
  if (passCount) {
    await passButton.click();
    await page.waitForTimeout(900);
  }
  const passText = await page.locator('body').innerText();
  const result = {
    url: page.url(),
    homeNavCount,
    navDealCount,
    dealPresetCount,
    dealNowCount,
    tokenCount: tokenBoxes.filter(Boolean).length,
    tokensAboveDock,
    hasHubHeading: hubText.includes('Choose a recipe'),
    hasTableSurface: bodyText.includes('YOUR TURN') || bodyText.includes('PASS TURN') || bodyText.includes('NEXT USEFUL MOVE'),
    hasTwoCardHand: bodyText.includes('2 CARDS'),
    hasTenCardDrawState: bodyText.includes('40 LEFT'),
    hasGuidance: bodyText.includes('NEXT USEFUL MOVE'),
    hasPassVeil: passText.includes('PASS DEVICE TO') && passText.includes('Hold to reveal'),
    passCount,
    errors,
  };
  process.stdout.write(JSON.stringify(result, null, 2));
  await browser.close();
  if (
    !result.hasHubHeading ||
    !result.tokensAboveDock ||
    !result.hasTableSurface ||
    !result.hasTwoCardHand ||
    !result.hasTenCardDrawState ||
    !result.hasGuidance ||
    !result.hasPassVeil ||
    result.errors.length > 0
  ) process.exitCode = 2;
})();
