// Read-only preview screenshots of the live Expo web server
const { chromium } = require('playwright');
(async () => {
  const shots = [
    { url: 'http://localhost:8082/lab', name: '.qa-preview-lab.png', wait: 9000 },
    { url: 'http://localhost:8082/', name: '.qa-preview-hub.png', wait: 6000 },
  ];
  const browser = await chromium.launch();
  for (const s of shots) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    try {
      await page.goto(s.url, { timeout: 45000 });
      await page.waitForTimeout(s.wait);
      await page.screenshot({ path: 'qa/' + s.name, fullPage: false });
      console.log('OK', s.url, '-> qa/' + s.name);
    } catch (e) { console.log('FAIL', s.url, String(e).slice(0, 120)); }
    await ctx.close();
  }
  await browser.close();
})();
