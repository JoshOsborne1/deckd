import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
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
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  CARD_FLIGHT_DEAL_STAGGER_MS,
  CARD_FLIGHT_SETTLE_PX,
  getDiscardArcRotation,
  type CardFlightPoint,
} from '@lib/cardFlight';
import { useMotion } from '@hooks/useMotion';
import { motion } from '@theme';

export type CardFlightKind = 'deal' | 'discard' | 'move';

export interface CardFlightOptions {
  kind?: CardFlightKind;
  delay?: number;
  duration?: number;
  arcHeight?: number;
  rotation?: number;
  discardDirection?: 'left' | 'right';
  startScale?: number;
  settlePx?: number;
  zIndex?: number;
}

export interface CardFlightHandle<TCard = ReactNode> {
  /** Fly one card from an absolute overlay point to another. */
  fly: (
    card: TCard,
    fromXY: CardFlightPoint,
    toXY: CardFlightPoint,
    opts?: CardFlightOptions,
  ) => string;
  /** Deal cards from one deck point to the matching hand slots. */
  deal: (
    cards: readonly TCard[],
    fromXY: CardFlightPoint,
    toXY: readonly CardFlightPoint[],
    opts?: Omit<CardFlightOptions, 'delay'>,
  ) => string[];
  clear: () => void;
}

export interface CardFlightProps<TCard = ReactNode> {
  renderCard?: (card: TCard) => ReactNode;
  zIndex?: number;
}

interface FlightRecord<TCard> {
  id: string;
  card: TCard;
  from: CardFlightPoint;
  to: CardFlightPoint;
  options: Required<Pick<CardFlightOptions, 'delay' | 'duration' | 'arcHeight' | 'rotation' | 'startScale' | 'settlePx' | 'zIndex'>>;
}

interface FlightCardProps<TCard> {
  flight: FlightRecord<TCard>;
  reduceMotion: boolean;
  renderCard: (card: TCard) => ReactNode;
  onComplete: (id: string) => void;
}

function resolveFlightOptions(
  options: CardFlightOptions | undefined,
  reduceMotion: boolean,
  zIndex: number,
): FlightRecord<unknown>['options'] {
  const kind = options?.kind ?? 'move';
  const defaultArc = kind === 'discard' ? 22 : 0;
  const defaultRotation =
    kind === 'discard'
      ? getDiscardArcRotation(options?.discardDirection ?? 'right')
      : 0;

  return {
    delay: options?.delay ?? 0,
    duration: reduceMotion ? motion.duration.fast : options?.duration ?? motion.duration.reveal,
    arcHeight: reduceMotion ? 0 : options?.arcHeight ?? defaultArc,
    rotation: reduceMotion ? 0 : options?.rotation ?? defaultRotation,
    startScale: reduceMotion ? 1 : options?.startScale ?? 0.94,
    settlePx: reduceMotion ? 0 : options?.settlePx ?? CARD_FLIGHT_SETTLE_PX,
    zIndex: options?.zIndex ?? zIndex,
  };
}

function FlightCard<TCard>({
  flight,
  reduceMotion,
  renderCard,
  onComplete,
}: FlightCardProps<TCard>) {
  const translateX = useSharedValue(flight.from.x);
  const translateY = useSharedValue(flight.from.y);
  const scale = useSharedValue(flight.options.startScale);
  const rotation = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const { to, options } = flight;
    const settle = options.settlePx;
    const spring = {
      ...motion.spring.card,
      overshootClamping: true,
    };

    if (reduceMotion) {
      opacity.value = withDelay(options.delay, withTiming(1, { duration: motion.duration.fast }));
      translateX.value = withDelay(options.delay, withTiming(to.x, { duration: options.duration }, (finished) => {
        'worklet';
        if (finished) runOnJS(onComplete)(flight.id);
      }));
      translateY.value = withDelay(options.delay, withTiming(to.y, { duration: options.duration }));
      scale.value = withDelay(options.delay, withTiming(1, { duration: options.duration }));
      rotation.value = withDelay(options.delay, withTiming(0, { duration: options.duration }));
      return () => {
        cancelAnimation(translateX);
        cancelAnimation(translateY);
        cancelAnimation(scale);
        cancelAnimation(rotation);
        cancelAnimation(opacity);
      };
    }

    opacity.value = withDelay(options.delay, withTiming(1, { duration: motion.duration.fast }));
    translateX.value = withDelay(
      options.delay,
      withSequence(
        withTiming(to.x, { duration: options.duration }),
        withSpring(to.x + settle, spring),
        withSpring(to.x, spring, (finished) => {
          'worklet';
          if (finished) runOnJS(onComplete)(flight.id);
        }),
      ),
    );
    translateY.value = withDelay(
      options.delay,
      withSequence(
        withTiming(to.y - options.arcHeight, { duration: Math.max(1, options.duration * 0.55) }),
        withTiming(to.y + settle, { duration: Math.max(1, options.duration * 0.45) }),
        withSpring(to.y, spring),
      ),
    );
    scale.value = withDelay(
      options.delay,
      withSequence(
        withTiming(1.04, { duration: options.duration }),
        withSpring(1, spring),
      ),
    );
    rotation.value = withDelay(
      options.delay,
      withTiming(options.rotation, { duration: options.duration }),
    );

    return () => {
      cancelAnimation(translateX);
      cancelAnimation(translateY);
      cancelAnimation(scale);
      cancelAnimation(rotation);
      cancelAnimation(opacity);
    };
  }, [flight, onComplete, opacity, reduceMotion, rotation, scale, translateX, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    zIndex: flight.options.zIndex,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotation.value}deg` },
      { scale: scale.value },
    ],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.flight, animatedStyle]}>
      {renderCard(flight.card)}
    </Animated.View>
  );
}

function CardFlightInner<TCard = ReactNode>(
  { renderCard, zIndex = 80 }: CardFlightProps<TCard>,
  ref: React.ForwardedRef<CardFlightHandle<TCard>>,
) {
  const { haptic, reduceMotion } = useMotion();
  const [flights, setFlights] = useState<readonly FlightRecord<TCard>[]>([]);
  const idRef = useRef(0);

  const finishFlight = useCallback((id: string) => {
    setFlights((current) => current.filter((flight) => flight.id !== id));
  }, []);

  const fly = useCallback(
    (
      card: TCard,
      fromXY: CardFlightPoint,
      toXY: CardFlightPoint,
      options?: CardFlightOptions,
    ) => {
      const id = `card-flight-${idRef.current++}`;
      const resolved = resolveFlightOptions(options, reduceMotion, zIndex);
      setFlights((current) => [
        ...current,
        { id, card, from: fromXY, to: toXY, options: resolved },
      ]);
      return id;
    },
    [reduceMotion, zIndex],
  );

  const deal = useCallback(
    (
      cards: readonly TCard[],
      fromXY: CardFlightPoint,
      toXY: readonly CardFlightPoint[],
      options?: Omit<CardFlightOptions, 'delay'>,
    ) => {
      const ids = cards.map((card, index) => {
        if (index % 3 === 2) haptic('light');
        return fly(card, fromXY, toXY[index] ?? toXY[toXY.length - 1] ?? fromXY, {
          ...options,
          kind: options?.kind ?? 'deal',
          delay: index * CARD_FLIGHT_DEAL_STAGGER_MS,
        });
      });
      return ids;
    },
    [fly, haptic],
  );

  const clear = useCallback(() => setFlights([]), []);

  useImperativeHandle(ref, () => ({ fly, deal, clear }), [clear, deal, fly]);

  const cardRenderer = useCallback(
    (card: TCard): ReactNode => renderCard?.(card) ?? (card as ReactNode),
    [renderCard],
  );

  return (
    <Animated.View pointerEvents="none" style={styles.overlay}>
      {flights.map((flight) => (
        <FlightCard
          key={flight.id}
          flight={flight}
          reduceMotion={reduceMotion}
          renderCard={cardRenderer}
          onComplete={finishFlight}
        />
      ))}
    </Animated.View>
  );
}

export const CardFlight = forwardRef(CardFlightInner) as <TCard = ReactNode>(
  props: CardFlightProps<TCard> & React.RefAttributes<CardFlightHandle<TCard>>,
) => React.ReactElement;

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    overflow: 'visible',
  },
  flight: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});

export default CardFlight;
