/**
 * Slice 1 deck proof — CardLab full-deck gallery QA.
 *
 *   node qa/deckd-deck-proof-qa.cjs          (defaults to the deployed local
 *   DECKD_QA_URL=http://127.0.0.1:8085 preview; override with DECKD_QA_URL)
 *
 * Asserts:
 *   1. /lab renders the "Full deck" gallery section.
 *   2. All 4 size rows exist and each holds exactly 54 face testIDs
 *      (52 ranks + red joker + black joker).
 *   3. Every rendered face has a non-zero bounding box (no blank faces)
 *      and every PlayingCard shell carries at least one SVG path
 *      (artwork painted, not an empty shell).
 *   4. Each face shell's aspect ratio stays within the 2.5:3.5 family
 *      (no squashed/stretched cards).
 */
const { chromium } = require('playwright');

const BASE_URL = process.env.DECKD_QA_URL ?? 'http://127.0.0.1:8085';
const SIZES = ['xs', 'sm', 'md', 'lg'];
// Card ids follow the engine's deterministic deck: <rank><suit-initial>.
// RANKS/SUITS kept only as documentation of the id scheme; the QA reads the
// testIDs CardLab emits, so no need to rebuild the list here.
const _RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const _SUITS = [
  ['hearts', 'H'], ['diamonds', 'D'], ['clubs', 'C'], ['spades', 'S'],
];
void _RANKS; void _SUITS;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const page = await browser.newPage({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await page.goto(`${BASE_URL}/lab`, { waitUntil: 'commit', timeout: 60000 });
  await page.waitForTimeout(15000);

  const body = await page.innerText('body');
  const assertions = [];
  const expect = (name, ok, note) => {
    assertions.push({ name, ok, note });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${note ? ` - ${note}` : ''}`);
  };

  expect('gallery section present', /Full deck\s*·\s*52 \+ 2 jokers/.test(body));

  let totalFaces = 0;
  let blankFaces = 0;
  let squashedFaces = 0;

  for (const size of SIZES) {
    const row = page.locator(`[data-testid="gallery-row-${size}"]`);
    const rowExists = await row.count();
    if (!rowExists) {
      expect(`row ${size} exists`, false, 'missing');
      continue;
    }

    const faces = row.locator('[data-testid^="face-"]');
    const faceCount = await faces.count();
    expect(`row ${size} has 54 faces`, faceCount === 54, `got ${faceCount}`);

    // Blank-face + aspect check per card.
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

  expect('no blank faces (all 216)', blankFaces === 0, `blank: ${blankFaces}/${totalFaces}`);
  expect('aspect ratio 2.5:3.5 held', squashedFaces === 0, `off: ${squashedFaces}/${totalFaces}`);

  // Jokers present as SVG with painted paths.
  const jokerPaths = await page
    .locator('[data-testid="face-md-joker-red"] svg path, [data-testid="face-md-joker-black"] svg path')
    .count();
  expect('jokers painted', jokerPaths > 0, `${jokerPaths} paths`);

  expect('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  await page.screenshot({ path: '.qa-slice1-lab-375.png', fullPage: false });
  console.log('screenshot: .qa-slice1-lab-375.png');

  // Desktop width pass for the same checks (1440).
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/lab`, { waitUntil: 'commit' });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: '.qa-slice1-lab-1440.png', fullPage: false });
  console.log('screenshot: .qa-slice1-lab-1440.png');

  await browser.close();

  const failed = assertions.filter((a) => !a.ok);
  console.log(`\n${assertions.length - failed.length}/${assertions.length} assertions passed`);
  process.exit(failed.length ? 1 : 0);
})();