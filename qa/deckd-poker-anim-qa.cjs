const { chromium } = require('playwright');
const BASE_URL = (process.env.DECKD_QA_URL ?? 'http://localhost:8081').replace(/\/$/, '');

async function run(viewport, label) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addInitScript(() => window.localStorage.clear());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  const results = [];
  const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);

  const clickAction = async (name) => {
    const button = page.getByRole('button', { name, exact: true });
    await button.first().waitFor({ state: 'visible', timeout: 15000 });
    await button.first().click();
    await page.waitForTimeout(700);
    return true;
  };

  try {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'commit', timeout: 60000 });
    await page.getByRole('button', { name: 'Deal the deck', exact: true }).last().waitFor({ state: 'visible', timeout: 60000 });
    await page.getByRole('button', { name: 'Deal the deck', exact: true }).last().click();
    await page.getByText('Choose a recipe', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
    const preset = page.getByRole('button', { name: /Poker/i }).first();
    await preset.waitFor({ state: 'visible', timeout: 30000 });
    await preset.click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Deal now', exact: true }).last().click();
    await page.waitForTimeout(2500);

    const geo = await page.evaluate(() => {
      const root = document.getElementById('root');
      return {
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        rootScrollWidth: root?.scrollWidth ?? 0,
      };
    });
    check('no horizontal overflow', geo.scrollWidth <= geo.innerWidth && geo.bodyScrollWidth <= geo.innerWidth && geo.rootScrollWidth <= geo.innerWidth, JSON.stringify(geo));

    // Ledger + bet actions visible
    const pot = page.getByText('POT', { exact: true });
    check('pot ledger visible', await pot.isVisible().catch(() => false));
    const call = page.getByRole('button', { name: 'CALL', exact: true });
    await call.first().waitFor({ state: 'visible', timeout: 15000 });
    const callBox = await call.first().boundingBox();
    check('CALL on screen', callBox && callBox.x >= 0 && callBox.x + callBox.width <= geo.innerWidth, JSON.stringify(callBox));

    // Bet round: CALL then CHECK to close preflop
    await clickAction('CALL');
    await clickAction('CHECK');
    check('BURN appears after betting closes', await page.getByRole('button', { name: 'BURN', exact: true }).first().isVisible().catch(() => false));

    // Burn + flop
    await clickAction('BURN');
    await clickAction('FLOP');
    await page.waitForTimeout(900);
    const community = page.getByText('COMMUNITY', { exact: true });
    check('community cards dealt (empty slot gone)', !(await community.isVisible().catch(() => false)));
    const flopLabel = page.getByText('FLOP', { exact: true });
    check('FLOP street label', await flopLabel.isVisible().catch(() => false));

    // Close flop betting, burn + turn
    await clickAction('CHECK');
    await clickAction('CHECK');
    await clickAction('BURN');
    await clickAction('TURN');
    await page.waitForTimeout(700);
    check('TURN street label', await page.getByText('TURN', { exact: true }).isVisible().catch(() => false));

    // Close turn betting, burn + river
    await clickAction('CHECK');
    await clickAction('CHECK');
    await clickAction('BURN');
    await clickAction('RIVER');
    await page.waitForTimeout(700);
    check('RIVER street label', await page.getByText('RIVER', { exact: true }).isVisible().catch(() => false));

    // Close river betting -> SHOWDOWN
    await clickAction('CHECK');
    await clickAction('CHECK');
    check('SHOWDOWN appears', await page.getByRole('button', { name: 'SHOWDOWN', exact: true }).first().isVisible().catch(() => false));
    await clickAction('SHOWDOWN');
    await page.waitForTimeout(1800);

    const ended = page.getByText('SESSION OVER', { exact: true });
    check('session-over banner', await ended.isVisible().catch(() => false));
    const bestHand = page.getByText(/^(HIGH CARD|PAIR|TWO PAIR|THREE OF A KIND|STRAIGHT|FLUSH|FULL HOUSE|FOUR OF A KIND|STRAIGHT FLUSH|ROYAL FLUSH)$/);
    check('best-hand pill at showdown', await bestHand.isVisible().catch(() => false));
  } catch (e) {
    results.push(`FAIL run — ${e.message}`);
  }

  console.log(`\n=== ${label} (${viewport.width}x${viewport.height}) ===`);
  results.forEach((r) => console.log(r));
  if (errors.length) {
    console.log('JS errors:');
    errors.slice(0, 5).forEach((e) => console.log(`  ${e}`));
  }
  await browser.close();
  return results.filter((r) => r.startsWith('FAIL')).length === 0;
}

(async () => {
  const mobileOk = await run({ width: 375, height: 812 }, 'MOBILE');
  const desktopOk = await run({ width: 1440, height: 900 }, 'DESKTOP');
  console.log(`\nOVERALL: ${mobileOk && desktopOk ? 'PASS' : 'FAIL'}`);
  process.exit(mobileOk && desktopOk ? 0 : 1);
})();
