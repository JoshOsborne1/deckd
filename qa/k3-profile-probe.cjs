// Inspect profile DOM to locate the reduce-motion toggle precisely.
const { chromium } = require('playwright');
const baseUrl = process.env.DECKD_QA_URL || 'http://127.0.0.1:8093/';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.getElementById('root')?.innerText?.length > 0, null, { timeout: 60000 });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label') || '').startsWith('Profile'));
      if (b) b.click();
    });
    await page.waitForURL('**/profile', { timeout: 10000 });
    await page.getByText('Reduce motion override', { exact: false }).waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(500);

    const dump = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('button')) {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        if (r.width < 1 || r.height < 1) continue;
        out.push({
          aria: el.getAttribute('aria-label'),
          text: (el.innerText || '').trim().slice(0, 40),
          x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
          bg: s.backgroundColor,
        });
      }
      return out;
    });
    process.stdout.write(JSON.stringify(dump, null, 2));
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e.stack || e); process.exitCode = 2; });
