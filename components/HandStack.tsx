import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
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
import { dealStagger, dealEntryTransform } from '../src/animations/deal';
import { handStackTransform } from '../src/animations/stack';
import { motion } from '@theme';
import type { CardFace, CardId, CardInstance } from '@engine/types';

export interface HandStackProps {
  cards: CardInstance[];
  faceFor: (card: CardInstance) => CardFace;
  onCardPress?: (cardId: CardId) => void;
  onCardLongPress?: (cardId: CardId) => void;
  onReorder?: (order: CardId[]) => void;
  reorderEnabled?: boolean;
  size?: 'md' | 'lg';
  highlightCardIds?: Set<CardId>;
}

const SWIPE_UP_DISCARD = -56;
const REORDER_DX = 38;

function StackCard({
  card,
  index,
  total,
  face,
  size,
  highlighted,
  onPress,
  onSwipeDiscard,
  onReorderDx,
  reduceMotion,
  isNew,
}: {
  card: CardInstance;
  index: number;
  total: number;
  face: CardFace;
  size: 'md' | 'lg';
  highlighted: boolean;
  onPress: (() => void) | undefined;
  onSwipeDiscard: (() => void) | undefined;
  onReorderDx: ((dx: number) => void) | undefined;
  reduceMotion: boolean;
  isNew: boolean;
}) {
  const { haptic } = useMotion();
  const cardWidth = SIZE_MAP[size].width;
  const stack = handStackTransform(index, total, cardWidth);
  const entry = useSharedValue(reduceMotion || !isNew ? 1 : 0);

  useEffect(() => {
    if (isNew && !reduceMotion) {
      const delay = dealStagger(index, total);
      entry.value = withDelay(delay, withSpring(1, motion.spring.card));
    }
  }, [isNew, reduceMotion, index, total, entry]);

  const animStyle = useAnimatedStyle(() => {
    'worklet';
    const e = dealEntryTransform(entry.value);
    return {
      opacity: e.opacity,
      transform: [
        { translateX: stack.translateX },
        { translateY: stack.translateY + e.translateY },
        { rotate: `${stack.rotateDeg + e.rotateDeg}deg` },
        { scale: e.scale },
      ],
      zIndex: index + 1,
    };
  });

  const parsed = parseCardId(card.id);
  const jokerColor = parseJokerId(card.id);

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

  const fireTap = useCallback(() => {
    haptic('light');
    onPress?.();
  }, [haptic, onPress]);

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
      size={size}
      elevated={highlighted}
      highlighted={highlighted}
    />
  );

  return (
    <Animated.View style={[styles.cardSlot, animStyle]}>
      <GestureDetector gesture={composed}>
        <View collapsable={false}>{inner}</View>
      </GestureDetector>
    </Animated.View>
  );
}

export function HandStack({
  cards,
  faceFor,
  onCardPress,
  onCardLongPress,
  onReorder,
  reorderEnabled = true,
  size = 'lg',
  highlightCardIds,
}: HandStackProps) {
  const { reduceMotion } = useMotion();
  const prevCountRef = useRef(cards.length);

  const newCardStartIndex = prevCountRef.current;
  useEffect(() => {
    prevCountRef.current = cards.length;
  }, [cards.length]);

  const cardWidth = SIZE_MAP[size].width;

  const handleReorderDx = useCallback(
    (cardId: CardId, dx: number) => {
      if (!onReorder || !reorderEnabled) return;
      const ids = cards.map((c) => c.id);
      const index = ids.indexOf(cardId);
      if (index < 0) return;
      const slots = Math.round(dx / (cardWidth * 0.55));
      const newIndex = Math.max(0, Math.min(ids.length - 1, index + slots));
      if (newIndex !== index) {
        const next = [...ids];
        const [removed] = next.splice(index, 1);
        next.splice(newIndex, 0, removed!);
        onReorder(next);
      }
    },
    [onReorder, reorderEnabled, cards, cardWidth],
  );

  return (
    <View style={[styles.root, { height: size === 'md' ? 162 : 200 }]}>
      {cards.map((card, index) => (
        <StackCard
          key={card.id}
          card={card}
          index={index}
          total={cards.length}
          face={faceFor(card)}
          size={size}
          highlighted={highlightCardIds?.has(card.id) ?? false}
          onPress={onCardPress ? () => onCardPress(card.id) : undefined}
          onSwipeDiscard={onCardLongPress ? () => onCardLongPress(card.id) : undefined}
          onReorderDx={
            onReorder && reorderEnabled ? (dx) => handleReorderDx(card.id, dx) : undefined
          }
          reduceMotion={reduceMotion}
          isNew={index >= newCardStartIndex}
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
  },
  cardSlot: {
    position: 'absolute',
  },
});

export default HandStack;
