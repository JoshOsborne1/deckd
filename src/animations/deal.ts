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
  void total;
  return index * baseDelay;
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
  overlapFactor = 0.55,
): FanTransform {
  'worklet';
  if (total <= 1) {
    return { rotate: '0deg', rotateDeg: 0, translateX: 0, translateY: 0 };
  }

  const halfSpread = spread / 2;
  const t = index / (total - 1);
  const angle = -halfSpread + t * spread;

  const safeOverlap = overlapFactor < 0.16 ? 0.16 : overlapFactor > 0.55 ? 0.55 : overlapFactor;
  const totalWidth = cardWidth * (1 + (total - 1) * safeOverlap);
  const xStart = -totalWidth / 2 + cardWidth / 2;
  const translateX = xStart + index * cardWidth * safeOverlap;

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
  translateY: number;
  rotate: string;
  rotateDeg: number;
  scale: number;
}

/**
 * Interpolates a deal-entry transform from `progress` 0→1.
 *
 * At 0: card is invisible, offset downward, slightly rotated and scaled down.
 * At 1: card is in its final resting position.
 */
export function dealEntryTransform(progress: number): DealEntryValues {
  'worklet';
  const p = progress < 0 ? 0 : progress > 1 ? 1 : progress;
  const angleDeg = (1 - p) * -12;
  return {
    opacity: p,
    translateY: (1 - p) * 80,
    rotate: `${angleDeg}deg`,
    rotateDeg: angleDeg,
    scale: 0.85 + p * 0.15,
  };
}
