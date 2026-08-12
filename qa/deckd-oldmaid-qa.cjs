const { chromium } = require('playwright');

const BASE_URL = process.env.DECKD_QA_URL ?? 'http://127.0.0.1:8081';
const MOBILE = { width: 375, height: 812 };
const DESKTOP = { width: 1440, height: 900 };

async function waitForHome(page) {
  await page.getByRole('button', { name: 'Deal the deck', exact: true }).last().waitFor({ state: 'visible', timeout: 30000 });
}

async function reset(page) {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'commit', timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'commit', timeout: 30000 });
  await waitForHome(page);
}

async function startOldMaid(page) {
  await page.getByRole('button', { name: 'Deal the deck', exact: true }).last().click();
  await page.getByText('Choose a recipe', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  const preset = page.getByRole('button', { name: /^Old Maid\./ }).last();
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

/** Click the current player's action (PAIR UP / DRAW CARD / FINISH) until the round ends. */
async function playUntilEnd(page, maxClicks = 200) {
  let clicks = 0;
  let pairSeen = false;
  let drawSeen = false;
  let ended = false;
  while (clicks < maxClicks) {
    const body = await page.locator('body').innerText();
    if (body.includes('SESSION OVER') || body.includes('HAND OVER')) {
      ended = true;
      break;
    }
    if (body.includes('PAIRS')) pairSeen = true;
    const pair = page.getByRole('button', { name: 'PAIR UP', exact: true });
    if (await pair.isVisible().catch(() => false)) {
      await pair.click();
      await page.waitForTimeout(350);
      clicks += 1;
      continue;
    }
    const draw = page.getByRole('button', { name: 'DRAW CARD', exact: true });
    if (await draw.isVisible().catch(() => false)) {
      drawSeen = true;
      await draw.click();
      await page.waitForTimeout(350);
      clicks += 1;
      continue;
    }
    const finish = page.getByRole('button', { name: 'FINISH', exact: true });
    if (await finish.isVisible().catch(() => false)) {
      await finish.click();
      await page.waitForTimeout(500);
      clicks += 1;
      continue;
    }
    break;
  }
  return { clicks, pairSeen, drawSeen, ended };
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
    await startOldMaid(page);

    // Table live rules sheet mentions the pair/draw flow.
    const rulesBtn = page.getByRole('button', { name: 'Read table rules', exact: true });
    await rulesBtn.waitFor({ state: 'visible', timeout: 30000 });
    await rulesBtn.click();
    await page.getByText('TABLE RULES', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
    const rulesBody = await page.locator('body').innerText();
    results.liveRules = {
      rendered: rulesBody.includes('Old Maid') && rulesBody.includes('Pair'),
    };
    await page.getByText('Back to the table', { exact: true }).last().click();
    await page.waitForTimeout(400);

    // Action rail present; no dead draw pile (Old Maid deals the whole deck).
    const bodyBefore = await page.locator('body').innerText();
    results.table = {
      hasPairOrDraw: bodyBefore.includes('PAIR UP') || bodyBefore.includes('DRAW CARD'),
      noDeadDrawPile: !bodyBefore.includes('0 LEFT'),
    };

    // Play to the end.
    const play = await playUntilEnd(page);
    results.play = play;

    // Pairs on the felt with an accessible label.
    const feltLabel = page.locator('[aria-label*="PAIRS cards on the felt"]').first();
    results.feltAccessible = await feltLabel.isVisible().catch(() => false);

    // End banner: winner copy + maid reveal.
    const endedBody = await page.locator('body').innerText();
    results.endState = {
      rendered: endedBody.includes('SESSION OVER'),
      winnerCopy: endedBody.includes('dodged the maid'),
      maidReveal: endedBody.includes('THE MAID STAYS WITH') || endedBody.includes('YOU HOLD THE MAID'),
      hasReplay: endedBody.includes('Replay table'),
      hasBackToSetup: endedBody.includes('Back to setup'),
    };

    await page.screenshot({ path: `.qa-oldmaid-${viewport.width}-ended.png`, fullPage: false });

    await page.getByRole('button', { name: 'Replay table', exact: true }).click();
    await page.waitForTimeout(800);
    const replayBody = await page.locator('body').innerText();
    results.replay = {
      backToPlay: replayBody.includes('PAIR UP') || replayBody.includes('DRAW CARD') || replayBody.includes('YOUR TURN'),
      endedBannerDismissed: !replayBody.includes('SESSION OVER'),
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
  const mobile = await runViewport(browser, MOBILE);
  const desktop = await runViewport(browser, DESKTOP);
  await browser.close();

  const output = { mobile, desktop };
  process.stdout.write(JSON.stringify(output, null, 2));

  const goodGeometry = (entry) => (
    entry.geometry.scrollWidth === entry.viewport.width &&
    entry.geometry.bodyScrollWidth === entry.viewport.width &&
    entry.geometry.rootScrollLeft === 0 &&
    entry.geometry.rootRectLeft === 0 &&
    entry.geometry.rootRectWidth === entry.viewport.width
  );

  const checks = [mobile, desktop].every((entry) => (
    !entry.error &&
    entry.liveRules.rendered &&
    entry.table.hasPairOrDraw &&
    entry.table.noDeadDrawPile &&
    entry.play.ended &&
    entry.feltAccessible &&
    entry.endState.rendered &&
    entry.endState.winnerCopy &&
    entry.endState.maidReveal &&
    entry.endState.hasReplay &&
    entry.endState.hasBackToSetup &&
    entry.replay.backToPlay &&
    entry.replay.endedBannerDismissed &&
    entry.errors.length === 0 &&
    goodGeometry(entry)
  ));

  if (!checks) process.exitCode = 2;
})();
