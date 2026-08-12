import {
  CARD_DRAG_HOLD_MS,
  CARD_DRAG_MIN_DISTANCE,
  getDropTargetAtPoint,
  getLandingTranslation,
} from './cardDrag';

describe('card drag foundation', () => {
  it('keeps the hold and movement thresholds in the shared motion contract', () => {
    expect(CARD_DRAG_HOLD_MS).toBe(120);
    expect(CARD_DRAG_MIN_DISTANCE).toBe(6);
  });

  it('hits the first drop target containing the dragged card point', () => {
    const target = getDropTargetAtPoint(
      { x: 150, y: 220 },
      [
        { id: 'discard', x: 40, y: 40, width: 80, height: 120 },
        { id: 'foundation', x: 120, y: 160, width: 80, height: 120 },
      ],
    );

    expect(target?.id).toBe('foundation');
  });

  it('returns no target outside every drop zone', () => {
    expect(
      getDropTargetAtPoint(
        { x: 12, y: 12 },
        [{ id: 'discard', x: 40, y: 40, width: 80, height: 120 }],
      ),
    ).toBeNull();
  });

  it('lands the card center on the target center', () => {
    expect(
      getLandingTranslation(
        { x: 100, y: 200 },
        { width: 60, height: 84 },
        { x: 220, y: 320, width: 90, height: 126 },
      ),
    ).toEqual({ x: 135, y: 141 });
  });
});
