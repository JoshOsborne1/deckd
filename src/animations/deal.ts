import { DEAL_ENTRY_OFFSET_Y, DEAL_ENTRY_START_SCALE } from '@lib/motion';

/**
 * Worklet-safe animation helpers for card dealing, hand-fan layout,
 * and deal-entry motion. All functions are safe to call on the UI thread.
 */

/**
 * Returns the stagger delay (in ms) for a card at `index` within
 * a batch of `total` cards being dealt.
 */
export function dealStagger(index: number, total: number, baseDelay = 60): number {
  'worklet';
  if (total <= 1 || index <= 0) return 0;
  return index * Math.max(0, baseDelay);
}

export interface FanTransform {
  rotate: string;
  rotateDeg: number;
  translateX: number;
  translateY: number;
}

/**
 * Computes position for card `index` in a fan of `total` cards.
 *
 * `spread` is the total angular spread in degrees (e.g. 60 = cards from -30° to +30°).
 * Cards at edges sit lower (parabolic translateY) so the middle card is highest —
 * standard playing-card fan feel.
 */
export function handFanTransform(
  index: number,
  total: number,
  spread: number,
  cardWidth = 110,
): FanTransform {
  'worklet';
  if (total <= 1) {
    return { rotate: '0deg', rotateDeg: 0, translateX: 0, translateY: 0 };
  }

  const halfSpread = spread / 2;
  const t = index / (total - 1);
  const angle = -halfSpread + t * spread;

  const overlapFactor = 0.55;
  const totalWidth = cardWidth * (1 + (total - 1) * overlapFactor);
  const xStart = -totalWidth / 2 + cardWidth / 2;
  const translateX = xStart + index * cardWidth * overlapFactor;

  // Parabolic curve: 0 at center, positive at edges (cards drop down)
  const normalized = t * 2 - 1; // -1 to +1
  const translateY = normalized * normalized * 18;

  return {
    rotate: `${angle}deg`,
    rotateDeg: angle,
    translateX,
    translateY,
  };
}

export interface DealEntryValues {
  opacity: number;
  translateX: number;
  translateY: number;
  rotate: string;
  rotateDeg: number;
  scale: number;
}

/**
 * Interpolates a deal-entry transform from `progress` 0→1.
 *
 * At 0: card is invisible, offset from the deck position, slightly rotated,
 * and scaled down. `targetX` lets fan/stack cards travel from the shared deck
 * centre into their final slot instead of popping into their layout position.
 * At 1: card is in its final resting position.
 */
export function dealEntryTransform(
  progress: number,
  targetX = 0,
  fromY = DEAL_ENTRY_OFFSET_Y,
): DealEntryValues {
  'worklet';
  const p = progress < 0 ? 0 : progress > 1 ? 1 : progress;
  const angleDeg = (1 - p) * -8;
  return {
    opacity: p,
    translateX: targetX * p,
    translateY: (1 - p) * fromY,
    rotate: `${angleDeg}deg`,
    rotateDeg: angleDeg,
    scale: DEAL_ENTRY_START_SCALE + p * (1 - DEAL_ENTRY_START_SCALE),
  };
}
