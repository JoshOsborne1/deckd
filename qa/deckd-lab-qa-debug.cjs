const { chromium } = require('playwright');
const BASE_URL = process.env.DECKD_QA_URL ?? 'http://127.0.0.1:8081';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}\n${error.stack || ''}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await page.goto(`${BASE_URL}/lab`, { waitUntil: 'commit', timeout: 30000 });
  await page.waitForTimeout(12000);

  // Read any error overlay content
  const overlay = await page.evaluate(() => {
    const el = document.getElementById('error-overlay');
    return el ? el.innerText : null;
  });
  if (overlay) {
    console.log('=== ERROR OVERLAY ===');
    console.log(overlay.slice(0, 3000));
  }
  console.log('\n=== CAPTURED ERRORS ===');
  errors.slice(0, 10).forEach((e) => console.log(e, '\n---'));
  await browser.close();
})();
