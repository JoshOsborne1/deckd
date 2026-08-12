export const CARD_FLIGHT_DEAL_STAGGER_MS = 40;
export const CARD_FLIGHT_SETTLE_PX = 2;

export interface CardFlightPoint {
  x: number;
  y: number;
}

export interface CardFlightStyle {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface CardFlightStyleOptions {
  arcHeight?: number;
  rotation?: number;
  scale?: number;
}

/** Pure midpoint math shared by native and web renderers. */
export function getCardFlightStyle(
  from: CardFlightPoint,
  to: CardFlightPoint,
  progress: number,
  options: CardFlightStyleOptions = {},
): CardFlightStyle {
  const t = Math.max(0, Math.min(1, progress));
  const arcHeight = options.arcHeight ?? 0;
  const rotation = options.rotation ?? 0;
  const scale = options.scale ?? 1;

  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t - Math.sin(Math.PI * t) * arcHeight,
    scale,
    rotation,
  };
}

export function getDiscardArcRotation(direction: 'left' | 'right'): number {
  return direction === 'left' ? -10 : 10;
}
