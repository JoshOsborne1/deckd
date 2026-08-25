import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { FlipCard } from '@components/FlipCard';
import { SIZE_MAP } from '@components/PlayingCard';
import { useMotion } from '@hooks/useMotion';
import { parseCardId, parseJokerId } from '@engine/selectors';
import { dealStagger, handFanTransform, dealEntryTransform } from '../src/animations/deal';
import { motion, space } from '@theme';
import type { CardFace, CardId, CardInstance, PlayerId } from '@engine/types';

export interface HandFanProps {
  cards: CardInstance[];
  viewerId: PlayerId | null;
  faceFor: (card: CardInstance) => CardFace;
  spread?: number;
  onCardPress?: (cardId: CardId) => void;
  /** Swipe up on a card to discard (replaces long-press discard). */
  onCardLongPress?: (cardId: CardId) => void;
  /** New hand order after a horizontal drag swap. */
  onReorder?: (order: CardId[]) => void;
  reorderEnabled?: boolean;
  size?: 'md' | 'lg';
  highlightCardIds?: Set<CardId>;
  fanStyle?: 'wide' | 'tight';
  /** Stable session-start key. Changing it replays the opening deal. */
  dealTrigger?: string | null;
}

const SWIPE_UP_DISCARD = -56;
const REORDER_DX = 38;

function resolveSpread(
  explicit: number | undefined,
  fanStyle: 'tight' | 'wide' | undefined,
): number {
  if (explicit !== undefined) return explicit;
  if (fanStyle === 'tight') return 10;
  if (fanStyle === 'wide') return 28;
  return 18;
}

function FanCard({
  card,
  index,
  total,
  spread,
  slotStep,
  face,
  size,
  highlighted,
  onPress,
  onSwipeDiscard,
  onReorderDx,
  reduceMotion,
  dealTrigger,
  animateEntry,
  dealDelay,
}: {
  card: CardInstance;
  index: number;
  total: number;
  spread: number;
  slotStep: number;
  face: CardFace;
  size: 'md' | 'lg';
  highlighted: boolean;
  onPress: (() => void) | undefined;
  onSwipeDiscard: (() => void) | undefined;
  onReorderDx: ((dx: number) => void) | undefined;
  reduceMotion: boolean;
  dealTrigger: string | null | undefined;
  /** Cards entering the hand travel from the shared deck line before settling. */
  animateEntry: boolean;
  /** Opening cards stagger; later cards enter immediately with a zero delay. */
  dealDelay: number;
}) {
  const { haptic } = useMotion();
  const cardWidth = SIZE_MAP[size].width;
  const fan = handFanTransform(index, total, spread, cardWidth, slotStep);
  const entry = useSharedValue(reduceMotion || !animateEntry ? 1 : 0);
  const animatedDealTrigger = useRef<string | null>(null);

  useEffect(() => {
    // `dealTrigger` identifies the session, not every card insertion. A card
    // drawn after the opening hand gets one short flight from the shared deck
    // line, while existing cards never replay their opening motion on redraw.
    if (!dealTrigger) {
      cancelAnimation(entry);
      entry.value = 1;
      return;
    }
    if (animatedDealTrigger.current === dealTrigger) return;

    animatedDealTrigger.current = dealTrigger;
    cancelAnimation(entry);
    if (!animateEntry) {
      entry.value = 1;
      return;
    }
    if (reduceMotion) {
      entry.value = 1;
      return;
    }

    entry.value = 0;
    entry.value = withDelay(dealDelay, withSpring(1, motion.spring.card));
    return () => cancelAnimation(entry);
  }, [animateEntry, dealDelay, dealTrigger, entry, reduceMotion]);

  const animStyle = useAnimatedStyle(() => {
    'worklet';
    const e = dealEntryTransform(entry.value, fan.translateX);
    return {
      opacity: e.opacity,
      transform: [
        { translateX: e.translateX },
        { translateY: fan.translateY + e.translateY },
        { rotate: `${fan.rotateDeg + e.rotateDeg}deg` },
        { scale: e.scale },
      ],
      zIndex: index + 1,
    };
  });

  const parsed = parseCardId(card.id);
  const jokerColor = parseJokerId(card.id);
  const cardLabel = parsed
    ? `${parsed.rank} of ${parsed.suit}`
    : jokerColor
      ? `${jokerColor} joker`
      : 'Face-down card';

  const fireTap = useCallback(() => {
    haptic('light');
    onPress?.();
  }, [haptic, onPress]);

  const fireDiscard = useCallback(() => {
    haptic('medium');
    onSwipeDiscard?.();
  }, [haptic, onSwipeDiscard]);

  const fireReorder = useCallback(
    (dx: number) => {
      haptic('light');
      onReorderDx?.(dx);
    },
    [haptic, onReorderDx],
  );

  const tap = Gesture.Tap().onEnd(() => {
    if (onPress) {
      runOnJS(fireTap)();
    }
  });

  const pan = Gesture.Pan()
    .minDistance(12)
    .onEnd((e) => {
      'worklet';
      const { translationX, translationY } = e;
      if (
        onSwipeDiscard &&
        translationY < SWIPE_UP_DISCARD &&
        Math.abs(translationY) > Math.abs(translationX)
      ) {
        runOnJS(fireDiscard)();
        return;
      }
      if (onReorderDx && Math.abs(translationX) > REORDER_DX) {
        runOnJS(fireReorder)(translationX);
      }
    });

  const composed = Gesture.Race(tap, pan);

  const inner = (
    <FlipCard
      face={face}
      rank={parsed?.rank}
      suit={parsed?.suit}
      jokerColor={jokerColor ?? undefined}
      overlapped={total > 2}
      size={size}
      elevated={highlighted}
      highlighted={highlighted}
    />
  );

  return (
    <Animated.View
      style={[
        styles.cardSlot,
        {
          width: cardWidth,
          height: SIZE_MAP[size].height,
          marginLeft: -cardWidth / 2,
        },
        animStyle,
      ]}
    >
      <GestureDetector gesture={composed}>
        <View
          collapsable={false}
          accessible={Boolean(onPress)}
          accessibilityRole={onPress ? 'button' : undefined}
          accessibilityLabel={onPress ? cardLabel : undefined}
          aria-label={onPress ? cardLabel : undefined}
          accessibilityHint={onPress
            ? highlighted
              ? 'Available card action. Activate to play this card.'
              : 'Activate this card.'
            : undefined}
          onAccessibilityTap={onPress ? fireTap : undefined}
        >
          {inner}
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

export function HandFan(props: HandFanProps) {
  // A new session gets a fresh opening-hand snapshot. Drawn cards keep the
  // same child instance, so they cannot accidentally replay the opening deal.
  return <HandFanContent key={props.dealTrigger ?? 'no-session'} {...props} />;
}

function HandFanContent({
  cards,
  faceFor,
  spread: spreadProp,
  onCardPress,
  onCardLongPress,
  onReorder,
  reorderEnabled = true,
  size = 'lg',
  highlightCardIds,
  fanStyle,
  dealTrigger,
}: HandFanProps) {
  const { reduceMotion } = useMotion();
  const resolvedSpread = resolveSpread(spreadProp, fanStyle);
  const [containerWidth, setContainerWidth] = useState(0);
  const [openingDealIds] = useState<ReadonlySet<CardId>>(
    () => new Set(cards.map((card) => card.id)),
  );

  const total = cards.length;
  const cardWidth = SIZE_MAP[size].width;
  const cardHeight = SIZE_MAP[size].height;
  // Two cards are a hand, not a fan: keep them upright and give the pair a
  // real paper gap. Rotation and the parabolic drop only become useful once
  // there are enough cards for an actual arc.
  const cappedSpread = total <= 2
    ? 0
    : total <= 4
      ? Math.min(resolvedSpread, 24)
      : total <= 7
        ? Math.min(resolvedSpread, 32)
        : Math.min(resolvedSpread, 24);
  const maxAngle = (cappedSpread / 2) * (Math.PI / 180);
  const rotatedCardWidth =
    cardWidth * Math.cos(maxAngle) + cardHeight * Math.sin(maxAngle);
  const maxStep = containerWidth > 0 && total > 1
    ? Math.max(0, (containerWidth - space.xl * 2 - rotatedCardWidth) / (total - 1))
    : cardWidth * 0.55;
  // Small hands should read as separate cards, not as a rotated collision.
  // Once the real width cannot support that gap, controlled overlap is the
  // fallback for larger hands.
  const preferredStep = (total <= 2 ? cardWidth + space.md : rotatedCardWidth + space.sm);
  const slotStep = containerWidth > 0
    ? Math.min(preferredStep, maxStep)
    : cardWidth + (total <= 2 ? space.md : space.sm);

  const handleReorderDx = useCallback(
    (cardId: CardId, dx: number) => {
      if (!onReorder || !reorderEnabled) return;
      const ids = cards.map((c) => c.id);
      const index = ids.indexOf(cardId);
      if (index < 0) return;
      const slots = Math.round(dx / Math.max(1, slotStep));
      const newIndex = Math.max(0, Math.min(ids.length - 1, index + slots));
      if (newIndex !== index) {
        const next = [...ids];
        const [removed] = next.splice(index, 1);
        next.splice(newIndex, 0, removed!);
        onReorder(next);
      }
    },
    [onReorder, reorderEnabled, cards, slotStep],
  );

  return (
    <View
      style={styles.root}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      {cards.map((card, index) => (
        <FanCard
          key={card.id}
          card={card}
          index={index}
          total={total}
          spread={cappedSpread}
          slotStep={slotStep}
          face={faceFor(card)}
          size={size}
          highlighted={highlightCardIds?.has(card.id) ?? false}
          onPress={onCardPress ? () => onCardPress(card.id) : undefined}
          onSwipeDiscard={onCardLongPress ? () => onCardLongPress(card.id) : undefined}
          onReorderDx={
            onReorder && reorderEnabled ? (dx) => handleReorderDx(card.id, dx) : undefined
          }
          reduceMotion={reduceMotion}
          dealTrigger={dealTrigger}
          // Every mounted card gets one arrival. Opening cards stagger; a
          // later draw uses a zero delay and cannot replay the opening batch.
          animateEntry
          dealDelay={openingDealIds.has(card.id) ? dealStagger(index, total, motion.stagger.deal) : 0}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    width: '100%',
    height: 180,
  },
  cardSlot: {
    position: 'absolute',
    left: '50%',
    bottom: space.lg,
  },
});

export default HandFan;
