const { chromium } = require('playwright');

const BASE_URL = process.env.DECKD_QA_URL ?? 'http://127.0.0.1:8081';
const VIEWPORT = { width: 375, height: 812 };

async function lastVisible(locator, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (let index = (await locator.count()) - 1; index >= 0; index -= 1) {
      const candidate = locator.nth(index);
      if (await candidate.isVisible().catch(() => false)) return candidate;
    }
    await locator.page().waitForTimeout(100);
  }
  throw new Error('Timed out waiting for a visible locator');
}

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
  await lastVisible(page.getByText('Choose a recipe', { exact: true }));
  const preset = await lastVisible(page.getByRole('button', { name: new RegExp(`^${name}\\.`) }));
  await preset.click();
  await (await lastVisible(page.getByRole('button', { name: 'Deal now', exact: true }))).click();
  await page.waitForTimeout(1200);
}

async function firstButton(page, pattern) {
  return lastVisible(page.getByRole('button', { name: pattern }));
}

async function handCardButton(page) {
  const cards = page.getByRole('button', {
    name: /^(A|Ace|[2-9]|10|J|Jack|Q|Queen|K|King) of (clubs|diamonds|hearts|spades)$/i,
  });
  const count = await cards.count();
  for (let index = count - 1; index >= 0; index -= 1) {
    const card = cards.nth(index);
    const rect = await card.boundingBox();
    if (rect && rect.y > VIEWPORT.height * 0.45 && await card.isVisible()) return card;
  }
  throw new Error('No active hand card control found');
}

async function optionalHandCardButton(page) {
  try {
    return await handCardButton(page);
  } catch {
    return null;
  }
}

async function hasVisibleButton(page, pattern) {
  const buttons = page.getByRole('button', { name: pattern });
  for (let index = 0; index < await buttons.count(); index += 1) {
    if (await buttons.nth(index).isVisible().catch(() => false)) return true;
  }
  return false;
}

async function visibleTableButtonNames(page) {
  return page.locator('[role="button"]').evaluateAll((elements) => elements
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        name: element.getAttribute('aria-label') ?? element.textContent?.trim() ?? '',
        top: rect.top,
        visible: rect.width > 0 && rect.height > 0,
      };
    })
    .filter((entry) => entry.visible && entry.top > 300)
    .map((entry) => entry.name));
}

async function cardButtonDebug(page) {
  return page.locator('[role="button"]').evaluateAll((elements) => elements
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.top > 300
        && /^(A|[2-9]|10|J|Q|K)$/.test(element.textContent?.trim() ?? '');
    })
    .map((element) => element.outerHTML.slice(0, 1200)));
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
    await (await firstButton(page, /^Play the top card from your pile,/)).click();
    await page.waitForTimeout(500);
    results.war = {
      hasPiles: warBefore.includes('TAP TO PLAY') && warBefore.includes('VS'),
      hasPhysicalPileControl: warBefore.includes('TAP TO PLAY'),
      retiredFlipDockAbsent: !(await hasVisibleButton(page, /^FLIP$/)),
      battleRendered: (await page.locator('body').innerText()).includes('BATTLE'),
      geometry: await readGeometry(page),
    };
    await page.screenshot({ path: '.qa-library-war-375.png', fullPage: false });

    await reset(page);
    await startPreset(page, 'Go Fish');
    const fishAction = await handCardButton(page);
    await fishAction.click();
    await page.waitForTimeout(500);
    const fishAfter = await page.locator('body').innerText();
    results.goFish = {
      hasCardAskControl: true,
      retiredRankDockAbsent: !(await hasVisibleButton(page, /^ASK /)),
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
    const crazyCard = await optionalHandCardButton(page);
    const crazyDraw = page.getByRole('button', { name: /^Draw pile,/ }).last();
    const crazyHasDraw = await crazyDraw.isEnabled().catch(() => false);
    if (!crazyCard && crazyHasDraw) await crazyDraw.click();
    await page.waitForTimeout(500);
    const crazyAfter = await page.locator('body').innerText();
    results.crazyEights = {
      hasPhysicalCardOrDraw: Boolean(crazyCard) || crazyHasDraw,
      retiredPlayButtonsAbsent: !(await hasVisibleButton(page, /^PLAY /)),
      hasDropTarget: crazyBefore.includes('DROP TO PLAY') || crazyHasDraw,
      hasHandReadout: crazyAfter.includes('HAND'),
      hasTurnCopy: crazyAfter.includes('YOUR TURN') || crazyAfter.includes('PASS THE TABLE'),
      visibleControls: await visibleTableButtonNames(page),
      cardButtonDebug: await cardButtonDebug(page),
      geometry: await readGeometry(page),
    };
    await page.screenshot({ path: '.qa-library-crazy-eights-375.png', fullPage: false });

    await reset(page);
    await startPreset(page, 'Sevens');
    const sevensCard = await optionalHandCardButton(page);
    const sevensPass = page.getByRole('button', { name: /^PASS$/ }).last();
    const sevensHasPass = await sevensPass.isEnabled().catch(() => false);
    if (!sevensCard && sevensHasPass) await sevensPass.click();
    await page.waitForTimeout(500);
    const sevensAfter = await page.locator('body').innerText();
    results.sevens = {
      hasPhysicalOrPass: Boolean(sevensCard) || sevensHasPass,
      retiredPlayButtonsAbsent: !(await hasVisibleButton(page, /^PLAY /)),
      hasPlayedReadout: sevensAfter.includes('PLAYED'),
      hasTurnCopy: sevensAfter.includes('YOUR TURN') || sevensAfter.includes('PASS THE TABLE'),
      visibleControls: await visibleTableButtonNames(page),
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
