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

async function startGoFish(page) {
  await page.getByRole('button', { name: 'Deal the deck', exact: true }).last().click();
  await page.getByText('Choose a recipe', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  const preset = page.getByRole('button', { name: /^Go Fish\./ }).last();
  await preset.waitFor({ state: 'visible', timeout: 30000 });
  await preset.click();
  await page.getByRole('button', { name: 'Deal now', exact: true }).last().click();
  await page.waitForTimeout(1200);
}

async function firstAskButton(page) {
  const button = page.getByRole('button', { name: /^ASK / }).first();
  await button.waitFor({ state: 'visible', timeout: 30000 });
  return button;
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

/** Click ASK buttons until a book appears on the felt or the round ends. */
async function playUntilBookOrEnd(page, maxClicks = 120) {
  let clicks = 0;
  let bookSeen = false;
  let missSeen = false;
  let ended = false;
  while (clicks < maxClicks) {
    const body = await page.locator('body').innerText();
    if (body.includes('SESSION OVER') || body.includes('HAND OVER')) {
      ended = true;
      break;
    }
    if (body.includes('BOOK')) {
      bookSeen = true;
    }
    const finish = page.getByRole('button', { name: 'FINISH', exact: true });
    if (await finish.isVisible().catch(() => false)) {
      await finish.click();
      await page.waitForTimeout(500);
      continue;
    }
    const ask = page.getByRole('button', { name: /^ASK / }).first();
    if (!(await ask.isVisible().catch(() => false))) {
      break;
    }
    const before = await page.locator('body').innerText();
    await ask.click();
    await page.waitForTimeout(450);
    const after = await page.locator('body').innerText();
    if (after.includes('PASS THE TABLE') && !before.includes('PASS THE TABLE')) {
      missSeen = true;
    }
    if (after.includes('BOOK') && !before.includes('BOOK')) {
      bookSeen = true;
    }
    if (after.includes('SESSION OVER')) {
      ended = true;
      break;
    }
    clicks += 1;
  }
  return { clicks, bookSeen, missSeen, ended };
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
    await startGoFish(page);

    // Table live rules sheet mentions the ask flow.
    const rulesBtn = page.getByRole('button', { name: 'Read table rules', exact: true });
    await rulesBtn.waitFor({ state: 'visible', timeout: 30000 });
    await rulesBtn.click();
    await page.getByText('TABLE RULES', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
    const rulesBody = await page.locator('body').innerText();
    results.liveRules = {
      rendered: rulesBody.includes('Go Fish') && rulesBody.includes('Ask the next player'),
    };
    await page.getByText('Back to the table', { exact: true }).last().click();
    await page.waitForTimeout(400);

    // Ask rail + readout present.
    const bodyBefore = await page.locator('body').innerText();
    results.table = {
      hasAsk: /ASK [A-Z0-9]+/.test(bodyBefore),
      hasBooksReadout: bodyBefore.includes('BOOKS'),
    };

    // Play until a book lands on the felt or the round ends.
    const play = await playUntilBookOrEnd(page);
    results.play = play;
    results.bookOnFelt = (await page.locator('body').innerText()).includes('BOOK');

    // The felt stack exposes an accessible label for QA / assistive tech.
    const feltLabel = page.locator('[aria-label*="BOOK cards on the felt"]').first();
    results.feltAccessible = await feltLabel.isVisible().catch(() => false);

    // Keep playing until the round ends (bounded).
    while (!play.ended) {
      const again = await playUntilBookOrEnd(page);
      if (again.ended) break;
      if (again.clicks === 0) break;
    }
    const endedBody = await page.locator('body').innerText();
    results.endState = {
      rendered: endedBody.includes('SESSION OVER'),
      winnerCopy: endedBody.includes('takes the table') || endedBody.includes('take the table'),
      bookCountMeta: /\d+ books ·/i.test(endedBody),
      hasReplay: endedBody.includes('Replay table'),
      hasBackToSetup: endedBody.includes('Back to setup'),
    };

    await page.screenshot({ path: `.qa-gofish-${viewport.width}-ended.png`, fullPage: false });

    await page.getByRole('button', { name: 'Replay table', exact: true }).click();
    await page.waitForTimeout(800);
    const replayBody = await page.locator('body').innerText();
    results.replay = {
      backToPlay: /ASK [A-Z0-9]+/.test(replayBody) || replayBody.includes('YOUR TURN'),
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
    entry.table.hasAsk &&
    entry.table.hasBooksReadout &&
    entry.play.bookSeen &&
    entry.endState.rendered &&
    entry.endState.winnerCopy &&
    entry.endState.bookCountMeta &&
    entry.endState.hasReplay &&
    entry.endState.hasBackToSetup &&
    entry.replay.backToPlay &&
    entry.replay.endedBannerDismissed &&
    entry.errors.length === 0 &&
    goodGeometry(entry)
  ));

  if (!checks) process.exitCode = 2;
})();
