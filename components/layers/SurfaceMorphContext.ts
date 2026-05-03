import { createContext, useContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';

/**
 * Direction of the current home <-> hub morph. `0` means idle (no transition
 * in flight). Consumers may leave this unused — the ambient `progress` value
 * is enough to drive every element window. It exists so individual pieces can
 * dial in direction-aware polish later (e.g. counter-rotating a shadow).
 */
export type MorphDirection = -1 | 0 | 1;

/**
 * Shared values published by the top-level surface (`app/index.tsx`) and
 * consumed by `HomeLayer` / `HubLayer` to choreograph element-level exits and
 * entries against a single timeline.
 *
 *  - `progress` — 0 means fully home, 1 means fully hub. All element windows
 *    are expressed as `interpolate(progress, [start, end], ...)`.
 *  - `direction` — sign of the current motion (-1 / 0 / +1).
 *  - `reduceMotion` — mirror of the JS-side accessibility flag as 0 or 1 so
 *    worklets can short-circuit to a plain cross-fade without bouncing back
 *    to JS.
 */
export interface SurfaceMorph {
  progress: SharedValue<number>;
  direction: SharedValue<MorphDirection>;
  reduceMotion: SharedValue<number>;
}

export const SurfaceMorphContext = createContext<SurfaceMorph | null>(null);

/**
 * Hook wrapper. Throws if the consumer is mounted outside the provider so we
 * fail loudly rather than silently animating against a zero shared value.
 */
export function useSurfaceMorph(): SurfaceMorph {
  const ctx = useContext(SurfaceMorphContext);
  if (!ctx) {
    throw new Error(
      'useSurfaceMorph must be used inside <SurfaceMorphContext.Provider>',
    );
  }
  return ctx;
}
