import {
  PHYS_MAGNETIC_EXPANSION,
  PHYS_VELOCITY_BIAS,
  physCardCenter,
  physHitTest,
  physInsertionIndex,
  physLandingTranslation,
  physTargetEmphasis,
  type PhysDropZone,
} from '@lib/physicalCards';

describe('physCardCenter', () => {
  it('tracks translation around the resting centre', () => {
    const rect = { x: 10, y: 20, width: 90, height: 126 };
    expect(physCardCenter(rect, 0, 0, false)).toEqual({ x: 55, y: 83 });
    expect(physCardCenter(rect, 8, -4, false)).toEqual({ x: 63, y: 79 });
  });

  it('applies the lift offset while lifted', () => {
    const rect = { x: 10, y: 20, width: 90, height: 126 };
    const lifted = physCardCenter(rect, 0, 0, true);
    expect(lifted.x).toBe(55);
    expect(lifted.y).toBeLessThan(83);
  });
});

describe('physHitTest', () => {
  const zones: PhysDropZone[] = [
    { id: 'illegal', x: 0, y: 0, width: 100, height: 100, legal: false },
    { id: 'legal', x: 200, y: 200, width: 100, height: 100, legal: true },
  ];

  it('ignores illegal zones even when the centre is inside', () => {
    expect(physHitTest({ x: 50, y: 50 }, { vx: 0, vy: 0 }, zones)).toBeNull();
  });

  it('hits a legal zone containing the centre', () => {
    expect(physHitTest({ x: 250, y: 250 }, { vx: 0, vy: 0 }, zones)?.id).toBe('legal');
  });

  it('expands the effective region by the magnetic expansion', () => {
    const justOutside = 200 - PHYS_MAGNETIC_EXPANSION + 4;
    expect(physHitTest({ x: justOutside, y: 250 }, { vx: 0, vy: 0 }, zones)?.id).toBe('legal');
    const tooFar = 200 - PHYS_MAGNETIC_EXPANSION - 8;
    expect(physHitTest({ x: tooFar, y: 250 }, { vx: 0, vy: 0 }, zones)).toBeNull();
  });

  it('biases toward velocity direction on a flick', () => {
    // Centre sits just beyond the magnetic region on the left, within one
    // clamped velocity-bias step of the expanded edge (edge = 200 − 28 = 172).
    const x = 200 - PHYS_MAGNETIC_EXPANSION - PHYS_VELOCITY_BIAS + 4;
    expect(physHitTest({ x, y: 250 }, { vx: 0, vy: 0 }, zones)).toBeNull();
    expect(physHitTest({ x, y: 250 }, { vx: 900, vy: 0 }, zones)?.id).toBe('legal');
  });
});

describe('physTargetEmphasis', () => {
  const zone = { x: 0, y: 0, width: 100, height: 100 };

  it('is 1 inside the inner region and 0 beyond maxDistance', () => {
    expect(physTargetEmphasis({ x: 50, y: 50 }, zone, 400)).toBe(1);
    expect(physTargetEmphasis({ x: 500, y: 500 }, zone, 400)).toBe(0);
  });

  it('decays monotonically between inner and maxDistance', () => {
    // inner = 50 + 28 = 78; maxDistance 400.
    const near = physTargetEmphasis({ x: 150, y: 50 }, zone, 400);
    const far = physTargetEmphasis({ x: 350, y: 50 }, zone, 400);
    expect(near).toBeGreaterThanOrEqual(far);
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThanOrEqual(0);
  });
});

describe('physInsertionIndex', () => {
  it('returns clamped indices across a fan', () => {
    expect(physInsertionIndex(-100, 0, 40, 5)).toBe(0);
    expect(physInsertionIndex(0, 0, 40, 5)).toBe(0);
    expect(physInsertionIndex(78, 0, 40, 5)).toBe(2);
    expect(physInsertionIndex(10000, 0, 40, 5)).toBe(5);
  });

  it('guards against empty fans and zero slot step', () => {
    expect(physInsertionIndex(50, 0, 40, 0)).toBe(0);
    expect(physInsertionIndex(50, 0, 0, 5)).toBe(0);
  });
});

describe('physLandingTranslation', () => {
  it('aligns the (lifted) card centre with the target centre', () => {
    const resting = { x: 0, y: 0, width: 90, height: 126 };
    const target = { x: 300, y: 100, width: 140, height: 140 };
    const landed = physLandingTranslation(resting, target, true);
    const after = physCardCenter(resting, landed.x, landed.y, true);
    expect(after.x).toBeCloseTo(370);
    expect(after.y).toBeCloseTo(170);
  });
});
