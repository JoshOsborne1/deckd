const { chromium } = require('playwright');

const BASE_URL = process.env.DECKD_QA_URL ?? 'http://127.0.0.1:8095';
const VIEWPORTS = [
  { width: 375, height: 812, name: '375' },
  { width: 1440, height: 900, name: '1440' },
];

async function visible(locator, label) {
  for (let i = 0; i < await locator.count(); i += 1) {
    const item = locator.nth(i);
    const box = await item.boundingBox().catch(() => null);
    const usable = await item.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.visibility !== 'hidden' && Number.parseFloat(style.opacity || '1') > 0.05;
    }).catch(() => false);
    if (box && box.width > 0 && box.height > 0 && usable) return item;
  }
  throw new Error(`No visible ${label}`);
}

async function clickVisible(page, locator, label) {
  const item = await visible(locator, label);
  await item.click();
  await page.waitForTimeout(700);
}

async function visibleCardInViewport(page) {
  const cards = page.getByRole('button', { name: /^Card / });
  const viewport = page.viewportSize();
  for (let index = (await cards.count()) - 1; index >= 0; index -= 1) {
    const card = cards.nth(index);
    const box = await card.boundingBox().catch(() => null);
    if (!box || !viewport || box.width < 20 || box.height < 20) continue;
    if (box.x + box.width <= 2 || box.x >= viewport.width - 2) continue;
    if (box.y < 250 || box.y >= viewport.height) continue;
    const testId = await card.getAttribute('data-testid');
    const topmost = await page.evaluate(({ x, y, id }) => {
      const element = document.elementFromPoint(x, y);
      return Boolean(element?.closest(`[data-testid="${id}"]`));
    }, { x: box.x + box.width / 2, y: box.y + box.height / 2, id: testId });
    if (topmost) return card;
  }
  return null;
}

async function openGame(page, gameName) {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'load', timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1300);
  await clickVisible(page, page.getByRole('button', { name: 'Deal the deck', exact: true }), 'Deal deck');
  const preset = page.getByRole('button', { name: new RegExp(`^${gameName}\\.`) });
  await clickVisible(page, preset, `${gameName} recipe`);
  await clickVisible(page, page.getByRole('button', { name: 'Deal now', exact: true }), 'Deal now');
  await page.waitForTimeout(1500);
}

async function body(page) {
  return (await page.locator('body').innerText()).replace(/\s+/g, ' ');
}

async function geometry(page) {
  return page.evaluate(() => {
    const root = document.getElementById('root');
    const rect = root?.getBoundingClientRect();
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      rootLeft: rect?.left ?? null,
      rootWidth: rect?.width ?? null,
      rootHeight: rect?.height ?? null,
    };
  });
}

async function captureGame(browser, gameName, viewport) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  const prefix = `.qa-baseline-${gameName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${viewport.name}`;
  try {
    await openGame(page, gameName);
    const initialBody = await body(page);
    await page.screenshot({ path: `${prefix}-initial.png`, fullPage: false });
    const result = {
      gameName,
      viewport,
      initial: {
        bodyHasTurn: initialBody.includes('YOUR TURN') || initialBody.includes('TO PLAY'),
        bodyText: initialBody.slice(-900),
      },
    };

    if (gameName === 'Blackjack-style') {
      await page.screenshot({ path: `${prefix}-playing.png`, fullPage: false });
      result.playing = {
        hasTwist: initialBody.includes('TWIST'),
        hasStick: initialBody.includes('STICK'),
        hasStand: initialBody.includes('STAND'),
        hasCards: initialBody.includes('HOUSE'),
      };
    } else if (gameName === 'Poker-style') {
      const call = await visible(page.getByRole('button', { name: 'CALL', exact: true }), 'CALL');
      await call.click();
      await page.waitForTimeout(700);
      const check = await visible(page.getByRole('button', { name: 'CHECK', exact: true }), 'CHECK');
      await check.click();
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${prefix}-flop.png`, fullPage: false });
      const flopBody = await body(page);
      result.playing = {
        hasPot: flopBody.includes('POT'),
        hasCommunityCards: !flopBody.includes('COMMUNITY'),
        hasBetActions: flopBody.includes('FOLD') && flopBody.includes('RAISE'),
        text: flopBody.slice(-900),
      };
    } else if (gameName === 'Sevens') {
      let card = null;
      for (let attempt = 0; attempt < 8 && !card; attempt += 1) {
        card = await visibleCardInViewport(page);
        if (!card) await page.waitForTimeout(250);
      }
      if (!card) throw new Error('No visible Sevens card');
      await card.click({ delay: 650 });
      await page.waitForTimeout(250);
      await (await visible(page.getByRole('button', { name: 'Play to the runs', exact: true }), 'Sevens card action')).click();
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${prefix}-after-play.png`, fullPage: false });
      const afterBody = await body(page);
      result.playing = {
        hasRuns: afterBody.includes('PLAYED'),
        hasDragHint: afterBody.toLowerCase().includes('drag'),
        hasPass: afterBody.includes('PASS'),
        text: afterBody.slice(-900),
      };
    }
    result.geometry = await geometry(page);
    result.errors = errors;
    return result;
  } catch (error) {
    return {
      gameName,
      viewport,
      error: error instanceof Error ? error.message : String(error),
      bodyText: await body(page).catch(() => ''),
      geometry: await geometry(page).catch(() => null),
      errors,
    };
  } finally {
    await page.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const viewport of VIEWPORTS) {
    for (const game of ['Blackjack-style', 'Poker-style', 'Sevens']) {
      results.push(await captureGame(browser, game, viewport));
    }
  }
  await browser.close();
  process.stdout.write(JSON.stringify(results, null, 2));
  if (results.some((result) => result.error || result.errors?.length)) process.exitCode = 2;
})();
