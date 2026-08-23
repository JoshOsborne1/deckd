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
async function waitForOnScreenText(page, text, { timeoutMs = 45000 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = await probeOnScreenText(page, text);
    if (found) return found;
    await page.waitForTimeout(500);
  }
  throw new Error(`waitForOnScreenText timed out: ${text}`);
}

/** Find the on-screen element whose text matches `text` and whose center is
 * actually hit-testable (elementFromPoint lands on it or a descendant).
 * Hidden layers sit in the DOM off-screen, so this is the only reliable
 * "what would a real tap hit" probe. */
async function probeOnScreenText(page, text) {
  return page.evaluate((target) => {
    const wanted = target.toLowerCase();
    const els = [...document.querySelectorAll('button, [role="button"], div, span')];
    const candidates = [];
    for (const el of els) {
      const label = (el.getAttribute('aria-label') || '').trim();
      const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
      const labelMatch = label.toLowerCase() === wanted || label.toLowerCase().startsWith(wanted + '.') || label.toLowerCase().startsWith(wanted + ' ');
      const textMatch = text.toLowerCase() === wanted || text.toLowerCase().startsWith(wanted);
      if (!labelMatch && !textMatch) continue;
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
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
  }, text);
}

async function tapOnScreenText(page, text, { timeoutMs = 45000 } = {}) {
  const found = await waitForOnScreenText(page, text, { timeoutMs });
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

async function startPreset(page, name) {
  await tapOnScreenText(page, 'Deal the deck');
  await tapOnScreenText(page, name);
  await page.waitForTimeout(600);
  await tapOnScreenText(page, 'Deal now');
  await page.waitForTimeout(1600);
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
        if (rect.right > maxRight) maxRight = rect.right;
        if (rect.bottom > maxBottom) maxBottom = rect.bottom;
        if (rect.right > vw + 1 || rect.left < -1) {
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
  const buttons = page.locator('button');
  const labels = [];
  for (let i = 0; i < await buttons.count(); i += 1) {
    const button = buttons.nth(i);
    const box = await button.boundingBox().catch(() => null);
    if (!box || box.width <= 0 || box.height <= 0) continue;
    const rect = await button.evaluate((node) => {
      const r = node.getBoundingClientRect();
      return { visible: r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth };
    }).catch(() => ({ visible: false }));
    if (!rect.visible) continue;
    const label = ((await button.innerText().catch(() => '')) || (await button.getAttribute('aria-label')) || '').trim();
    if (label) labels.push(label);
  }
  return labels;
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
    const buttons = [...document.querySelectorAll('button')].filter((b) => {
      const rect = b.getBoundingClientRect();
      return rect.width > 40 && rect.height > 28 && rect.top > window.innerHeight * 0.45 && rect.bottom < window.innerHeight * 0.95;
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
        const actionTop = Math.min(...rects.map((x) => x.top));
        out.handActionGap = Math.round(actionTop - handBottom);
        if (actionTop < handBottom) out.handActionOverlap = true;
      }
    }
    return out;
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const games = process.env.AUDIT_GAMES ? process.env.AUDIT_GAMES.split(',') : ['War', 'Go Fish', 'Old Maid', 'Crazy Eights', 'Sevens', 'Blackjack-style', 'Poker-style', 'Klondike', 'FreeCell', 'Pyramid', 'Golf'];
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
