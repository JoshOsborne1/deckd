import type { LayoutRectangle } from 'react-native';

export interface CardPoint {
  x: number;
  y: number;
}

/** Card drag begins only after a deliberate hold and a small movement. */
export const CARD_DRAG_HOLD_MS = 120;
export const CARD_DRAG_MIN_DISTANCE = 6;
export const CARD_DRAG_LIFT_SCALE = 1.08;
export const CARD_DRAG_SETTLE_PX = 2;

export interface CardDropTarget extends LayoutRectangle {
  id: string;
  label?: string;
  disabled?: boolean;
}

export type CardSlot = Pick<LayoutRectangle, 'x' | 'y' | 'width' | 'height'>;

/**
 * Return the first enabled target containing the dragged card's centre point.
 * The shared helper is intentionally pure so hit testing stays deterministic
 * on web and native gesture runtimes.
 */
export function getDropTargetAtPoint(
  point: CardPoint,
  targets: readonly CardDropTarget[],
): CardDropTarget | null {
  'worklet';
  return (
    targets.find(
      (target) =>
        !target.disabled &&
        point.x >= target.x &&
        point.x <= target.x + target.width &&
        point.y >= target.y &&
        point.y <= target.y + target.height,
    ) ?? null
  );
}

/**
 * Translation needed to align the dragged card's centre with a target centre.
 * The card is positioned at its original slot before this translation applies.
 */
export function getLandingTranslation(
  slot: Pick<CardSlot, 'x' | 'y'>,
  cardSize: Pick<CardSlot, 'width' | 'height'>,
  target: Pick<CardDropTarget, 'x' | 'y' | 'width' | 'height'>,
): CardPoint {
  'worklet';
  const cardCenter = {
    x: slot.x + cardSize.width / 2,
    y: slot.y + cardSize.height / 2,
  };
  const targetCenter = {
    x: target.x + target.width / 2,
    y: target.y + target.height / 2,
  };

  return {
    x: targetCenter.x - cardCenter.x,
    y: targetCenter.y - cardCenter.y,
  };
}
