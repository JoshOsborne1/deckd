const { chromium } = require('playwright');
const BASE_URL = (process.env.DECKD_QA_URL ?? 'http://localhost:8081').replace(/\/$/, '');

async function run(viewport, label) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addInitScript(() => window.localStorage.clear());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  const results = [];
  const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);

  try {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'commit', timeout: 60000 });
    await page.getByRole('button', { name: 'Deal the deck', exact: true }).last().waitFor({ state: 'visible', timeout: 60000 });
    await page.getByRole('button', { name: 'Deal the deck', exact: true }).last().click();
    await page.getByText('Choose a recipe', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
    const preset = page.getByRole('button', { name: /Blackjack/i }).first();
    await preset.waitFor({ state: 'visible', timeout: 30000 });
    await preset.click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Deal now', exact: true }).last().click();
    await page.waitForTimeout(2500);

    // Geometry: no horizontal overflow, no clipped action rail
    const geo = await page.evaluate(() => {
      const root = document.getElementById('root');
      return {
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        rootScrollWidth: root?.scrollWidth ?? 0,
      };
    });
    check('no horizontal overflow', geo.scrollWidth <= geo.innerWidth && geo.bodyScrollWidth <= geo.innerWidth && geo.rootScrollWidth <= geo.innerWidth, JSON.stringify(geo));

    // Twist + stick buttons visible
    const twist = page.getByRole('button', { name: 'TWIST', exact: true });
    const stick = page.getByRole('button', { name: 'STICK', exact: true });
    await twist.first().waitFor({ state: 'visible', timeout: 15000 });
    await stick.first().waitFor({ state: 'visible', timeout: 15000 });
    const twistBox = await twist.first().boundingBox();
    const stickBox = await stick.first().boundingBox();
    check('twist button on screen', twistBox && twistBox.x >= 0 && twistBox.x + twistBox.width <= geo.innerWidth, JSON.stringify(twistBox));
    check('stick button on screen', stickBox && stickBox.x >= 0 && stickBox.x + stickBox.width <= geo.innerWidth, JSON.stringify(stickBox));

    // Dealer hand + value pill present
    const dealerLabel = page.getByText('HOUSE', { exact: true });
    check('dealer label visible', await dealerLabel.isVisible().catch(() => false));

    // Twist once -> hand grows, dealer cascade runs
    await twist.first().click();
    await page.waitForTimeout(1200);
    const handPill = page.getByText(/^[0-9]+( · BUST)?$/).first();
    check('value pill after twist', await handPill.isVisible().catch(() => false));

    // Play to bust or stick: click STICK to trigger dealer auto-play
    await stick.first().click();
    await page.waitForTimeout(3000);
    const ended = page.getByText(/^(HAND OVER|SESSION OVER)$/, { exact: true });
    const endedVisible = await ended.isVisible().catch(() => false);
    check('hand-over banner appears', endedVisible);
    if (endedVisible) {
      const bannerBox = await ended.boundingBox();
      check('banner on screen', bannerBox && bannerBox.x >= 0 && bannerBox.x + bannerBox.width <= geo.innerWidth, JSON.stringify(bannerBox));
    }
  } catch (e) {
    results.push(`FAIL run — ${e.message}`);
  }

  console.log(`\n=== ${label} (${viewport.width}x${viewport.height}) ===`);
  results.forEach((r) => console.log(r));
  if (errors.length) {
    console.log('JS errors:');
    errors.slice(0, 5).forEach((e) => console.log(`  ${e}`));
  }
  await browser.close();
  return results.filter((r) => r.startsWith('FAIL')).length === 0;
}

(async () => {
  const mobileOk = await run({ width: 375, height: 812 }, 'MOBILE');
  const desktopOk = await run({ width: 1440, height: 900 }, 'DESKTOP');
  console.log(`\nOVERALL: ${mobileOk && desktopOk ? 'PASS' : 'FAIL'}`);
  process.exit(mobileOk && desktopOk ? 0 : 1);
})();
