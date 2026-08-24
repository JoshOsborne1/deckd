/**
 * Physical-card interaction math and shared constants.
 *
 * Every function here is pure and tagged 'worklet' where gesture-runtime
 * callable, mirroring lib/cardDrag.ts. Gesture callbacks read these on the UI
 * thread; jest covers them on node so the physics answers never drift between
 * lab and engines.
 */

import type { LayoutRectangle } from 'react-native';

/** Press-in feedback fires on the same frame, before any threshold. */
export const PHYS_PRESS_SCALE = 0.98;

/** Hold threshold before lift. Short enough to feel direct, long enough not to steal fan browsing. */
export const PHYS_LIFT_HOLD_MS = 160;

/** Movement required in addition to the hold before the card leaves the fan. */
export const PHYS_LIFT_MIN_DISTANCE = 8;

/** Lifted card scale. */
export const PHYS_LIFT_SCALE = 1.06;

/**
 * Vertical offset applied after lift so the card floats above the fingertip
 * and the rank/suit corner stays readable.
 */
export const PHYS_LIFT_OFFSET_Y = 56;

/** Magnetism: the effective drop region expands by this many pixels on every side. */
export const PHYS_MAGNETIC_EXPANSION = 28;

/** Bias (0..1) that velocity direction adds to hit testing when two zones overlap. */
export const PHYS_VELOCITY_BIAS = 12;

/** Spring-home budget for an invalid/cancelled drop. */
export const PHYS_CANCEL_DURATION_MS = 400;

/** Minimum exposed edge hit area for fan cards. */
export const PHYS_MIN_EDGE_HIT = 44;

export interface PhysPoint {
  x: number;
  y: number;
}

export interface PhysRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PhysVelocity {
  vx: number;
  vy: number;
}

export interface PhysDropZone extends PhysRect {
  id: string;
  /** Legal targets only: illegal zones are never returned by the hit test. */
  legal: boolean;
  label?: string;
}

/**
 * Card-centre point given a resting rect, current translation and lift
 * configuration. The lifted card visually offsets up, and its centre tracks
 * that same offset so hit-testing matches the on-screen card.
 */
export function physCardCenter(
  resting: Pick<PhysRect, 'x' | 'y' | 'width' | 'height'>,
  translationX: number,
  translationY: number,
  lifted: boolean,
): PhysPoint {
  'worklet';
  return {
    x: resting.x + resting.width / 2 + translationX,
    y: resting.y + resting.height / 2 + translationY - (lifted ? PHYS_LIFT_OFFSET_Y : 0),
  };
}

/**
 * Grab-point preservation: the translation that keeps the card's original
 * finger-contact point exactly under the finger. `fingerStart` is the touch
 * position at gesture start in the same coordinate space as `resting`.
 */
export function physGrabTranslation(
  resting: Pick<PhysRect, 'x' | 'y'>,
  fingerStart: PhysPoint,
  fingerNow: PhysPoint,
): PhysPoint {
  'worklet';
  return {
    x: fingerNow.x - fingerStart.x + (fingerStart.x - resting.x) - (fingerStart.x - resting.x),
    y: fingerNow.y - fingerStart.y,
  };
}

/**
 * Hit test with magnetism and velocity. Expands every legal zone's rect by
 * PHYS_MAGNETIC_EXPANSION, then breaks ties using the velocity direction: a
 * fast flick toward a zone slightly outside its rect still lands.
 */
export function physHitTest(
  center: PhysPoint,
  velocity: PhysVelocity,
  zones: readonly PhysDropZone[],
): PhysDropZone | null {
  'worklet';
  const biased: PhysPoint = {
    x: center.x + Math.max(-PHYS_VELOCITY_BIAS, Math.min(PHYS_VELOCITY_BIAS, velocity.vx * 0.06)),
    y: center.y + Math.max(-PHYS_VELOCITY_BIAS, Math.min(PHYS_VELOCITY_BIAS, velocity.vy * 0.06)),
  };
  for (const zone of zones) {
    if (!zone.legal) continue;
    const x = zone.x - PHYS_MAGNETIC_EXPANSION;
    const y = zone.y - PHYS_MAGNETIC_EXPANSION;
    const width = zone.width + PHYS_MAGNETIC_EXPANSION * 2;
    const height = zone.height + PHYS_MAGNETIC_EXPANSION * 2;
    if (biased.x >= x && biased.x <= x + width && biased.y >= y && biased.y <= y + height) {
      return zone;
    }
  }
  return null;
}

/**
 * Distance-based emphasis (0..1) for legal targets on approach. 1 when the
 * card centre is inside the magnetic region, decaying to 0 at maxDistance.
 */
export function physTargetEmphasis(
  center: PhysPoint,
  zone: PhysRect,
  maxDistance: number,
): number {
  'worklet';
  const cx = zone.x + zone.width / 2;
  const cy = zone.y + zone.height / 2;
  const dx = center.x - cx;
  const dy = center.y - cy;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const inner = Math.max(zone.width, zone.height) / 2 + PHYS_MAGNETIC_EXPANSION;
  if (distance <= inner) return 1;
  if (distance >= maxDistance) return 0;
  return 1 - (distance - inner) / (maxDistance - inner);
}

/**
 * Live insertion gap for in-hand reorder. Given evenly spaced slots of width
 * `slotStep`, returns the insertion index for the lifted card's centre.
 */
export function physInsertionIndex(
  centerX: number,
  fanLeftX: number,
  slotStep: number,
  cardCount: number,
): number {
  'worklet';
  if (cardCount <= 0 || slotStep <= 0) return 0;
  const index = Math.round((centerX - fanLeftX) / slotStep);
  return Math.max(0, Math.min(cardCount, index));
}

/** Translation for the centre-snap landing into a target rect. */
export function physLandingTranslation(
  resting: Pick<PhysRect, 'x' | 'y' | 'width' | 'height'>,
  target: PhysRect,
  lifted: boolean,
): PhysPoint {
  'worklet';
  const cardCenter = physCardCenter(resting, 0, 0, lifted);
  return {
    x: target.x + target.width / 2 - cardCenter.x,
    y: target.y + target.height / 2 - cardCenter.y,
  };
}
