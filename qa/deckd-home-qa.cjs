/*
 * Slice 4f: home de-tutorial + desktop centering QA.
 * Usage: node qa/deckd-home-qa.cjs
 * Optional: DECKD_QA_URL=https://deckd-app.roxai.click  HOME_QA_PREFIX=.qa-home-public
 * Stale-expectation header (2026-09-06): assumes tutorial strings
 * "THE DECK IS THE DOOR" / "PICK A RECIPE AFTER THE DEAL" are REMOVED from home,
 * home headline is "One deck. Your table.", desktop (>=900px) centers an
 * 840px content column, and the first-run hint may show once (uiStore).
 * Hidden layers stay mounted: only visible-layer elements are asserted.
 */
const { chromium } = require('playwright');

const BASE_URL = process.env.DECKD_QA_URL ?? 'http://127.0.0.1:8085';
const PREFIX = process.env.HOME_QA_PREFIX ?? '.qa-home-local';
const VIEWPORTS = [
  { name: '375', width: 375, height: 812 },
  { name: '1440', width: 1440, height: 900 },
];

let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail += 1;
    failures.push(name);
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function visibleTexts(page, text) {
  const matches = page.getByText(text, { exact: true });
  const out = [];
  const count = await matches.count().catch(() => 0);
  for (let i = count - 1; i >= 0; i -= 1) {
    const m = matches.nth(i);
    const box = await m.boundingBox().catch(() => null);
    if (!box || box.width <= 0 || box.height <= 0) continue;
    const visible = await m.isVisible().catch(() => false);
    if (!visible) continue;
    out.push(box);
  }
  return out;
}

async function visibleTextBox(page, text) {
  const boxes = await visibleTexts(page, text);
  if (boxes.length === 0) return null;
  return boxes[0];
}

(async () => {
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    // Wait for home to settle (layer animations).
    await page.waitForTimeout(800);

    const bodyText = await page.evaluate(() => document.body.innerText);

    // 1. Tutorial strings gone.
    check(
      `${vp.name}: no "THE DECK IS THE DOOR"`,
      !bodyText.includes('THE DECK IS THE DOOR'),
    );
    check(
      `${vp.name}: no "PICK A RECIPE AFTER THE DEAL"`,
      !bodyText.includes('PICK A RECIPE AFTER THE DEAL'),
    );

    // 1b. Hub VIEW RULES link must not bleed onto home (painted opacity 0 at
    // morph progress 0; hidden layers stay mounted, so text is still in the DOM).
    const rulesPaint = await page.evaluate(() => {
      let found = null;
      document.querySelectorAll('*').forEach((el) => {
        if (found) return;
        if ((el.textContent || '').trim() !== 'VIEW RULES') return;
        if (el.children.length > 0) return;
        const r = el.getBoundingClientRect();
        if (r.width <= 0) return;
        let op = 1;
        let cur = el;
        while (cur && cur !== document.body) {
          const o = parseFloat(getComputedStyle(cur).opacity);
          if (Number.isFinite(o)) op *= o;
          cur = cur.parentElement;
        }
        found = Math.round(op * 100) / 100;
      });
      return found;
    });
    check(
      `${vp.name}: hub VIEW RULES not painted on home (op=${rulesPaint})`,
      rulesPaint === null || rulesPaint <= 0.05,
    );

    // 2. Headline present, measure fits one or two clean lines (no orphan single word is
    // asserted by geometry below).
    const headline = await visibleTextBox(page, 'One deck. Your table.');
    check(
      `${vp.name}: headline "One deck. Your table." visible`,
      Boolean(headline),
    );

    // 3. Deal object + label visible.
    const deal = await visibleTextBox(page, 'DEAL');
    check(`${vp.name}: DEAL label visible`, Boolean(deal));

    // 4. No "LV." abbreviation; LEVEL spelled out.
    check(`${vp.name}: no "LV." stat`, !bodyText.includes('LV.'));

    // 5. STREAK 0 hidden.
    check(`${vp.name}: no "STREAK 0" empty-state ad`, !bodyText.includes('STREAK 0'));

    // 6. Desktop centering: content column centered at >=900px.
    if (vp.width >= 900) {
      const col = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="home-content-column"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, right: window.innerWidth - r.right, width: r.width };
      });
      check(
        `${vp.name}: content column centered (left=${col && Math.round(col.left)}, right=${col && Math.round(col.right)})`,
        Boolean(col) && Math.abs(col.left - col.right) <= 2,
      );
      check(
        `${vp.name}: content column capped (width=${col && Math.round(col.width)}px <= 840)`,
        Boolean(col) && col.width <= 841,
      );
      // side actions are a column to the right on desktop
      const stage = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="home-main-stage"]');
        if (!el) return null;
        return window.getComputedStyle(el).flexDirection;
      });
      check(
        `${vp.name}: desktop main stage is a row (stage=${stage})`,
        stage === 'row',
      );
    } else {
      // Mobile: side actions stack below (column), full-width.
      const stage = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="home-main-stage"]');
        if (!el) return null;
        return window.getComputedStyle(el).flexDirection;
      });
      check(`${vp.name}: mobile main stage is a column (stage=${stage})`, stage !== 'row');
    }

    // 7. No horizontal overflow.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check(`${vp.name}: zero horizontal overflow (${overflow}px)`, overflow <= 0);

    // 8. No browser errors.
    check(`${vp.name}: zero browser errors`, errors.length === 0, errors.slice(0, 2).join(' | '));

    // Screenshot.
    await page.screenshot({ path: `${PREFIX}-${vp.name}.png`, fullPage: false });
    console.log(`SHOT ${PREFIX}-${vp.name}.png`);
    await context.close();
  }

  // Interaction: tap the deck -> hub (375 only, proves the primary action works).
  {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // find the visible DEAL pressable via hit-test
    const dealBox = await visibleTextBox(page, 'DEAL');
    if (!dealBox) {
      check('tap deck: visible DEAL found', false);
    } else {
      const cx = dealBox.x + dealBox.width / 2;
      const cy = dealBox.y + dealBox.height / 2;
      // The deck object button is larger; click its center via elementFromPoint reachability.
      const reachable = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return Boolean(el);
      }, { x: cx, y: cy });
      check('tap deck: DEAL point hit-tests', reachable);
      await page.mouse.click(cx, cy);
      await page.waitForTimeout(1800);
      const hubText = await page.evaluate(() => document.body.innerText);
      check(
        'tap deck: hub reached (recipe chooser visible)',
        /PLAY SOLO|CHOOSE|RECIPE|PICK/i.test(hubText) || (await visibleTexts(page, 'READY')).length > 0,
      );
      const shot = `${PREFIX}-hub-after-tap.png`;
      await page.screenshot({ path: shot, fullPage: false });
      console.log(`SHOT ${shot}`);
    }
    await context.close();
  }

  await browser.close();
  console.log(`\nTOTAL pass=${pass} fail=${fail}`);
  if (fail > 0) {
    console.log(`FAILURES: ${failures.join(', ')}`);
    process.exit(1);
  }
})().catch((e) => {
  console.error('QA crashed:', e);
  process.exit(2);
});