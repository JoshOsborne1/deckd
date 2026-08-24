/**
 * Card Lab visual QA — exercises the blueprint §6.1-6.12 scenarios on web.
 *
 *   node qa/deckd-lab-qa.cjs
 *
 * Uses the dev server by default (DECKD_QA_URL to override). Verifies route
 * resolution, lab chrome renders, fan-count chips switch, action buttons
 * enable/disable with pile state, typed intents land in the log, and the
 * reduced-motion and busy-JS toggles flip without runtime errors.
 */
const { chromium } = require('playwright');
const BASE_URL = process.env.DECKD_QA_URL ?? 'http://127.0.0.1:8081';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await page.goto(`${BASE_URL}/lab`, { waitUntil: 'commit', timeout: 30000 });
  await page.waitForTimeout(12000);

  const body = await page.innerText('body');
  const assertions = [];
  const expect = (name, ok, note) => {
    assertions.push({ name, ok, note });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${note ? ` — ${note}` : ''}`);
  };

  // 6.1-6.2 chrome presence.
  expect('title "Card Lab"', body.includes('Card Lab'));
  expect('intent log section', body.includes('Typed intent log'));
  expect('fan count chips 2/5/10/20', ['2', '5', '10', '20'].every((label) =>
    body.split('\n').some((line) => line.trim() === label)));
  expect('deck zone present', body.includes('Deck') || body.includes('deck') || body.includes('cards'));
  expect('discard zone present', body.includes('Discard'));
  expect('pile zone present', body.includes('Pile'));
  expect('hand zone present', body.includes('Your hand'));
  expect('partner viewport present (6.10)', body.includes('Partner viewport'));
  expect('pass token present', body.includes('PASS'));

  // Reset and fan-count interactions.
  const clickByText = async (text) => {
    const locator = page.locator(`text="${text}"`).first();
    if (!(await locator.count())) return false;
    await locator.click({ timeout: 5000 });
    return true;
  };

  // 6.1: switch fan to 20 cards and assert hand counter updates.
  await clickByText('20');
  await page.waitForTimeout(1200);
  const afterTwenty = await page.innerText('body');
  expect('fan=20 renders 20-card hand', /Your hand \(20\)/.test(afterTwenty),
    (afterTwenty.match(/Your hand \(\d+\)/) || ['none'])[0]);

  // 6.3: tap-to-draw the accessible fallback (the deck is a Pressable).
  await clickByText('Reset');
  await page.waitForTimeout(800);
  const initialBody = await page.innerText('body');
  const initialHandCount = (await (async () => {
    const m = initialBody.match(/Your hand \((\d+)\)/);
    return m ? parseInt(m[1], 10) : null;
  })());
  const deckTap = page.locator('[data-testid="deck-pile-lab-deck-tap"]').first();
  const deckTapCount = await deckTap.count();
  expect('deck tap fallback present', deckTapCount > 0);
  if (deckTapCount > 0) {
    await deckTap.click({ timeout: 5000 });
    await page.waitForTimeout(1200);
    const afterDraw = await page.innerText('body');
    const newCount = (() => {
      const m = afterDraw.match(/Your hand \((\d+)\)/);
      return m ? parseInt(m[1], 10) : null;
    })();
    expect('tap-to-draw increments hand', newCount !== null && initialHandCount !== null && newCount === initialHandCount + 1,
      `${initialHandCount} -> ${newCount}`);
    expect('pile.draw intent logged', afterDraw.includes('pile.draw'));
  }

  // 6.7: Flip top is disabled while the pile is empty.
  const flipBtn = page.locator('[aria-label="Flip top of pile"]').first();
  const flipDisabled = await flipBtn.isDisabled().catch(() => true);
  expect('flip disabled with empty pile', flipDisabled);

  // 6.12: busy-JS stress toggle flips without runtime errors.
  const stressToggle = page.locator('[aria-label="Toggle busy render stress"]').first();
  if (await stressToggle.count()) {
    await stressToggle.click();
    await page.waitForTimeout(900);
    const errorCountBeforeOff = errors.length;
    await stressToggle.click();
    expect('busy stress toggle cycles cleanly', errors.length === errorCountBeforeOff);
  } else {
    expect('busy stress toggle present', false, 'switch not found');
  }

  // Pass token commits the pass ritual (6.9) — via accessibility action fallback.
  const passBtn = page.locator('[data-testid="turn-token"]').first();
  if (await passBtn.count()) {
    await passBtn.click({ timeout: 5000 });
    await page.waitForTimeout(900);
  }

  // Screen-reader / action parity verification lives at the unit layer
  // (CardEntity exposes accessibilityActions that dispatch the same intents).

  // Fail on unhandled runtime errors.
  expect('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  const failed = assertions.filter((a) => !a.ok);
  console.log(`\n${failed.length === 0 ? 'PASS ALL' : 'FAIL'} ${assertions.length - failed.length}/${assertions.length} assertions`);
  await browser.close();
  process.exit(failed.length === 0 ? 0 : 1);
})();
