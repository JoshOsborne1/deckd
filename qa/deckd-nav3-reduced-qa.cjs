// Reduced-motion check for nav v3: chips must appear (plain fade, no spring)
// and be fully visible + tappable with prefers-reduced-motion: reduce.
const { chromium } = require('playwright');

const baseUrl = process.env.DECKD_QA_URL ?? 'http://localhost:8081/';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  try {
    await page.goto(baseUrl, { waitUntil: 'commit', timeout: 60000 });
    await page.getByRole('button', { name: 'Table', exact: true }).last().waitFor({ state: 'visible', timeout: 60000 });
    await page.waitForTimeout(800);

    const media = await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const boxes = await page.evaluate(() => {
      const wanted = new Set(['Home', 'Store', 'Table', 'Presets', 'Profile']);
      return [...document.querySelectorAll('button')]
        .map((b) => {
          const label = b.getAttribute('aria-label') ?? '';
          const style = window.getComputedStyle(b);
          const rect = b.getBoundingClientRect();
          return { label, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height, opacity: Number(style.opacity), visibility: style.visibility, pointerEvents: style.pointerEvents };
        })
        .filter((i) => wanted.has(i.label) && i.width > 0 && i.height > 0 && i.opacity > 0.01 && i.visibility !== 'hidden' && i.pointerEvents !== 'none');
    });
    // Bottom-most instance per label (nav rail).
    const byLabel = new Map();
    for (const b of boxes) {
      const prev = byLabel.get(b.label);
      if (!prev || b.bottom > prev.bottom) byLabel.set(b.label, b);
    }
    const nav = [...byLabel.values()];
    const widths = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    await page.screenshot({ path: '.qa-nav3-reduced-375.png', fullPage: false });

    const result = { media, navCount: nav.length, nav, widths, errors };
    process.stdout.write(JSON.stringify(result, null, 2));
    await browser.close();
    if (!media || nav.length !== 5 || widths.scrollWidth !== 375 || widths.bodyScrollWidth !== 375 || errors.length > 0) {
      process.exitCode = 2;
    }
  } catch (error) {
    await page.screenshot({ path: '.qa-nav3-reduced-failure.png', fullPage: false }).catch(() => {});
    process.stdout.write(JSON.stringify({ error: error instanceof Error ? error.message : String(error), errors }, null, 2));
    await browser.close();
    process.exitCode = 2;
  }
})();
