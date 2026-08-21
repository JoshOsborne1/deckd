// Screenshot the presets page at 375x812 and 1440x900.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  for (const vp of [
    { name: '375', width: 375, height: 812 },
    { name: '1440', width: 1440, height: 900 },
  ]) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => errors.push(`${vp.name} pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${vp.name} console: ${m.text()}`); });
    await page.goto('https://deckd-app.roxai.click/list', { waitUntil: 'commit', timeout: 30000 });
    await page.waitForTimeout(12000);
    const body = await page.locator('body').innerText().catch(() => '');
    const hasRulesets = body.includes('Rulesets');
    await page.screenshot({ path: `.qa-presets-${vp.name}.png`, fullPage: false });
    // Geometry probe: doc/body scroll width vs viewport.
    const geom = await page.evaluate(() => ({
      docScrollW: document.documentElement.scrollWidth,
      bodyScrollW: document.body.scrollWidth,
      innerW: window.innerWidth,
    }));
    const labels = await page.getByText(/Freeplay|Deal 2 each|Blackjack-style|Poker-style/, { exact: false }).count();
    console.log(JSON.stringify({ vp: vp.name, hasRulesets, labels, geom, errors: errors.filter((e) => e.startsWith(vp.name)) }));
    await page.close();
  }
  await browser.close();
})();
