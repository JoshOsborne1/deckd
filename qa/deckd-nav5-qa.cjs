const { chromium } = require('playwright');
const baseUrl = process.env.DECKD_QA_URL || 'http://127.0.0.1:8093/';
const navLabels = ['Home', 'Store', 'Presets', 'Profile'];

async function visibleButton(page, label) {
  const candidates = page.locator('button');
  for (let i = 0; i < await candidates.count(); i++) {
    const button = candidates.nth(i);
    if ((await button.getAttribute('aria-label')) !== label) continue;
    const box = await button.boundingBox();
    if (!box || box.width < 1 || box.height < 1) continue;
    const visible = await button.evaluate((el) => {
      const s = getComputedStyle(el);
      return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.01 && s.pointerEvents !== 'none';
    });
    if (visible) return button;
  }
  throw new Error(`Visible button not found: ${label}`);
}

async function navState(page) {
  return page.evaluate(() => {
    const labels = ['Home', 'Store', 'Table', 'Presets', 'Profile'];
    const out = {};
    for (const label of labels) {
      const nodes = [...document.querySelectorAll('button')].filter((b) => (b.getAttribute('aria-label') || '').startsWith(label));
      const visible = nodes.map((b) => ({ b, r: b.getBoundingClientRect(), s: getComputedStyle(b) })).filter(({ r, s }) => r.width > 0 && r.height > 0 && Number(s.opacity) > 0.01 && s.visibility !== 'hidden' && s.pointerEvents !== 'none').sort((a, z) => z.r.bottom - a.r.bottom);
      const hit = visible[0];
      if (!hit) { out[label] = null; continue; }
      const face = hit.b.firstElementChild;
      const faceStyle = face ? getComputedStyle(face) : null;
      out[label] = {
        box: { x: hit.r.x, y: hit.r.y, width: hit.r.width, height: hit.r.height },
        selected: hit.b.getAttribute('aria-selected') || hit.b.getAttribute('data-selected') || hit.b.getAttribute('aria-pressed'),
        transform: faceStyle?.transform || '',
        borderRadius: faceStyle?.borderRadius || '',
        background: faceStyle?.backgroundColor || '',
        label: hit.b.getAttribute('aria-label'),
      };
    }
    return out;
  });
}

function assertBounds(state, viewport) {
  for (const [label, item] of Object.entries(state)) {
    if (!item) throw new Error(`Missing nav item: ${label}`);
    const { x, y, width, height } = item.box;
    if (x < -1 || y < -1 || x + width > viewport.width + 1 || y + height > viewport.height + 1) throw new Error(`Out of bounds: ${label} ${JSON.stringify(item.box)}`);
    if (width < 44 || height < 44) throw new Error(`Touch target too small: ${label}`);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.getAttribute('aria-label') === 'Home'), null, { timeout: 30000 });
    await page.waitForTimeout(1200);

    const homeState = await navState(page);
    assertBounds(homeState, { width: 375, height: 812 });
    if (homeState.Table?.label !== 'Table, Deckd logo button') throw new Error(`Logo is not standalone: ${JSON.stringify(homeState.Table)}`);
    if (navLabels.every((label) => homeState[label]?.transform === 'none' || homeState[label]?.transform === '')) throw new Error('No card fan transforms detected');
    await page.screenshot({ path: '.vischeck/nav-v5-home-375.png', fullPage: false });

    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((candidate) => candidate.getAttribute('aria-label') === 'Store');
      if (!button) throw new Error('Store button missing for timing probe');
      window.__deckdNavTiming = { pointerDown: 0, route: 0 };
      button.addEventListener('pointerdown', () => { window.__deckdNavTiming.pointerDown = performance.now(); }, { capture: true, once: true });
      const originalReplaceState = history.replaceState.bind(history);
      history.replaceState = (...args) => {
        window.__deckdNavTiming.route = performance.now();
        return originalReplaceState(...args);
      };
    });
    const storeButton = await visibleButton(page, 'Store');
    await storeButton.click();
    await page.waitForURL('**/store', { timeout: 5000 });
    const routeMs = await page.evaluate(() => window.__deckdNavTiming.route - window.__deckdNavTiming.pointerDown);
    await page.getByText('Passes', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
    if (routeMs > 300) throw new Error(`Store navigation was not instant: ${routeMs.toFixed(1)}ms`);
    await page.waitForTimeout(700);
    const storeState = await navState(page);
    assertBounds(storeState, { width: 375, height: 812 });
    await page.screenshot({ path: '.vischeck/nav-v5-store-375.png', fullPage: false });

    const tableButton = await visibleButton(page, 'Table, Deckd logo button');
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((candidate) => candidate.getAttribute('aria-label') === 'Table, Deckd logo button');
      if (!button) throw new Error('Table button missing for timing probe');
      window.__deckdNavTiming.pointerDown = 0;
      window.__deckdNavTiming.route = 0;
      button.addEventListener('pointerdown', () => { window.__deckdNavTiming.pointerDown = performance.now(); }, { capture: true, once: true });
    });
    await tableButton.click();
    await page.getByText('Choose a recipe', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
    const tableMs = await page.evaluate(() => window.__deckdNavTiming.route - window.__deckdNavTiming.pointerDown);
    if (tableMs > 300) throw new Error(`Table navigation was not instant: ${tableMs.toFixed(1)}ms`);
    await page.waitForTimeout(500);
    const tableState = await navState(page);
    assertBounds(tableState, { width: 375, height: 812 });
    await page.screenshot({ path: '.vischeck/nav-v5-table-375.png', fullPage: false });

    process.stdout.write(JSON.stringify({ baseUrl, routeMs: Number(routeMs.toFixed(1)), tableMs: Number(tableMs.toFixed(1)), homeState, storeState, tableState, errors }, null, 2));
    if (errors.length) process.exitCode = 2;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 2;
});
