const { chromium } = require('playwright');

const BASE_URL = process.env.DECKD_QA_URL ?? 'http://127.0.0.1:8095';
const MOBILE = { width: 375, height: 812 };
const DESKTOP = { width: 1440, height: 900 };

async function waitForHome(page) {
  await page.getByRole('button', { name: 'Deal the deck', exact: true }).last().waitFor({ state: 'visible', timeout: 60000 });
}

async function reset(page) {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'commit', timeout: 120000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'commit', timeout: 120000 });
  await waitForHome(page);
}

async function startGolf(page) {
  await page.getByRole('button', { name: 'Deal the deck', exact: true }).last().click();
  await page.getByText('Choose a recipe', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  const preset = page.getByRole('button', { name: /^Golf\./ }).last();
  await preset.waitFor({ state: 'visible', timeout: 30000 });
  await preset.click();
  await page.getByRole('button', { name: 'Deal now', exact: true }).last().click();
  await page.waitForTimeout(1200);
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
      rootScrollWidth: root?.scrollWidth ?? 0,
      rootRectLeft: rootRect?.left ?? 0,
      rootRectWidth: rootRect?.width ?? 0,
    };
  });
}

/** Parse the Golf readout: "TABLEAU 35/35 · STOCK 17". Returns count or -1. */
async function readTableauCount(page) {
  const body = await page.locator('body').innerText();
  const m = body.match(/TABLEAU (\d+)\/35/);
  return m ? Number(m[1]) : -1;
}

/**
 * Drive Golf autonomously: try each tableau column, fall back to DRAW when no
 * column plays, press END TABLE when stuck. The readout count is the source of
 * truth for whether a tap legally played.
 */
async function playUntilEnd(page, maxRounds = 60) {
  let rounds = 0;
  let draws = 0;
  let plays = 0;
  let ended = false;
  let endVia = null;
  while (rounds < maxRounds) {
    const body = await page.locator('body').innerText();
    if (body.includes('COMPLETE') && (body.includes('cleared the tableau') || body.includes('No more moves'))) {
      ended = true;
      endVia = body.includes('cleared the tableau') ? 'win' : 'stuck';
      break;
    }
    // Try every column once; a tableau-count drop means a legal play.
    let roundPlayed = false;
    for (let col = 1; col <= 7; col += 1) {
      const before = await readTableauCount(page);
      const btn = page.getByRole('button', { name: `Play column ${col}`, exact: true });
      if (!(await btn.isVisible().catch(() => false))) continue;
      if (!(await btn.isEnabled().catch(() => false))) continue; // empty column
      await btn.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(250);
      const after = await readTableauCount(page);
      if (after >= 0 && after < before) {
        plays += 1;
        roundPlayed = true;
      }
    }
    if (roundPlayed) {
      rounds += 1;
      continue;
    }
    // No legal play this pass: draw, or end the table when the stock is dry.
    const drawBtn = page.getByRole('button', { name: 'DRAW', exact: true });
    if (await drawBtn.isVisible().catch(() => false)) {
      await drawBtn.click();
      draws += 1;
      await page.waitForTimeout(300);
      rounds += 1;
      continue;
    }
    const endBtn = page.getByRole('button', { name: 'END TABLE', exact: true });
    if (await endBtn.isVisible().catch(() => false)) {
      await endBtn.click();
      await page.waitForTimeout(500);
      rounds += 1;
      continue;
    }
    break;
  }
  return { rounds, draws, plays, ended, endVia };
}

async function runViewport(browser, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  const results = { viewport };

  try {
    await reset(page);
    await startGolf(page);

    // The dedicated Golf board: GOLF eyebrow, stock/waste piles, 7 playable
    // columns, readout with tableau + stock counts, and the DRAW action.
    const body = await page.locator('body').innerText();
    results.board = {
      golfEyebrow: body.includes('GOLF'),
      readout: /TABLEAU 35\/35 · STOCK 17/.test(body),
      drawAction: body.includes('DRAW'),
      wastePile: body.includes('WASTE'),
      stockPile: body.includes('STOCK'),
    };
    let columnsSeen = 0;
    for (let col = 1; col <= 7; col += 1) {
      if (await page.getByRole('button', { name: `Play column ${col}`, exact: true }).isVisible().catch(() => false)) columnsSeen += 1;
    }
    results.board.columns = columnsSeen;

    // Rules sheet renders the Golf guide.
    const rulesBtn = page.getByRole('button', { name: 'Read rules', exact: true });
    await rulesBtn.waitFor({ state: 'visible', timeout: 30000 });
    await rulesBtn.click();
    await page.getByText('TABLE RULES', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
    const rulesBody = await page.locator('body').innerText();
    results.liveRules = {
      rendered: rulesBody.includes('Golf Solitaire') && rulesBody.includes('rank'),
    };
    await page.getByRole('button', { name: 'Close rules', exact: true }).first().click();
    await page.waitForTimeout(400);

    // Play autonomously to a terminal state.
    const play = await playUntilEnd(page);
    results.play = play;

    // End banner: COMPLETE with either the win or stuck copy, plus replay.
    const endedBody = await page.locator('body').innerText();
    results.endState = {
      rendered: endedBody.includes('COMPLETE'),
      winCopy: endedBody.includes('cleared the tableau'),
      stuckCopy: endedBody.includes('No more moves'),
      hasNewDeal: endedBody.includes('New deal'),
    };

    await page.screenshot({ path: `.qa-golf-${viewport.width}-ended.png`, fullPage: false });

    await page.getByRole('button', { name: 'New deal', exact: true }).click();
    await page.waitForTimeout(900);
    const replayBody = await page.locator('body').innerText();
    results.replay = {
      freshDeal: /TABLEAU 35\/35/.test(replayBody),
      endedBannerDismissed: !replayBody.includes('COMPLETE'),
    };

    const geometry = await readGeometry(page);
    results.geometry = geometry;
    results.errors = errors;
    return results;
  } catch (error) {
    results.error = error instanceof Error ? error.message : String(error);
    results.bodyTail = (await page.locator('body').innerText().catch(() => '')).slice(-1800);
    results.errors = errors;
    return results;
  } finally {
    await page.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  // Warm the web bundle once so viewport runs don't pay cold-compile time.
  const warm = await browser.newPage({ viewport: MOBILE });
  await warm.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 180000 }).catch(() => {});
  await warm.waitForTimeout(15000);
  await warm.close();

  const mobile = await runViewport(browser, MOBILE);
  const desktop = await runViewport(browser, DESKTOP);
  await browser.close();

  const output = { mobile, desktop };
  process.stdout.write(JSON.stringify(output, null, 2));

  const okMobile = !mobile.error && mobile.board.columns === 7 && mobile.board.readout
    && mobile.liveRules.rendered && mobile.play.plays > 0 && mobile.endState.rendered
    && (mobile.endState.winCopy || mobile.endState.stuckCopy) && mobile.endState.hasNewDeal
    && mobile.replay.freshDeal && mobile.replay.endedBannerDismissed
    && mobile.geometry && mobile.geometry.scrollWidth <= mobile.geometry.innerWidth
    && mobile.errors.length === 0;
  const okDesktop = !desktop.error && desktop.board.columns === 7 && desktop.board.readout
    && desktop.liveRules.rendered && desktop.play.plays > 0 && desktop.endState.rendered
    && (desktop.endState.winCopy || desktop.endState.stuckCopy) && desktop.endState.hasNewDeal
    && desktop.replay.freshDeal && desktop.replay.endedBannerDismissed
    && desktop.geometry && desktop.geometry.scrollWidth <= desktop.geometry.innerWidth
    && desktop.errors.length === 0;
  process.stdout.write(`\n\nGOLF QA: mobile=${okMobile ? 'PASS' : 'FAIL'} desktop=${okDesktop ? 'PASS' : 'FAIL'}\n`);
  process.exit(okMobile && okDesktop ? 0 : 1);
})();
