/**
 * Worklet-safe layout for a stacked hand — overlapping cards with slight
 * vertical and horizontal offset (deck-in-hand feel, not a fanned arc).
 */

export interface StackTransform {
  rotate: string;
  rotateDeg: number;
  translateX: number;
  translateY: number;
}

/**
 * Cards stack bottom-up: index 0 is bottom, last index is top (highest z).
 * Visible "lip" per card ~10px; subtle fan rotation for depth.
 */
export function handStackTransform(
  index: number,
  total: number,
  cardWidth?: number,
): StackTransform {
  'worklet';
  if (total <= 1) {
    return { rotate: '0deg', rotateDeg: 0, translateX: 0, translateY: 0 };
  }

  const lip = cardWidth ? Math.round(cardWidth * 0.09) : 10;
  const maxRot = 4;
  const t = index / Math.max(1, total - 1);
  const rotateDeg = -maxRot + t * (maxRot * 2);
  const translateY = -index * lip;
  const translateX = (index - (total - 1) / 2) * 3;

  return {
    rotate: `${rotateDeg}deg`,
    rotateDeg,
    translateX,
    translateY,
  };
}
