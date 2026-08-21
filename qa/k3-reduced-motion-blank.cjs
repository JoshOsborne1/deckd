// K3 reduced-motion regression: toggle the profile override on, reload,
// confirm the React root still renders content, then toggle off and reload.
// Run: node qa/k3-reduced-motion-blank.cjs
const { chromium } = require('playwright');

const baseUrl = process.env.DECKD_QA_URL || 'http://127.0.0.1:8093/';

async function rootState(page) {
  return page.evaluate(() => {
    const root = document.getElementById('root');
    if (!root) return { root: false, text: '', buttons: 0 };
    return {
      root: true,
      text: (root.innerText || '').slice(0, 400),
      buttons: root.querySelectorAll('button').length,
      bodyChildren: document.body.children.length,
    };
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

    // Clean slate
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.getElementById('root')?.innerText?.length > 0, null, { timeout: 60000 });
    await page.waitForTimeout(800);
    const initial = await rootState(page);
    if (!initial.root || initial.buttons === 0) throw new Error(`Baseline root empty: ${JSON.stringify(initial)}`);

    // Navigate to profile and toggle "Reduce motion override" On.
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label') || '').startsWith('Profile'));
      if (b) b.click();
    });
    await page.waitForURL('**/profile', { timeout: 10000 });
    await page.getByText('Reduce motion override', { exact: false }).waitFor({ state: 'visible', timeout: 15000 });

    // The toggle sits in the "Reduce motion override" preference row. The
    // row div is the smallest ancestor whose innerText contains the row
    // title, so pick the smallest such div and click its On/Off button.
    const toggled = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('div')]
        .filter((d) => d.innerText?.includes('Reduce motion override') && d.querySelector('button'))
        .sort((a, b) => a.innerText.length - b.innerText.length);
      for (const row of rows) {
        const btns = [...row.querySelectorAll('button')].filter((b) => /^(On|Off)$/.test((b.innerText || '').trim()));
        if (btns.length) { btns[0].click(); return true; }
      }
      return false;
    });
    if (!toggled) throw new Error('Could not find the reduce-motion toggle button');
    await page.waitForTimeout(600);

    const persisted = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('profile:local') || '{}')?.state?.reduceMotionOverride ?? null; }
      catch { return null; }
    });
    if (persisted !== true) throw new Error(`Override did not persist true: ${JSON.stringify(persisted)}`);

    // Reload with the override ON — the crash scenario from WEB-05.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    const afterReload = await rootState(page);
    if (!afterReload.root || afterReload.bodyChildren === 0 || afterReload.text.trim().length === 0) {
      throw new Error(`BLANK ROOT after reload with override=true: ${JSON.stringify(afterReload)} errors=${JSON.stringify(errors)}`);
    }

    // Navigate across surfaces while reduced, then toggle OFF and reload.
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label') || '').startsWith('Profile'));
      if (b) b.click();
    });
    await page.waitForURL('**/profile', { timeout: 10000 });
    await page.getByText('Reduce motion override', { exact: false }).waitFor({ state: 'visible', timeout: 15000 });
    const toggledOff = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('div')]
        .filter((d) => d.innerText?.includes('Reduce motion override') && d.querySelector('button'))
        .sort((a, b) => a.innerText.length - b.innerText.length);
      for (const row of rows) {
        const btns = [...row.querySelectorAll('button')].filter((b) => /^(On|Off)$/.test((b.innerText || '').trim()));
        if (btns.length) { btns[0].click(); return true; }
      }
      return false;
    });
    if (!toggledOff) throw new Error('Could not toggle reduce motion OFF');
    await page.waitForTimeout(600);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const afterOff = await rootState(page);
    if (!afterOff.root || afterOff.text.trim().length === 0) {
      throw new Error(`BLANK ROOT after reload with override=false: ${JSON.stringify(afterOff)}`);
    }

    const out = { baseUrl, initial, persisted, afterReload, afterOff, errors };
    process.stdout.write(JSON.stringify(out, null, 2));
    if (errors.length) process.exitCode = 2;
  } catch (error) {
    process.stdout.write(JSON.stringify({ error: error instanceof Error ? error.message : String(error), errors }, null, 2));
    process.exitCode = 2;
  } finally {
    await browser.close();
  }
})();
