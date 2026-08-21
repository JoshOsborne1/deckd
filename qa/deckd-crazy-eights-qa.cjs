const { chromium } = require('playwright');

const BASE_URL = process.env.DECKD_QA_URL ?? 'http://127.0.0.1:8096';
const VIEWPORTS = [
  { width: 375, height: 812, name: '375' },
  { width: 1440, height: 900, name: '1440' },
];

async function reset(page) {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'commit', timeout: 60000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'commit', timeout: 60000 });
  await page.getByRole('button', { name: 'Deal the deck', exact: true }).last().waitFor({ state: 'visible', timeout: 60000 });
}

async function startCrazyEights(page) {
  await page.getByRole('button', { name: 'Deal the deck', exact: true }).last().click();
  const preset = page.getByRole('button', { name: /^Crazy Eights\./ }).last();
  await preset.waitFor({ state: 'visible', timeout: 30000 });
  await preset.click();
  await page.getByRole('button', { name: 'Deal now', exact: true }).last().click();
  await page.waitForTimeout(1200);
}

async function visibleButtonLabels(page) {
  const buttons = page.locator('button');
  const labels = [];
  for (let i = 0; i < await buttons.count(); i += 1) {
    const button = buttons.nth(i);
    const box = await button.boundingBox().catch(() => null);
    if (!box || box.width <= 0 || box.height <= 0) continue;
    labels.push((await button.innerText().catch(() => '')) || (await button.getAttribute('aria-label')) || '');
  }
  return labels.map((label) => label.trim()).filter(Boolean);
}

async function readGeometry(page) {
  return page.evaluate(() => {
    const root = document.getElementById('root');
    return {
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      rootScrollWidth: root?.scrollWidth ?? 0,
      bodyScrollHeight: document.body.scrollHeight,
    };
  });
}

async function discardBox(page) {
  return page.evaluate(() => {
    const labelled = [...document.querySelectorAll('[aria-label*="Discard target"]')];
    const candidates = [];
    for (const element of labelled) {
      let node = element;
      for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
        const rect = node.getBoundingClientRect();
        if (rect.width >= 90 && rect.height >= 120) {
          candidates.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
        }
      }
    }
    return candidates.sort((a, b) => (a.width * a.height) - (b.width * b.height))[0] ?? null;
  });
}

async function dragPlayableCard(page) {
  const cards = page.locator('[data-testid^="card-drag-"]');
  const count = await cards.count();
  if (count === 0) return { attempted: false, reason: 'no-playable-card-drag-handle' };
  let cardBox = null;
  for (let i = count - 1; i >= 0; i -= 1) {
    const candidate = cards.nth(i);
    const candidateBox = await candidate.boundingBox().catch(() => null);
    if (candidateBox && candidateBox.width > 20 && candidateBox.height > 20) {
      cardBox = candidateBox;
      break;
    }
  }
  const targetBox = await discardBox(page);
  if (!cardBox || !targetBox) return { attempted: false, reason: 'missing-card-or-target-box', count, cardBox, targetBox };

  const before = await page.locator('body').innerText();
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(180);
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 });
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(900);
  const after = await page.locator('body').innerText();
  return {
    attempted: true,
    count,
    target: targetBox,
    card: cardBox,
    stateChanged: before !== after,
    afterHand: (after.match(/HAND\s+\d+/)?.[0] ?? null),
  };
}

async function visibleDragHandleCount(page) {
  const handles = page.locator('[data-testid^="card-drag-"]');
  let count = 0;
  for (let i = 0; i < await handles.count(); i += 1) {
    const handle = handles.nth(i);
    const box = await handle.boundingBox().catch(() => null);
    const opacity = await handle.evaluate((node) => Number.parseFloat(getComputedStyle(node).opacity || '1')).catch(() => 0);
    if (box && box.width > 20 && box.height > 20 && opacity > 0.05 && box.x < page.viewportSize().width && box.x + box.width > 0 && box.y < page.viewportSize().height && box.y + box.height > 0) count += 1;
  }
  return count;
}

async function drawFromPile(page) {
  const buttons = page.getByRole('button', { name: /^Draw pile,/ });
  for (let i = 0; i < await buttons.count(); i += 1) {
    const button = buttons.nth(i);
    const box = await button.boundingBox().catch(() => null);
    if (!box || box.width <= 0 || box.height <= 0) continue;
    const before = await page.locator('body').innerText();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(900);
    const after = await page.locator('body').innerText();
    return { attempted: true, card: box, stateChanged: before !== after };
  }
  return { attempted: false, reason: 'no-visible-draw-pile' };
}

async function readHandSlots(page) {
  const slots = page.locator('[data-testid^="crazy-eights-card-hand-slot-"]');
  const result = [];
  for (let i = 0; i < await slots.count(); i += 1) {
    const slot = slots.nth(i);
    result.push({ id: await slot.getAttribute('data-testid'), box: await slot.boundingBox(), text: await slot.innerText().catch(() => '') });
  }
  return result;
}

async function runViewport(browser, viewport) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  const result = { viewport: viewport.name, errors };
  try {
    await reset(page);
    await startCrazyEights(page);
    const labels = await visibleButtonLabels(page);
    const geometry = await readGeometry(page);
    const body = await page.locator('body').innerText();
    const dragHandles = await visibleDragHandleCount(page);
    const targetBox = await discardBox(page);
    const handSlots = await readHandSlots(page);
    await page.screenshot({ path: `.qa-crazy-eights-${viewport.name}-before.png`, fullPage: false });
    const drag = await dragPlayableCard(page);
    const draw = drag.attempted ? { attempted: false, reason: 'drag-tested' } : await drawFromPile(page);
    result.surface = {
      hasCrazyTitle: body.includes('CRAZY EIGHTS'),
      hasDragInstruction: body.includes('Hold · drag to discard') || body.includes('Tap the draw pile'),
      noVisiblePlayButtons: !labels.some((label) => /^PLAY\s/i.test(label)),
      dragHandles,
      targetVisible: Boolean(targetBox),
      targetBox,
      handSlots,
      geometry,
    };
    result.drag = drag;
    result.draw = draw;
  } catch (error) {
    result.error = error.message;
  } finally {
    await page.close();
  }
  return result;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const viewport of VIEWPORTS) results.push(await runViewport(browser, viewport));
  } finally {
    await browser.close();
  }
  const failed = results.some((result) => {
    const dragOrDrawPassed = result.drag?.attempted ? result.drag.stateChanged : result.draw?.attempted && result.draw.stateChanged;
    const hasPlayableInteraction = (result.surface?.dragHandles ?? 0) >= 1 || result.draw?.attempted;
    return result.error
      || result.errors.length > 0
      || !result.surface?.hasCrazyTitle
      || !result.surface?.hasDragInstruction
      || !result.surface?.noVisiblePlayButtons
      || !hasPlayableInteraction
      || (!result.surface?.targetVisible && !result.draw?.attempted)
      || result.surface.geometry.scrollWidth > result.surface.geometry.innerWidth + 1
      || !dragOrDrawPassed;
  });
  console.log(JSON.stringify({ results, failed }, null, 2));
  process.exitCode = failed ? 2 : 0;
})();
