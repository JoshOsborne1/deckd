/**
 * Sound-pass UI proof: settings mute toggle at 375px and desktop.
 *
 * Verifies:
 * 1. Settings screen renders the Table sounds card with the toggle at 375px.
 * 2. Toggle flips and persists (reload -> still off).
 * 3. Same at 1440x900 (desktop).
 *
 * Usage: node qa/deckd-sound-qa.cjs
 * Env: DECKD_QA_URL (default http://127.0.0.1:8081)
 */
const path = require('path');
function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    // Global install fallback (dev machine has playwright via npm global).
    return require('C:/Users/Wrekin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright');
  }
}
const { chromium } = loadPlaywright();

const BASE_URL = process.env.DECKD_QA_URL ?? 'http://127.0.0.1:8081';
const SHOT_DIR = path.resolve('.qa-shots');

(async () => {
  const fs = require('fs');
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/Wrekin/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe',
  });
  const errors = [];
  const results = [];

  const check = (name, ok, detail = '') => {
    results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
    if (!ok) errors.push(name);
  };

  for (const [label, viewport] of [
    ['375', { width: 375, height: 812 }],
    ['desktop', { width: 1440, height: 900 }],
  ]) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`[${label}] console: ${m.text()}`);
    });

    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'commit', timeout: 60000 });
    // Clear persisted state so we test the default (sound ON) first.
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'commit', timeout: 60000 });

    // Wait for the Table sounds card.
    const card = page.getByText('Table sounds', { exact: true });
    await card.waitFor({ state: 'visible', timeout: 60000 });

    // Toggle: RN-web Switch renders as an input[type=checkbox][role=switch].
    const toggle = page.getByRole('switch').first();
    await toggle.waitFor({ state: 'visible', timeout: 15000 });
    const initiallyOn = await toggle.isChecked();
    check(`${label}: toggle defaults ON`, initiallyOn === true, `checked=${initiallyOn}`);

    await page.screenshot({ path: path.join(SHOT_DIR, `sound-settings-${label}-default.png`) });

    // Flip it off.
    await toggle.click();
    await page.waitForTimeout(400);
    const afterOff = await toggle.isChecked();
    check(`${label}: toggle flips OFF`, afterOff === false, `checked=${afterOff}`);
    await page.screenshot({ path: path.join(SHOT_DIR, `sound-settings-${label}-off.png`) });

    // Reload: persistence across launches.
    await page.reload({ waitUntil: 'commit', timeout: 60000 });
    await card.waitFor({ state: 'visible', timeout: 60000 });
    const afterReload = await page.getByRole('switch').first().isChecked();
    check(`${label}: toggle persists OFF after reload`, afterReload === false, `checked=${afterReload}`);

    // No horizontal overflow at 375px (clean layout gate).
    if (label === '375') {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      check(`${label}: no horizontal overflow`, overflow === false);
    }

    // Flip back on for a clean state.
    await page.getByRole('switch').first().click();
    await page.close();
  }

  await browser.close();
  console.log(results.join('\n'));
  if (errors.length) {
    console.error(`\nFAILED: ${errors.join(', ')}`);
    process.exit(1);
  }
  console.log('\nALL SOUND QA CHECKS PASSED');
})();
