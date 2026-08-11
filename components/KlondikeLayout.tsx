import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { PlayingCard, type PlayingCardBack } from '@components/PlayingCard';
import type { GameAction } from '@engine/rules';
import {
  KLONDIKE_FOUNDATION_SUITS,
  KLONDIKE_TABLEAU_COUNT,
  klondikeFoundationZoneId,
  klondikeTableauZoneId,
  type CardInstance,
  type GameState,
} from '@engine/types';
import { parseCardId } from '@engine/selectors';
import { alpha, colors, fonts, letterSpacing, radii, space } from '@theme';

const SUIT_GLYPHS: Record<(typeof KLONDIKE_FOUNDATION_SUITS)[number], string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

interface KlondikeLayoutProps {
  state: GameState;
  onAction: (action: GameAction) => void;
  back: PlayingCardBack;
}

function cardLabel(card: CardInstance): string {
  const parsed = parseCardId(card.id);
  return parsed ? `${parsed.rank} of ${parsed.suit}` : 'Unknown card';
}

function CardSlot({
  card,
  label,
  selected,
  disabled,
  placeholder,
  back,
  cardSize,
  cardScale,
  slotWidth,
  slotHeight,
  onPress,
}: {
  card?: CardInstance;
  label: string;
  selected?: boolean;
  disabled?: boolean;
  placeholder?: string;
  back: PlayingCardBack;
  cardSize: 'sm' | 'md';
  cardScale: number;
  slotWidth: number;
  slotHeight: number;
  onPress?: () => void;
}) {
  const parsed = card ? parseCardId(card.id) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.cardSlot,
        { width: slotWidth, height: slotHeight },
        selected && styles.cardSlotSelected,
        disabled && styles.cardSlotDisabled,
        pressed && styles.cardSlotPressed,
      ]}
    >
      {card && parsed ? (
        <PlayingCard
          rank={parsed.rank}
          suit={parsed.suit}
          face={card.face}
          size={cardSize}
          back={back}
          elevated={selected}
          style={{ transform: [{ scale: cardScale }] }}
        />
      ) : card ? (
        <PlayingCard face={card.face} size={cardSize} back={back} style={{ transform: [{ scale: cardScale }] }} />
      ) : (
        <Text style={[styles.emptySlotText, { width: slotWidth, height: slotHeight }]}>{placeholder ?? '·'}</Text>
      )}
    </Pressable>
  );
}

export function KlondikeLayout({ state, onAction, back }: KlondikeLayoutProps) {
  const { width: viewportWidth } = useWindowDimensions();
  const desktopLayout = viewportWidth >= 700;
  const slotWidth = desktopLayout ? 72 : 44;
  const slotHeight = desktopLayout ? 100 : 62;
  const cardSize: 'sm' | 'md' = desktopLayout ? 'md' : 'sm';
  const cardScale = desktopLayout ? 0.8 : 0.72;
  const stackOverlap = desktopLayout ? 44 : 28;
  const slotProps = { back, cardSize, cardScale, slotWidth, slotHeight };
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const tableau = useMemo(
    () => Array.from({ length: KLONDIKE_TABLEAU_COUNT }, (_, index) => state.zones[klondikeTableauZoneId(index)]?.cardIds ?? []),
    [state.zones],
  );
  const wasteIds = state.zones.discard?.cardIds ?? [];
  const stockIds = state.zones.draw?.cardIds ?? [];
  const foundationCount = KLONDIKE_FOUNDATION_SUITS.reduce(
    (total, suit) => total + (state.zones[klondikeFoundationZoneId(suit)]?.cardIds.length ?? 0),
    0,
  );
  const activeSelectedId = selectedId && state.cards[selectedId] ? selectedId : null;

  const moveOrSelect = (cardId: string) => {
    const card = state.cards[cardId];
    if (!card) return;
    if (activeSelectedId && activeSelectedId !== cardId) {
      const targetZone = card.zoneId;
      if (targetZone.startsWith('tableau:') || targetZone.startsWith('foundation:')) {
        onAction(`move:${activeSelectedId}|${targetZone}`);
        setSelectedId(null);
        return;
      }
    }
    setSelectedId((current) => (current === cardId ? null : cardId));
  };

  const handleFoundationPress = (suit: (typeof KLONDIKE_FOUNDATION_SUITS)[number]) => {
    if (!activeSelectedId) return;
    onAction(`move:${activeSelectedId}|${klondikeFoundationZoneId(suit)}`);
    setSelectedId(null);
  };

  return (
    <View style={styles.root} accessibilityLabel="Klondike tableau">
      <View style={styles.statusRow}>
        <Text style={styles.eyebrow}>KLONDIKE · DRAW ONE</Text>
        <Text style={styles.statusText}>{foundationCount}/52 FOUNDATIONS</Text>
      </View>

      <View style={styles.topRow}>
        <View style={styles.stockWasteRow}>
          <CardSlot
            {...slotProps}
            card={stockIds.length > 0 ? { id: stockIds[0]!, face: 'down', zoneId: 'draw', order: 0 } : undefined}
            label={stockIds.length > 0 ? `Stock, ${stockIds.length} cards` : 'Recycle waste'}
            placeholder="↻"
            disabled={stockIds.length === 0 && wasteIds.length === 0}
            onPress={() => onAction(stockIds.length > 0 ? 'draw' : 'recycle')}
          />
          <CardSlot
            {...slotProps}
            card={wasteIds.length > 0 ? state.cards[wasteIds[wasteIds.length - 1]!] : undefined}
            label={wasteIds.length > 0 ? `Waste, ${cardLabel(state.cards[wasteIds[wasteIds.length - 1]!]!)}` : 'Empty waste'}
            placeholder="·"
            selected={Boolean(wasteIds.length > 0 && selectedId === wasteIds[wasteIds.length - 1])}
            disabled={wasteIds.length === 0}
            onPress={wasteIds.length > 0 ? () => moveOrSelect(wasteIds[wasteIds.length - 1]!) : undefined}
          />
        </View>
        <View style={styles.foundationRow}>
          {KLONDIKE_FOUNDATION_SUITS.map((suit) => {
            const ids = state.zones[klondikeFoundationZoneId(suit)]?.cardIds ?? [];
            const topId = ids[ids.length - 1];
            const topCard = topId ? state.cards[topId] : undefined;
            return (
              <CardSlot
                {...slotProps}
                key={suit}
                card={topCard}
                label={topCard ? `${suit} foundation, ${cardLabel(topCard)}` : `${SUIT_GLYPHS[suit]} foundation, empty`}
                placeholder={SUIT_GLYPHS[suit]}
                selected={Boolean(topId && activeSelectedId === topId)}
                disabled={!activeSelectedId && !topId}
                onPress={topId ? () => moveOrSelect(topId) : () => handleFoundationPress(suit)}
              />
            );
          })}
        </View>
      </View>

      <View style={styles.tableauLabelRow}>
        <Text style={styles.sectionLabel}>TABLEAU</Text>
        <Text style={styles.selectionText}>
          {activeSelectedId ? 'Choose a destination' : 'Tap a face-up card to move it'}
        </Text>
      </View>
      <View style={styles.tableauRow}>
        {tableau.map((ids, column) => {
          const topId = ids[ids.length - 1];
          return (
            <View
              key={column}
              style={[
                styles.column,
                { width: slotWidth, minHeight: slotHeight + (slotHeight - stackOverlap) * (ids.length > 0 ? ids.length - 1 : 0) },
              ]}
            >
              {ids.length === 0 ? (
                <CardSlot
                  {...slotProps}
                  label="Empty tableau, requires a king"
                  placeholder="K"
                  disabled={!activeSelectedId}
                  onPress={() => {
                    if (activeSelectedId) {
                      onAction(`move:${activeSelectedId}|${klondikeTableauZoneId(column)}`);
                      setSelectedId(null);
                    }
                  }}
                />
              ) : (
                ids.map((cardId, index) => {
                  const card = state.cards[cardId];
                  if (!card) return null;
                  const top = cardId === topId;
                  const canPress = card.face === 'up';
                  return (
                    <View
                      key={cardId}
                      style={[
                        styles.stackedCard,
                        { width: slotWidth, height: slotHeight },
                        index > 0 && { marginTop: -stackOverlap },
                      ]}
                    >
                      <CardSlot
                        {...slotProps}
                        card={card}
                        label={`${cardLabel(card)}${card.face === 'down' ? ', face down' : ''}`}
                        selected={activeSelectedId === cardId}
                        disabled={!canPress && card.face === 'up'}
                        onPress={
                          card.face === 'down' && top
                            ? () => onAction(`flip:${cardId}`)
                            : canPress
                              ? () => moveOrSelect(cardId)
                              : undefined
                        }
                      />
                    </View>
                  );
                })
              )}
            </View>
          );
        })}
      </View>

      <Text style={styles.helperText}>
        {activeSelectedId ? 'Tap a tableau card or foundation to place the selected card.' : 'Build alternating-color runs down, then send each suit up.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    alignItems: 'center',
    paddingHorizontal: space.xs,
  },
  statusRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xs,
    marginBottom: space.sm,
  },
  eyebrow: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: letterSpacing.caps,
  },
  statusText: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.cap,
  },
  topRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: space.sm,
  },
  stockWasteRow: {
    flexDirection: 'row',
    gap: space.xs,
  },
  foundationRow: {
    flexDirection: 'row',
    gap: space.xs,
  },
  cardSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  cardSlotSelected: {
    borderWidth: 2,
    borderColor: colors.brand,
    backgroundColor: alpha.brand10,
  },
  cardSlotDisabled: {
    opacity: 0.76,
  },
  cardSlotPressed: {
    transform: [{ scale: 0.96 }],
  },
  emptySlotText: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 16,
    fontFamily: fonts.extra,
    color: colors.inkSubtle,
  },
  tableauLabelRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space.md,
    marginBottom: space.xs,
    paddingHorizontal: space.xs,
  },
  sectionLabel: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.caps,
  },
  selectionText: {
    fontSize: 9,
    fontFamily: fonts.medium,
    color: colors.inkSubtle,
  },
  tableauRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.xs,
  },
  column: {
    alignItems: 'center',
  },
  stackedCard: {
    zIndex: 1,
  },
  helperText: {
    maxWidth: 340,
    marginTop: space.sm,
    fontSize: 10,
    lineHeight: 14,
    fontFamily: fonts.medium,
    color: colors.inkSubtle,
    textAlign: 'center',
  },
});
