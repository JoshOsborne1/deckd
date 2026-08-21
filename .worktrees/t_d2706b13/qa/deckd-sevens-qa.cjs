const { chromium } = require('playwright');

const BASE_URL = process.env.DECKD_QA_URL ?? 'http://127.0.0.1:8081';
const MOBILE = { width: 375, height: 812 };
const DESKTOP = { width: 1440, height: 900 };

async function waitForHome(page) {
  await page.getByRole('button', { name: 'Deal the deck', exact: true }).last().waitFor({ state: 'visible', timeout: 60000 });
}

async function reset(page) {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'commit', timeout: 60000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'commit', timeout: 60000 });
  await waitForHome(page);
}

async function startSevens(page) {
  await page.getByRole('button', { name: 'Deal the deck', exact: true }).last().click();
  await page.getByText('Choose a recipe', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  const preset = page.getByRole('button', { name: /^Sevens\./ }).last();
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

/**
 * Drive the Sevens turn loop. The rule rail owns the game: PLAY <rank>
 * buttons for cards that legally extend a suit run, PASS when nothing fits.
 * Returns what the driver observed.
 */
async function playUntilEnd(page, maxClicks = 300) {
  let clicks = 0;
  let playSeen = false;
  let passSeen = false;
  let ended = false;
  while (clicks < maxClicks) {
    const body = await page.locator('body').innerText();
    if (body.includes('SESSION OVER') || body.includes('HAND OVER')) {
      ended = true;
      break;
    }
    const play = page.getByRole('button', { name: /^PLAY / }).first();
    if (await play.isVisible().catch(() => false)) {
      playSeen = true;
      await play.click();
      await page.waitForTimeout(350);
      clicks += 1;
      continue;
    }
    const pass = page.getByRole('button', { name: /^PASS$/i, exact: true });
    if (await pass.isVisible().catch(() => false)) {
      passSeen = true;
      await pass.click();
      await page.waitForTimeout(350);
      clicks += 1;
      continue;
    }
    break;
  }
  return { clicks, playSeen, passSeen, ended };
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
    await startSevens(page);

    // Live rules sheet mentions the run-building flow.
    const rulesBtn = page.getByRole('button', { name: 'Read table rules', exact: true });
    await rulesBtn.waitFor({ state: 'visible', timeout: 30000 });
    await rulesBtn.click();
    await page.getByText('TABLE RULES', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
    const rulesBody = await page.locator('body').innerText();
    results.liveRules = {
      rendered: rulesBody.includes('Sevens') && rulesBody.includes('suit run'),
    };
    await page.getByText('Back to the table', { exact: true }).last().click();
    await page.waitForTimeout(400);

    // The felt shows the readout (PLAYED/HAND) and no dead draw-pile deck
    // object (rule rail owns the game; the pile count lives in the readout).
    const bodyBefore = await page.locator('body').innerText();
    results.table = {
      readoutPresent: bodyBefore.includes('PLAYED') && bodyBefore.includes('HAND'),
      noDeadDrawPile: !bodyBefore.includes('LEFT') && !bodyBefore.includes('Draw pile,'),
    };

    // Play to the end through the rule rail. Sevens is pass-heavy, so the
    // driver must see both PLAY and PASS.
    const play = await playUntilEnd(page);
    results.play = play;

    // End banner: SESSION OVER + Sevens winner copy + replay.
    const endedBody = await page.locator('body').innerText();
    results.endState = {
      rendered: endedBody.includes('SESSION OVER'),
      winnerCopy: endedBody.includes('plays out first') || endedBody.includes('play out first'),
      hasReplay: endedBody.includes('Replay table'),
      hasBackToSetup: endedBody.includes('Back to setup'),
    };

    await page.screenshot({ path: `.qa-sevens-${viewport.width}-ended.png`, fullPage: false });

    await page.getByRole('button', { name: 'Replay table', exact: true }).click();
    await page.waitForTimeout(900);
    const replayBody = await page.locator('body').innerText();
    results.replay = {
      backToPlay: replayBody.includes('PLAY') || replayBody.includes('YOUR TURN') || replayBody.includes('PASS'),
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
    entry.table.readoutPresent &&
    entry.table.noDeadDrawPile &&
    entry.play.ended &&
    entry.play.playSeen &&
    entry.play.passSeen &&
    entry.endState.rendered &&
    entry.endState.winnerCopy &&
    entry.endState.hasReplay &&
    entry.endState.hasBackToSetup &&
    entry.replay.backToPlay &&
    entry.replay.endedBannerDismissed &&
    entry.errors.length === 0 &&
    goodGeometry(entry)
  ));

  if (!checks) process.exitCode = 2;
})();
