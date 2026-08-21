const { chromium } = require('playwright');

const BASE_URL = process.env.DECKD_QA_URL ?? 'http://127.0.0.1:8081';
const VIEWPORT = { width: 375, height: 812 };

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
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      rootScrollLeft: root?.scrollLeft ?? 0,
      rootRectLeft: rootRect?.left ?? 0,
      rootRectWidth: rootRect?.width ?? 0,
    };
  });
}

async function visibleBounds(page, name) {
  return page.getByText(name, { exact: true }).last().evaluate((element) => {
    const target = element.closest('[role="button"],button') ?? element.parentElement ?? element;
    const rect = target.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  const results = {};

  try {
    await reset(page);
    await page.getByRole('button', { name: 'Deal the deck', exact: true }).last().click();
    await page.getByText('Choose a recipe', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });

    const setupRules = page.getByRole('button', { name: 'Read Freeplay rules', exact: true }).last();
    await setupRules.click();
    await page.getByText('TABLE RULES', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(600);
    const setupRulesBody = await page.locator('body').innerText();
    const setupCloseBounds = await visibleBounds(page, 'Back to the table');
    results.setupRules = {
      rendered: setupRulesBody.includes('HOW TO PLAY') && setupRulesBody.includes('WHEN IT ENDS'),
      hasTableNote: setupRulesBody.includes('AT THE TABLE'),
      closeBounds: setupCloseBounds,
    };
    await page.screenshot({ path: '.qa-rules-sheet-375.png', fullPage: false });
    await page.getByText('Back to the table', { exact: true }).last().click();

    await page.getByRole('button', { name: /^Freeplay\./ }).last().click();
    await page.getByRole('button', { name: 'Deal now', exact: true }).last().click();
    await page.waitForTimeout(900);

    const tableRules = page.getByRole('button', { name: 'Read table rules', exact: true });
    await tableRules.waitFor({ state: 'visible', timeout: 30000 });
    await tableRules.click();
    await page.getByText('TABLE RULES', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(600);
    const liveRulesBody = await page.locator('body').innerText();
    results.liveRules = {
      rendered: liveRulesBody.includes('Freeplay') && liveRulesBody.includes('Deal, draw, flip'),
      closeBounds: await visibleBounds(page, 'Back to the table'),
    };
    await page.getByText('Back to the table', { exact: true }).last().click();

    await page.getByRole('button', { name: 'End table', exact: true }).click();
    await page.getByText('SESSION OVER', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
    const endedBody = await page.locator('body').innerText();
    results.endState = {
      rendered: endedBody.includes('SESSION OVER') && endedBody.toLowerCase().includes('round complete'),
      hasReplay: endedBody.includes('Replay table'),
      hasBackToSetup: endedBody.includes('Back to setup'),
      bodyTail: endedBody.slice(-600),
    };

    await page.getByRole('button', { name: 'Replay table', exact: true }).click();
    await page.waitForTimeout(700);
    const replayBody = await page.locator('body').innerText();
    results.replay = {
      returnedToPlay: replayBody.includes('PASS TURN') || replayBody.includes('YOUR TURN'),
      endedBannerDismissed: !replayBody.includes('SESSION OVER'),
      rulesStillReachable: await tableRules.isVisible(),
    };

    await page.screenshot({ path: '.qa-rules-replay-375.png', fullPage: false });
    const geometry = await readGeometry(page);
    const result = { viewport: VIEWPORT, results, geometry, errors };
    process.stdout.write(JSON.stringify(result, null, 2));
    await browser.close();

    const checks = [
      results.setupRules.rendered,
      results.setupRules.hasTableNote,
      results.liveRules.rendered,
      results.endState.rendered,
      results.endState.hasReplay,
      results.endState.hasBackToSetup,
      results.replay.returnedToPlay,
      results.replay.endedBannerDismissed,
      results.replay.rulesStillReachable,
      geometry.scrollWidth === VIEWPORT.width,
      geometry.bodyScrollWidth === VIEWPORT.width,
      geometry.rootScrollLeft === 0,
      geometry.rootRectLeft === 0,
      geometry.rootRectWidth === VIEWPORT.width,
      errors.length === 0,
    ];
    const bounds = [results.setupRules.closeBounds, results.liveRules.closeBounds];
    const boundsInViewport = bounds.every((rect) => (
      rect.left >= 0 && rect.top >= 0 && rect.right <= VIEWPORT.width && rect.bottom <= VIEWPORT.height && rect.width >= 44 && rect.height >= 44
    ));
    if (!checks.every(Boolean) || !boundsInViewport) process.exitCode = 2;
  } catch (error) {
    process.stdout.write(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      results,
      body: (await page.locator('body').innerText().catch(() => '')).slice(-1800),
      errors,
    }, null, 2));
    await browser.close();
    process.exitCode = 2;
  }
})();
