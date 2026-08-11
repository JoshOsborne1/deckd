const { chromium } = require('playwright');
const BASE_URL = process.env.DECKD_QA_URL ?? 'http://127.0.0.1:8082';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });
  const errors = [];
  const actions = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  const waitForTable = async () => page.waitForTimeout(900);
  const clickAction = async (name) => {
    const button = page.getByRole('button', { name, exact: true });
    if (!(await button.count())) return false;
    await button.first().click();
    actions.push(name);
    await waitForTable();
    return true;
  };
  const text = async () => page.locator('body').innerText();

  await page.goto(`${BASE_URL}/`, { waitUntil: 'commit', timeout: 30000 });
  await page.waitForTimeout(8000);

  // Deal a table, choose Poker, then start the hand.
  await page.getByRole('button', { name: 'Deal the deck', exact: true }).last().click();
  await waitForTable();
  const presetBtn = page.getByRole('button', { name: /Poker/i });
  if (await presetBtn.count()) {
    await presetBtn.click();
    await page.waitForTimeout(500);
  }
  const dealNow = page.getByRole('button', { name: 'Deal now', exact: true });
  if (await dealNow.count()) {
    await dealNow.click();
    await page.waitForTimeout(1500);
  }

  await page.screenshot({ path: '.qa-poker-dealt-375.png', fullPage: false });
  let bodyText = await text();
  const initial = {
    hasPot: bodyText.includes('POT'),
    hasStack: bodyText.includes('YOUR STACK'),
    hasFold: bodyText.includes('FOLD'),
    hasCheck: bodyText.includes('CHECK'),
    hasCall: bodyText.includes('CALL'),
    hasRaise: bodyText.includes('RAISE'),
    hasStreetControlBeforeBetting: bodyText.includes('BURN') || bodyText.includes('FLOP'),
    errors: [...errors],
  };

  // Heads-up preflop: small blind calls, big blind checks.
  const preflopCall = await clickAction('CALL');
  const preflopCheck = await clickAction('CHECK');
  bodyText = await text();
  const preflop = {
    callClicked: preflopCall,
    checkClicked: preflopCheck,
    hasBurn: bodyText.includes('BURN'),
    hasFlop: bodyText.includes('FLOP'),
    errors: [...errors],
  };

  // Flop and post-flop check/check.
  const burnFlop = [await clickAction('BURN'), await clickAction('FLOP')];
  await page.screenshot({ path: '.qa-poker-flop-375.png', fullPage: false });
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
  await page.screenshot({ path: '.qa-poker-turn-375.png', fullPage: false });
  const turnCheckOne = await clickAction('CHECK');
  const turnCheckTwo = await clickAction('CHECK');

  // River, then the final check/check.
  const riverBurn = await clickAction('BURN');
  const riverDeal = await clickAction('RIVER');
  await page.screenshot({ path: '.qa-poker-river-375.png', fullPage: false });
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
  await page.screenshot({ path: '.qa-poker-showdown-375.png', fullPage: false });
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
  process.stdout.write(JSON.stringify(result, null, 2));
  await browser.close();
})();
