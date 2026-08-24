/**
 * HandFanSurface — a physical hand of cards.
 *
 * Fan browsing at 2/5/10/20+ cards. Each card is a CardEntity; the lift
 * threshold is short enough to be direct, long enough that lateral browse
 * swipes don't pick the card up. While a card IS lifted and dragged sideways
 * inside the hand's horizontal span, the fan opens a LIVE insertion gap where
 * the card would land — no pixel-perfect drops between overlapped cards.
 *
 * Reorder dispatches the SAME `hand.reorder` typed intent as the accessible
 * "move left/right" actions. Exposed edges keep >=44pt hit targets.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { SIZE_MAP } from '@components/PlayingCard';
import { CardEntity } from '@components/card/CardEntity';
import { useMotion } from '@hooks/useMotion';
import { PHYS_MIN_EDGE_HIT, physInsertionIndex } from '@lib/physicalCards';
import {
  nextPhysicalIntentId,
  type LegalTargetsProvider,
  type PhysicalIntent,
} from '@lib/physicalIntents';
import { motion, space } from '@theme';

export interface HandFanCard {
  id: string;
  render: (concealed?: boolean) => ReactNode;
  accessibilityLabel?: string;
}

export interface HandFanSurfaceProps {
  zoneId: string;
  actorId: string;
  cards: readonly HandFanCard[];
  legalTargets: LegalTargetsProvider;
  dispatchIntent: (intent: PhysicalIntent) => void;
  /** Maximum visible width for the fan; cards squeeze to fit. */
  maxWidth?: number;
  /** Card size tier. */
  size?: 'sm' | 'md' | 'lg';
  /** Live-reorder enabled. */
  canReorder?: boolean;
  /** Conceal all faces (privacy veil, opponent hands on a shared surface). */
  concealed?: boolean;
  /** Announce labels (e.g. "Your hand") for accessibility. */
  label?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const CARD_OVERLAP_MIN = 12;

interface FanSlot {
  x: number;
  y: number;
  rotation: number;
}

function computeFanLayout(
  count: number,
  cardWidth: number,
  maxWidth: number,
): { slots: FanSlot[]; slotStep: number; fanWidth: number } {
  if (count === 0) return { slots: [], slotStep: cardWidth, fanWidth: 0 };
  if (count === 1) {
    return {
      slots: [{ x: 0, y: 0, rotation: 0 }],
      slotStep: cardWidth,
      fanWidth: cardWidth,
    };
  }
  const naturalWidth = cardWidth * count;
  const maxStep = Math.min(cardWidth * 0.55, cardWidth); // never more than 55% exposed
  let slotStep = maxStep;
  let fanWidth = cardWidth + (count - 1) * slotStep;

  if (fanWidth > maxWidth) {
    slotStep = Math.max(CARD_OVERLAP_MIN, (maxWidth - cardWidth) / (count - 1));
    fanWidth = cardWidth + (count - 1) * slotStep;
  } else if (naturalWidth <= maxWidth) {
    slotStep = cardWidth + space.xs;
    fanWidth = cardWidth + (count - 1) * slotStep;
  }

  const slots: FanSlot[] = [];
  const centre = (count - 1) / 2;
  for (let index = 0; index < count; index += 1) {
    const normalized = index - centre;
    const rotation = count <= 2 ? 0 : Math.max(-9, Math.min(9, normalized * 3.5));
    const rise = count <= 2 ? 0 : Math.abs(normalized) * 3;
    slots.push({ x: index * slotStep, y: rise, rotation });
  }
  return { slots, slotStep, fanWidth };
}

interface FanCardViewProps {
  card: HandFanCard;
  index: number;
  slot: FanSlot;
  slotStep: number;
  cardWidth: number;
  cardHeight: number;
  fanLeftX: number;
  concealed: boolean;
  draggedCardId: string | null;
  gapIndex: number | null;
  actorId: string;
  zoneId: string;
  legalTargets: LegalTargetsProvider;
  dispatchIntent: (intent: PhysicalIntent) => void;
  onDragStart: (cardId: string) => void;
  onDragCenterX: (cardId: string, centerX: number | null) => void;
  onReorderCommit: (cardId: string, toIndex: number) => void;
  size: 'sm' | 'md' | 'lg';
}

function FanCardView({
  card,
  index,
  slot,
  slotStep,
  cardWidth,
  cardHeight,
  fanLeftX,
  concealed,
  draggedCardId,
  gapIndex,
  actorId,
  zoneId,
  legalTargets,
  dispatchIntent,
  onDragStart,
  onDragCenterX,
  onReorderCommit,
  size,
}: FanCardViewProps) {
  const { haptic } = useMotion();
  // The resting rect this card reports to the entity. When a gap is open at
  // gapIndex < index, this card slides right by one slotStep to free the slot.
  const isDragged = draggedCardId === card.id;
  const baseX = slot.x;
  const gapOpen = gapIndex !== null && gapIndex >= 0 && !isDragged;
  const displaced = gapOpen && index >= gapIndex;
  const targetX = displaced ? baseX + slotStep : baseX;

  const xSv = useSharedValue(targetX);

  useEffect(() => {
    xSv.value = withSpring(targetX, motion.spring.card);
  }, [targetX, xSv]);

  const animStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [{ translateX: xSv.value - baseX }],
    };
  });

  const hitSlop = useMemo(
    () => ({
      left: Math.max(0, (PHYS_MIN_EDGE_HIT - Math.min(slotStep, cardWidth)) / 2),
      right: Math.max(0, (PHYS_MIN_EDGE_HIT - Math.min(slotStep, cardWidth)) / 2),
      top: 6,
      bottom: 6,
    }),
    [cardWidth, slotStep],
  );

  const handleDragCenterX = useCallback(
    (id: string, centerX: number | null) => {
      onDragCenterX(id, centerX);
      if (centerX === null) return;
    },
    [onDragCenterX],
  );

  const restingRect = useMemo(
    () => ({ x: fanLeftX + slot.x, y: slot.y, width: cardWidth, height: cardHeight }),
    [cardHeight, cardWidth, fanLeftX, slot.x, slot.y],
  );

  const cardLabel = card.accessibilityLabel ?? `Card ${index + 1}`;

  const moveLeft = useCallback(() => {
    if (index <= 0) return;
    haptic('select');
    dispatchIntent({
      id: nextPhysicalIntentId(),
      type: 'hand.reorder',
      actorId,
      cardId: card.id,
      toIndex: index - 1,
    });
  }, [actorId, card.id, dispatchIntent, haptic, index]);

  const moveRight = useCallback(() => {
    haptic('select');
    dispatchIntent({
      id: nextPhysicalIntentId(),
      type: 'hand.reorder',
      actorId,
      cardId: card.id,
      toIndex: index + 1,
    });
  }, [actorId, card.id, dispatchIntent, haptic, index]);

  return (
    <View
      style={[
        styles.fanCard,
        {
          width: cardWidth,
          height: cardHeight,
          // Rotation around the bottom centre keeps the fan arc feeling held.
          transform: [{ rotate: `${slot.rotation}deg` }],
        },
      ]}
      hitSlop={hitSlop}
      pointerEvents="box-none"
    >
      <Animated.View style={[StyleSheet.absoluteFill, animStyle]} pointerEvents="box-none">
        <CardEntity
          cardId={card.id}
          actorId={actorId}
          zoneId={zoneId}
          restingRect={restingRect}
          legalTargets={legalTargets}
          dispatchIntent={dispatchIntent}
          onDragCenterX={handleDragCenterX}
          accessibilityLabel={cardLabel}
          accessibilityHint="Hold and drag to reorder or move; long-press for the action menu."
          extraAccessibilityActions={[
            { name: 'move-left', label: 'Move left', run: moveLeft },
            { name: 'move-right', label: 'Move right', run: moveRight },
          ]}
          testID={`fan-card-${card.id}`}
        >
          <View
            accessibilityRole="none"
            style={styles.cardFace}
          >
            {card.render(concealed)}
          </View>
        </CardEntity>
      </Animated.View>
    </View>
  );
}

export function HandFanSurface({
  zoneId,
  actorId,
  cards,
  legalTargets,
  dispatchIntent,
  maxWidth = 360,
  size = 'md',
  canReorder = true,
  concealed = false,
  label = 'Hand',
  style,
  testID,
}: HandFanSurfaceProps) {
  const { announce } = useMotion();
  const [containerLeft, setContainerLeft] = useState(0);
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [gapIndex, setGapIndex] = useState<number | null>(null);
  const gapRef = useRef<number | null>(null);
  const containerRef = useRef<View | null>(null);

  const cardWidth = SIZE_MAP[size].width;
  const cardHeight = SIZE_MAP[size].height;

  const { slots, slotStep, fanWidth } = useMemo(
    () => computeFanLayout(cards.length, cardWidth, maxWidth),
    [cards.length, cardWidth, maxWidth],
  );

  const onLayout = useCallback((_event: LayoutChangeEvent) => {
    containerRef.current?.measureInWindow((x) => {
      setContainerLeft(x);
    });
  }, []);

  const handleDragCenterX = useCallback(
    (cardId: string, centerX: number | null) => {
      if (centerX === null) {
        const pending = gapRef.current;
        gapRef.current = null;
        setGapIndex(null);
        setDraggedCardId(null);
        if (pending !== null && canReorder) {
          const originalIndex = cards.findIndex((card) => card.id === cardId);
          const toIndex = pending > originalIndex ? pending - 1 : pending;
          if (toIndex !== originalIndex && toIndex >= 0 && toIndex < cards.length) {
            announce(`Moved ${cardId} to position ${toIndex + 1}`);
            dispatchIntent({
              id: nextPhysicalIntentId(),
              type: 'hand.reorder',
              actorId,
              cardId,
              toIndex,
            });
          }
        }
        return;
      }
      if (draggedCardId !== cardId) setDraggedCardId(cardId);
      if (!canReorder) return;
      const local = centerX - containerLeft;
      const index = physInsertionIndex(local, 0, slotStep, cards.length);
      if (gapRef.current !== index) {
        gapRef.current = index;
        setGapIndex(index);
      }
    },
    [actorId, announce, canReorder, cards, containerLeft, dispatchIntent, draggedCardId, slotStep],
  );

  const handleReorderCommit = useCallback(
    (cardId: string, toIndex: number) => {
      dispatchIntent({
        id: nextPhysicalIntentId(),
        type: 'hand.reorder',
        actorId,
        cardId,
        toIndex,
      });
    },
    [actorId, dispatchIntent],
  );

  const handleDragStart = useCallback((_cardId: string) => {
    // Reserved for future on-lift affordances (e.g. dimming legal targets elsewhere).
  }, []);

  const renderedCards = useMemo(
    () =>
      cards.map((card, index) => {
        const slot = slots[index];
        if (!slot) return null;
        return (
          <FanCardView
            key={card.id}
            card={card}
            index={index}
            slot={slot}
            slotStep={slotStep}
            cardWidth={cardWidth}
            cardHeight={cardHeight}
            fanLeftX={containerLeft}
            concealed={concealed}
            draggedCardId={draggedCardId}
            gapIndex={gapIndex}
            actorId={actorId}
            zoneId={zoneId}
            legalTargets={legalTargets}
            dispatchIntent={dispatchIntent}
            onDragStart={handleDragStart}
            onDragCenterX={handleDragCenterX}
            onReorderCommit={handleReorderCommit}
            size={size}
          />
        );
      }),
    [
      actorId,
      cardHeight,
      cardWidth,
      cards,
      concealed,
      containerLeft,
      dispatchIntent,
      draggedCardId,
      gapIndex,
      handleDragCenterX,
      handleDragStart,
      handleReorderCommit,
      legalTargets,
      size,
      slotStep,
      slots,
      zoneId,
    ],
  );

  return (
    <View
      ref={(node) => {
        containerRef.current = node;
      }}
      testID={testID ?? `hand-fan-${zoneId}`}
      accessibilityLabel={label}
      onLayout={onLayout}
      style={[styles.fan, { width: fanWidth, height: cardHeight + 28 }, style]}
    >
      {renderedCards}
    </View>
  );
}

const styles = StyleSheet.create({
  fan: {
    position: 'relative',
  },
  fanCard: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  cardFace: {
    flex: 1,
  },
});

export default HandFanSurface;
