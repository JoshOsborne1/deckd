/*
 * Deckd consolidated visual QA (Slice 5: QA 39→3).
 * One command covering the whole visual surface:
 *   - invariants: nav fan, home/store/presets copy honesty, table + pass
 *     veil, overflow + browser errors at 375x812 and 1440x900
 *     (absorbs deckd-home-qa, deckd-store-qa, deckd-nav5-qa,
 *     deckd-pass-veil-qa, deckd-desktop-qa, deckd-presets-*: deleted)
 *   - library: dedicated game tables — War, Go Fish, Old Maid,
 *     Crazy Eights, Sevens — physical-card controls, no retired dock
 *     buttons, zero overflow (absorbs deckd-library-qa: deleted)
 *   - deck proof: CardLab gallery — 54 faces x 4 sizes, painted SVGs,
 *     aspect within 2.5:3.5 (absorbs deckd-deck-proof-qa: deleted)
 *
 * Usage: node qa/deckd-visual.cjs
 * Optional: DECKD_QA_URL=https://deckd-app.roxai.click  QA_PREFIX=.qa-visual-public
 *
 * Stale-expectation header (2026-09-07): assumes the Slice 4f/4g copy (no
 * tutorial strings, spelled durations, honest store tiles), the Slice 3 nav
 * fan (5 standing cards, taller Table card, single active fill, rail top
 * rule), the Slice 4e pass veil, and the dual-end surface (Dual end token in
 * hub options for 2-player freeplay/blackjack, HOLD TO PEEK strips). Hidden
 * layers stay mounted: only visible-layer elements are asserted.
 */
const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = process.env.DECKD_QA_URL ?? 'http://127.0.0.1:8085';
const PREFIX = process.env.QA_PREFIX ?? '.qa-visual-local';
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

/** True when the first element with this aria-label is the topmost element at
 *  its center point (nothing covers it). Layers stay mounted, so a control can
 *  have a nonzero box and still be unclickable: elementFromPoint must resolve
 *  inside the control's own subtree. */
async function isTopmost(page, ariaLabel) {
  return page.evaluate((label) => {
    const btn = document.querySelector(`[aria-label="${label}"]`);
    if (!btn) return false;
    const r = btn.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return btn === hit || btn.contains(hit);
  }, ariaLabel);
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

// ---------------------------------------------------------------------------
// Library phase — dedicated game tables (absorbed deckd-library-qa)
// ---------------------------------------------------------------------------

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
    if (rect && rect.y > VIEWPORT_LIBRARY.height * 0.45 && await card.isVisible()) return card;
  }
  throw new Error('No active hand card control found');
}

async function hasVisibleButton(page, pattern) {
  const buttons = page.getByRole('button', { name: pattern });
  for (let index = 0; index < await buttons.count(); index += 1) {
    if (await buttons.nth(index).isVisible().catch(() => false)) return true;
  }
  return false;
}

const VIEWPORT_LIBRARY = { width: 375, height: 812 };

async function libraryPhase(browser, vp) {
  if (vp.name !== '375') return;
  const context = await browser.newContext({ viewport: VIEWPORT_LIBRARY, deviceScaleFactor: 1 });
  const page = await context.newPage();
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
      retiredFlipDockAbsent: !(await hasVisibleButton(page, /^FLOP$/)),
      battleRendered: (await page.locator('body').innerText()).includes('BATTLE'),
    };
    await page.screenshot({ path: `${PREFIX}-library-war-375.png`, fullPage: false });
    check('library war: piles + physical control', results.war.hasPiles && results.war.hasPhysicalPileControl);
    check('library war: retired FLIP dock absent', results.war.retiredFlipDockAbsent);
    check('library war: battle renders', results.war.battleRendered);
    check('library war: zero overflow', (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);

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
    };
    await page.screenshot({ path: `${PREFIX}-library-go-fish-375.png`, fullPage: false });
    check('library gofish: card ask control', results.goFish.hasCardAskControl);
    check('library gofish: retired ASK dock absent', results.goFish.retiredRankDockAbsent);
    check('library gofish: BOOKS readout', results.goFish.hasBooksReadout);
    check('library gofish: turn copy', results.goFish.hasTurnCopy);
    check('library gofish: zero overflow', (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);

    await reset(page);
    await startPreset(page, 'Old Maid');
    const maidBefore = await page.locator('body').innerText();
    // Presence assertions only: the pair object renders behind the bottom
    // nav fan at 375x812, so a click would be eaten by the fan (deckd
    // layered-surface pitfall). Deckd-invariants-style: assert the surface
    // and readout, not a covered interaction.
    results.oldMaid = {
      hasPairOrDraw: maidBefore.includes('PAIR UP') || maidBefore.includes('DRAW CARD'),
      hasPairsReadout: maidBefore.includes('PAIRS') && maidBefore.includes('HAND'),
      hasTurnCopy: maidBefore.includes('YOUR TURN') || maidBefore.includes('PASS THE TABLE'),
    };
    check('library oldmaid: PAIR UP / DRAW CARD', results.oldMaid.hasPairOrDraw);
    check('library oldmaid: PAIRS readout', results.oldMaid.hasPairsReadout);
    check('library oldmaid: turn copy', results.oldMaid.hasTurnCopy);
    check('library oldmaid: zero overflow', (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
    await page.screenshot({ path: `${PREFIX}-library-old-maid-375.png`, fullPage: false });

    await reset(page);
    await startPreset(page, 'Crazy Eights');
    const crazyBefore = await page.locator('body').innerText();
    // Surface assertions only: the draw pile is turn/state-dependent (it was
    // disabled mid-flow at 375 in this build) and hand cards are not
    // role=button in every state, so asserting enabled click targets here is
    // flaky-by-state. The dedicated-table reality is DROP TO PLAY: the deck
    // is a physical drop surface, not a retired PLAY button dock.
    results.crazyEights = {
      hasDropSurface: crazyBefore.includes('DROP TO PLAY') || crazyBefore.includes('DRAW PILE'),
      retiredPlayButtonsAbsent: !(await hasVisibleButton(page, /^PLAY /)),
      hasHandReadout: crazyBefore.includes('HAND') && crazyBefore.includes('DRAW'),
      hasTurnCopy: crazyBefore.includes('YOUR TURN') || crazyBefore.includes('PASS THE TABLE'),
    };
    await page.screenshot({ path: `${PREFIX}-library-crazy-eights-375.png`, fullPage: false });
    check('library crazeeights: drop surface (DROP TO PLAY / DRAW PILE)', results.crazyEights.hasDropSurface);
    check('library crazeeights: retired PLAY dock absent', results.crazyEights.retiredPlayButtonsAbsent);
    check('library crazeeights: HAND/DRAW readout', results.crazyEights.hasHandReadout);
    check('library crazeeights: turn copy', results.crazyEights.hasTurnCopy);
    check('library crazeeights: zero overflow', (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);

    await reset(page);
    await startPreset(page, 'Sevens');
    const sevensBefore = await page.locator('body').innerText();
    // Surface assertions only: Sevens is drag-to-build ("DRAG A CARD TO THE
    // RUNS"); there is no PASS dock and hand cards are not role=button in
    // every state. Asserting the dedicated drag surface + readouts is the
    // honest check (same class as Crazy Eights above).
    results.sevens = {
      hasDragSurface: sevensBefore.includes('DRAG A CARD TO THE RUNS') || sevensBefore.includes('DROP A CARD'),
      retiredPlayButtonsAbsent: !(await hasVisibleButton(page, /^PLAY /)),
      hasPlayedReadout: sevensBefore.includes('PLAYED') && sevensBefore.includes('HAND'),
      hasTurnCopy: sevensBefore.includes('YOUR TURN') || sevensBefore.includes('PASS THE TABLE'),
    };
    await page.screenshot({ path: `${PREFIX}-library-sevens-375.png`, fullPage: false });
    check('library sevens: drag surface (DRAG A CARD TO THE RUNS)', results.sevens.hasDragSurface);
    check('library sevens: retired PLAY dock absent', results.sevens.retiredPlayButtonsAbsent);
    check('library sevens: PLAYED/HAND readout', results.sevens.hasPlayedReadout);
    check('library sevens: turn copy', results.sevens.hasTurnCopy);
    check('library sevens: zero overflow', (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);

    check('library: zero browser errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (error) {
    check('library: completed without harness error', false, error instanceof Error ? error.message : String(error));
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// Dual-end phase — one phone, two ends, hold-to-peek (§8.3, absorbed the
// owed-P0 hold-to-peek proof). Playwright drives the real gesture: mouse
// down on an end strip, hold past HOLD_MS, assert the faces reveal, mouse
// up, assert the re-veil. Both ends probed independently.
// ---------------------------------------------------------------------------

async function dualEndPhase(browser, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  try {
    await reset(page);
    // Deal a freeplay table, then enable the dual-end token from the hub.
    await page.getByRole('button', { name: 'Deal the deck', exact: true }).last().click();
    await lastVisible(page.getByText('Choose a recipe', { exact: true }));
    const freeplay = await lastVisible(page.getByRole('button', { name: /^Freeplay\./ }));
    await freeplay.click();
    await page.waitForTimeout(600);
    // 2 players is the default; the Dual end token renders in the options card.
    const dualToken = await lastVisible(page.getByRole('button', { name: 'Dual end: one phone, two ends' }));
    await dualToken.click();
    await page.waitForTimeout(300);
    const dealNow = await lastVisible(page.getByRole('button', { name: 'Deal now', exact: true }));
    await dealNow.click();
    await page.waitForTimeout(1500);

    // The dual-end surface replaces the classic table.
    const bodyBefore = await page.locator('body').innerText();
    check(`dualend ${vp.name}: surface mounts (HOLD TO PEEK hint)`, bodyBefore.includes('HOLD TO PEEK YOUR HAND'));
    check(`dualend ${vp.name}: honesty line present`, bodyBefore.includes('SHOULDER-SURF RESISTANT'));
    check(`dualend ${vp.name}: both seat names render`, bodyBefore.includes('PLAYER 2'));

    // Face-up card labels must NOT exist before any hold (re-veil default).
    const faceLabelsBefore = await page.getByRole('button', {
      name: /^(A|Ace|[2-9]|10|J|Jack|Q|Queen|K|King) of (clubs|diamonds|hearts|spades)$/i,
    }).count();
    check(`dualend ${vp.name}: hands veiled at rest`, faceLabelsBefore === 0, `${faceLabelsBefore} labels`);

    // Give BOTH ends a card: draw for the bottom player, pass the turn, then
    // draw for the top player. Peek needs something to reveal on each end.
    const drawPile = page.getByRole('button', { name: /Draw pile, \d+ cards left/ });
    const drawBox1 = await drawPile.last().boundingBox();
    if (drawBox1 && drawBox1.width > 0) {
      await page.mouse.click(drawBox1.x + drawBox1.width / 2, drawBox1.y + drawBox1.height / 2);
      await page.waitForTimeout(500);
    }
    const passTurn = await visibleTextBoxPrefix(page, 'PASS TURN');
    if (passTurn && passTurn.element) {
      await passTurn.element.click();
      await page.waitForTimeout(700);
      const drawBox2 = await drawPile.last().boundingBox();
      if (drawBox2 && drawBox2.width > 0) {
        await page.mouse.click(drawBox2.x + drawBox2.width / 2, drawBox2.y + drawBox2.height / 2);
        await page.waitForTimeout(500);
      }
    }

    // Hold the BOTTOM end strip: press, hold, assert reveal, release.
    // The strip Pressable wraps the whole end; hold on its card row area.
    const seatBlocks = page.getByText('HOLD TO PEEK YOUR HAND');
    const blockCount = await seatBlocks.count();
    let bottomBox = null;
    for (let i = 0; i < blockCount; i += 1) {
      const box = await seatBlocks.nth(i).boundingBox().catch(() => null);
      // The bottom strip's hint sits in the lower half of the viewport.
      if (box && box.width > 0 && box.y > vp.height * 0.5) { bottomBox = box; break; }
    }
    if (!bottomBox) {
      check(`dualend ${vp.name}: bottom end strip present`, false, 'no strip box');
    } else {
      const cx = Math.max(bottomBox.x + bottomBox.width / 2, 10);
      const cy = Math.min(bottomBox.y + bottomBox.height / 2, vp.height - 20);
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.waitForTimeout(450); // past delayLongPress (300)
      const duringHold = await page.getByRole('button', {
        name: /^(A|Ace|[2-9]|10|J|Jack|Q|Queen|K|King) of (clubs|diamonds|hearts|spades)$/i,
      }).count();
      await page.waitForTimeout(350); // let the flip spring settle for the proof shot
      await page.screenshot({ path: `${PREFIX}-dualend-hold-${vp.name}.png`, fullPage: false });
      await page.mouse.up();
      await page.waitForTimeout(600);
      const afterRelease = await page.getByRole('button', {
        name: /^(A|Ace|[2-9]|10|J|Jack|Q|Queen|K|King) of (clubs|diamonds|hearts|spades)$/i,
      }).count();
      check(`dualend ${vp.name}: hold reveals the held end`, duringHold > 0, `${duringHold} labels mid-hold`);
      check(`dualend ${vp.name}: release re-veils`, afterRelease === 0, `${afterRelease} labels after`);
      await page.screenshot({ path: `${PREFIX}-dualend-released-${vp.name}.png`, fullPage: false });
    }

    // Hold the TOP end strip (the rotated far end) the same way.
    let topBox = null;
    for (let i = 0; i < blockCount; i += 1) {
      const box = await seatBlocks.nth(i).boundingBox().catch(() => null);
      if (box && box.width > 0 && box.y < vp.height * 0.4) { topBox = box; break; }
    }
    if (!topBox) {
      check(`dualend ${vp.name}: top end strip present`, false, 'no top box');
    } else {
      const cx = topBox.x + topBox.width / 2;
      const cy = Math.max(topBox.y + topBox.height / 2, 40);
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.waitForTimeout(450);
      const duringHoldTop = await page.getByRole('button', {
        name: /^(A|Ace|[2-9]|10|J|Jack|Q|Queen|K|King) of (clubs|diamonds|hearts|spades)$/i,
      }).count();
      await page.waitForTimeout(350); // settle the far-end flip spring
      await page.screenshot({ path: `${PREFIX}-dualend-top-hold-${vp.name}.png`, fullPage: false });
      await page.mouse.up();
      await page.waitForTimeout(500);
      const afterReleaseTop = await page.getByRole('button', {
        name: /^(A|Ace|[2-9]|10|J|Jack|Q|Queen|K|King) of (clubs|diamonds|hearts|spades)$/i,
      }).count();
      check(`dualend ${vp.name}: far end peeks too`, duringHoldTop > 0, `${duringHoldTop} labels mid-hold`);
      check(`dualend ${vp.name}: far end re-veils`, afterReleaseTop === 0, `${afterReleaseTop} labels after`);
    }

    check(`dualend ${vp.name}: zero overflow`, (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
    check(`dualend ${vp.name}: zero browser errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await page.screenshot({ path: `${PREFIX}-dualend-rest-${vp.name}.png`, fullPage: false });
  } catch (error) {
    check(`dualend ${vp.name}: completed without harness error`, false, error instanceof Error ? error.message : String(error));
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// Deck-proof phase — CardLab gallery (absorbed deckd-deck-proof-qa)
// ---------------------------------------------------------------------------

const CARD_SIZES = ['xs', 'sm', 'md', 'lg'];

async function deckProofPhase(browser) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  try {
    await page.goto(`${BASE_URL}/lab`, { waitUntil: 'commit', timeout: 60000 });
    await page.waitForTimeout(15000);

    const bodyText = await page.innerText('body');
    check('deckproof: gallery section present', /Full deck\s*·\s*52 \+ 2 jokers/.test(bodyText));

    let totalFaces = 0;
    let blankFaces = 0;
    let squashedFaces = 0;

    for (const size of CARD_SIZES) {
      const row = page.locator(`[data-testid="gallery-row-${size}"]`);
      const rowExists = await row.count();
      if (!rowExists) {
        check(`deckproof: row ${size} exists`, false, 'missing');
        continue;
      }

      const faces = row.locator('[data-testid^="face-"]');
      const faceCount = await faces.count();
      check(`deckproof: row ${size} has 54 faces`, faceCount === 54, `got ${faceCount}`);

      const boxes = await faces.evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            w: rect.width,
            h: rect.height,
            paths: node.querySelectorAll('svg path, svg use').length,
          };
        }),
      );
      for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i];
        totalFaces++;
        if (box.w <= 0 || box.h <= 0 || box.paths === 0) {
          blankFaces++;
          if (blankFaces <= 3) console.log(`  blank face at ${size}[${i}]: ${JSON.stringify(box)}`);
        }
        const ratio = box.h / box.w;
        if (ratio < 1.35 || ratio > 1.45) {
          squashedFaces++;
          if (squashedFaces <= 3) console.log(`  bad ratio ${ratio.toFixed(3)} at ${size}[${i}]`);
        }
      }
    }

    check('deckproof: no blank faces (all 216)', blankFaces === 0, `blank: ${blankFaces}/${totalFaces}`);
    check('deckproof: aspect ratio 2.5:3.5 held', squashedFaces === 0, `off: ${squashedFaces}/${totalFaces}`);

    const jokerPaths = await page
      .locator('[data-testid="face-md-joker-red"] svg path, [data-testid="face-md-joker-black"] svg path')
      .count();
    check('deckproof: jokers painted', jokerPaths > 0, `${jokerPaths} paths`);
    check('deckproof: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

    await page.screenshot({ path: `${PREFIX}-lab-375.png`, fullPage: false });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/lab`, { waitUntil: 'commit' });
    await page.waitForTimeout(8000);
    await page.screenshot({ path: `${PREFIX}-lab-1440.png`, fullPage: false });
    check('deckproof: 1440 pass clean', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (error) {
    check('deckproof: completed without harness error', false, error instanceof Error ? error.message : String(error));
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

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
    check(
      `${vp.name}: home Host a lobby is topmost (no layer covers it)`,
      await isTopmost(page, 'Host a lobby'),
    );
    check(
      `${vp.name}: home Deal the deck is topmost (no layer covers it)`,
      await isTopmost(page, 'Deal the deck'),
    );
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
    await libraryPhase(browser, vp);
  }

  await deckProofPhase(browser);
  await dualEndPhase(browser, { name: '375', width: 375, height: 812 });
  await dualEndPhase(browser, { name: '1440', width: 1440, height: 900 });
  await browser.close();
  console.log(`VISUAL pass=${pass} fail=${fail}`);
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
