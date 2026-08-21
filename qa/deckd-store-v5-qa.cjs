const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
    await page.goto('http://127.0.0.1:8093/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.getAttribute('aria-label') === 'Store'), null, { timeout: 30000 });
    await page.locator('button[aria-label="Store"]').dispatchEvent('pointerdown');
    await page.waitForURL('**/store', { timeout: 5000 });
    await page.getByText('Passes', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
    const before = await page.evaluate(() => ({
      body: document.body.innerText.slice(0, 1500),
      buttons: [...document.querySelectorAll('button')].map((button) => ({
        label: button.getAttribute('aria-label'),
        text: button.textContent?.trim().replace(/\s+/g, ' ').slice(0, 100),
        rect: (() => { const r = button.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })(),
      })).filter(({ rect }) => rect.width > 0 && rect.height > 0),
    }));
    const deckButtons = page.locator('button[aria-label^="Preview"]');
    const deckCount = await deckButtons.count();
    if (!deckCount) throw new Error(`No preview buttons found. Visible buttons: ${JSON.stringify(before.buttons)}`);
    const firstDeck = deckButtons.first();
    const firstBox = await firstDeck.boundingBox();
    if (!firstBox || firstBox.width < 44 || firstBox.height < 44) throw new Error(`Deck preview hit target too small: ${JSON.stringify(firstBox)}`);
    await firstDeck.click();
    await page.waitForTimeout(500);
    const afterPreview = await page.evaluate(() => document.body.innerText.slice(0, 1500));
    const hasPreviewStage = afterPreview.includes('Tap the card to flip it') || afterPreview.includes('FLIP');
    await page.screenshot({ path: '.vischeck/store-v5-interaction-375.png', fullPage: false });
    process.stdout.write(JSON.stringify({ deckCount, firstBox, hasPreviewStage, errors, beforeButtons: before.buttons.slice(-20) }, null, 2));
    if (errors.length || !hasPreviewStage) process.exitCode = 2;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 2;
});
