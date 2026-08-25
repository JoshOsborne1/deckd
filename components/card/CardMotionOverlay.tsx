/**
 * CardMotionCoordinator + CardMotionOverlay — event-owned landing journeys.
 *
 * Blueprint §7.4: the engine commits an event; the coordinator turns that
 * committed event into ONE continuous physical flight from measured source
 * geometry to measured destination geometry. When geometry is missing, the
 * overlay uses a short opacity handoff instead of guessing coordinates.
 *
 * State applies immediately. The overlay temporarily owns the moving card's
 * presentation until landing, so there is never a duplicate or a teleport.
 * Snapshot hydration passes no events, so stale choreography never replays.
 *
 * Phase 1 scope: the lab dispatches typed intents that immediately produce
 * committed move "events" fed to this coordinator. Phase 2 replaces the lab's
 * dispatch with the real engine event log — the coordinator API stays put.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useZoneRegistry, type ZoneRegistryApi } from '@components/table/ZoneRegistry';
import { useMotion } from '@hooks/useMotion';
import { motion } from '@theme';
import { getCardFlightStyle, type CardFlightPoint } from '@lib/cardFlight';

/** A committed physical movement the overlay owns until it lands. */
export interface CommittedMove {
  /** Engine/grouping id. Used to dedupe and to avoid replaying stale work. */
  transactionId: string;
  /** Canonical event id; multiple movements may share one transaction. */
  eventId?: string;
  cardId: string;
  fromZoneId: string;
  toZoneId: string;
  /** Optional presentation cue (deal, draw, discard, collect, reveal, muck). */
  cue?: 'deal' | 'draw' | 'discard' | 'collect' | 'reveal' | 'muck' | 'move';
  /** When true the card art stays face-down through the flight. */
  concealed?: boolean;
}

export interface CardMotionCoordinatorApi {
  /** Consume a committed move. Returns true if a flight was scheduled. */
  commitMove: (move: CommittedMove) => boolean;
  /** Flush all in-flight choreography (snapshot hydration path). */
  flush: () => void;
}

interface Flight extends CommittedMove {
  id: string;
  from: CardFlightPoint;
  to: CardFlightPoint;
}

const CoordinatorContext = createContext<CardMotionCoordinatorApi | null>(null);

function FlightView({
  flight,
  reduceMotion,
  renderCardFace,
  onDone,
}: {
  flight: Flight;
  reduceMotion: boolean;
  renderCardFace: (cardId: string, concealed: boolean) => ReactNode;
  onDone: (id: string) => void;
}) {
  const progress = useSharedValue(0);
  const opacity = useSharedValue(1);

  React.useEffect(() => {
    if (reduceMotion) {
      // Reduced motion: keep the state change and a short fade, drop travel.
      opacity.value = withTiming(0, { duration: motion.duration.fast }, (finished) => {
        'worklet';
        if (finished) runOnJS(onDone)(flight.id);
      });
      return () => {
        cancelAnimation(opacity);
      };
    }
    progress.value = withTiming(1, { duration: motion.duration.slow }, (finished) => {
      'worklet';
      if (finished) runOnJS(onDone)(flight.id);
    });
    return () => {
      cancelAnimation(progress);
    };
  }, [flight.id, onDone, opacity, progress, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    if (reduceMotion) {
      // Cross-fade handoff: pin the card at its destination while fading out,
      // satisfying "state applies immediately, no travel" under reduced motion.
      return {
        left: flight.to.x,
        top: flight.to.y,
        opacity: opacity.value,
      };
    }
    const pose = getCardFlightStyle(flight.from, flight.to, progress.value, {
      arcHeight: flight.cue === 'draw' || flight.cue === 'deal' ? 26 : 12,
    });
    return {
      left: pose.x,
      top: pose.y,
      opacity: 1,
      transform: [{ rotate: `${pose.rotation}deg` }, { scale: pose.scale }],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.flight, animatedStyle]}>
      {renderCardFace(flight.cardId, Boolean(flight.concealed))}
    </Animated.View>
  );
}

export function CardMotionOverlay({
  children,
  renderCardFace,
}: {
  children: ReactNode;
  /** Renderer for a card face/back given only its id (opaque to caller state). */
  renderCardFace: (cardId: string, concealed: boolean) => ReactNode;
}) {
  const registry = useZoneRegistry();
  const { reduceMotion } = useMotion();
  const [flights, setFlights] = useState<readonly Flight[]>([]);
  const seenMovesRef = useRef(new Set<string>());
  const idRef = useRef(0);

  const finishFlight = useCallback((id: string) => {
    setFlights((current) => current.filter((flight) => flight.id !== id));
  }, []);

  const flush = useCallback(() => {
    setFlights([]);
  }, []);

  const commitMove = useCallback(
    (move: CommittedMove): boolean => {
      const dedupeKey = move.eventId ?? `${move.transactionId}:${move.cardId}:${move.toZoneId}`;
      if (seenMovesRef.current.has(dedupeKey)) {
        return false;
      }
      seenMovesRef.current.add(dedupeKey);
      if (seenMovesRef.current.size > 256) {
        // Bounded memory: drop the oldest half once we pass a session's worth.
        seenMovesRef.current = new Set(
          Array.from(seenMovesRef.current).slice(-128),
        );
      }

      const from = registry.getZoneRect(move.fromZoneId);
      const to = registry.getZoneRect(move.toZoneId);

      if (!from || !to) {
        // Geometry missing: opacity handoff. Nothing renders; the surfaces
        // crossfade through their own state change, so we just acknowledge.
        return false;
      }

      const flight: Flight = {
        ...move,
        id: `cm-${idRef.current++}`,
        from: { x: from.x + from.width / 2, y: from.y + from.height / 2 },
        to: { x: to.x + to.width / 2, y: to.y + to.height / 2 },
      };
      setFlights((current) => [...current, flight]);
      return true;
    },
    [registry],
  );

  const api = useMemo<CardMotionCoordinatorApi>(() => ({ commitMove, flush }), [commitMove, flush]);

  return (
    <CoordinatorContext.Provider value={api}>
      {children}
      <Animated.View pointerEvents="none" style={styles.overlay}>
        {flights.map((flight) => (
          <FlightView
            key={flight.id}
            flight={flight}
            reduceMotion={reduceMotion}
            renderCardFace={renderCardFace}
            onDone={finishFlight}
          />
        ))}
      </Animated.View>
    </CoordinatorContext.Provider>
  );
}

export function useCardMotionCoordinator(): CardMotionCoordinatorApi {
  const ctx = useContext(CoordinatorContext);
  if (!ctx) {
    throw new Error('useCardMotionCoordinator must be used inside <CardMotionOverlay>');
  }
  return ctx;
}

/** Convenience: expose registry alongside coordinator for lab surfaces. */
export function useCardMotionContext(): {
  coordinator: CardMotionCoordinatorApi;
  registry: ZoneRegistryApi;
} {
  const coordinator = useCardMotionCoordinator();
  const registry = useZoneRegistry();
  return { coordinator, registry };
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'visible',
    zIndex: 900,
  },
  flight: {
    position: 'absolute',
  },
});

export default CardMotionOverlay;
