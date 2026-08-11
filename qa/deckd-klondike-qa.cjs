const { chromium } = require('playwright');

const BASE_URL = process.env.DECKD_QA_URL ?? 'http://127.0.0.1:8081';
const VIEWPORTS = [
  { width: 375, height: 812, key: '375' },
  { width: 1440, height: 900, key: '1440' },
];

async function waitForHome(page) {
  await page.getByRole('button', { name: 'Deal the deck', exact: true }).last().waitFor({ state: 'visible', timeout: 30000 });
}

async function reset(page) {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'commit', timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'commit', timeout: 30000 });
  await waitForHome(page);
}

async function readGeometry(page) {
  return page.evaluate(() => {
    const root = document.getElementById('root');
    const rootRect = root?.getBoundingClientRect();
    return {
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      rootScrollLeft: root?.scrollLeft ?? 0,
      rootRectLeft: rootRect?.left ?? 0,
      rootRectWidth: rootRect?.width ?? 0,
    };
  });
}

async function visibleButton(page, name) {
  const button = page.getByRole('button', { name, exact: true }).last();
  await button.waitFor({ state: 'visible', timeout: 30000 });
  return button;
}

async function visibleSheetAction(page, name) {
  const action = page.getByText(name, { exact: true }).last();
  await action.waitFor({ state: 'visible', timeout: 30000 });
  return action;
}

async function runViewport(page, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await reset(page);

  await (await visibleButton(page, 'Deal the deck')).click();
  await page.getByText('Choose a recipe', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });

  const klondikeCard = page.getByRole('button', { name: /^Klondike\./ }).last();
  await klondikeCard.waitFor({ state: 'visible', timeout: 30000 });
  await klondikeCard.click();
  await page.getByText('Solo tableau and foundation play', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });

  const rulesButton = await visibleButton(page, 'Read Klondike rules');
  await rulesButton.click();
  await page.getByText('TABLE RULES', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  const rulesBody = await page.locator('body').innerText();
  const rulesClose = await visibleSheetAction(page, 'Back to the table');
  const rulesCloseBox = await rulesClose.evaluate((element) => {
    const target = element.closest('[role="button"],button') ?? element.parentElement ?? element;
    const rect = target.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
  });
  await rulesClose.click();

  await (await visibleButton(page, 'Deal now')).click();
  await page.getByText('KLONDIKE · DRAW ONE', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  await page.getByText('TABLEAU', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(700);

  const stock24 = page.getByRole('button', { name: 'Stock, 24 cards', exact: true }).last();
  const stock24Visible = await stock24.isVisible().catch(() => false);
  const foundationReadout = (await page.locator('body').innerText()).includes('0/52 FOUNDATIONS');

  const faceDownCards = page.locator('[role="button"][aria-label*="face down"]:visible');
  const faceDownBefore = await faceDownCards.count();
  const enabledFaceDown = page.locator('[role="button"][aria-label*="face down"]:not([aria-disabled="true"]):visible');
  const flipAvailable = await enabledFaceDown.count() > 0;
  let flipWorked = false;
  if (faceDownBefore > 0) {
    const exposedFaceDown = enabledFaceDown.last();
    if (flipAvailable) {
      await exposedFaceDown.click();
      await page.waitForTimeout(300);
      flipWorked = (await page.locator('[role="button"][aria-label*="face down"]:visible').count()) < faceDownBefore;
    }
  }

  const drawButton = await visibleButton(page, 'DRAW STOCK');
  await drawButton.click();
  await page.waitForTimeout(250);
  const stock23Visible = await page.getByRole('button', { name: 'Stock, 23 cards', exact: true }).last().isVisible().catch(() => false);
  for (let index = 1; index < 24; index += 1) {
    await (await visibleButton(page, 'DRAW STOCK')).click();
    await page.waitForTimeout(35);
  }
  const recycleButton = await visibleButton(page, 'RECYCLE WASTE');
  await recycleButton.click();
  await page.waitForTimeout(300);
  const recycledStockVisible = await page.getByRole('button', { name: 'Stock, 24 cards', exact: true }).last().isVisible().catch(() => false);

  await (await visibleButton(page, 'End table')).click();
  await page.getByText('TABLE OVER', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  const endedBody = await page.locator('body').innerText();
  const newDeal = await visibleButton(page, 'New deal');
  await newDeal.click();
  await page.getByText('KLONDIKE · DRAW ONE', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  const replayBody = await page.locator('body').innerText();

  await page.screenshot({ path: `.qa-klondike-${viewport.key}.png`, fullPage: false });
  const geometry = await readGeometry(page);
  return {
    rules: rulesBody.includes('Klondike') && rulesBody.includes('Build four same-suit foundations'),
    rulesCloseBox,
    soloSetup: true,
    stock24Visible,
    foundationReadout,
    flipWorked,
    stock23Visible,
    recycledStockVisible,
    ended: endedBody.includes('TABLE OVER') && endedBody.includes('New deal'),
    replay: replayBody.includes('KLONDIKE · DRAW ONE') && !replayBody.includes('TABLE OVER'),
    geometry,
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORTS[0], deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  try {
    const results = {};
    for (const viewport of VIEWPORTS) results[viewport.key] = await runViewport(page, viewport);
    const checks = Object.values(results).flatMap((result) => [
      result.rules,
      result.soloSetup,
      result.stock24Visible,
      result.foundationReadout,
      !result.flipAvailable || result.flipWorked,
      result.stock23Visible,
      result.recycledStockVisible,
      result.ended,
      result.replay,
      result.geometry.scrollWidth === result.geometry.innerWidth,
      result.geometry.bodyScrollWidth === result.geometry.innerWidth,
      result.geometry.rootScrollLeft === 0,
      result.geometry.rootRectLeft === 0,
      result.geometry.rootRectWidth === result.geometry.innerWidth,
      result.rulesCloseBox && result.rulesCloseBox.width >= 44 && result.rulesCloseBox.height >= 44,
    ]);
    const output = { baseUrl: BASE_URL, results, errors };
    process.stdout.write(JSON.stringify(output, null, 2));
    await browser.close();
    if (!checks.every(Boolean) || errors.length > 0) process.exitCode = 2;
  } catch (error) {
    process.stdout.write(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      body: (await page.locator('body').innerText().catch(() => '')).slice(-2400),
      errors,
    }, null, 2));
    await browser.close();
    process.exitCode = 2;
  }
})();
