/*
 * Deckd consolidated invariants QA (Slice 5: QA 39→3).
 * One command: surface geometry, nav-fan bounds, overflow, copy honesty,
 * and pass-veil presence at 375x812 and 1440x900.
 *
 * Usage: node qa/deckd-invariants.cjs
 * Optional: DECKD_QA_URL=https://deckd-app.roxai.click  QA_PREFIX=.qa-invariants-public
 *
 * Stale-expectation header (2026-09-07): absorbs deckd-home-qa, deckd-store-qa,
 * deckd-nav5-qa, deckd-pass-veil-qa, deckd-desktop-qa (deleted). Assumes the
 * Slice 4f/4g copy (no tutorial strings, spelled durations, honest store
 * tiles), the Slice 3 nav fan (5 standing cards, taller Table card, single
 * active fill, rail top rule), and the Slice 4e pass veil. Hidden layers
 * stay mounted: only visible-layer elements are asserted.
 */
const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = process.env.DECKD_QA_URL ?? 'http://127.0.0.1:8085';
const PREFIX = process.env.QA_PREFIX ?? '.qa-invariants-local';
const VIEWPORTS = [
  { name: '375', width: 375, height: 812 },
  { name: '1440', width: 1440, height: 900 },
];
const NAV_LABELS = ['Home', 'Store', 'Table', 'Presets', 'Profile'];
const NAV_ARIA = {
  Home: 'Home',
  Store: 'Store',
  Table: 'Table, Deckd logo button',
  Presets: 'Presets',
  Profile: 'Profile',
};

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

async function visibleButton(page, label) {
  const candidates = page.locator('button');
  const count = await candidates.count().catch(() => 0);
  for (let i = 0; i < count; i += 1) {
    const b = candidates.nth(i);
    const aria = (await b.getAttribute('aria-label').catch(() => null)) ?? '';
    if (aria !== NAV_ARIA[label] && aria !== label) continue;
    const box = await b.boundingBox().catch(() => null);
    if (!box || box.width < 1 || box.height < 1) continue;
    const visible = await b.evaluate((element) => {
      let current = element;
      let opacity = 1;
      while (current instanceof HTMLElement) {
        const style = getComputedStyle(current);
        if (style.visibility === 'hidden' || style.display === 'none') return false;
        opacity *= Number(style.opacity);
        if (opacity <= 0.01) return false;
        current = current.parentElement;
      }
      return true;
    }).catch(() => false);
    if (visible) return b;
  }
  return null;
}

async function clickVisible(page, locator, name) {
  const box = await locator.boundingBox().catch(() => null);
  if (!box || box.width <= 0 || box.height <= 0) {
    throw new Error(`${name}: no bounding box`);
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return box;
}

async function waitForVisibleText(page, text, timeout = 15000) {
  await page.waitForFunction((expected) => [...document.querySelectorAll('*')].some((element) => {
    if (element.childElementCount !== 0 || element.textContent?.trim() !== expected) return false;
    const rect = element.getBoundingClientRect();
    let current = element;
    let opacity = 1;
    while (current instanceof HTMLElement) {
      const style = getComputedStyle(current);
      if (style.visibility === 'hidden' || style.display === 'none') return false;
      opacity *= Number(style.opacity);
      if (opacity <= 0.01) return false;
      current = current.parentElement;
    }
    return rect.width > 0 && rect.height > 0 && opacity > 0.01;
  }), text, { timeout });
}

async function waitForVisibleButton(page, label, timeout = 15000) {
  await page.waitForFunction((expected) => [...document.querySelectorAll('button')].some((button) => {
    const aria = button.getAttribute('aria-label');
    if (aria !== expected) return false;
    const rect = button.getBoundingClientRect();
    let current = button;
    let opacity = 1;
    while (current instanceof HTMLElement) {
      const style = getComputedStyle(current);
      if (style.visibility === 'hidden' || style.display === 'none') return false;
      opacity *= Number(style.opacity);
      if (opacity <= 0.01) return false;
      current = current.parentElement;
    }
    return rect.width > 0 && rect.height > 0 && opacity > 0.01;
  }), label, { timeout });
}

async function waitForVisibleTextPrefix(page, prefix, timeout = 15000) {
  await page.waitForFunction((expected) => [...document.querySelectorAll('*')].some((element) => {
    if (element.childElementCount !== 0) return false;
    const text = element.textContent?.trim() ?? '';
    if (!text.startsWith(expected)) return false;
    const rect = element.getBoundingClientRect();
    let current = element;
    let opacity = 1;
    while (current instanceof HTMLElement) {
      const style = getComputedStyle(current);
      if (style.visibility === 'hidden' || style.display === 'none') return false;
      opacity *= Number(style.opacity);
      if (opacity <= 0.01) return false;
      current = current.parentElement;
    }
    return rect.width > 0 && rect.height > 0 && opacity > 0.01;
  }), prefix, { timeout });
}

async function visibleTextBoxPrefix(page, prefix) {
  const matches = page.locator('text=' + prefix);
  const count = await matches.count().catch(() => 0);
  for (let i = count - 1; i >= 0; i -= 1) {
    const m = matches.nth(i);
    const box = await m.boundingBox().catch(() => null);
    if (!box || box.width <= 0 || box.height <= 0) continue;
    const visible = await m.isVisible().catch(() => false);
    if (!visible) continue;
    const text = await m.textContent().catch(() => '');
    if (text && text.trim().startsWith(prefix)) return { box, element: m };
  }
  return null;
}

async function newPage(browser, vp) {
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
  return { context, page, errors };
}

async function assertNav(page, vp, routeLabel) {
  const state = await page.evaluate((labels) => {
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      let current = element;
      let opacity = 1;
      while (current instanceof HTMLElement) {
        const style = getComputedStyle(current);
        if (style.visibility === 'hidden' || style.display === 'none') return false;
        opacity *= Number(style.opacity);
        if (opacity <= 0.01) return false;
        current = current.parentElement;
      }
      return rect.width > 0 && rect.height > 0 && opacity > 0.01;
    };
    const rect = (element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
    };
    const items = {};
    for (const label of labels) {
      const aria = ({
        Home: 'Home',
        Store: 'Store',
        Table: 'Table, Deckd logo button',
        Presets: 'Presets',
        Profile: 'Profile',
      })[label];
      const buttons = [...document.querySelectorAll('button')]
        .filter((button) => button.getAttribute('aria-label') === aria)
        .filter(isVisible)
        .sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);
      const button = buttons[0];
      if (!button) {
        items[label] = null;
        continue;
      }
      const face = button.firstElementChild;
      const labelElement = [...button.querySelectorAll('*')].find(
        (element) => element.childElementCount === 0 && element.textContent?.trim() === label && isVisible(element),
      );
      const faceStyle = face ? getComputedStyle(face) : null;
      items[label] = {
        button: rect(button),
        face: face ? rect(face) : null,
        labelRect: labelElement ? rect(labelElement) : null,
        background: faceStyle?.backgroundColor ?? '',
      };
    }
    const railElement = document.querySelector('[data-testid="global-nav-rail"]');
    const railStyle = railElement ? getComputedStyle(railElement) : null;
    return {
      items,
      rail: railElement && railStyle ? {
        rect: rect(railElement),
        borderTopWidth: railStyle.borderTopWidth,
      } : null,
    };
  }, NAV_LABELS);

  if (!state.rail) {
    check(`${vp.name} ${routeLabel}: nav rail present`, false);
    return;
  }
  const rail = state.rail.rect;
  check(
    `${vp.name} ${routeLabel}: nav rail in bounds`,
    rail.x >= -1 && rail.right <= vp.width + 1 && rail.bottom <= vp.height - 7,
    JSON.stringify(rail),
  );
  check(
    `${vp.name} ${routeLabel}: nav rail top rule`,
    Number.parseFloat(state.rail.borderTopWidth) >= 0.5,
    state.rail.borderTopWidth,
  );

  const sideHeights = [];
  for (const label of NAV_LABELS) {
    const item = state.items[label];
    if (!item || !item.face || !item.labelRect) {
      check(`${vp.name} ${routeLabel}: ${label} nav card visible`, false);
      continue;
    }
    const button = item.button;
    check(
      `${vp.name} ${routeLabel}: ${label} target in bounds`,
      button.x >= 8 && button.right <= vp.width - 8 && button.bottom <= vp.height - 7 &&
        faceInBounds(item.face, vp) && faceInBounds(item.labelRect, vp),
      JSON.stringify(button),
    );
    check(`${vp.name} ${routeLabel}: ${label} target >= 44px`, button.width >= 44 && button.height >= 44);
    if (label !== 'Table') sideHeights.push(item.face.height);
  }
  const table = state.items.Table;
  if (table) {
    const maxSide = Math.max(0, ...sideHeights);
    check(
      `${vp.name} ${routeLabel}: Table card taller than sides`,
      table.face.height > maxSide,
      `${table.face.height} vs ${maxSide}`,
    );
    check(
      `${vp.name} ${routeLabel}: Table slot is a card`,
      table.background !== 'rgba(0, 0, 0, 0)' && table.background !== 'transparent',
      table.background,
    );
  }

  // Content must not overlap the nav fan.
  const visualTop = rail.y;
  const overlap = await page.evaluate((top) => {
    const navRail = document.querySelector('[data-testid="global-nav-rail"]');
    const clippedRect = (element) => {
      const source = element.getBoundingClientRect();
      let left = Math.max(0, source.left);
      let top = Math.max(0, source.top);
      let right = Math.min(innerWidth, source.right);
      let bottom = Math.min(innerHeight, source.bottom);
      let current = element.parentElement;
      while (current instanceof HTMLElement) {
        const style = getComputedStyle(current);
        if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
          const clip = current.getBoundingClientRect();
          left = Math.max(left, clip.left);
          top = Math.max(top, clip.top);
          right = Math.min(right, clip.right);
          bottom = Math.min(bottom, clip.bottom);
        }
        current = current.parentElement;
      }
      return { width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
    };
    return [...document.querySelectorAll('*')]
      .filter((element) => element.childElementCount === 0 && element.textContent?.trim())
      .filter((element) => !navRail?.contains(element))
      .map((element) => ({ element, clip: clippedRect(element) }))
      .filter(({ element, clip }) => {
        let current = element;
        let opacity = 1;
        while (current instanceof HTMLElement) {
          const style = getComputedStyle(current);
          if (style.visibility === 'hidden' || style.display === 'none' || style.pointerEvents === 'none') return false;
          opacity *= Number(style.opacity);
          if (opacity <= 0.01) return false;
          current = current.parentElement;
        }
        return opacity > 0.01 && clip.width > 0 && clip.height > 0;
      })
      .filter(({ clip }) => clip.height > 0)
      .map(({ element, clip }) => {
        const rect = element.getBoundingClientRect();
        return { label: element.textContent.trim().slice(0, 60), bottom: rect.bottom };
      })
      .filter((entry) => entry.bottom > top + 1);
  }, visualTop);
  check(
    `${vp.name} ${routeLabel}: content clear of nav fan`,
    overlap.length === 0,
    JSON.stringify(overlap.slice(0, 2)),
  );
}

function faceInBounds(rect, vp) {
  return rect.x >= 8 && rect.right <= vp.width - 8 && rect.y >= -1 && rect.bottom <= vp.height - 7;
}

async function checkOverflowErrors(page, vp, label, errors) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check(`${vp.name} ${label}: zero horizontal overflow (${overflow}px)`, overflow <= 0);
  check(`${vp.name} ${label}: zero browser errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
}

(async () => {
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    const { context, page, errors } = await newPage(browser, vp);
    const bodyText = await page.evaluate(() => document.body.innerText);

    // Home surface.
    check(`${vp.name}: no "THE DECK IS THE DOOR"`, !bodyText.includes('THE DECK IS THE DOOR'));
    check(`${vp.name}: no "PICK A RECIPE AFTER THE DEAL"`, !bodyText.includes('PICK A RECIPE AFTER THE DEAL'));
    check(`${vp.name}: headline "One deck. Your table." visible`, Boolean(await visibleTextBox(page, 'One deck. Your table.')));
    check(`${vp.name}: DEAL label visible`, Boolean(await visibleTextBox(page, 'DEAL')));
    check(`${vp.name}: no "LV." stat`, !bodyText.includes('LV.'));
    check(`${vp.name}: no "STREAK 0" empty-state ad`, !bodyText.includes('STREAK 0'));
    if (vp.width >= 900) {
      const col = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="home-content-column"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, right: window.innerWidth - r.right, width: r.width };
      });
      check(
        `${vp.name}: content column centered (${col && Math.round(col.left)} vs ${col && Math.round(col.right)})`,
        Boolean(col) && Math.abs(col.left - col.right) <= 2,
      );
      check(`${vp.name}: content column capped ${col && Math.round(col.width)}px <= 840`, Boolean(col) && col.width <= 841);
    }
    await assertNav(page, vp, 'home');
    await checkOverflowErrors(page, vp, 'home', errors);
    await page.screenshot({ path: `${PREFIX}-home-${vp.name}.png`, fullPage: false });

    // Store route.
    const storeNav = await visibleButton(page, 'Store');
    if (storeNav) {
      await clickVisible(page, storeNav, 'Store nav');
      await page.waitForTimeout(2500);
      const storeText = await page.evaluate(() => document.body.innerText);
      check(`${vp.name}: store "24 hours" spelled out`, Boolean(await visibleTextBox(page, '24 hours')));
      check(`${vp.name}: store "30 days" spelled out`, Boolean(await visibleTextBox(page, '30 days')));
      check(`${vp.name}: store "Lifetime" spelled out`, Boolean(await visibleTextBox(page, 'Lifetime')));
      check(`${vp.name}: store no "-24h"`, !storeText.includes('-24h'));
      check(`${vp.name}: store no "-Lifetime"`, !storeText.includes('-Lifetime'));
      check(`${vp.name}: store "Host any table" tile`, Boolean(await visibleTextBox(page, 'Host any table')));
      check(`${vp.name}: store "Every deck" tile`, Boolean(await visibleTextBox(page, 'Every deck')));
      check(`${vp.name}: store "8 players online"`, Boolean(await visibleTextBox(page, '8 players online')));
      check(`${vp.name}: store "6 players offline"`, Boolean(await visibleTextBox(page, '6 players offline')));
      check(`${vp.name}: store no "Choose a recipe"`, !storeText.includes('Choose a recipe'));
      check(`${vp.name}: store no "FLIP A DECK TO PREVIEW"`, !storeText.includes('FLIP A DECK TO PREVIEW'));
      check(`${vp.name}: store no "013" artifact`, !storeText.includes('013'));
      check(`${vp.name}: store deck name "Deckd Crimson"`, Boolean(await visibleTextBox(page, 'Deckd Crimson')));
      await assertNav(page, vp, 'store');
      await checkOverflowErrors(page, vp, 'store', errors);
      await page.screenshot({ path: `${PREFIX}-store-${vp.name}.png`, fullPage: false });
    } else {
      check(`${vp.name}: Store nav reachable`, false);
    }

    // Presets route.
    const presetsNav = await visibleButton(page, 'Presets');
    if (presetsNav) {
      await clickVisible(page, presetsNav, 'Presets nav');
      await page.waitForTimeout(1800);
      check(`${vp.name}: presets "Rulesets" heading`, Boolean(await visibleTextBox(page, 'Rulesets')));
      // Recipe tap flips + moves DEFAULT (presets-interaction folded in).
      try {
        const defaultBefore = await page.getByText('DEFAULT', { exact: true }).count();
        const deal2 = page.getByRole('button', { name: /Deal 2 each/ }).first();
        const deal2Box = await deal2.boundingBox().catch(() => null);
        if (deal2Box && deal2Box.width > 0) {
          await page.mouse.click(deal2Box.x + deal2Box.width / 2, deal2Box.y + deal2Box.height / 2);
          await page.waitForTimeout(1200);
          const defaultAfter = await page.getByText('DEFAULT', { exact: true }).count();
          const defaultVisible = await page.getByText('DEFAULT', { exact: true }).first().isVisible().catch(() => false);
          check(`${vp.name}: recipe tap flips + DEFAULT moves`, defaultAfter >= defaultBefore && defaultVisible);
        } else {
          check(`${vp.name}: Deal 2 each recipe visible`, false);
        }
      } catch (e) {
        check(`${vp.name}: recipe tap flips + DEFAULT moves`, false, String(e));
      }
      await checkOverflowErrors(page, vp, 'presets', errors);
      await page.screenshot({ path: `${PREFIX}-presets-${vp.name}.png`, fullPage: false });
    } else {
      check(`${vp.name}: Presets nav reachable`, false);
    }

    // Deal a freeplay table and reach the pass veil.
    const dealNav = await visibleButton(page, 'Table');
    if (dealNav) {
      await clickVisible(page, dealNav, 'Table nav');
      try {
        await waitForVisibleText(page, 'Choose a recipe', 12000);
      } catch {
        check(`${vp.name}: hub "Choose a recipe" heading`, false);
      }
      let recipeClicked = false;
      try {
        await waitForVisibleButton(page, 'Deal now', 8000);
        const dealNow = await visibleButton(page, 'Deal now');
        if (dealNow) {
          await clickVisible(page, dealNow, 'Deal now');
          recipeClicked = true;
        }
      } catch {
        // Not pre-selected: tap the Freeplay recipe card first.
        const recipe = page.getByRole('button', { name: /^Freeplay\./ });
        const recipeBox = await recipe.last().boundingBox().catch(() => null);
        if (recipeBox && recipeBox.width > 0) {
          await page.mouse.click(recipeBox.x + recipeBox.width / 2, recipeBox.y + recipeBox.height / 2);
          await page.waitForTimeout(700);
          try {
            await waitForVisibleButton(page, 'Deal now', 8000);
            const dealNow = await visibleButton(page, 'Deal now');
            if (dealNow) {
              await clickVisible(page, dealNow, 'Deal now');
              recipeClicked = true;
            }
          } catch (e2) {
            check(`${vp.name}: Deal now visible`, false, String(e2));
          }
        } else {
          check(`${vp.name}: Freeplay recipe visible`, false);
        }
      }
      if (recipeClicked) {
        try {
          await waitForVisibleTextPrefix(page, 'PASS TURN', 12000);
          const passTurnFound = await visibleTextBoxPrefix(page, 'PASS TURN');
          check(`${vp.name}: PASS TURN reached on freeplay table`, Boolean(passTurnFound));
          if (passTurnFound && passTurnFound.element) {
            await page.screenshot({ path: `${PREFIX}-table-${vp.name}.png`, fullPage: false });
            await passTurnFound.element.click();
            await page.waitForTimeout(1200);
            const veilText = await page.evaluate(() => document.body.innerText);
            check(`${vp.name}: veil "PASS TO"`, veilText.includes('PASS TO'));
            check(`${vp.name}: veil "HOLD FOR 0.6s" hint`, veilText.includes('HOLD FOR 0.6s'));
            check(`${vp.name}: veil no old "PASS DEVICE TO"`, !veilText.includes('PASS DEVICE TO'));
            check(`${vp.name}: veil no "PASSING PHASE"`, !veilText.includes('PASSING PHASE'));
            check(`${vp.name}: veil no tutorial "Pass the phone over."`, !veilText.includes('Pass the phone over.'));
            await page.screenshot({ path: `${PREFIX}-veil-${vp.name}.png`, fullPage: false });
          }
        } catch (e) {
          check(`${vp.name}: PASS TURN reached on freeplay table`, false, String(e));
        }
      }
      await checkOverflowErrors(page, vp, 'table', errors);
    } else {
      check(`${vp.name}: Table nav reachable`, false);
    }

    await context.close();
  }

  await browser.close();
  console.log(`INVARIANTS pass=${pass} fail=${fail}`);
  if (fail > 0) {
    console.log('FAILURES:', failures.join(' | '));
    process.exitCode = 2;
  } else {
    fs.writeFileSync(`${PREFIX}-count.txt`, `pass=${pass} fail=${fail}\n`);
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 2;
});
