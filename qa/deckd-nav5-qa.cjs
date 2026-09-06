const { chromium } = require('playwright');
const fs = require('fs');

const baseUrl = process.env.DECKD_QA_URL || 'http://127.0.0.1:8085/';
const viewports = [
  { width: 375, height: 812 },
  { width: 1440, height: 900 },
];
const navLabels = ['Home', 'Store', 'Table', 'Presets', 'Profile'];
const navAriaLabels = {
  Home: 'Home',
  Store: 'Store',
  Table: 'Table, Deckd logo button',
  Presets: 'Presets',
  Profile: 'Profile',
};
const routes = [
  { id: 'home', marker: 'THE DECK IS THE DOOR' },
  { id: 'store', marker: 'Passes', button: 'Store' },
  { id: 'table', marker: 'Choose a recipe', button: 'Table' },
  { id: 'presets', marker: 'Rulesets', button: 'Presets' },
  { id: 'profile', marker: 'Player identity', button: 'Profile' },
];

async function visibleButton(page, label) {
  const candidates = page.locator('button');
  for (let index = 0; index < await candidates.count(); index += 1) {
    const button = candidates.nth(index);
    if ((await button.getAttribute('aria-label')) !== navAriaLabels[label] &&
        (await button.getAttribute('aria-label')) !== label) continue;
    const box = await button.boundingBox();
    if (!box || box.width < 1 || box.height < 1) continue;
    const visible = await button.evaluate((element) => {
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
    });
    if (visible) return button;
  }
  throw new Error(`Visible nav button not found: ${label}`);
}

async function waitForVisibleText(page, text) {
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
  }), text, { timeout: 15000 });
}

async function navState(page) {
  return page.evaluate((labels) => {
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
      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        right: box.right,
        bottom: box.bottom,
      };
    };
    const items = {};
    for (const label of labels) {
      const buttons = [...document.querySelectorAll('button')]
        .filter((button) => button.getAttribute('aria-label') === ({
          Home: 'Home',
          Store: 'Store',
          Table: 'Table, Deckd logo button',
          Presets: 'Presets',
          Profile: 'Profile',
        })[label])
        .filter(isVisible)
        .sort((first, second) => second.getBoundingClientRect().bottom - first.getBoundingClientRect().bottom);
      const button = buttons[0];
      if (!button) {
        items[label] = null;
        continue;
      }
      const face = button.firstElementChild;
      const labelElement = [...button.querySelectorAll('*')]
        .find((element) => element.childElementCount === 0 &&
          element.textContent?.trim() === label && isVisible(element));
      const faceStyle = face ? getComputedStyle(face) : null;
      items[label] = {
        button: rect(button),
        face: face ? rect(face) : null,
        labelRect: labelElement ? rect(labelElement) : null,
        background: faceStyle?.backgroundColor ?? '',
        border: faceStyle?.borderColor ?? '',
        transform: faceStyle?.transform ?? '',
        borderRadius: faceStyle?.borderRadius ?? '',
        label: button.getAttribute('aria-label'),
      };
    }
    const railElement = document.querySelector('[data-testid="global-nav-rail"]');
    const railStyle = railElement ? getComputedStyle(railElement) : null;
    return {
      items,
      rail: railElement && railStyle ? {
        rect: rect(railElement),
        borderTopWidth: railStyle.borderTopWidth,
        borderTopColor: railStyle.borderTopColor,
      } : null,
    };
  }, navLabels);
}

async function assertNavBounds(page, state, viewport, routeId) {
  if (!state.rail) throw new Error(`${routeId}: global nav rail marker is missing`);
  const rail = state.rail.rect;
  if (rail.x < -1 || rail.right > viewport.width + 1 || rail.bottom > viewport.height - 7) {
    throw new Error(`${routeId}: nav rail is out of bounds ${JSON.stringify(rail)}`);
  }
  if (Number.parseFloat(state.rail.borderTopWidth) < 0.5) {
    throw new Error(`${routeId}: nav rail has no visible top rule`);
  }

  for (const label of navLabels) {
    const item = state.items[label];
    if (!item || !item.face || !item.labelRect) throw new Error(`${routeId}: missing visible ${label} card or label`);
    const button = item.button;
    const face = item.face;
    const labelRect = item.labelRect;
    if (button.x < 8 || button.right > viewport.width - 8 || button.bottom > viewport.height - 7) {
      throw new Error(`${routeId}: ${label} touch target is out of bounds ${JSON.stringify(button)}`);
    }
    if (face.x < 8 || face.right > viewport.width - 8 || face.y < -1 || face.bottom > viewport.height - 7) {
      throw new Error(`${routeId}: ${label} card face is clipped ${JSON.stringify(face)}`);
    }
    if (labelRect.x < 8 || labelRect.right > viewport.width - 8 || labelRect.y < -1 || labelRect.bottom > viewport.height - 7) {
      throw new Error(`${routeId}: ${label} label is clipped ${JSON.stringify(labelRect)}`);
    }
    if (button.width < 44 || button.height < 44) {
      throw new Error(`${routeId}: ${label} touch target is too small`);
    }
  }

  const pageWidth = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
  if (pageWidth > viewport.width + 1) {
    throw new Error(`${routeId}: horizontal overflow ${pageWidth}px at ${viewport.width}px`);
  }

  const table = state.items.Table;
  const sideHeights = navLabels
    .filter((label) => label !== 'Table')
    .map((label) => state.items[label].face.height);
  if (table.background === 'rgba(0, 0, 0, 0)' || table.background === 'transparent') {
    throw new Error(`${routeId}: Table slot is not a card ${JSON.stringify(table)}`);
  }
  if (table.face.height <= Math.max(...sideHeights)) {
    throw new Error(`${routeId}: Table card is not taller than side cards`);
  }
}

async function assertNoContentOverlap(page, state, routeId) {
  const visualTop = state.rail.rect.y;
  const controls = await page.evaluate(() => {
    const navLabelsSet = new Set([
      'Home',
      'Store',
      'Table, Deckd logo button',
      'Presets',
      'Profile',
    ]);
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
      return { x: left, y: top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
    };
    return [...document.querySelectorAll('button')]
      .filter((button) => !navLabelsSet.has(button.getAttribute('aria-label')))
      .map((button) => {
        const rect = button.getBoundingClientRect();
        const visible = clippedRect(button);
        const style = getComputedStyle(button);
        let current = button;
        let opacity = 1;
        let ancestorVisible = true;
        while (current instanceof HTMLElement) {
          const ancestorStyle = getComputedStyle(current);
          if (ancestorStyle.visibility === 'hidden' || ancestorStyle.display === 'none' || ancestorStyle.pointerEvents === 'none') {
            ancestorVisible = false;
            break;
          }
          opacity *= Number(ancestorStyle.opacity);
          if (opacity <= 0.01) {
            ancestorVisible = false;
            break;
          }
          current = current.parentElement;
        }
        return {
          label: button.getAttribute('aria-label') || button.textContent?.trim().slice(0, 50) || 'unlabelled',
          x: rect.x,
          y: rect.y,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          visibleX: visible.x,
          visibleY: visible.y,
          visibleRight: visible.right,
          visibleBottom: visible.bottom,
          visibleWidth: visible.width,
          visibleHeight: visible.height,
          visible: ancestorVisible && visible.width > 0 && visible.height > 0 &&
            style.visibility !== 'hidden' && style.display !== 'none' && opacity > 0.01,
        };
      })
      .filter((control) => control.visible);
  });

  const contentText = await page.evaluate(() => {
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
      return {
        x: left,
        y: top,
        right,
        bottom,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
      };
    };
    const visible = (element, clip) => {
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
    };
    return [...document.querySelectorAll('*')]
      .filter((element) => element.childElementCount === 0 && element.textContent?.trim())
      .filter((element) => !navRail?.contains(element))
      .map((element) => ({ element, clip: clippedRect(element) }))
      .filter(({ element, clip }) => visible(element, clip))
      .map(({ element, clip }) => ({
        label: element.textContent.trim().slice(0, 80),
        x: clip.x,
        y: clip.y,
        right: clip.right,
        bottom: clip.bottom,
        width: clip.width,
        height: clip.height,
      }));
  });
  const overlappingText = contentText.filter((text) => text.bottom > visualTop + 1);
  if (overlappingText.length > 0) {
    throw new Error(`${routeId}: content text overlaps nav fan at ${visualTop.toFixed(1)}px ${JSON.stringify(overlappingText)}`);
  }

  if (routeId === 'store') {
    const restore = controls.find((control) => control.label === 'Restore purchases');
    if (!restore) throw new Error('store: Restore purchases is not visible');
    if (restore.width < 44 || restore.height < 44) {
      throw new Error(`store: Restore purchases is not a button-sized target ${JSON.stringify(restore)}`);
    }
    if (restore.visibleBottom > visualTop - 8) {
      throw new Error(`store: Restore purchases is too close to nav fan ${JSON.stringify({ restore, visualTop })}`);
    }
  }
}

async function clickNav(page, label) {
  const button = await visibleButton(page, label);
  await button.click();
  return button;
}

async function runViewport(browser, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.addInitScript(() => localStorage.clear());
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.getAttribute('aria-label') === 'Home'), null, { timeout: 30000 });

  const results = {};
  for (const route of routes) {
    if (route.button) await clickNav(page, route.button);
    await waitForVisibleText(page, route.marker);
    await page.waitForTimeout(700);
    const state = await navState(page);
    await assertNavBounds(page, state, viewport, route.id);
    await assertNoContentOverlap(page, state, route.id);
    const screenshotPath = `.vischeck/nav-v5-${route.id}-${viewport.width}.png`;
    fs.mkdirSync('.vischeck', { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: false });
    results[route.id] = { state, screenshotPath };
  }

  const normalizeTransform = (transform) => {
    const matrix = transform.match(/^matrix\(([^)]+)\)$/);
    if (!matrix) return transform;
    return matrix[1]
      .split(',')
      .map((value) => {
        const numeric = Number.parseFloat(value);
        return Math.abs(numeric) < 0.05 ? '0' : numeric.toFixed(2);
      })
      .join(',');
  };
  const transforms = {};
  for (const label of navLabels) {
    transforms[label] = new Set(routes.map((route) => normalizeTransform(results[route.id].state.items[label].transform)));
    if (transforms[label].size !== 1) {
      throw new Error(`${viewport.width}: ${label} geometry changed with selection, active state is not fill-only: ${JSON.stringify([...transforms[label]])}`);
    }
  }

  const expectedFilled = {
    home: 'Home',
    store: 'Store',
    table: 'Table',
    presets: 'Presets',
    profile: 'Profile',
  };
  for (const route of routes) {
    const filled = navLabels.filter((label) => results[route.id].state.items[label].background === 'rgb(229, 50, 47)');
    const expected = expectedFilled[route.id];
    if (expected && (filled.length !== 1 || filled[0] !== expected)) {
      throw new Error(`${route.id}: expected one active fill on ${expected}, got ${JSON.stringify(filled)}`);
    }
    if (!expected && filled.length !== 0) {
      throw new Error(`${route.id}: Table route unexpectedly has another active fill ${JSON.stringify(filled)}`);
    }
  }

  await page.close();
  return { viewport, results, errors };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const output = [];
    for (const viewport of viewports) output.push(await runViewport(browser, viewport));
    const errors = output.flatMap((run) => run.errors);
    process.stdout.write(JSON.stringify({ baseUrl, viewports: output, errors }, null, 2));
    if (errors.length > 0) process.exitCode = 2;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 2;
});
