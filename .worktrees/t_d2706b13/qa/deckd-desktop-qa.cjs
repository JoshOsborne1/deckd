const { chromium } = require('playwright');

const BASE_URL = process.env.DECKD_QA_URL ?? 'http://127.0.0.1:8081';
const VIEWPORT = { width: 1440, height: 900 };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  try {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'commit', timeout: 30000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'commit', timeout: 30000 });
    await page.getByRole('button', { name: 'Deal the deck', exact: true }).last().waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('button', { name: 'Deal the deck', exact: true }).last().click();
    await page.getByText('Choose a recipe', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('button', { name: /^War\./ }).last().click();
    await page.getByRole('button', { name: 'Deal now', exact: true }).last().click();
    await page.getByRole('button', { name: 'FLIP', exact: true }).waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(600);

    const geometry = await page.evaluate(() => {
      const root = document.getElementById('root');
      const rootRect = root?.getBoundingClientRect();
      return {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        rootScrollLeft: root?.scrollLeft ?? 0,
        rootRectLeft: rootRect?.left ?? 0,
        rootRectWidth: rootRect?.width ?? 0,
      };
    });
    const buttonBounds = await Promise.all([
      ['Home', page.getByRole('button', { name: 'Home', exact: true }).last()],
      ['Profile', page.getByRole('button', { name: 'Profile', exact: true }).last()],
      ['FLIP', page.getByRole('button', { name: 'FLIP', exact: true }).last()],
    ].map(async ([label, button]) => {
      const rect = await button.boundingBox();
      return rect
        ? {
            label,
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            right: rect.x + rect.width,
            bottom: rect.y + rect.height,
          }
        : null;
    })).then((bounds) => bounds.filter(Boolean));

    await page.screenshot({ path: '.qa-library-war-desktop-1440.png', fullPage: false });
    const body = await page.locator('body').innerText();
    const result = {
      viewport: VIEWPORT,
      hasTable: body.includes('YOUR TURN') && body.includes('FLIP'),
      bodyTail: body.slice(-1200),
      geometry,
      buttonBounds,
      errors,
    };
    const buttonsInBounds = buttonBounds.length === 3 && buttonBounds.every((button) => (
      button.left >= 0 && button.top >= 0 && button.right <= VIEWPORT.width && button.bottom <= VIEWPORT.height
    ));
    result.checks = {
      buttonsInBounds,
      noDocumentOverflow: geometry.scrollWidth === VIEWPORT.width && geometry.bodyScrollWidth === VIEWPORT.width,
      rootStable: geometry.rootScrollLeft === 0 && geometry.rootRectLeft === 0 && geometry.rootRectWidth === VIEWPORT.width,
    };
    process.stdout.write(JSON.stringify(result, null, 2));
    await browser.close();

    if (
      !result.hasTable ||
      !buttonsInBounds ||
      geometry.scrollWidth !== VIEWPORT.width ||
      geometry.bodyScrollWidth !== VIEWPORT.width ||
      geometry.rootScrollLeft !== 0 ||
      geometry.rootRectLeft !== 0 ||
      geometry.rootRectWidth !== VIEWPORT.width ||
      errors.length > 0
    ) process.exitCode = 2;
  } catch (error) {
    process.stdout.write(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      body: (await page.locator('body').innerText().catch(() => '')).slice(-1600),
      errors,
    }, null, 2));
    await browser.close();
    process.exitCode = 2;
  }
})();
