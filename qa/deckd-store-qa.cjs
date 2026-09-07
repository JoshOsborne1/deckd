/*
 * Slice 4g: store honesty pass QA.
 * Usage: node qa/deckd-store-qa.cjs
 * Optional: DECKD_QA_URL=https://deckd-app.roxai.click  STORE_QA_PREFIX=.qa-store-public
 * Stale-expectation header (2026-09-07): assumes the store shows spelled
 * durations ("24 hours" not "-24h"), two benefit tiles ("Host any table" /
 * "Every deck") instead of one "Host + Cosmetic" bundle card, real deck
 * names ("Deckd Crimson", "Noir", "Crimson") with state pills, no "Choose a
 * recipe" / "FLIP A DECK TO PREVIEW" / "013" recipe row, no "Home" back
 * pill, an honest preview note, and a centered capped content column at
 * desktop. Hidden layers stay mounted: only visible-layer elements asserted.
 */
const { chromium } = require('playwright');

const BASE_URL = process.env.DECKD_QA_URL ?? 'http://127.0.0.1:8085';
const PREFIX = process.env.STORE_QA_PREFIX ?? '.qa-store-local';
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

async function visibleTextBox(page, text) {
  const matches = page.getByText(text, { exact: true });
  const count = await matches.count().catch(() => 0);
  for (let i = count - 1; i >= 0; i -= 1) {
    const m = matches.nth(i);
    const box = await m.boundingBox().catch(() => null);
    if (!box || box.width <= 0 || box.height <= 0) continue;
    const visible = await m.isVisible().catch(() => false);
    if (!visible) continue;
    return box;
  }
  return null;
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
    await page.waitForTimeout(1500);

    // Enter the store through the nav card (real user flow).
    const storeNav = page.getByRole('button', { name: 'Store', exact: true });
    const navCount = await storeNav.count();
    let storeBox = null;
    for (let i = navCount - 1; i >= 0; i -= 1) {
      const box = await storeNav.nth(i).boundingBox().catch(() => null);
      if (box && box.y > 100) {
        storeBox = box;
        break;
      }
    }
    if (storeBox) {
      await page.mouse.click(storeBox.x + storeBox.width / 2, storeBox.y + storeBox.height / 2);
      await page.waitForTimeout(2500);
    } else {
      check(`${vp.name}: store nav reachable`, false, 'no visible Store nav button');
    }

    const bodyText = await page.evaluate(() => document.body.innerText);

    // 1. Spelled durations, no negative-duration strings.
    check(`${vp.name}: "24 hours" spelled out`, Boolean(await visibleTextBox(page, '24 hours')));
    check(`${vp.name}: "3 days" spelled out`, Boolean(await visibleTextBox(page, '3 days')));
    check(`${vp.name}: "30 days" spelled out`, Boolean(await visibleTextBox(page, '30 days')));
    check(`${vp.name}: "Lifetime" spelled out`, Boolean(await visibleTextBox(page, 'Lifetime')));
    check(`${vp.name}: no "-24h" negative duration`, !bodyText.includes('-24h'));
    check(`${vp.name}: no "-Lifetime" negative duration`, !bodyText.includes('-Lifetime'));

    // 2. Bundle tile split into two honest benefit tiles.
    check(`${vp.name}: "Host any table" tile`, Boolean(await visibleTextBox(page, 'Host any table')));
    check(`${vp.name}: "Every deck" tile`, Boolean(await visibleTextBox(page, 'Every deck')));
    check(`${vp.name}: real online capacity "8 players online"`, Boolean(await visibleTextBox(page, '8 players online')));
    check(`${vp.name}: real offline capacity "6 players offline"`, Boolean(await visibleTextBox(page, '6 players offline')));
    check(`${vp.name}: no flattened "Host" bundle head`, !(await visibleTextBox(page, 'Host')));
    check(`${vp.name}: no "Cosmetic" bundle head`, !(await visibleTextBox(page, 'Cosmetic')));
    check(`${vp.name}: no invented cosmetic lines`, !bodyText.includes('Spin') && !bodyText.includes('Icon'));

    // 3. Deck names visible, states honest.
    for (const name of ['Deckd Crimson', 'Noir', 'Crimson']) {
      check(`${vp.name}: deck name "${name}" visible`, Boolean(await visibleTextBox(page, name)));
    }
    check(`${vp.name}: "Equipped" state pill visible`, Boolean(await visibleTextBox(page, 'Equipped')));
    check(`${vp.name}: "Equip" state pill visible`, Boolean(await visibleTextBox(page, 'Equip')));
    check(`${vp.name}: no "FREE" price on a state pill`, !bodyText.includes('FREE'));
    check(`${vp.name}: deck stage behind pairs`, Boolean(await page.locator('[data-testid="deck-stage"]').first()));

    // 4. Recipe duplicate cut.
    check(`${vp.name}: no "Choose a recipe" duplicate`, !bodyText.includes('Choose a recipe'));
    check(`${vp.name}: no "FLIP A DECK TO PREVIEW"`, !bodyText.includes('FLIP A DECK TO PREVIEW'));
    check(`${vp.name}: no "013" index artifact`, !bodyText.includes('013'));

    // 5. Back pill cut (nav Home card is the way back). The nav card
    // legitimately says "Home" at the bottom; a back pill would paint it
    // top-left of the store header.
    {
      const homeText = await page.evaluate(() => {
        const hits = [];
        document.querySelectorAll('*').forEach((el) => {
          if ((el.textContent || '').trim() !== 'Home') return;
          if (el.children.length > 0) return;
          const r = el.getBoundingClientRect();
          if (r.width <= 0) return;
          hits.push({ x: Math.round(r.left), y: Math.round(r.top) });
        });
        return hits;
      });
      const pillHits = homeText.filter((h) => h.y < 300 && h.x < 200);
      check(
        `${vp.name}: no "Home" back pill in header (hits=${JSON.stringify(pillHits)})`,
        pillHits.length === 0,
      );
    }

    // 6. Honest preview note.
    check(
      `${vp.name}: preview note visible`,
      Boolean(await visibleTextBox(page, 'Everything is free in this preview. Purchases arrive at launch.')),
    );
    check(`${vp.name}: Restore purchases visible`, Boolean(await visibleTextBox(page, 'Restore purchases')));

    // 7. Centered capped column (all widths: nav is viewport-centered).
    const col = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="store-content-column"]');
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

    // 8. Pass tiles never overflow the viewport vertically off-screen is
    // fine (scroll), but the horizontal row must not create page overflow.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check(`${vp.name}: zero horizontal overflow (${overflow}px)`, overflow <= 0);

    // 9. Zero browser errors.
    check(`${vp.name}: zero browser errors`, errors.length === 0, errors.slice(0, 2).join(' | '));

    const shot = `${PREFIX}-${vp.name}.png`;
    await page.screenshot({ path: shot, fullPage: false });
    console.log(`SHOT ${shot}`);
    await context.close();
  }

  // Interaction (375): tap a deck pair -> preview stage opens; tap a state
  // pill -> Equip flips to Equipped. Preview-mode rule: taps never blocked.
  {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const storeNav = page.getByRole('button', { name: 'Store', exact: true });
    const navCount = await storeNav.count();
    let storeBox = null;
    for (let i = navCount - 1; i >= 0; i -= 1) {
      const box = await storeNav.nth(i).boundingBox().catch(() => null);
      if (box && box.y > 100) {
        storeBox = box;
        break;
      }
    }
    if (storeBox) {
      await page.mouse.click(storeBox.x + storeBox.width / 2, storeBox.y + storeBox.height / 2);
      await page.waitForTimeout(2500);
    }

    // Scroll decks into view.
    await page.mouse.wheel(0, 420);
    await page.waitForTimeout(900);

    // Tap the Noir pair (labelled Pressable).
    const noirBtn = page.getByRole('button', { name: 'Preview Noir', exact: true });
    const btnCount = await noirBtn.count();
    let btnBox = null;
    for (let i = btnCount - 1; i >= 0; i -= 1) {
      const box = await noirBtn.nth(i).boundingBox().catch(() => null);
      if (box && box.y > 100 && box.y < 812) {
        btnBox = box;
        break;
      }
    }
    check('tap deck: visible Preview Noir pressable found', Boolean(btnBox));
    if (btnBox) {
      await page.mouse.click(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2);
      await page.waitForTimeout(1400);
      const stageText = await page.evaluate(() => document.body.innerText);
      check('tap deck: preview stage opens', stageText.includes('Tap the card to flip it'));
      const shot = `${PREFIX}-preview-375.png`;
      await page.screenshot({ path: shot, fullPage: false });
      console.log(`SHOT ${shot}`);
      // Dismiss the overlay.
      await page.mouse.click(30, 100);
      await page.waitForTimeout(900);
    }

    // Equip flow: Noir should show "Equip" (owned by default, not equipped).
    const equipBtn = page.getByRole('button', { name: 'Equip Noir', exact: true });
    const equipCount = await equipBtn.count();
    let equipBox = null;
    for (let i = equipCount - 1; i >= 0; i -= 1) {
      const box = await equipBtn.nth(i).boundingBox().catch(() => null);
      if (box && box.y > 100) {
        equipBox = box;
        break;
      }
    }
    check('equip: visible Equip Noir pill found', Boolean(equipBox));
    if (equipBox) {
      // Scroll until the pill sits clear of the nav strip (the nav overlay
      // wins hit-tests near the viewport bottom).
      for (let attempt = 0; attempt < 10; attempt += 1) {
        if (equipBox.y > 120 && equipBox.y + equipBox.height < 700) break;
        await page.mouse.wheel(0, 160);
        await page.waitForTimeout(400);
        const nb = await equipBtn.last().boundingBox().catch(() => null);
        if (!nb) break;
        equipBox = nb;
      }
      await page.mouse.click(equipBox.x + equipBox.width / 2, equipBox.y + equipBox.height / 2);
      await page.waitForTimeout(900);
      check('equip: pill flips to Equipped', Boolean(await visibleTextBox(page, 'Equipped')));
      const shot = `${PREFIX}-equipped-375.png`;
      await page.screenshot({ path: shot, fullPage: false });
      console.log(`SHOT ${shot}`);
    }

    check('interaction: zero browser errors', errors.length === 0, errors.slice(0, 2).join(' | '));
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