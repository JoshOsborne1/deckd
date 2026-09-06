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
  await visibleText(page, 'Choose a recipe');
  const preset = await visibleRecipeButton(page, 'Old Maid');
  await preset.click();
  await page.getByRole('button', { name: 'Deal now', exact: true }).last().click();
  await page.waitForTimeout(1200);
}

async function isUncovered(candidate) {
  return candidate.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    // RN Web text wrappers use pointer-events:none, so their own parent (or
    // another ancestor) is the legitimate hit target. A sibling cover is not.
    return target === element
      || (target !== null && element.contains(target))
      || (target !== null && target.contains(element));
  }).catch(() => false);
}

async function visibleText(page, text) {
  const candidate = await findVisibleText(page, text);
  if (candidate) return candidate;
  throw new Error(`No visible text: ${text}`);
}

async function findVisibleText(page, text) {
  const loc = page.getByText(text, { exact: true });
  const viewport = page.viewportSize();
  const count = await loc.count();
  for (let i = count - 1; i >= 0; i -= 1) {
    const candidate = loc.nth(i);
    if (!(await candidate.isVisible().catch(() => false))) continue;
    const box = await candidate.boundingBox().catch(() => null);
    if (!box || box.width <= 0 || box.height <= 0) continue;
    if (viewport && (box.y + box.height < 0 || box.y > viewport.height)) continue;
    const rendered = await candidate.evaluate((element) => {
      for (let node = element; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0) return false;
      }
      return true;
    }).catch(() => false);
    if (!rendered) continue;
    if (!(await isUncovered(candidate))) continue;
    return candidate;
  }
  return null;
}

async function visibleRecipeButton(page, name) {
  const loc = page.getByRole('button', { name: new RegExp(`^${name}`) });
  const viewport = page.viewportSize();
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const count = await loc.count();
    for (let i = 0; i < count; i += 1) {
      const candidate = loc.nth(i);
      if (!(await candidate.isVisible().catch(() => false))) continue;
      const before = await candidate.boundingBox().catch(() => null);
      if (!before || before.width <= 0 || before.height <= 0) continue;
      const beforeRight = before.x + before.width;
      const beforeBottom = before.y + before.height;
      if (!viewport || before.x < 0 || beforeRight > viewport.width || before.y < 0 || beforeBottom > viewport.height) {
        await candidate.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          for (let node = element.parentElement; node; node = node.parentElement) {
            if (node.scrollWidth <= node.clientWidth + 1) continue;
            const scroller = node.getBoundingClientRect();
            const desired = node.scrollLeft + rect.left + rect.width / 2 - (scroller.left + node.clientWidth / 2);
            node.scrollLeft = Math.max(0, Math.min(node.scrollWidth - node.clientWidth, desired));
            break;
          }
        }).catch(() => undefined);
        await page.waitForTimeout(100);
      }
      const box = await candidate.boundingBox().catch(() => null);
      if (!box || box.width <= 0 || box.height <= 0) continue;
      const boxRight = box.x + box.width;
      const boxBottom = box.y + box.height;
      if (viewport && (boxRight <= 0 || box.x >= viewport.width || boxBottom <= 0 || box.y >= viewport.height)) continue;
      if (await isUncovered(candidate)) return candidate;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`No visible recipe button: ${name}`);
}

async function visibleTestId(page, testId) {
  const loc = page.locator(`[data-testid="${testId}"]`);
  const viewport = page.viewportSize();
  const count = await loc.count();
  for (let i = count - 1; i >= 0; i -= 1) {
    const candidate = loc.nth(i);
    if (!(await candidate.isVisible().catch(() => false))) continue;
    const box = await candidate.boundingBox().catch(() => null);
    if (!box || box.width <= 0 || box.height <= 0) continue;
    if (viewport && (box.y + box.height < 0 || box.y > viewport.height)) continue;
    const hit = await candidate.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return target === element || (target !== null && element.contains(target));
    }).catch(() => false);
    if (!hit) continue;
    return candidate;
  }
  return null;
}

async function revealPass(page, reveal) {
  const prompt = reveal ?? await visibleText(page, 'Hold to reveal');
  const box = await prompt.boundingBox();
  if (!box) throw new Error('Pass reveal has no geometry');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(750);
  await page.mouse.up();
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (!(await findVisibleText(page, 'Hold to reveal'))) return;
    await page.waitForTimeout(100);
  }
  throw new Error('Pass reveal did not complete');
}

async function readGeometry(page) {
  return page.evaluate(() => {
    const root = document.getElementById('root');
    const rootRect = root?.getBoundingClientRect();
    const visibleRect = (selector) => Array.from(document.querySelectorAll(selector))
      .map((element) => {
        const box = element.getBoundingClientRect();
        let visible = true;
        for (let node = element; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            visible = false;
            break;
          }
        }
        return {
          box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height },
          visible,
        };
      })
      .filter(({ box, visible }) => visible && box.width > 0 && box.height > 0 && box.bottom >= 0 && box.top <= window.innerHeight)
      .map(({ box }) => box)
      .at(-1) ?? null;
    const handElement = document.querySelector('[data-testid="old-maid-hand"]');
    const handVisualBottom = handElement
      ? Array.from(handElement.querySelectorAll('*')).reduce((bottom, element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0 ? Math.max(bottom, box.bottom) : bottom;
      }, handElement.getBoundingClientRect().top)
      : null;
    return {
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      rootScrollLeft: root?.scrollLeft ?? 0,
      rootScrollWidth: root?.scrollWidth ?? 0,
      rootRectLeft: rootRect?.left ?? 0,
      rootRectWidth: rootRect?.width ?? 0,
      table: visibleRect('[data-testid="old-maid-table"]'),
      hand: visibleRect('[data-testid="old-maid-hand"]'),
      handVisualBottom,
      pairObject: visibleRect('[data-testid="old-maid-pair-object"]'),
      drawObject: visibleRect('[data-testid="old-maid-draw-object"]'),
      handHint: visibleRect('[data-testid="old-maid-hand-hint"]'),
      nav: visibleRect('[data-testid="global-nav-rail"]'),
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
    const passPrompt = await findVisibleText(page, 'Hold to reveal');
    if (passPrompt) {
      await revealPass(page, passPrompt);
      continue;
    }
    const body = await page.locator('body').innerText();
    if (body.includes('SESSION OVER') || body.includes('HAND OVER')) {
      ended = true;
      break;
    }
    if (body.includes('PAIRS')) pairSeen = true;
    const pair = await visibleTestId(page, 'old-maid-pair-object');
    if (pair && await pair.isEnabled().catch(() => false)) {
      await pair.click();
      await page.waitForTimeout(350);
      clicks += 1;
      continue;
    }
    const draw = await visibleTestId(page, 'old-maid-draw-object');
    if (draw && await draw.isEnabled().catch(() => false)) {
      drawSeen = true;
      await draw.click();
      await page.waitForTimeout(350);
      clicks += 1;
      continue;
    }
    const finish = await visibleTestId(page, 'old-maid-finish-object');
    if (finish && await finish.isEnabled().catch(() => true)) {
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

    // TableShell keeps rules behind the single utility trigger.
    await page.getByRole('button', { name: 'Open utility drawer', exact: true }).last().click();
    const rulesBtn = page.getByRole('button', { name: 'Read table rules', exact: true }).last();
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
    const pairObject = await visibleTestId(page, 'old-maid-pair-object');
    const drawObject = await visibleTestId(page, 'old-maid-draw-object');
    const initialGeometry = await readGeometry(page);
    results.table = {
      hasPhysicalObjects: Boolean(pairObject || drawObject),
      hasPairOrDraw: bodyBefore.includes('PAIR WELL') || bodyBefore.includes('PAIR UP') || bodyBefore.includes('DRAW CARD'),
      noDeadDrawPile: !bodyBefore.includes('0 LEFT'),
    };
    await page.screenshot({ path: `.qa-oldmaid-${viewport.width}-table.png`, fullPage: false });

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
      winnerCopy: endedBody.includes('dodged the maid') || endedBody.includes('keeps the maid') || endedBody.includes('stays with you'),
      maidReveal: endedBody.includes('THE MAID STAYS WITH') || endedBody.includes('YOU HOLD THE MAID'),
      consistentMaidOutcome: !(endedBody.includes('YOU HOLD THE MAID') && endedBody.includes('You dodged the maid')),
      noStaleWaitingCopy: !endedBody.includes('keep your maid hidden'),
      noStaleTurnCopy: !endedBody.includes('WAITING FOR') && !endedBody.includes('· TO PLAY') && !endedBody.includes('YOUR TURN'),
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
    results.initialGeometry = initialGeometry;
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

  const objectWithinViewport = (box, entry) => (
    box &&
    box.left >= -1 &&
    box.right <= entry.viewport.width + 1 &&
    box.top >= 0 &&
    box.bottom <= entry.viewport.height + 1
  );
  const objectsDoNotOverlapHand = (entry) => {
    const geometry = entry.initialGeometry ?? entry.geometry;
    const pairOrDraw = [geometry.pairObject, geometry.drawObject].filter(Boolean);
    return !geometry.hand || pairOrDraw.every((box) => box.bottom <= geometry.hand.top + 1);
  };

  const handClearsNav = (entry) => {
    const geometry = entry.initialGeometry ?? entry.geometry;
    if (!geometry.nav) return true;
    return (!geometry.hand || geometry.hand.bottom <= geometry.nav.top + 1) &&
      (geometry.handVisualBottom === null || geometry.handVisualBottom <= geometry.nav.top + 1) &&
      (!geometry.handHint || geometry.handHint.bottom <= geometry.nav.top + 1);
  };

  const checks = [mobile, desktop].every((entry) => (
    !entry.error &&
    entry.liveRules.rendered &&
    entry.table.hasPhysicalObjects &&
    entry.table.hasPairOrDraw &&
    entry.table.noDeadDrawPile &&
    entry.play.ended &&
    entry.feltAccessible &&
    entry.endState.rendered &&
    entry.endState.winnerCopy &&
    entry.endState.maidReveal &&
    entry.endState.consistentMaidOutcome &&
    entry.endState.noStaleWaitingCopy &&
    entry.endState.noStaleTurnCopy &&
    entry.endState.hasReplay &&
    entry.endState.hasBackToSetup &&
    entry.replay.backToPlay &&
    entry.replay.endedBannerDismissed &&
    objectWithinViewport((entry.initialGeometry ?? entry.geometry).pairObject, entry) &&
    objectWithinViewport((entry.initialGeometry ?? entry.geometry).drawObject, entry) &&
    objectsDoNotOverlapHand(entry) &&
    handClearsNav(entry) &&
    entry.errors.length === 0 &&
    goodGeometry(entry)
  ));

  if (!checks) process.exitCode = 2;
})();
