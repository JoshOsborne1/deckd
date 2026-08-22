import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { CardDrag } from '@components/CardDrag';
import { PlayingCard, SIZE_MAP } from '@components/PlayingCard';
import { parseCardId, parseJokerId } from '@engine/selectors';
import { space } from '@theme';
import type { CardFace, CardId, CardInstance } from '@engine/types';
import type { CardDropTarget } from '@lib/cardDrag';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CardDragHandProps {
  cards: readonly CardInstance[];
  playableCardIds: ReadonlySet<CardId>;
  faceFor: (card: CardInstance) => CardFace;
  dropTargets?: readonly CardDropTarget[];
  disabled?: boolean;
  onDrop?: (cardId: CardId, targetId: string) => void;
  size?: 'md' | 'lg';
  /** Use a restrained physical fan instead of a flat overlap. */
  fan?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const OVERLAP = 36;

const RANK_NAMES: Record<string, string> = {
  A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King',
};
const SUIT_NAMES: Record<string, string> = {
  H: 'Hearts', S: 'Spades', D: 'Diamonds', C: 'Clubs',
};

/** Human-readable VoiceOver label, e.g. "Queen of Hearts" / "Face-down card". */
export function describeCardLabel(cardId: string, face: CardFace): string {
  if (face === 'down') return 'Face-down card';
  const jokerColor = parseJokerId(cardId);
  if (jokerColor) return `${jokerColor === 'red' ? 'Red' : 'Black'} joker`;
  const parsed = parseCardId(cardId);
  if (!parsed) return `Card ${cardId}`;
  const rank = RANK_NAMES[parsed.rank] ?? parsed.rank;
  const suit = SUIT_NAMES[parsed.suit] ?? '';
  return suit ? `${rank} of ${suit}` : rank;
}

/**
 * A measured, scrollable hand with a single drag layer above the scroll view.
 *
 * The scroll view owns layout and browsing. Draggable cards are rendered in a
 * sibling overlay after measurement, so a lifted card can leave the clipped
 * scroll viewport and land on a target elsewhere on the table.
 */
export function CardDragHand({
  cards,
  playableCardIds,
  faceFor,
  dropTargets = [],
  disabled = false,
  onDrop,
  size = 'md',
  fan = false,
  style,
  testID,
}: CardDragHandProps) {
  const handRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const slotRefs = useRef<Record<string, View | null>>({});
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const [slots, setSlots] = useState<Record<string, Rect>>({});
  const cardSize = SIZE_MAP[size];
  const overlap = fan ? 42 : OVERLAP;

  const measureOrigin = useCallback(() => {
    handRef.current?.measureInWindow((x: number, y: number) => setOrigin({ x, y }));
  }, []);

  const measureSlot = useCallback((cardId: string, node: View | null) => {
    node?.measureInWindow((x, y, width, height) => {
      setSlots((current) => {
        const previous = current[cardId];
        if (
          previous &&
          previous.x === x &&
          previous.y === y &&
          previous.width === width &&
          previous.height === height
        ) {
          return current;
        }
        return { ...current, [cardId]: { x, y, width, height } };
      });
    });
  }, []);

  const measureAllSlots = useCallback(() => {
    Object.entries(slotRefs.current).forEach(([cardId, node]) => measureSlot(cardId, node));
  }, [measureSlot]);

  const setSlotRef = useCallback(
    (cardId: string, node: View | null) => {
      slotRefs.current[cardId] = node;
      measureSlot(cardId, node);
    },
    [measureSlot],
  );

  const handleScroll = useCallback(() => {
    // P1-17: slot and origin are both measured in window space, so their
    // DELTA (what the drag layer consumes) is invariant under scroll —
    // the ScrollView translates both equally. Re-measuring every scroll
    // frame was N measureInWindow calls at 60Hz for zero effect. Origin is
    // refreshed on layout/scroll-end instead (see effects below).
  }, []);

  // Stable dep: the card identity sequence, not the array object (P1-17).
  const cardOrderKey = useMemo(() => cards.map((c) => c.id).join(','), [cards]);

  useEffect(() => {
    const frame = requestAnimationFrame(measureOrigin);
    return () => cancelAnimationFrame(frame);
  }, [cardOrderKey, measureOrigin]);

  useEffect(() => {
    const firstPlayableIndex = cards.findIndex((card) => playableCardIds.has(card.id));
    if (firstPlayableIndex < 0) return;
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        x: Math.max(0, firstPlayableIndex * (cardSize.width - overlap) - space.md),
        animated: false,
      });
      measureOrigin();
      requestAnimationFrame(measureAllSlots);
    });
    return () => cancelAnimationFrame(frame);
  }, [cardSize.width, cardOrderKey, measureAllSlots, measureOrigin, overlap, playableCardIds]);

  const localTargets = useMemo(
    () => dropTargets.map((target) => ({ ...target, x: target.x - origin.x, y: target.y - origin.y })),
    [dropTargets, origin.x, origin.y],
  );
  // P1-18: stable primitive identity for useCardDrag's gesture deps — the
  // gesture only rebuilds when size/disabled/targets genuinely change.
  const dragCardSize = useMemo(
    () => ({ width: cardSize.width, height: cardSize.height }),
    [cardSize.width, cardSize.height],
  );

  const visibleDragCards = cards.filter(
    (card) => playableCardIds.has(card.id) && slots[card.id],
  );

  return (
    <View
      ref={handRef}
      testID={testID}
      style={[styles.root, style]}
      onLayout={measureOrigin}
      pointerEvents="box-none"
    >
      <ScrollView
        ref={scrollRef}
        testID={testID ? `${testID}-scroll` : undefined}
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        onScrollEndDrag={() => {
          measureOrigin();
          measureAllSlots();
        }}
        onMomentumScrollEnd={() => {
          measureOrigin();
          measureAllSlots();
        }}
      >
        {cards.map((card, index) => {
          const parsedSize = cardSize;
          const playable = playableCardIds.has(card.id);
          const parsed = parseCardId(card.id);
          const jokerColor = parseJokerId(card.id);
          const fanOffset = index - (cards.length - 1) / 2;
          const cardStyle = fan
            ? { transform: [{ translateY: Math.abs(fanOffset) * 4 }, { rotate: `${fanOffset * 4}deg` }] }
            : undefined;
          return (
            <View
              key={card.id}
              testID={testID ? `${testID}-slot-${card.id}` : undefined}
              ref={(node) => setSlotRef(card.id, node)}
              pointerEvents={playable ? 'none' : 'auto'}
              style={[
                styles.cardSlot,
                {
                  width: parsedSize.width,
                  height: parsedSize.height,
                  marginLeft: index === 0 ? 0 : -overlap,
                },
              ]}
            >
              <View style={playable && slots[card.id] ? styles.placeholder : undefined}>
                <View style={cardStyle}>
                  <PlayingCard
                    rank={parsed?.rank}
                    suit={parsed?.suit}
                    jokerColor={jokerColor ?? undefined}
                    face={faceFor(card)}
                    size={size}
                  />
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {visibleDragCards.map((card) => {
        const slot = slots[card.id]!;
        const cardIndex = cards.indexOf(card);
        return (
          <HandDragCard
            key={`drag-${card.id}`}
            card={card}
            cardIndex={cardIndex}
            handCount={cards.length}
            slot={{ x: slot.x - origin.x, y: slot.y - origin.y }}
            cardSize={dragCardSize}
            dropTargets={localTargets}
            disabled={disabled}
            size={size}
            fan={fan}
            face={faceFor(card)}
            onDrop={onDrop}
          />
        );
      })}
    </View>
  );
}

/**
 * Memoized per-card drag wrapper (P1-19). Fan transforms are derived from
 * primitives (index/count) so re-renders of the hand don't rebuild inline
 * style objects for unchanged cards — React.memo can then skip them.
 */
const HandDragCard = memo(function HandDragCard({
  card,
  cardIndex,
  handCount,
  slot,
  cardSize,
  dropTargets,
  disabled,
  size,
  fan,
  face,
  onDrop,
}: {
  card: CardInstance;
  cardIndex: number;
  handCount: number;
  slot: { x: number; y: number };
  cardSize: { width: number; height: number };
  dropTargets: readonly CardDropTarget[];
  disabled: boolean;
  size: 'md' | 'lg';
  fan: boolean;
  face: CardFace;
  onDrop?: (cardId: CardId, targetId: string) => void;
}) {
  const parsed = parseCardId(card.id);
  const jokerColor = parseJokerId(card.id);
  const fanOffset = cardIndex - (handCount - 1) / 2;
  const cardStyle = useMemo(
    () =>
      fan
        ? { transform: [{ translateY: Math.abs(fanOffset) * 4 }, { rotate: `${fanOffset * 4}deg` }] }
        : undefined,
    [fan, fanOffset],
  );
  const handleDrop = useCallback(
    (targetId: string) => onDrop?.(card.id as CardId, targetId),
    [card.id, onDrop],
  );

  return (
    <CardDrag
      cardId={card.id}
      slot={slot}
      cardSize={cardSize}
      dropTargets={dropTargets}
      disabled={disabled}
      style={{ zIndex: cardIndex + 1 }}
      cardStyle={cardStyle}
      accessibilityLabel={describeCardLabel(card.id, face)}
      onDrop={handleDrop}
    >
      <PlayingCard
        rank={parsed?.rank}
        suit={parsed?.suit}
        jokerColor={jokerColor ?? undefined}
        face={face}
        size={size}
      />
    </CardDrag>
  );
});

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    width: '100%',
    minHeight: 142,
    overflow: 'visible',
  },
  scrollContent: {
    alignItems: 'flex-end',
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    paddingBottom: space.xs,
  },
  cardSlot: {
    justifyContent: 'flex-end',
  },
  placeholder: {
    opacity: 0,
  },
});

export default CardDragHand;
