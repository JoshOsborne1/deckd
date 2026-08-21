const { chromium } = require('playwright');

const baseUrl = process.env.DECKD_QA_URL ?? 'https://deckd-app.roxai.click/';
const viewport = { width: 375, height: 812 };

async function waitForBody(page, predicate, timeout = 30000) {
  await page.waitForFunction(predicate, null, { timeout });
}

async function visibleButtonGeometry(page, labels) {
  return page.evaluate((wanted) => {
    const wantedSet = new Set(wanted);
    return [...document.querySelectorAll('button')]
      .map((button) => {
        const label = button.getAttribute('aria-label') ?? '';
        const style = window.getComputedStyle(button);
        const rect = button.getBoundingClientRect();
        return {
          label,
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          opacity: Number(style.opacity),
          visibility: style.visibility,
          pointerEvents: style.pointerEvents,
        };
      })
      .filter((item) =>
        wantedSet.has(item.label) &&
        item.width > 0 &&
        item.height > 0 &&
        item.opacity > 0.01 &&
        item.visibility !== 'hidden' &&
        item.pointerEvents !== 'none',
      );
  }, labels);
}

function assertBounds(stage, boxes) {
  if (boxes.length === 0) throw new Error(`${stage}: no visible controls matched`);
  for (const box of boxes) {
    if (
      box.left < 0 || box.top < 0 || box.right > viewport.width || box.bottom > viewport.height ||
      box.width < 44 || box.height < 44
    ) {
      throw new Error(`${stage}: invalid touch bounds ${JSON.stringify(box)}`);
    }
  }
}

async function scrollWidths(page) {
  return page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  try {
    await page.goto(baseUrl, { waitUntil: 'commit', timeout: 30000 });
    await page.getByRole('button', { name: 'Deal the deck', exact: true }).last().waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(500);

    const media = await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const homeBoxes = await visibleButtonGeometry(page, ['Home', 'Store', 'Deal the deck', 'Presets', 'Profile', 'Deal to friends']);
    assertBounds('home', homeBoxes);
    const homeWidths = await scrollWidths(page);
    await page.screenshot({ path: '.qa-reduced-home-375.png', fullPage: false });

    await page.getByRole('button', { name: 'Deal the deck', exact: true }).last().click();
    await page.getByText('Choose a recipe', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(500);
    const hubBoxes = await visibleButtonGeometry(page, ['Home', 'Store', 'Deal the deck', 'Presets', 'Profile', 'Deal now', 'Host a lobby']);
    assertBounds('hub', hubBoxes);
    const hubWidths = await scrollWidths(page);
    await page.screenshot({ path: '.qa-reduced-hub-375.png', fullPage: false });

    await page.getByRole('button', { name: /Deal 2 each\./ }).last().click();
    await page.getByRole('button', { name: 'Deal now', exact: true }).last().click();
    await waitForBody(page, () => document.body.innerText.includes('PASS TURN'));
    await page.waitForTimeout(500);
    const tableBoxes = await visibleButtonGeometry(page, ['Home', 'Store', 'Deal the deck', 'Presets', 'Profile', 'PASS TURN »']);
    assertBounds('table', tableBoxes);
    const tableWidths = await scrollWidths(page);
    await page.screenshot({ path: '.qa-reduced-table-375.png', fullPage: false });

    const result = {
      url: page.url(),
      viewport,
      prefersReducedMotion: media,
      home: { boxes: homeBoxes, widths: homeWidths },
      hub: { boxes: hubBoxes, widths: hubWidths },
      table: { boxes: tableBoxes, widths: tableWidths },
      errors,
    };
    process.stdout.write(JSON.stringify(result, null, 2));
    await browser.close();
    if (
      !media || errors.length > 0 ||
      homeWidths.scrollWidth !== viewport.width || homeWidths.bodyScrollWidth !== viewport.width ||
      hubWidths.scrollWidth !== viewport.width || hubWidths.bodyScrollWidth !== viewport.width ||
      tableWidths.scrollWidth !== viewport.width || tableWidths.bodyScrollWidth !== viewport.width
    ) process.exitCode = 2;
  } catch (error) {
    await page.screenshot({ path: '.qa-reduced-failure-375.png', fullPage: false }).catch(() => {});
    process.stdout.write(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      body: (await page.locator('body').innerText().catch(() => '')).slice(-1600),
      errors,
    }, null, 2));
    await browser.close();
    process.exitCode = 2;
  }
})();
