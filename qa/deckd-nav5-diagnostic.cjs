const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror:${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console:${m.text()}`); });
  await page.goto('http://127.0.0.1:8093/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(8000);
  const data = await page.evaluate(() => ({
    title: document.title,
    url: location.href,
    body: document.body.innerText.slice(0, 1200),
    buttons: [...document.querySelectorAll('button')].map((b) => ({ label: b.getAttribute('aria-label'), text: b.textContent?.trim().slice(0, 60), rect: (() => { const r=b.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })(), display: getComputedStyle(b).display, visibility: getComputedStyle(b).visibility, opacity: getComputedStyle(b).opacity })).slice(-30),
    images: document.images.length,
  }));
  console.log(JSON.stringify({ data, errors }, null, 2));
  await page.screenshot({ path: '.vischeck/nav-v5-diagnostic.png', fullPage: false });
  await browser.close();
})();
