const { chromium } = require('playwright');

const BASE_URL = process.env.DECKD_QA_URL ?? 'http://127.0.0.1:8085';
const MOBILE = { width: 375, height: 812 };
const DESKTOP = { width: 1440, height: 900 };

async function visibleButton(page, name) {
  const loc = page.getByRole('button', { name, exact: true });
  const count = await loc.count();
  const viewport = page.viewportSize();
  for (let i = count - 1; i >= 0; i -= 1) {
    const candidate = loc.nth(i);
    if (!(await candidate.isVisible().catch(() => false))) continue;
    const box = await candidate.boundingBox().catch(() => null);
    if (!box || box.width <= 0 || box.height <= 0) continue;
    if (viewport && (box.bottom < 0 || box.top > viewport.height)) continue;
    return candidate;
  }
  throw new Error(`No visible button: ${name}`);
}

async function visibleText(page, text) {
  const loc = page.getByText(text, { exact: true });
  const count = await loc.count();
  const viewport = page.viewportSize();
  for (let i = count - 1; i >= 0; i -= 1) {
    const candidate = loc.nth(i);
    if (!(await candidate.isVisible().catch(() => false))) continue;
    const box = await candidate.boundingBox().catch(() => null);
    if (!box || box.width <= 0 || box.height <= 0) continue;
    if (viewport && (box.bottom < 0 || box.top > viewport.height)) continue;
    return candidate;
  }
  throw new Error(`No visible text: ${text}`);
}

async function hasVisibleTestId(page, testId) {
  const loc = page.locator(`[data-testid="${testId}"]`);
  const count = await loc.count();
  for (let i = count - 1; i >= 0; i -= 1) {
    const candidate = loc.nth(i);
    if (!(await candidate.isVisible().catch(() => false))) continue;
    const box = await candidate.boundingBox().catch(() => null);
    if (box && box.width > 0 && box.height > 0) return true;
  }
  return false;
}

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
  await visibleText(page, 'Choose a recipe');
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

async function readGolfGeometry(page) {
  return page.evaluate(() => {
    const rect = (element) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      };
    };
    const cardRects = Array.from(document.querySelectorAll('[data-testid^="golf-card-"]'))
      .map((element) => rect(element))
      .filter((box) => box && box.width > 0 && box.height > 0);
    const firstVisibleRect = (selector) => Array.from(document.querySelectorAll(selector))
      .map((element) => rect(element))
      .find((box) => box && box.width > 0 && box.height > 0) ?? null;
    const stock = firstVisibleRect('[data-testid="golf-stock-card"]');
    const draw = firstVisibleRect('button[aria-label="DRAW"]');
    const minLeft = cardRects.length ? Math.min(...cardRects.map((box) => box.left)) : null;
    const maxRight = cardRects.length ? Math.max(...cardRects.map((box) => box.right)) : null;
    const minTop = cardRects.length ? Math.min(...cardRects.map((box) => box.top)) : null;
    const maxBottom = cardRects.length ? Math.max(...cardRects.map((box) => box.bottom)) : null;
    return {
      cardCount: cardRects.length,
      cardWidths: [...new Set(cardRects.map((box) => Math.round(box.width)))],
      cardHeights: [...new Set(cardRects.map((box) => Math.round(box.height)))],
      aspectPreserved: cardRects.length === 35 && cardRects.every((box) => {
        const ratio = box.width / box.height;
        return box.width >= 59 && box.height >= 83 && ratio > 0.68 && ratio < 0.75;
      }),
      tableauBounds: { minLeft, maxRight, minTop, maxBottom },
      tableauWithinViewport: minLeft !== null && maxRight !== null
        && minLeft >= 0 && maxRight <= window.innerWidth,
      stock,
      draw,
      drawContainsStock: Boolean(stock && draw
        && draw.left <= stock.left && draw.right >= stock.right
        && draw.top <= stock.top && draw.bottom >= stock.bottom),
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
      const btn = await visibleButton(page, `Play column ${col}`).catch(() => null);
      if (!btn || !(await btn.isEnabled().catch(() => false))) continue; // empty or illegal column
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
    const drawBtn = await visibleButton(page, 'DRAW').catch(() => null);
    if (drawBtn && await drawBtn.isEnabled().catch(() => false)) {
      await drawBtn.click();
      draws += 1;
      await page.waitForTimeout(300);
      rounds += 1;
      continue;
    }
    const endBtn = await visibleButton(page, 'END TABLE').catch(() => null);
    if (endBtn) {
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
      if (await visibleButton(page, `Play column ${col}`).catch(() => null)) columnsSeen += 1;
    }
    results.board.columns = columnsSeen;
    results.geometry = await readGolfGeometry(page);
    await page.screenshot({ path: `.qa-golf-${viewport.width}-start.png`, fullPage: false });

    // The DRAW control lives on the stock itself and must advance the stock
    // without relying on the detached action rail.
    const beforeDraw = await readTableauCount(page);
    const drawBtn = await visibleButton(page, 'DRAW');
    const beforeBody = await page.locator('body').innerText();
    const beforeStock = Number(beforeBody.match(/TABLEAU \d+\/35 · STOCK (\d+)/)?.[1] ?? -1);
    await drawBtn.click();
    await page.waitForTimeout(350);
    const afterBody = await page.locator('body').innerText();
    const afterStock = Number(afterBody.match(/TABLEAU \d+\/35 · STOCK (\d+)/)?.[1] ?? -1);
    const afterDraw = await readTableauCount(page);
    results.drawInteraction = {
      stockBefore: beforeStock,
      stockAfter: afterStock,
      tableauBefore: beforeDraw,
      tableauAfter: afterDraw,
      stockDecremented: beforeStock > 0 && afterStock === beforeStock - 1,
      tableauUnchanged: beforeDraw >= 0 && beforeDraw === afterDraw,
      wasteCardRendered: await hasVisibleTestId(page, 'golf-waste-card'),
    };

    // Rules sheet is owned by the shell's utility drawer, which keeps the
    // gameplay surface focused on the stock and tableau.
    const utilityBtn = await visibleButton(page, 'Open utility drawer');
    await utilityBtn.click();
    const rulesBtn = await visibleButton(page, 'Read table rules');
    await rulesBtn.click();
    await visibleText(page, 'TABLE RULES');
    const rulesBody = await page.locator('body').innerText();
    results.liveRules = {
      rendered: rulesBody.includes('Golf Solitaire') && rulesBody.includes('rank'),
    };
    await (await visibleButton(page, 'Close rules')).click();
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

    await (await visibleButton(page, 'New deal')).click();
    await page.waitForTimeout(900);
    const replayBody = await page.locator('body').innerText();
    results.replay = {
      freshDeal: /TABLEAU 35\/35/.test(replayBody),
      endedBannerDismissed: !replayBody.includes('COMPLETE'),
    };

    const documentGeometry = await readGeometry(page);
    results.documentGeometry = documentGeometry;
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
    && mobile.liveRules.rendered && mobile.drawInteraction.stockDecremented
    && mobile.drawInteraction.tableauUnchanged && mobile.drawInteraction.wasteCardRendered
    && mobile.geometry.cardCount === 35 && mobile.geometry.aspectPreserved
    && mobile.geometry.tableauWithinViewport && mobile.geometry.drawContainsStock
    && mobile.play.plays > 0 && mobile.endState.rendered
    && (mobile.endState.winCopy || mobile.endState.stuckCopy) && mobile.endState.hasNewDeal
    && mobile.replay.freshDeal && mobile.replay.endedBannerDismissed
    && mobile.documentGeometry && mobile.documentGeometry.scrollWidth <= mobile.documentGeometry.innerWidth
    && mobile.errors.length === 0;
  const okDesktop = !desktop.error && desktop.board.columns === 7 && desktop.board.readout
    && desktop.liveRules.rendered && desktop.drawInteraction.stockDecremented
    && desktop.drawInteraction.tableauUnchanged && desktop.drawInteraction.wasteCardRendered
    && desktop.geometry.cardCount === 35 && desktop.geometry.aspectPreserved
    && desktop.geometry.tableauWithinViewport && desktop.geometry.drawContainsStock
    && desktop.play.plays > 0 && desktop.endState.rendered
    && (desktop.endState.winCopy || desktop.endState.stuckCopy) && desktop.endState.hasNewDeal
    && desktop.replay.freshDeal && desktop.replay.endedBannerDismissed
    && desktop.documentGeometry && desktop.documentGeometry.scrollWidth <= desktop.documentGeometry.innerWidth
    && desktop.errors.length === 0;
  process.stdout.write(`\n\nGOLF QA: mobile=${okMobile ? 'PASS' : 'FAIL'} desktop=${okDesktop ? 'PASS' : 'FAIL'}\n`);
  process.exit(okMobile && okDesktop ? 0 : 1);
})();
