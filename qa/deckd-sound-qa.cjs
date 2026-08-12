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

  // --- Playback proof: sounds actually fire, not just the toggle ---
  // expo-audio web creates DETACHED `new Audio()` elements (never in the
  // DOM), so querySelectorAll('audio') is useless. Instrument the prototype
  // instead: record every play() call with its source.
  const instrument = (p) =>
    p.addInitScript(() => {
      window.__audioPlays = [];
      const orig = HTMLAudioElement.prototype.play;
      HTMLAudioElement.prototype.play = function patchedPlay() {
        window.__audioPlays.push({
          // In headless the src can be a blob/data URI (expo-audio web
          // preloads assets) — record both forms for the detail line.
          src: String(this.src || '').split('/').pop(),
          currentSrc: String(this.currentSrc || '').split('/').pop(),
          at: Date.now(),
        });
        return orig.apply(this, arguments);
      };
    });
  const plays = (p) => p.evaluate(() => window.__audioPlays || []);

  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await instrument(page);
  page.on('pageerror', (e) => errors.push(`[playback] pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[playback] console: ${m.text()}`);
  });

  await page.goto(`${BASE_URL}/`, { waitUntil: 'commit', timeout: 60000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'commit', timeout: 60000 });

  // Prime the browser audio pipeline with a real user gesture (autoplay policy).
  await page.waitForTimeout(500);
  await page.mouse.click(180, 400).catch(() => {});
  await page.waitForTimeout(300);

  // Deal a session through the real UI: Home → deal → preset → deal now.
  // "Deal 2 each" actually deals cards at start (freeplay keeps 52 in the
  // pile, so it correctly plays no deal sound).
  await page.getByRole('button', { name: 'Deal the deck', exact: true }).last().click();
  await page.getByText('Choose a recipe', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  await page.getByRole('button', { name: /^Deal 2 each\./ }).last().click();
  await page.getByRole('button', { name: 'Deal now', exact: true }).last().click();
  await page.waitForTimeout(1500);

  const dealPlays = await plays(page);
  check(
    'playback: deal sound actually plays after dealing',
    dealPlays.length > 0,
    JSON.stringify(dealPlays.slice(0, 3)),
  );
  await page.screenshot({ path: path.join(SHOT_DIR, 'sound-playback-deal.png') });
  await page.close();

  // Mute OFF → deal again → no playback starts.
  const mutedPage = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await instrument(mutedPage);
  mutedPage.on('pageerror', (e) => errors.push(`[muted] pageerror: ${e.message}`));
  mutedPage.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[muted] console: ${m.text()}`);
  });

  await mutedPage.goto(`${BASE_URL}/settings`, { waitUntil: 'commit', timeout: 60000 });
  await mutedPage.evaluate(() => localStorage.clear());
  await mutedPage.reload({ waitUntil: 'commit', timeout: 60000 });
  await mutedPage.getByText('Table sounds', { exact: true }).waitFor({ state: 'visible', timeout: 60000 });
  const toggle = mutedPage.getByRole('switch').first();
  await toggle.waitFor({ state: 'visible', timeout: 15000 });
  if (await toggle.isChecked()) await toggle.click();
  await mutedPage.waitForTimeout(300);

  await mutedPage.goto(`${BASE_URL}/`, { waitUntil: 'commit', timeout: 60000 });
  await mutedPage.mouse.click(180, 400).catch(() => {});
  await mutedPage.getByRole('button', { name: 'Deal the deck', exact: true }).last().click();
  await mutedPage.getByText('Choose a recipe', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  await mutedPage.getByRole('button', { name: /^Deal 2 each\./ }).last().click();
  await mutedPage.getByRole('button', { name: 'Deal now', exact: true }).last().click();
  await mutedPage.waitForTimeout(1500);

  const mutedPlays = await plays(mutedPage);
  check(
    'playback: muted table stays silent after dealing',
    mutedPlays.length === 0,
    JSON.stringify(mutedPlays.slice(0, 3)),
  );
  await mutedPage.screenshot({ path: path.join(SHOT_DIR, 'sound-playback-muted.png') });
  await mutedPage.close();

  await browser.close();
  console.log(results.join('\n'));
  if (errors.length) {
    console.error(`\nFAILED: ${errors.join(', ')}`);
    process.exit(1);
  }
  console.log('\nALL SOUND QA CHECKS PASSED');
})();
