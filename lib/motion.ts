import { Easing, Extrapolation, interpolate } from 'react-native-reanimated';
import { motion as themeMotion } from '@theme';

/** Material-style “emphasized” curve — use with `withTiming` for opacity (no overshoot). */
export const EASING_EMPHASIZED = Easing.bezier(0.4, 0, 0.2, 1);
/** Slightly snappier exit / secondary motion */
export const EASING_ACCELERATE = Easing.bezier(0.4, 0, 1, 1);

export const SPRING = themeMotion.spring;
export const DURATION = themeMotion.duration;
export const STAGGER = themeMotion.stagger;

/** Worklet-safe helper for producing a layered entry offset.
 *  Callers pass a 0..1 progress value; returns a y translation where
 *  layers slide up into place. */
export function entryTranslateY(progress: number, magnitude = 32): number {
  'worklet';
  return (1 - progress) * magnitude;
}

/** Inverse helper for exiting layers. */
export function exitTranslateY(progress: number, magnitude = 32): number {
  'worklet';
  return (1 - progress) * -magnitude;
}

/** Clamp a value between lo and hi (worklet-safe). */
export function clamp(v: number, lo: number, hi: number): number {
  'worklet';
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

/** Worklet-safe linear interpolation. */
export function lerp(t: number, from: number, to: number): number {
  'worklet';
  return from + (to - from) * t;
}

/**
 * Interpolate `progress` within a `[start, end]` window onto a `[from, to]`
 * output range, clamped at both ends. This is the workhorse used by the
 * home → hub morph: each element declares its own window against the single
 * `progress` shared value and is driven independently.
 */
export function interpolateWindow(
  progress: number,
  start: number,
  end: number,
  from: number,
  to: number,
): number {
  'worklet';
  return interpolate(progress, [start, end], [from, to], Extrapolation.CLAMP);
}
