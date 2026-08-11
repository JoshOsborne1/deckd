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

async function startPreset(page, name) {
  await page.getByRole('button', { name: 'Deal the deck', exact: true }).last().click();
  await page.getByText('Choose a recipe', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  const preset = page.getByRole('button', { name: new RegExp(`^${name}\\.`) }).last();
  await preset.waitFor({ state: 'visible', timeout: 30000 });
  await preset.click();
  await page.getByRole('button', { name: 'Deal now', exact: true }).last().click();
  await page.waitForTimeout(1200);
}

async function firstButton(page, pattern) {
  const button = page.getByRole('button', { name: pattern }).first();
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
      scrollX: window.scrollX,
      rootScrollLeft: root?.scrollLeft ?? 0,
      rootScrollWidth: root?.scrollWidth ?? 0,
      rootRectLeft: rootRect?.left ?? 0,
      rootRectWidth: rootRect?.width ?? 0,
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
    await startPreset(page, 'War');
    const warBefore = await page.locator('body').innerText();
    await (await firstButton(page, /^FLIP$/)).click();
    await page.waitForTimeout(500);
    results.war = {
      hasPiles: warBefore.includes('CARDS'),
      hasFlip: warBefore.includes('FLIP'),
      battleRendered: (await page.locator('body').innerText()).includes('BATTLE'),
      geometry: await readGeometry(page),
    };
    await page.screenshot({ path: '.qa-library-war-375.png', fullPage: false });

    await reset(page);
    await startPreset(page, 'Go Fish');
    const fishBefore = await page.locator('body').innerText();
    const fishAction = await firstButton(page, /^ASK /);
    await fishAction.click();
    await page.waitForTimeout(500);
    const fishAfter = await page.locator('body').innerText();
    results.goFish = {
      hasAsk: /ASK [A-Z0-9]+/.test(fishBefore),
      hasBooksReadout: fishAfter.includes('BOOKS'),
      hasTurnCopy: fishAfter.includes('YOUR TURN') || fishAfter.includes('PASS THE TABLE'),
      geometry: await readGeometry(page),
    };
    await page.screenshot({ path: '.qa-library-go-fish-375.png', fullPage: false });

    await reset(page);
    await startPreset(page, 'Old Maid');
    const maidBefore = await page.locator('body').innerText();
    const maidAction = await firstButton(page, /^(PAIR UP|DRAW CARD)$/);
    await maidAction.click();
    await page.waitForTimeout(500);
    const maidAfter = await page.locator('body').innerText();
    results.oldMaid = {
      hasPairOrDraw: maidBefore.includes('PAIR UP') || maidBefore.includes('DRAW CARD'),
      hasPairsReadout: maidAfter.includes('PAIRS'),
      hasTurnCopy: maidAfter.includes('YOUR TURN') || maidAfter.includes('PASS THE TABLE'),
      geometry: await readGeometry(page),
    };
    await page.screenshot({ path: '.qa-library-old-maid-375.png', fullPage: false });

    await reset(page);
    await startPreset(page, 'Crazy Eights');
    const crazyBefore = await page.locator('body').innerText();
    const crazyAction = await firstButton(page, /^(PLAY|DRAW)/);
    await crazyAction.click();
    await page.waitForTimeout(500);
    const crazyAfter = await page.locator('body').innerText();
    results.crazyEights = {
      hasPlayOrDraw: crazyBefore.includes('PLAY') || crazyBefore.includes('DRAW'),
      hasHandReadout: crazyAfter.includes('HAND'),
      hasTurnCopy: crazyAfter.includes('YOUR TURN') || crazyAfter.includes('PASS THE TABLE'),
      geometry: await readGeometry(page),
    };
    await page.screenshot({ path: '.qa-library-crazy-eights-375.png', fullPage: false });

    await reset(page);
    await startPreset(page, 'Sevens');
    const sevensBefore = await page.locator('body').innerText();
    const sevensAction = await firstButton(page, /^(PLAY|PASS)/);
    await sevensAction.click();
    await page.waitForTimeout(500);
    const sevensAfter = await page.locator('body').innerText();
    results.sevens = {
      hasPlayOrPass: sevensBefore.includes('PLAY') || sevensBefore.includes('PASS'),
      hasPlayedReadout: sevensAfter.includes('PLAYED'),
      hasTurnCopy: sevensAfter.includes('YOUR TURN') || sevensAfter.includes('PASS THE TABLE'),
      geometry: await readGeometry(page),
    };
    await page.screenshot({ path: '.qa-library-sevens-375.png', fullPage: false });

    const geometry = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      rootScrollLeft: document.getElementById('root')?.scrollLeft ?? 0,
      rootScrollWidth: document.getElementById('root')?.scrollWidth ?? 0,
      rootRectLeft: document.getElementById('root')?.getBoundingClientRect().left ?? 0,
    }));
    const result = { viewport: VIEWPORT, results, geometry, errors };
    process.stdout.write(JSON.stringify(result, null, 2));
    await browser.close();
    const passed = Object.values(results).every((entry) => Object.values(entry).every(Boolean));
    const rootShifted = Object.values(results).some((entry) => (
      entry.geometry.rootScrollLeft !== 0 ||
      entry.geometry.rootRectLeft !== 0 ||
      entry.geometry.rootRectWidth !== VIEWPORT.width
    ));
    if (
      !passed ||
      geometry.scrollWidth !== VIEWPORT.width ||
      geometry.bodyScrollWidth !== VIEWPORT.width ||
      geometry.rootScrollLeft !== 0 ||
      geometry.rootRectLeft !== 0 ||
      rootShifted ||
      errors.length > 0
    ) {
      process.exitCode = 2;
    }
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
