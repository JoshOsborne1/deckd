const { chromium } = require('playwright');
const BASE_URL = (process.env.DECKD_QA_URL ?? 'http://127.0.0.1:8082').replace(/\/$/, '');
const VIEWPORT_WIDTH = Number(process.env.DECKD_QA_WIDTH ?? 375);
const VIEWPORT_HEIGHT = Number(process.env.DECKD_QA_HEIGHT ?? 812);
const QA_SUFFIX = `${VIEWPORT_WIDTH}x${VIEWPORT_HEIGHT}`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
    deviceScaleFactor: 1,
  });
  // The game store persists its event log in localStorage. Start every run
  // from a cold client so a prior ended hand cannot mask setup or deal.
  await context.addInitScript(() => window.localStorage.clear());
  const page = await context.newPage();
  const errors = [];
  const actions = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  const waitForTable = async () => page.waitForTimeout(900);
  const clickAction = async (name) => {
    const button = page.getByRole('button', { name: new RegExp(`^${name}(?:\\s|$)`, 'i') });
    const count = await button.count();
    let target = null;
    for (let index = count - 1; index >= 0; index -= 1) {
      const candidate = button.nth(index);
      const box = await candidate.boundingBox().catch(() => null);
      if (box && box.width > 0 && box.height > 0 && box.y >= 0 && box.y < VIEWPORT_HEIGHT) {
        target = candidate;
        break;
      }
    }
    if (!target) throw new Error(`no visible ${name} action`);
    await target.click();
    actions.push(name);
    await waitForTable();
    return true;
  };
  const text = async () => page.locator('body').innerText();
  const firstVisibleBox = async (locator) => {
    const count = await locator.count();
    for (let index = count - 1; index >= 0; index -= 1) {
      const candidate = locator.nth(index);
      const box = await candidate.boundingBox().catch(() => null);
      if (box && box.width > 0 && box.height > 0 && box.y >= 0 && box.y < VIEWPORT_HEIGHT) {
        return box;
      }
    }
    return null;
  };
  const turnStatusIsAdjacentToAction = async () => {
    const turnBox = await firstVisibleBox(page.getByText('YOUR TURN', { exact: true }));
    const actionBox = await firstVisibleBox(page.getByRole('button', { name: /^FOLD(?:\s|$)/i }));
    if (!turnBox || !actionBox) return false;
    const turnBottom = turnBox.y + turnBox.height;
    return Math.abs(actionBox.y - turnBottom) <= 80 || Math.abs(turnBox.y - (actionBox.y + actionBox.height)) <= 80;
  };

  await page.goto(`${BASE_URL}/`, { waitUntil: 'commit', timeout: 30000 });
  await page.getByRole('button', { name: /Deal the deck/ }).first().waitFor({ state: 'visible', timeout: 30000 });

  // Deal a table, choose Poker, then start the hand.
  await page.getByRole('button', { name: /Deal the deck/ }).first().click();
  await waitForTable();
  const presetBtn = page.getByRole('button', { name: /Poker/i });
  await presetBtn.first().waitFor({ state: 'visible', timeout: 15000 });
  await presetBtn.first().click();
  await page.waitForTimeout(500);
  const dealNow = page.getByRole('button').filter({ hasText: 'Drop into play' });
  await dealNow.first().waitFor({ state: 'visible', timeout: 15000 });
  await dealNow.first().click();
  await page.waitForTimeout(1500);

  await page.screenshot({ path: `.qa-poker-dealt-${QA_SUFFIX}.png`, fullPage: false });
  let bodyText = await text();
  const muckBox = await firstVisibleBox(page.locator('[aria-label^="Muck zone"]'));
  const initial = {
    hasPot: bodyText.includes('POT'),
    hasStack: bodyText.includes('YOUR STACK'),
    hasFold: bodyText.includes('FOLD'),
    hasCheck: bodyText.includes('CHECK'),
    hasCall: bodyText.includes('CALL'),
    hasRaise: bodyText.includes('RAISE'),
    hasNoStreetControlBeforeBetting: !bodyText.includes('BURN') && !bodyText.includes('FLOP'),
    hasMuckZone: bodyText.includes('MUCK') && bodyText.includes('EMPTY') && Boolean(muckBox && muckBox.width >= 60 && muckBox.height >= 80),
    hasCallAmount: /\bCALL \d+\b/.test(bodyText),
    hasRaiseAmount: /\bRAISE TO \d+\b/.test(bodyText),
    singlePotReadout: (bodyText.match(/\bPOT\b/g) ?? []).length === 1,
    singleStackReadout: (bodyText.match(/\bYOUR STACK\b/g) ?? []).length === 1,
    turnAdjacent: await turnStatusIsAdjacentToAction(),
    errors: [...errors],
  };

  // Heads-up preflop: small blind calls, big blind checks.
  const preflopCall = await clickAction('CALL');
  const preflopCheck = await clickAction('CHECK');
  bodyText = await text();
  const preflop = {
    callClicked: preflopCall,
    checkClicked: preflopCheck,
    potUpdated: bodyText.replace(/\s+/g, ' ').includes('POT 20'),
    hasBurn: bodyText.includes('BURN'),
    hasFlopBeforeBurn: bodyText.includes('FLOP'),
    errors: [...errors],
  };

  // Flop and post-flop check/check.
  const burnFlop = [await clickAction('BURN'), await clickAction('FLOP')];
  await page.screenshot({ path: `.qa-poker-flop-${QA_SUFFIX}.png`, fullPage: false });
  const flopCheckOne = await clickAction('CHECK');
  const flopCheckTwo = await clickAction('CHECK');
  bodyText = await text();
  const afterFlop = {
    burnClicked: burnFlop[0],
    flopClicked: burnFlop[1],
    checksClicked: flopCheckOne && flopCheckTwo,
    hasTurn: bodyText.includes('TURN'),
    hasRiver: bodyText.includes('RIVER'),
    errors: [...errors],
  };

  // Turn, then another check/check.
  const turnBurn = await clickAction('BURN');
  const turnDeal = await clickAction('TURN');
  await page.screenshot({ path: `.qa-poker-turn-${QA_SUFFIX}.png`, fullPage: false });
  const turnCheckOne = await clickAction('CHECK');
  const turnCheckTwo = await clickAction('CHECK');

  // River, then the final check/check.
  const riverBurn = await clickAction('BURN');
  const riverDeal = await clickAction('RIVER');
  await page.screenshot({ path: `.qa-poker-river-${QA_SUFFIX}.png`, fullPage: false });
  const riverCheckOne = await clickAction('CHECK');
  const riverCheckTwo = await clickAction('CHECK');
  bodyText = await text();
  const river = {
    turnSequence: turnBurn && turnDeal && turnCheckOne && turnCheckTwo,
    riverSequence: riverBurn && riverDeal && riverCheckOne && riverCheckTwo,
    hasShowdown: bodyText.includes('SHOWDOWN'),
    errors: [...errors],
  };

  // Showdown: reveal all hands and end the session.
  const showdownClicked = await clickAction('SHOWDOWN');
  await page.screenshot({ path: `.qa-poker-showdown-${QA_SUFFIX}.png`, fullPage: false });
  bodyText = await text();

  const result = {
    initial,
    preflop,
    afterFlop,
    river,
    showdownClicked,
    actionCount: actions.length,
    actions,
    hasWinnerBanner: bodyText.includes('SESSION OVER') || bodyText.includes('takes the table'),
    showdownRevealed: !bodyText.includes('HAND LOCKED'),
    errors,
  };
  const failures = [];
  if (!initial.hasPot || !initial.hasStack || !initial.hasFold || !initial.hasCall || !initial.hasRaise) {
    failures.push('initial poker ledger/actions are missing');
  }
  if (!initial.hasMuckZone) failures.push('muck is not a visible inset zone with an empty state');
  if (!initial.hasCallAmount || !initial.hasRaiseAmount) failures.push('call/raise amounts are missing from the action labels');
  if (!initial.singlePotReadout || !initial.singleStackReadout) failures.push('pot/stack readout is duplicated');
  if (!initial.turnAdjacent) failures.push('your turn status is not adjacent to the action rail');
  if (!initial.hasNoStreetControlBeforeBetting) failures.push('street controls were exposed before betting closed');
  if (!preflop.callClicked || !preflop.checkClicked || !preflop.potUpdated || !preflop.hasBurn || preflop.hasFlopBeforeBurn) {
    failures.push('preflop call/check did not expose burn-before-flop sequencing');
  }
  if (!afterFlop.burnClicked || !afterFlop.flopClicked || !afterFlop.checksClicked || !afterFlop.hasTurn) {
    failures.push('flop sequence did not expose the turn');
  }
  if (!river.turnSequence || !river.riverSequence || !river.hasShowdown) {
    failures.push('turn/river sequence did not expose showdown');
  }
  if (!showdownClicked || !result.hasWinnerBanner || !result.showdownRevealed) {
    failures.push('showdown did not end with revealed hands and a winner banner');
  }
  if (errors.length > 0) failures.push('browser console/page errors were reported');
  result.failures = failures;
  process.stdout.write(JSON.stringify(result, null, 2));
  await context.close();
  await browser.close();
  if (failures.length > 0) process.exitCode = 2;
})();
