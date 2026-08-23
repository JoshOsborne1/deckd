/**
 * Gameplay audit harness (2026-08-23).
 *
 * Plays every shipped game at 375x812 and measures the three things Josh
 * called out: unplayable (no actionable controls), buggy (console/page
 * errors), terrible UI with overlapping elements (horizontal overflow,
 * nav/hand/action-bar collisions). Screenshots land in .qa-gameplay-*.png.
 *
 * Run: DECKD_QA_URL=https://deckd-app.roxai.click node qa/gameplay-audit.cjs
 */
const { chromium } = require('playwright');

const BASE_URL = process.env.DECKD_QA_URL ?? 'http://127.0.0.1:8085';
const VIEWPORT = { width: 375, height: 812 };

/**
 * Poll until an on-screen, hit-testable element matching `text` exists.
 * Returns its center without clicking.
 */
async function waitForOnScreenText(page, text, { timeoutMs = 45000, fuzzy = false } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = await probeOnScreenText(page, text, { fuzzy });
    if (found) return found;
    await page.waitForTimeout(500);
  }
  throw new Error(`waitForOnScreenText timed out: ${text}`);
}

/** Find the on-screen element whose text matches `text` and whose center is
 * actually hit-testable (elementFromPoint lands on it or a descendant).
 * Hidden layers sit in the DOM off-screen, so this is the only reliable
 * "what would a real tap hit" probe. */
async function probeOnScreenText(page, text, { fuzzy = false } = {}) {
  return page.evaluate(({ target, fuzzy }) => {
    const wanted = target.toLowerCase();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Only interactive controls count as tap targets. Container divs (the
    // recipe carousel, the hub backdrop) contain every card's text, so
    // matching them produces a "hit" that clicks the WRONG card physically.
    const els = [...document.querySelectorAll('button, [role="button"]')];
    const candidates = [];
    for (const el of els) {
      const label = (el.getAttribute('aria-label') || '').trim();
      const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
      const lowerText = text.toLowerCase();
      const labelMatch = fuzzy ? label.toLowerCase().includes(wanted) : (label.toLowerCase() === wanted || label.toLowerCase().startsWith(wanted + '.') || label.toLowerCase().startsWith(wanted + ' '));
      const textMatch = fuzzy ? lowerText.includes(wanted) : (lowerText === wanted || lowerText.startsWith(wanted));
      if (!labelMatch && !textMatch) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 20 || rect.height < 20) continue;
      if (rect.right <= 0 || rect.left >= vw || rect.bottom <= 0 || rect.top >= vh) continue;
      // Prefer compact elements: the actual control, not a wrapper div.
      candidates.push({ el, rect, area: rect.width * rect.height, text: text.slice(0, 60) });
    }
    candidates.sort((a, b) => a.area - b.area);
    for (const { el, rect, text } of candidates) {
      // Try several interior points: a real tap can land on any part of the
      // control, and partially covered buttons still work where uncovered.
      const points = [
        [rect.left + rect.width / 2, rect.top + rect.height / 2],
        [rect.left + rect.width * 0.25, rect.top + rect.height / 2],
        [rect.left + rect.width * 0.75, rect.top + rect.height / 2],
        [rect.left + rect.width / 2, rect.top + rect.height * 0.3],
        [rect.left + rect.width / 2, rect.top + rect.height * 0.7],
      ];
      for (const [px, py] of points) {
        if (px < 0 || px >= vw || py < 0 || py >= vh) continue;
        const top = document.elementFromPoint(px, py);
        let node = top;
        let ok = false;
        while (node) {
          if (node === el) { ok = true; break; }
          node = node.parentElement;
        }
        if (ok) return { x: px, y: py, tag: el.tagName, text };
      }
    }
    return null;
  }, { target: text, fuzzy });
}

async function tapOnScreenText(page, text, { timeoutMs = 45000, fuzzy = false } = {}) {
  const found = await waitForOnScreenText(page, text, { timeoutMs, fuzzy });
  await page.mouse.click(found.x, found.y);
  return found;
}

async function waitForHome(page) {
  await waitForOnScreenText(page, 'Deal the deck', { timeoutMs: 45000 });
}

async function reset(page) {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'commit', timeout: 60000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'commit', timeout: 60000 });
  await waitForHome(page);
}

async function revealPreset(page, name) {
  // The recipe carousel is a horizontal scroll container; presets past the
  // first few are off-screen and fail the hit-test probe. Scroll the
  // carousel in chunks until the target is reachable.
  const carousel = await page.evaluate(() => {
    const els = [...document.querySelectorAll('div')];
    for (let i = 0; i < els.length; i += 1) {
      const el = els[i];
      const style = getComputedStyle(el);
      if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 50) {
        const r = el.getBoundingClientRect();
        if (r.width > 280 && r.height < 400 && r.left >= -2 && r.right <= window.innerWidth + 2) {
          return { left: r.left, top: r.top, width: r.width, height: r.height, index: i };
        }
      }
    }
    return null;
  });
  if (!carousel) return false;
  const scrollTo = (v) => page.evaluate(({ i, v: value }) => {
    const el = document.querySelectorAll('div')[i];
    el.scrollLeft = value;
    return el.scrollLeft;
  }, { i: carousel.index, v });
  await scrollTo(0);
  for (let left = 0; left <= 1500; left += 250) {
    const found = await probeOnScreenText(page, name, { fuzzy: true });
    if (found) return true;
    const scrolled = await scrollTo(left);
    if (scrolled < left - 10 && left > 0) break; // hit the end
    await page.waitForTimeout(200);
  }
  return (await probeOnScreenText(page, name, { fuzzy: true })) !== null;
}

async function startPreset(page, name) {
  await tapOnScreenText(page, 'Deal the deck');
  // Preset cards read 'Recipe … <name> …' so matching must be fuzzy
  // (includes), like the existing harnesses' /Poker/i regex.
  const visible = await probeOnScreenText(page, name, { fuzzy: true });
  if (!visible) {
    const scrolled = await revealPreset(page, name);
    if (!scrolled) throw new Error(`could not reveal preset: ${name}`);
  }
  await tapOnScreenText(page, name, { fuzzy: true });
  // The app reads the preset selection synchronously at deal time (ref fix,
  // 2026-08-23), so no long registration wait is needed. Keep a short settle
  // for the recipe modal close animation.
  await page.waitForTimeout(400);
  const dealBtn = await probeOnScreenText(page, 'Deal now');
  if (!dealBtn) await page.waitForTimeout(1200); // some presets animate in
  await tapOnScreenText(page, 'Deal now');
  // Wait for the table layer to mount. Not every game shows 'YOUR TURN'
  // (solitaire variants), so fall back to: setup controls gone from the top
  // layer while the table is present.
  const started = Date.now();
  while (Date.now() - started < 15000) {
    const inGame = await probeOnScreenText(page, 'your turn', { fuzzy: true })
      || await probeOnScreenText(page, 'undo', { fuzzy: true });
    if (inGame) break;
    const dealOpen = await probeOnScreenText(page, 'Deal now');
    const dealDeck = await probeOnScreenText(page, 'Deal the deck');
    if (!dealOpen && !dealDeck) break; // setup gone → table is the top layer
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1200); // deal animation
}

async function readGeometry(page) {
  return page.evaluate(() => {
    const root = document.getElementById('root');
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Collect every visible element's rect to find overflow past the viewport.
    let maxRight = 0;
    let maxBottom = 0;
    const overflowers = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      const style = getComputedStyle(node);
      if (style.visibility === 'hidden' || style.display === 'none' || Number.parseFloat(style.opacity || '1') < 0.05) {
        node = walker.nextNode();
        continue;
      }
      const rect = node.getBoundingClientRect();
      // Only viewport-intersecting elements are on-screen (hidden layers are
      // translated off-screen); ignore the rest so they can't pollute.
      const intersects = rect.right > 0 && rect.left < vw && rect.bottom > 0 && rect.top < vh;
      if (rect.width > 4 && rect.height > 4 && intersects) {
        // Top-layer check (same rule as visibleButtons): a hidden layer
        // underneath the table keeps its rect but a real tap never reaches
        // it. If elementFromPoint at the centre lands somewhere else, this
        // element is covered and must not count as layout.
        const cx = Math.min(Math.max(rect.left + rect.width / 2, 1), vw - 1);
        const cy = Math.min(Math.max(rect.top + rect.height / 2, 1), vh - 1);
        const top = document.elementFromPoint(cx, cy);
        let probe = top;
        let reachable = false;
        while (probe) {
          if (probe === node) { reachable = true; break; }
          probe = probe.parentElement;
        }
        if (!reachable) {
          node = walker.nextNode();
          continue;
        }
        // Is the overflow absorbed by a scrollable ancestor (carousel, pager)?
        // If so it is intentional scrolling, not broken layout.
        let absorbed = false;
        let parent = node.parentElement;
        while (parent && parent !== document.body) {
          const ps = getComputedStyle(parent);
          const scrollableX = (ps.overflowX === 'auto' || ps.overflowX === 'scroll') && parent.scrollWidth > parent.clientWidth + 1;
          if (scrollableX) {
            absorbed = true;
            break;
          }
          parent = parent.parentElement;
        }
        if (rect.right > maxRight) maxRight = rect.right;
        if (rect.bottom > maxBottom) maxBottom = rect.bottom;
        if (!absorbed && (rect.right > vw + 1 || rect.left < -1)) {
          const text = (node.textContent || '').trim().slice(0, 40).replace(/\s+/g, ' ');
          overflowers.push({ tag: node.tagName, left: Math.round(rect.left), right: Math.round(rect.right), text });
        }
      }
      node = walker.nextNode();
    }
    return {
      innerWidth: vw,
      innerHeight: vh,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      rootScrollWidth: root?.scrollWidth ?? 0,
      maxRight,
      maxBottom,
      overflowCount: overflowers.length,
      overflowers: overflowers.slice(0, 8),
    };
  });
}

async function visibleButtons(page) {
  // Hit-test filtered: only elements that a real tap would reach (top layer).
  // Hidden layers keep viewport-intersecting rects, so bounding boxes alone
  // are not enough.
  return page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')];
    const labels = [];
    for (const button of buttons) {
      const r = button.getBoundingClientRect();
      if (r.width < 24 || r.height < 24) continue;
      if (r.right <= 0 || r.left >= window.innerWidth || r.bottom <= 0 || r.top >= window.innerHeight) continue;
      const style = getComputedStyle(button);
      if (style.visibility === 'hidden' || style.display === 'none' || Number.parseFloat(style.opacity || '1') < 0.05) continue;
      // Top-layer check: elementFromPoint at the center must reach the button.
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let node = document.elementFromPoint(cx, cy);
      let ok = false;
      while (node) {
        if (node === button) { ok = true; break; }
        node = node.parentElement;
      }
      if (!ok) continue;
      const label = ((button.innerText || '').trim() || button.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
      if (label) labels.push(label.slice(0, 32));
    }
    return labels;
  });
}

async function geometryReport(page) {
  return page.evaluate(() => {
    const out = {};
    // The nav rail (standing cards at the bottom).
    const candidates = [...document.querySelectorAll('[aria-label*="Home"], [aria-label*="Store"], [aria-label*="Profile"], [aria-label*="Presets"]')];
    const navEls = candidates.filter((el) => {
      const r2 = el.getBoundingClientRect();
      return r2.width > 30 && r2.height > 30 && r2.top > window.innerHeight * 0.7;
    });
    const nav = navEls.length > 0 ? navEls.map((el) => el.getBoundingClientRect()) : null;
    if (nav) {
      const union = { left: Math.min(...nav.map((x) => x.left)), top: Math.min(...nav.map((x) => x.top)), right: Math.max(...nav.map((x) => x.right)), bottom: Math.max(...nav.map((x) => x.bottom)) };
      out.navBar = { top: Math.round(union.top), bottom: Math.round(union.bottom), height: Math.round(union.bottom - union.top) };
    }
    // Action buttons: the widest row of buttons in the lower-middle area.
    // EXCLUDE hand cards: CardDragHand renders each card as a Pressable
    // (button), which would make hand-vs-action a self-intersection.
    // ALSO exclude occluded buttons (hidden Hub carousel cards behind the
    // table layer) — elementFromPoint must reach the button.
    const buttons = [...document.querySelectorAll('button')].filter((b) => {
      const rect = b.getBoundingClientRect();
      if (b.closest('[data-testid*="hand"]')) return false;
      if (rect.width <= 40 || rect.height <= 28) return false;
      if (rect.top < window.innerHeight * 0.45 || rect.bottom > window.innerHeight * 0.95) return false;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let node = document.elementFromPoint(cx, cy);
      while (node) {
        if (node === b) return true;
        node = node.parentElement;
      }
      return false;
    });
    if (buttons.length > 0) {
      const rects = buttons.map((b) => b.getBoundingClientRect());
      out.actionBar = { top: Math.round(Math.min(...rects.map((x) => x.top))), bottom: Math.round(Math.max(...rects.map((x) => x.bottom))), count: buttons.length };
      // Hand region: the row of card elements above the action bar.
      const cards = [...document.querySelectorAll('[data-testid^="card-drag-"], [data-testid*="hand"], [data-testid*="card"]')].filter((c) => {
        const rect = c.getBoundingClientRect();
        return rect.width > 40 && rect.height > 50 && rect.bottom < window.innerHeight * 0.8;
      });
      if (cards.length > 0) {
        const cardRects = cards.map((c) => c.getBoundingClientRect());
        out.handRow = { top: Math.round(Math.min(...cardRects.map((x) => x.top))), bottom: Math.round(Math.max(...cardRects.map((x) => x.bottom))), count: cards.length };
        const handBottom = Math.max(...cardRects.map((x) => x.bottom));
        const handTop = Math.min(...cardRects.map((x) => x.top));
        const actionTop = Math.min(...rects.map((x) => x.top));
        const actionBottom = Math.max(...rects.map((x) => x.bottom));
        // True overlap = the rectangles actually intersect. A hand that sits
        // BELOW the action row is normal layout, not an overlap.
        out.handActionGap = Math.round(actionTop - handBottom);
        if (actionTop < handBottom && actionBottom > handTop) out.handActionOverlap = true;
      }
    }
    return out;
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const games = process.env.AUDIT_GAMES ? process.env.AUDIT_GAMES.split(',') : ['War', 'Go Fish', 'Old Maid', 'Crazy Eights', 'Sevens', 'Blackjack', 'Poker', 'Klondike', 'FreeCell', 'Pyramid', 'Golf'];
  const results = {};
  const timeBox = (promise, ms) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`HUNG > ${ms / 1000}s`)), ms))]);
  for (const name of games) {
    const errors = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    try {
      await timeBox((async () => {
        await reset(page);
        await startPreset(page, name);
      })(), 60000);
      const geo = await readGeometry(page);
      const buttons = await visibleButtons(page);
      const report = await geometryReport(page);
      await page.screenshot({ path: `.qa-gameplay-${name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-375.png`, fullPage: false });
      results[name] = { buttons, geo, report, errors };
      console.log(`\n== ${name} ==`);
      console.log(`  buttons: ${buttons.slice(0, 12).join(' | ')}`);
      console.log(`  overflow: ${JSON.stringify({ scrollW: geo.scrollWidth, innerW: geo.innerWidth, maxRight: geo.maxRight, overflowers: geo.overflowers.length })}`);
      if (geo.overflowers.length > 0) console.log(`  OVERFLOWERS: ${JSON.stringify(geo.overflowers.slice(0, 3))}`);
      if (report.handActionOverlap) console.log(`  ⚠ HAND/ACTION OVERLAP: hand bottom ${report.handRow?.bottom} vs action top ${report.actionBar?.top}`);
      if (report.navBar) console.log(`  nav: ${JSON.stringify(report.navBar)}`);
      if (report.handRow && report.actionBar && !report.handActionOverlap) console.log(`  hand-bottom ${report.handRow.bottom} / action-top ${report.actionBar.top} / gap ${report.handActionGap}`);
      if (errors.length > 0) console.log(`  ERRORS: ${errors.slice(0, 3).join(' | ')}`);
    } catch (error) {
      results[name] = { error: error.message.slice(0, 300) };
      console.log(`\n== ${name} == FAILED: ${error.message.slice(0, 200)}`);
    }
  }
  await browser.close();
  require('fs').writeFileSync('.qa-gameplay-audit.json', JSON.stringify(results, null, 2));
  console.log('\nWrote .qa-gameplay-audit.json');
})();
