const { chromium } = require('playwright');

const BASE_URL = process.env.DECKD_QA_URL ?? 'http://127.0.0.1:8081';
const VIEWPORTS = [
  { width: 375, height: 812, key: '375' },
  { width: 1440, height: 900, key: '1440' },
];

async function isActuallyVisible(locator) {
  const box = await locator.boundingBox().catch(() => null);
  if (!box || box.width <= 0 || box.height <= 0 || box.bottom <= 0 || box.right <= 0) return false;
  return locator.evaluate((element) => {
    let node = element;
    while (node instanceof HTMLElement) {
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      node = node.parentElement;
    }
    return true;
  }).catch(() => false);
}

async function visibleLocator(locator, description) {
  await locator.first().waitFor({ state: 'attached', timeout: 30000 });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const count = await locator.count();
    for (let index = count - 1; index >= 0; index -= 1) {
      const candidate = locator.nth(index);
      if (await isActuallyVisible(candidate)) return candidate;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`No visible ${description} found`);
}

async function waitForHome(page) {
  await visibleLocator(page.getByRole('button', { name: 'Deal the deck', exact: true }), 'Deal the deck button');
}

async function reset(page) {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'commit', timeout: 90000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'commit', timeout: 90000 });
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
  return visibleLocator(page.getByRole('button', { name, exact: true }), `button ${name}`);
}

async function visibleSheetAction(page, name) {
  return visibleLocator(page.getByText(name, { exact: true }), `sheet action ${name}`);
}

async function runViewport(page, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await reset(page);

  await (await visibleButton(page, 'Deal the deck')).click();
  await visibleLocator(page.getByText('Choose a recipe', { exact: true }), 'Choose a recipe heading');

  const klondikeCard = await visibleLocator(page.getByRole('button', { name: /^Klondike\./ }), 'Klondike recipe card');
  await klondikeCard.click();
  await visibleLocator(page.getByText('Build four foundations from ace to king. Draw one from the stock.', { exact: true }), 'Klondike setup copy');

  const rulesButton = await visibleButton(page, 'Read Klondike rules');
  await rulesButton.click();
  await visibleLocator(page.getByText('TABLE RULES', { exact: true }), 'table rules heading');
  const rulesBody = await page.locator('body').innerText();
  const rulesClose = await visibleSheetAction(page, 'Back to the table');
  const rulesCloseBox = await rulesClose.evaluate((element) => {
    const target = element.closest('[role="button"],button') ?? element.parentElement ?? element;
    const rect = target.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
  });
  await rulesClose.click();

  await (await visibleButton(page, 'Deal now')).click();
  await visibleLocator(page.getByText('KLONDIKE · DRAW ONE', { exact: true }), 'Klondike table marker');
  await visibleLocator(page.getByText('TABLEAU', { exact: true }), 'Klondike tableau marker');
  await page.waitForTimeout(700);

  const stockButton = await visibleLocator(
    page.getByRole('button', { name: 'Stock, 24 cards', exact: true }),
    '24-card stock',
  );
  const topLabelsVisible = Boolean(
    await visibleLocator(page.getByText('STOCK 24 · WASTE', { exact: true }), 'stock and waste label')
      .catch(() => null),
  ) && Boolean(
    await visibleLocator(page.getByText('FOUNDATIONS', { exact: true }), 'foundations label')
      .catch(() => null),
  );
  const emptyWasteVisible = Boolean(
    await visibleLocator(page.getByRole('button', { name: 'Empty waste', exact: true }), 'empty waste slot')
      .catch(() => null),
  );
  const stock24Visible = await isActuallyVisible(stockButton);
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

  await stockButton.click();
  await page.waitForTimeout(250);
  const stock23Visible = await visibleLocator(
    page.getByRole('button', { name: 'Stock, 23 cards', exact: true }),
    '23-card stock',
  ).then(() => true).catch(() => false);
  for (let index = 1; index < 24; index += 1) {
    const remaining = 24 - index;
    await (await visibleLocator(
      page.getByRole('button', { name: `Stock, ${remaining} cards`, exact: true }),
      `${remaining}-card stock`,
    )).click();
    await page.waitForTimeout(35);
  }
  const recycleButton = await visibleButton(page, 'Recycle waste');
  await recycleButton.click();
  await page.waitForTimeout(300);
  const recycledStockVisible = await visibleLocator(
    page.getByRole('button', { name: 'Stock, 24 cards', exact: true }),
    'recycled 24-card stock',
  ).then(() => true).catch(() => false);

  const utilityButton = await visibleButton(page, 'Open utility drawer');
  await utilityButton.click();
  await (await visibleButton(page, 'End table')).click();
  await (await visibleButton(page, 'Confirm end table')).click();
  await visibleLocator(page.getByText('TABLE OVER', { exact: true }), 'table over marker');
  const endedBody = await page.locator('body').innerText();
  const newDeal = await visibleButton(page, 'New deal');
  await newDeal.click();
  await visibleLocator(page.getByText('KLONDIKE · DRAW ONE', { exact: true }), 'replayed Klondike marker');
  const replayBody = await page.locator('body').innerText();

  await page.screenshot({ path: `.qa-klondike-${viewport.key}.png`, fullPage: false });
  const geometry = await readGeometry(page);
  return {
    rules: rulesBody.includes('Klondike') && rulesBody.includes('Build four same-suit foundations'),
    rulesCloseBox,
    soloSetup: true,
    stock24Visible,
    topLabelsVisible,
    emptyWasteVisible,
    foundationReadout,
    flipAvailable,
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
  page.on('dialog', (dialog) => dialog.accept());
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
      result.topLabelsVisible,
      result.emptyWasteVisible,
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
