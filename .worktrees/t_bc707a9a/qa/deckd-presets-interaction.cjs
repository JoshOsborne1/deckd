// Verify presets page interactions: tap a recipe card -> flips, DEFAULT moves.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto('https://deckd-app.roxai.click/list', { waitUntil: 'commit', timeout: 30000 });
  await page.waitForTimeout(12000);

  const before = await page.getByText('DEFAULT', { exact: true }).count();
  // Tap the Deal 2 each recipe card.
  await page.getByRole('button', { name: /Deal 2 each/ }).first().click();
  await page.waitForTimeout(1200); // flip animation
  const after = await page.getByText('DEFAULT', { exact: true }).count();
  const defaultUnder = await page.getByText('DEFAULT', { exact: true }).first().isVisible().catch(() => false);

  // Add a recipe flow: open clone list, duplicate Freeplay, expect a user card.
  await page.getByRole('button', { name: 'Add a recipe' }).click();
  await page.waitForTimeout(400);
  const dupButtons = await page.getByRole('button', { name: /Duplicate/ }).count();
  await page.getByRole('button', { name: /Duplicate Freeplay/ }).click();
  await page.waitForTimeout(600);
  const userCard = await page.getByText('Freeplay (yours)', { exact: false }).count();

  console.log(JSON.stringify({
    defaultBefore: before,
    defaultAfterTap: after,
    defaultStillVisible: defaultUnder,
    dupButtonsShown: dupButtons,
    userCardCreated: userCard,
    errors,
  }, null, 2));
  await page.screenshot({ path: '.qa-presets-after-tap.png', fullPage: false });
  await browser.close();
})();
