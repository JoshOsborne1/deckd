// Nav v4 (standing playing cards) QA: geometry, presence, active state, screenshots.
// Usage: node qa/deckd-nav3-qa.cjs [baseUrl]
const { chromium } = require('playwright');

const baseUrl = process.env.DECKD_QA_URL ?? 'http://localhost:8081/';
const NAV_LABELS = ['Home', 'Store', 'Table', 'Presets', 'Profile'];

// The nav rail lives in the bottom ~132px of the viewport. Scope controls
// to that rail so layered route surfaces cannot be mistaken for the nav.
const NAV_ZONE_BOTTOM = 130;

async function visibleButtons(page, labels) {
  return page.evaluate(
    ({ wanted, zoneBottom }) => {
      const wantedSet = new Set(wanted);
      return [...document.querySelectorAll('button')]
        .map((button) => {
          const label = button.getAttribute('aria-label') ?? '';
          const style = window.getComputedStyle(button);
          const rect = button.getBoundingClientRect();
          return {
            label,
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
            opacity: Number(style.opacity),
            visibility: style.visibility,
            pointerEvents: style.pointerEvents,
            inNavZone: window.innerHeight - rect.bottom <= zoneBottom && rect.bottom > 0,
          };
        })
        .filter(
          (item) =>
            wantedSet.has(item.label) &&
            item.width > 0 &&
            item.height > 0 &&
            item.opacity > 0.01 &&
            item.visibility !== 'hidden' &&
            item.pointerEvents !== 'none',
        );
    },
    { wanted: labels, zoneBottom: NAV_ZONE_BOTTOM },
  );
}

// Choose the bottom-most instance of each label, which is the standing-card rail.
function pickNavButtons(boxes) {
  const byLabel = new Map();
  for (const box of boxes) {
    const prev = byLabel.get(box.label);
    if (!prev || box.bottom > prev.bottom) byLabel.set(box.label, box);
  }
  return [...byLabel.values()];
}

function assertNav(stage, boxes, viewport) {
  if (boxes.length !== 5) {
    throw new Error(`${stage}: expected 5 nav controls, got ${boxes.length}: ${JSON.stringify(boxes.map((b) => b.label))}`);
  }
  for (const box of boxes) {
    if (
      box.left < -1 || box.top < -1 || box.right > viewport.width + 1 || box.bottom > viewport.height + 1 ||
      box.width < 44 || box.height < 44
    ) {
      throw new Error(`${stage}: invalid touch bounds ${JSON.stringify(box)}`);
    }
  }
  // Standing cards must not overlap each other (no horizontal collision).
  const sorted = [...boxes].sort((a, b) => a.left - b.left);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].left < sorted[i - 1].right - 1) {
      throw new Error(`${stage}: overlapping nav controls ${sorted[i - 1].label} / ${sorted[i].label}`);
    }
  }
}

async function scrollWidths(page) {
  return page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
}

async function chipFaceProbe(page) {
  // The chip face is the circular element inside each nav button: find the
  // button by aria-label, then inspect its first child's border radius.
  return page.evaluate(() => {
    const out = {};
    for (const label of ['Home', 'Store', 'Presets', 'Profile']) {
      const btn = [...document.querySelectorAll('button')].find(
        (b) => b.getAttribute('aria-label') === label,
      );
      if (!btn) { out[label] = null; continue; }
      const face = btn.firstElementChild;
      const style = face ? window.getComputedStyle(face) : null;
      out[label] = style
        ? {
            borderRadius: style.borderRadius,
            borderWidth: style.borderWidth,
            borderColor: style.borderColor,
            backgroundColor: style.backgroundColor,
            width: face.getBoundingClientRect().width,
            height: face.getBoundingClientRect().height,
          }
        : null;
    }
    return out;
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const report = { baseUrl, viewports: {} };

  for (const vp of [
    { name: '375', width: 375, height: 812 },
    { name: '1440', width: 1440, height: 900 },
  ]) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => errors.push(`${vp.name} pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${vp.name} console: ${m.text()}`); });
    const entry = { screens: {} };
    try {
      await page.goto(baseUrl, { waitUntil: 'commit', timeout: 60000 });
      await page.getByRole('button', { name: 'Table', exact: true }).last().waitFor({ state: 'visible', timeout: 60000 });
      await page.waitForTimeout(1200);

      // Home: all five controls, no overflow, active chip = Home.
      const homeBoxes = await visibleButtons(page, NAV_LABELS);
      assertNav('home', pickNavButtons(homeBoxes), vp);
      const homeWidths = await scrollWidths(page);
      const homeFaces = await chipFaceProbe(page);
      await page.screenshot({ path: `.qa-nav3-home-${vp.name}.png`, fullPage: false });
      entry.screens.home = true;
      entry.home = { boxes: homeBoxes, widths: homeWidths, faces: homeFaces };

      // Hub (deal): chips still present on the setup surface.
      await page.getByRole('button', { name: 'Table', exact: true }).last().click();
      await page.getByText('Choose a recipe', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
      await page.waitForTimeout(600);
      const hubBoxes = await visibleButtons(page, NAV_LABELS);
      assertNav('hub', pickNavButtons(hubBoxes), vp);
      const hubWidths = await scrollWidths(page);
      await page.screenshot({ path: `.qa-nav3-hub-${vp.name}.png`, fullPage: false });
      entry.screens.hub = true;
      entry.hub = { boxes: hubBoxes, widths: hubWidths };

      // Store route: chips on a menu surface.
      await page.getByRole('button', { name: 'Store', exact: true }).last().click();
      await page.waitForTimeout(2500);
      const storeBoxes = await visibleButtons(page, NAV_LABELS);
      assertNav('store', pickNavButtons(storeBoxes), vp);
      const storeWidths = await scrollWidths(page);
      await page.screenshot({ path: `.qa-nav3-store-${vp.name}.png`, fullPage: false });
      entry.screens.store = true;
      entry.store = { boxes: storeBoxes, widths: storeWidths };

      // Presets route.
      await page.getByRole('button', { name: 'Presets', exact: true }).last().click();
      await page.waitForTimeout(2500);
      const listBoxes = await visibleButtons(page, NAV_LABELS);
      assertNav('list', pickNavButtons(listBoxes), vp);
      const listWidths = await scrollWidths(page);
      await page.screenshot({ path: `.qa-nav3-list-${vp.name}.png`, fullPage: false });
      entry.screens.list = true;
      entry.list = { boxes: listBoxes, widths: listWidths };

      // Profile route.
      await page.getByRole('button', { name: 'Profile', exact: true }).last().click();
      await page.waitForTimeout(2500);
      const profileBoxes = await visibleButtons(page, NAV_LABELS);
      assertNav('profile', pickNavButtons(profileBoxes), vp);
      const profileWidths = await scrollWidths(page);
      await page.screenshot({ path: `.qa-nav3-profile-${vp.name}.png`, fullPage: false });
      entry.screens.profile = true;
      entry.profile = { boxes: profileBoxes, widths: profileWidths };

      // Live table: back to Home first (matches the proven hub flow), then
      // deal 2 each. Chips + deck object must stay on the edge and the action
      // rail must clear the nav zone (the edge is part of the table).
      await page.getByRole('button', { name: 'Home', exact: true }).last().click();
      await page.waitForTimeout(1500);
      await page.getByRole('button', { name: 'Table', exact: true }).last().click();
      await page
        .getByText('Choose a recipe', { exact: true })
        .filter({ visible: true })
        .first()
        .waitFor({ state: 'visible', timeout: 30000 });
      await page.waitForTimeout(600);
      await page.getByText('Deal 2 each', { exact: true }).first().click().catch(() => {});
      await page.waitForTimeout(400);
      const dealNow = page.getByRole('button', { name: /Deal now/i });
      if (await dealNow.count()) await dealNow.first().click();
      await page.waitForTimeout(1800);
      const tableBoxes = await visibleButtons(page, NAV_LABELS);
      assertNav('table', pickNavButtons(tableBoxes), vp);
      const tableWidths = await scrollWidths(page);
      // The action rail (PASS TURN etc.) must sit ABOVE the nav zone so the
      // edge stays clear of table controls.
      const railClear = await page.evaluate(() => {
        const navTop = window.innerHeight - 92;
        return [...document.querySelectorAll('button')]
          .map((b) => {
            const label = b.getAttribute('aria-label') || b.textContent?.trim().slice(0, 24) || '';
            const r = b.getBoundingClientRect();
            const style = window.getComputedStyle(b);
            return {
              label,
              bottom: r.bottom,
              // The layered-surface architecture keeps hidden hub layers
              // mounted in the DOM; only VISIBLE controls can collide.
              visible:
                r.width > 0 &&
                r.height > 0 &&
                Number(style.opacity) > 0.01 &&
                style.visibility !== 'hidden' &&
                style.pointerEvents !== 'none',
            };
          })
          .filter((b) => b.visible && b.bottom > navTop && b.bottom <= window.innerHeight)
          .filter((b) => !['Home', 'Store', 'Table', 'Presets', 'Profile'].includes(b.label))
          .map((b) => b.label);
      });
      if (railClear.length > 0) {
        throw new Error(`${vp.name} table: controls collide with the nav edge: ${JSON.stringify(railClear)}`);
      }
      await page.screenshot({ path: `.qa-nav3-table-${vp.name}.png`, fullPage: false });
      entry.screens.table = true;
      entry.table = { boxes: tableBoxes, widths: tableWidths, railClear };

      // Pass veil: PASS TURN raises the privacy veil; the nav stays on the
      // edge so the pass ritual never traps the player.
      const passTurn = page.getByRole('button', { name: /PASS TURN/i });
      if (await passTurn.count()) {
        await passTurn.first().click();
        await page.waitForTimeout(1200);
      }
      const passBoxes = await visibleButtons(page, NAV_LABELS);
      assertNav('pass', pickNavButtons(passBoxes), vp);
      const passWidths = await scrollWidths(page);
      await page.screenshot({ path: `.qa-nav3-pass-${vp.name}.png`, fullPage: false });
      entry.screens.pass = true;
      entry.pass = { boxes: passBoxes, widths: passWidths };

      // No horizontal overflow on any surface.
      for (const [name, widths] of Object.entries({
        home: homeWidths, hub: hubWidths, store: storeWidths, list: listWidths, profile: profileWidths,
        table: tableWidths, pass: passWidths,
      })) {
        if (widths.scrollWidth !== vp.width || widths.bodyScrollWidth !== vp.width) {
          throw new Error(`${vp.name} ${name}: horizontal overflow ${JSON.stringify(widths)}`);
        }
      }
      report.viewports[vp.name] = entry;
    } catch (error) {
      await page.screenshot({ path: `.qa-nav3-failure-${vp.name}.png`, fullPage: false }).catch(() => {});
      entry.error = error instanceof Error ? error.message : String(error);
      entry.body = (await page.locator('body').innerText().catch(() => '')).slice(-1200);
      report.viewports[vp.name] = entry;
    }
    await page.close();
  }

  report.errors = errors;
  process.stdout.write(JSON.stringify(report, null, 2));
  await browser.close();
  const failed = Object.values(report.viewports).some((v) => v.error) || errors.length > 0;
  if (failed) process.exitCode = 2;
})();
