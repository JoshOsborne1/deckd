/**
 * ZoneRegistry — measured source/target geometry for the physical-card system.
 *
 * Every interactive surface (hand fan, deck pile, discard well, stack run,
 * opponent seat in the lab) registers its on-screen rect here on layout.
 * CardEntity hit-tests against these rects, and CardMotionOverlay reads them
 * to fly committed cards from zone to zone without guessing coordinates.
 *
 * Registration is idempotent per zone id; unmounting removes the entry.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import type { LayoutRectangle } from 'react-native';

export interface ZoneEntry extends LayoutRectangle {
  id: string;
}

export interface ZoneRegistryApi {
  /** Register or update a zone's measured rect. */
  registerZone: (id: string, rect: LayoutRectangle) => void;
  /** Remove a zone (on unmount). */
  unregisterZone: (id: string) => void;
  /** Snapshot the current rect for a zone, if mounted. */
  getZoneRect: (id: string) => LayoutRectangle | null;
  /** Snapshot every registered zone. Used by the motion overlay. */
  getAllZones: () => readonly ZoneEntry[];
  /** Subscribe to zone changes. Returns an unsubscribe. */
  subscribe: (listener: () => void) => () => void;
}

const ZoneRegistryContext = createContext<ZoneRegistryApi | null>(null);

export function ZoneRegistryProvider({ children }: { children: ReactNode }) {
  const zonesRef = useRef(new Map<string, LayoutRectangle>());
  const listenersRef = useRef(new Set<() => void>());

  const notify = useCallback(() => {
    listenersRef.current.forEach((listener) => listener());
  }, []);

  const registerZone = useCallback(
    (id: string, rect: LayoutRectangle) => {
      const existing = zonesRef.current.get(id);
      if (
        existing &&
        existing.x === rect.x &&
        existing.y === rect.y &&
        existing.width === rect.width &&
        existing.height === rect.height
      ) {
        return;
      }
      zonesRef.current.set(id, rect);
      notify();
    },
    [notify],
  );

  const unregisterZone = useCallback(
    (id: string) => {
      if (zonesRef.current.delete(id)) notify();
    },
    [notify],
  );

  const getZoneRect = useCallback((id: string) => zonesRef.current.get(id) ?? null, []);

  const getAllZones = useCallback(
    () =>
      Array.from(zonesRef.current.entries()).map(([id, rect]) => ({
        id,
        ...rect,
      })),
    [],
  );

  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const api = useMemo<ZoneRegistryApi>(
    () => ({ registerZone, unregisterZone, getZoneRect, getAllZones, subscribe }),
    [registerZone, unregisterZone, getZoneRect, getAllZones, subscribe],
  );

  return <ZoneRegistryContext.Provider value={api}>{children}</ZoneRegistryContext.Provider>;
}

export function useZoneRegistry(): ZoneRegistryApi {
  const ctx = useContext(ZoneRegistryContext);
  if (!ctx) {
    throw new Error('useZoneRegistry must be used inside <ZoneRegistryProvider>');
  }
  return ctx;
}
