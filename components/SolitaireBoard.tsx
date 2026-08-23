import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { BookOpen, ChevronLeft, RotateCcw } from 'lucide-react-native';
import { PlayingCard } from '@components/PlayingCard';
import { CardButton } from '@components/CardButton';
import { RulesSheet } from '@components/RulesSheet';
import { useMotion } from '@hooks/useMotion';
import { useGameStore } from '@store/gameStore';
import { useUiStore } from '@store/uiStore';
import {
  parseCardId,
} from '@engine/selectors';
import {
  ZONE_DRAW,
  type GameState,
} from '@engine/types';
import {
  ZONE_WASTE,
  PYRAMID_ZONE,
  PYRAMID_STOCK,
  PYRAMID_WASTE,
  tableauZoneId,
  foundationZoneId,
  freeCellTableauZoneId,
  freeCellZoneId,
  isKlondikeWon,
  isFreeCellWon,
  isPyramidWon,
  isPyramidCardFree,
  tableauRun,
  GOLF_STOCK,
  GOLF_WASTE,
  golfTableauZoneId,
  golfPlaysOnWaste,
  isGolfWon,
} from '@engine/solitaire';
import {
  getGameRules,
  encodeMoveAction,
  type GameAction,
} from '@engine/rules';
import {
  alpha,
  colors,
  fonts,
  fontSizes,
  letterSpacing,
  radii,
  space,
} from '@theme';

// ---------------------------------------------------------------------------
// Shared solitaire board — renders Klondike, FreeCell, or Pyramid
// ---------------------------------------------------------------------------

export interface SolitaireBoardProps {
  state: GameState;
  viewerId: string;
  topInset: number;
  bottomInset: number;
}

type SolitaireGame = 'klondike' | 'freecell' | 'pyramid' | 'golf';

function solitaireGameId(presetId: string | null): SolitaireGame | null {
  if (presetId === 'klondike') return 'klondike';
  if (presetId === 'freecell') return 'freecell';
  if (presetId === 'pyramid') return 'pyramid';
  if (presetId === 'golf') return 'golf';
  return null;
}

/** Small playing card for the solitaire board (smaller than md, bigger than xs). */
function MiniCard({
  cardId,
  face,
  selected,
  highlight,
  onPress,
  size = 'sm',
}: {
  cardId: string;
  face: 'up' | 'down';
  selected?: boolean;
  highlight?: boolean;
  onPress?: () => void;
  size?: 'sm' | 'xs';
}) {
  const parsed = parseCardId(cardId);
  const inner = parsed ? (
    <PlayingCard
      rank={parsed.rank}
      suit={parsed.suit}
      face={face}
      size={size}
      style={selected ? styles.cardSelected : undefined}
      elevated={highlight || selected}
    />
  ) : (
    <PlayingCard face={face} size={size} />
  );
  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} style={[styles.cardPressable, selected ? styles.cardSelected : undefined]}>
      {inner}
    </Pressable>
  );
}

/** Empty slot placeholder for a pile position. */
function EmptySlot({ label, onPress, selected }: { label?: string; onPress?: () => void; selected?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.emptySlot, selected && styles.slotSelected]}
    >
      {label ? <Text style={styles.emptySlotLabel}>{label}</Text> : null}
    </Pressable>
  );
}

export function SolitaireBoard({ state, viewerId, topInset, bottomInset }: SolitaireBoardProps) {
  const game = solitaireGameId(state.config.presetId);
  const { haptic } = useMotion();
  const gameAction = useGameStore((s) => s.gameAction);
  const startNextHand = useGameStore((s) => s.startNextHand);
  const setViewMode = useUiStore((s) => s.setViewMode);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const { width: viewportWidth } = useWindowDimensions();

  const handleAction = useCallback(
    (action: GameAction) => {
      haptic('medium');
      const ok = gameAction(action, viewerId);
      if (!ok) haptic('error');
      setSelectedSource(null);
    },
    [gameAction, haptic, viewerId],
  );

  const handleSourceSelect = useCallback(
    (zoneId: string) => {
      haptic('light');
      setSelectedSource((prev) => (prev === zoneId ? null : zoneId));
    },
    [haptic],
  );

  const handleTargetSelect = useCallback(
    (targetZoneId: string) => {
      if (!selectedSource) return;
      const action = encodeMoveAction(selectedSource, targetZoneId);
      handleAction(action);
    },
    [selectedSource, handleAction],
  );

  // --- Pyramid: tap two cards to pair them ---
  const [pyramidFirst, setPyramidFirst] = useState<string | null>(null);

  const handlePyramidCardTap = useCallback(
    (token: string, cardId: string) => {
      if (cardId.endsWith('-K')) {
        // King: remove alone.
        handleAction(`play:${token}:` as GameAction);
        return;
      }
      if (!pyramidFirst) {
        haptic('light');
        setPyramidFirst(token);
        return;
      }
      if (pyramidFirst === token) {
        // Deselect.
        setPyramidFirst(null);
        return;
      }
      handleAction(`play:${pyramidFirst}:${token}` as GameAction);
      setPyramidFirst(null);
    },
    [pyramidFirst, handleAction, haptic],
  );

  const readout = useMemo(() => {
    const rules = getGameRules(state.config.presetId);
    return rules.readout?.(state, viewerId) ?? null;
  }, [state, viewerId]);

  const isWon = game === 'klondike'
    ? isKlondikeWon(state)
    : game === 'freecell'
    ? isFreeCellWon(state)
    : game === 'pyramid'
    ? isPyramidWon(state)
    : game === 'golf'
    ? isGolfWon(state)
    : false;

  if (!game) return null;

  return (
    <View style={[styles.root, { paddingTop: topInset + space.md, paddingBottom: bottomInset }]}>
      {/* Header */}
      <View style={styles.header}>
        <CardButton
          variant="ghost"
          size="sm"
          elevated={false}
          haptic="light"
          onPress={() => setViewMode('hub')}
          style={styles.backChip}
        >
          <ChevronLeft size={18} color={colors.inkMuted} />
          <Text style={styles.backText}>Hub</Text>
        </CardButton>
        <Text style={styles.eyebrow}>
          {state.phase === 'ended' ? 'COMPLETE' : game === 'klondike' ? 'KLONDIKE' : game === 'freecell' ? 'FREECELL' : game === 'pyramid' ? 'PYRAMID' : 'GOLF'}
        </Text>
        <View style={styles.headerActions}>
          {state.phase !== 'ended' && (
            <Pressable
              onPress={() => setRulesOpen(true)}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityLabel="Read rules"
            >
              <BookOpen size={20} color={colors.inkMuted} />
            </Pressable>
          )}
          {state.phase !== 'ended' && (
            <Pressable
              onPress={() => startNextHand()}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityLabel="New deal"
            >
              <RotateCcw size={18} color={colors.inkMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Readout */}
      {!!readout && state.phase !== 'ended' && (
        <View style={styles.readoutBar}>
          <Text style={styles.readoutText}>{readout}</Text>
        </View>
      )}

      {/* Board */}
      <ScrollView
        style={styles.boardScroll}
        contentContainerStyle={[styles.boardContent, { paddingHorizontal: space.md }]}
        showsVerticalScrollIndicator={false}
      >
        {game === 'klondike' && (
          <KlondikeBoard
            state={state}
            selectedSource={selectedSource}
            onSourceSelect={handleSourceSelect}
            onTargetSelect={handleTargetSelect}
            onCycleStock={() => handleAction('cycleStock')}
          />
        )}
        {game === 'freecell' && (
          <FreeCellBoard
            state={state}
            selectedSource={selectedSource}
            onSourceSelect={handleSourceSelect}
            onTargetSelect={handleTargetSelect}
          />
        )}
        {game === 'pyramid' && (
          <PyramidBoard
            state={state}
            pyramidFirst={pyramidFirst}
            onCardTap={handlePyramidCardTap}
            onCycleStock={() => handleAction('cycleStock')}
          />
        )}
        {game === 'golf' && (
          <GolfBoard
            state={state}
            onPlayColumn={(index) => handleAction(`play:${index}` as GameAction)}
          />
        )}
      </ScrollView>

      {/* Action bar (stock draw / finish) */}
      {state.phase !== 'ended' && (
        <SolitaireActionBar state={state} game={game} onAction={handleAction} viewportWidth={viewportWidth} />
      )}

      {/* Win banner */}
      {state.phase === 'ended' && (
        <View style={styles.winBanner} pointerEvents="box-none">
          <View style={styles.winCard}>
            <Text style={styles.winEyebrow}>COMPLETE</Text>
            <Text style={styles.winTitle}>
              {isWon
                ? game === 'klondike'
                  ? 'You built the foundations'
                  : game === 'freecell'
                  ? 'You cleared the board'
                  : game === 'pyramid'
                  ? 'You dismantled the pyramid'
                  : 'You cleared the tableau'
                : 'No more moves'}
            </Text>
            <Text style={styles.winMeta}>
              {isWon ? 'Well played' : 'Try a new deal'}
            </Text>
            <CardButton
              variant="primary"
              size="md"
              haptic="medium"
              onPress={() => startNextHand()}
              style={styles.winCta}
            >
              <Text style={styles.winCtaText}>New deal</Text>
            </CardButton>
          </View>
        </View>
      )}

      <RulesSheet
        visible={rulesOpen}
        presetId={state.config.presetId}
        onClose={() => setRulesOpen(false)}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Klondike board
// ---------------------------------------------------------------------------

function KlondikeBoard({
  state,
  selectedSource,
  onSourceSelect,
  onTargetSelect,
  onCycleStock,
}: {
  state: GameState;
  selectedSource: string | null;
  onSourceSelect: (zoneId: string) => void;
  onTargetSelect: (zoneId: string) => void;
  onCycleStock: () => void;
}) {
  const stockCount = state.zones[ZONE_DRAW]?.cardIds.length ?? 0;
  const wasteZone = state.zones[ZONE_WASTE];
  const wasteTop = wasteZone?.cardIds[wasteZone.cardIds.length - 1] ?? null;
  const wasteCard = wasteTop ? state.cards[wasteTop] : null;
  const wasteParsed = wasteTop ? parseCardId(wasteTop) : null;

  return (
    <View style={styles.klondikeBoard}>
      {/* Top row: stock + waste + foundations */}
      <View style={styles.klondikeTopRow}>
        {/* Stock */}
        <Pressable onPress={onCycleStock} style={styles.pileSlot}>
          {stockCount > 0 ? (
            <View>
              <PlayingCard face="down" size="sm" />
              <Text style={styles.pileCount}>{stockCount}</Text>
            </View>
          ) : wasteZone && wasteZone.cardIds.length > 0 ? (
            <View>
              <EmptySlot label="↻" />
            </View>
          ) : (
            <EmptySlot />
          )}
        </Pressable>

        {/* Waste */}
        <View style={styles.pileSlot}>
          {wasteCard && wasteParsed ? (
            <MiniCard
              cardId={wasteTop!}
              face={wasteCard.face}
              selected={selectedSource === ZONE_WASTE}
              onPress={() => onSourceSelect(ZONE_WASTE)}
            />
          ) : (
            <EmptySlot label="WASTE" />
          )}
        </View>

        <View style={styles.klondikeSpacer} />

        {/* Foundations */}
        {Array.from({ length: 4 }, (_, i) => {
          const zone = state.zones[foundationZoneId(i)];
          const topCardId = zone?.cardIds[zone.cardIds.length - 1] ?? null;
          const card = topCardId ? state.cards[topCardId] : null;
          const parsed = topCardId ? parseCardId(topCardId) : null;
          return (
            <Pressable
              key={i}
              onPress={() => onTargetSelect(foundationZoneId(i))}
              style={styles.pileSlot}
            >
              {card && parsed ? (
                <MiniCard cardId={topCardId!} face={card.face} size="sm" highlight />
              ) : (
                <EmptySlot label="A" />
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Tableau columns */}
      <View style={styles.klondikeTableau}>
        {Array.from({ length: 7 }, (_, col) => {
          const zone = state.zones[tableauZoneId(col)];
          if (!zone) return null;
          return (
            <Pressable
              key={col}
              onPress={() => {
                if (selectedSource) onTargetSelect(tableauZoneId(col));
                else onSourceSelect(tableauZoneId(col));
              }}
              style={[styles.tableauColumn, selectedSource === tableauZoneId(col) && styles.columnSelected]}
            >
              {zone.cardIds.length === 0 ? (
                <EmptySlot />
              ) : (
                zone.cardIds.map((cardId, idx) => {
                  const card = state.cards[cardId];
                  if (!card) return null;
                  const isTop = idx === zone.cardIds.length - 1;
                  const isFaceUp = card.face === 'up';
                  const run = tableauRun(state, col);
                  const isInRun = isFaceUp && run.includes(cardId);
                  const isSelected = selectedSource === tableauZoneId(col) && isInRun;
                  // Offset face-down cards tightly, face-up cards slightly more.
                  const offset = isFaceUp ? idx * 20 : idx * 10;
                  return (
                    <View
                      key={cardId}
                      style={[styles.tableauCard, { top: offset }, isSelected && styles.cardSelected]}
                    >
                      <MiniCard
                        cardId={cardId}
                        face={card.face}
                        selected={isSelected}
                        highlight={isTop && selectedSource !== null && selectedSource !== tableauZoneId(col)}
                      />
                    </View>
                  );
                })
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// FreeCell board
// ---------------------------------------------------------------------------

function FreeCellBoard({
  state,
  selectedSource,
  onSourceSelect,
  onTargetSelect,
}: {
  state: GameState;
  selectedSource: string | null;
  onSourceSelect: (zoneId: string) => void;
  onTargetSelect: (zoneId: string) => void;
}) {
  return (
    <View style={styles.freeCellBoard}>
      {/* Top row: free cells + foundations */}
      <View style={styles.freeCellTopRow}>
        {Array.from({ length: 4 }, (_, i) => {
          const zone = state.zones[freeCellZoneId(i)];
          const topCardId = zone?.cardIds[zone.cardIds.length - 1] ?? null;
          const card = topCardId ? state.cards[topCardId] : null;
          return (
            <Pressable
              key={`fc-${i}`}
              onPress={() => {
                if (selectedSource && selectedSource !== freeCellZoneId(i)) onTargetSelect(freeCellZoneId(i));
                else if (topCardId) onSourceSelect(freeCellZoneId(i));
              }}
              style={[styles.pileSlot, styles.freeCellTopSlot, selectedSource === freeCellZoneId(i) && styles.slotSelected]}
            >
              {card ? (
                <MiniCard cardId={topCardId!} face={card.face} selected={selectedSource === freeCellZoneId(i)} />
              ) : (
                <EmptySlot />
              )}
            </Pressable>
          );
        })}
        <View style={styles.klondikeSpacer} />
        {Array.from({ length: 4 }, (_, i) => {
          const zone = state.zones[foundationZoneId(i)];
          const topCardId = zone?.cardIds[zone.cardIds.length - 1] ?? null;
          const card = topCardId ? state.cards[topCardId] : null;
          const parsed = topCardId ? parseCardId(topCardId) : null;
          return (
            <Pressable
              key={`fdn-${i}`}
              onPress={() => onTargetSelect(foundationZoneId(i))}
              style={[styles.pileSlot, styles.freeCellTopSlot]}
            >
              {card && parsed ? (
                <MiniCard cardId={topCardId!} face={card.face} size="sm" highlight />
              ) : (
                <EmptySlot label="A" />
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Tableau columns (8) */}
      <View style={styles.freeCellTableau}>
        {Array.from({ length: 8 }, (_, col) => {
          const zone = state.zones[freeCellTableauZoneId(col)];
          if (!zone) return null;
          return (
            <Pressable
              key={col}
              onPress={() => {
                if (selectedSource) onTargetSelect(freeCellTableauZoneId(col));
                else onSourceSelect(freeCellTableauZoneId(col));
              }}
              style={[styles.freeCellColumn, selectedSource === freeCellTableauZoneId(col) && styles.columnSelected]}
            >
              {zone.cardIds.length === 0 ? (
                <EmptySlot />
              ) : (
                zone.cardIds.map((cardId, idx) => {
                  const card = state.cards[cardId];
                  if (!card) return null;
                  const isTop = idx === zone.cardIds.length - 1;
                  const offset = idx * 20;
                  return (
                    <View
                      key={cardId}
                      style={[styles.tableauCard, { top: offset }, isTop && selectedSource === freeCellTableauZoneId(col) && styles.cardSelected]}
                    >
                      <MiniCard
                        cardId={cardId}
                        face={card.face}
                        selected={isTop && selectedSource === freeCellTableauZoneId(col)}
                        highlight={isTop && selectedSource !== null && selectedSource !== freeCellTableauZoneId(col)}
                      />
                    </View>
                  );
                })
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Pyramid board
// ---------------------------------------------------------------------------

function PyramidBoard({
  state,
  pyramidFirst,
  onCardTap,
  onCycleStock,
}: {
  state: GameState;
  pyramidFirst: string | null;
  onCardTap: (token: string, cardId: string) => void;
  onCycleStock: () => void;
}) {
  const pyramidZone = state.zones[PYRAMID_ZONE];
  const stockZone = state.zones[PYRAMID_STOCK];
  const wasteZone = state.zones[PYRAMID_WASTE];
  const stockCount = stockZone?.cardIds.length ?? 0;
  const wasteTop = wasteZone?.cardIds[wasteZone.cardIds.length - 1] ?? null;
  const wasteCard = wasteTop ? state.cards[wasteTop] : null;
  const wasteParsed = wasteTop ? parseCardId(wasteTop) : null;

  // Compute pyramid row layout.
  const pyramidCards = pyramidZone?.cardIds ?? [];
  const rows = Array.from({ length: 7 }, (_, row) => {
    const start = (row * (row + 1)) / 2;
    const count = row + 1;
    return Array.from({ length: count }, (_, i) => start + i);
  });

  return (
    <View style={styles.pyramidBoard}>
      {/* Pyramid */}
      <View style={styles.pyramidStack}>
        {rows.map((rowCards, rowIdx) => (
          <View key={rowIdx} style={[styles.pyramidRow, { marginLeft: rowIdx * 14 }]}>
            {rowCards.map((idx) => {
              const cardId = pyramidCards[idx];
              if (!cardId) {
                return <View key={idx} style={styles.pyramidEmptySlot} />;
              }
              const card = state.cards[cardId];
              if (!card) return null;
              const free = isPyramidCardFree(state, idx);
              const isFirst = pyramidFirst === String(idx);
              return (
                <Pressable
                  key={idx}
                  onPress={() => free && onCardTap(String(idx), cardId)}
                  disabled={!free}
                  style={[styles.pyramidCardWrap, !free && styles.pyramidCardBlocked, isFirst && styles.cardSelected]}
                >
                  <MiniCard cardId={cardId} face={card.face} selected={isFirst} size="xs" />
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {/* Stock + Waste */}
      <View style={styles.pyramidStockRow}>
        <Pressable onPress={onCycleStock} disabled={stockCount === 0} style={styles.pileSlot}>
          {stockCount > 0 ? (
            <View>
              <PlayingCard face="down" size="sm" />
              <Text style={styles.pileCount}>{stockCount}</Text>
            </View>
          ) : (
            <EmptySlot label="STOCK" />
          )}
        </Pressable>
        <View style={styles.pileSlot}>
          {wasteCard && wasteParsed ? (
            <Pressable
              onPress={() => onCardTap('waste', wasteTop!)}
              style={[styles.cardPressable, pyramidFirst === 'waste' && styles.cardSelected]}
            >
              <MiniCard cardId={wasteTop!} face={wasteCard.face} selected={pyramidFirst === 'waste'} size="sm" />
            </Pressable>
          ) : (
            <EmptySlot label="WASTE" />
          )}
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Golf board
// ---------------------------------------------------------------------------

function GolfBoard({
  state,
  onPlayColumn,
}: {
  state: GameState;
  onPlayColumn: (index: number) => void;
}) {
  const stockZone = state.zones[GOLF_STOCK];
  const wasteZone = state.zones[GOLF_WASTE];
  const stockCount = stockZone?.cardIds.length ?? 0;
  const wasteTop = wasteZone?.cardIds[wasteZone.cardIds.length - 1] ?? null;
  const wasteCard = wasteTop ? state.cards[wasteTop] : null;

  return (
    <View style={styles.golfBoard}>
      {/* Stock + waste */}
      <View style={styles.golfTopRow}>
        <View style={styles.pileSlot}>
          {stockCount > 0 ? (
            <View>
              <PlayingCard face="down" size="sm" />
              <Text style={styles.pileCount}>{stockCount}</Text>
            </View>
          ) : (
            <EmptySlot label="STOCK" />
          )}
        </View>
        <View style={styles.pileSlot}>
          {wasteCard ? (
            <MiniCard cardId={wasteTop!} face={wasteCard.face} size="sm" />
          ) : (
            <EmptySlot label="WASTE" />
          )}
        </View>
      </View>

      {/* Tableau: 7 columns of 5, only the top card plays */}
      <View style={styles.golfTableau}>
        {Array.from({ length: 7 }, (_, col) => {
          const zone = state.zones[golfTableauZoneId(col)];
          const cards = zone?.cardIds ?? [];
          const topCardId = cards[cards.length - 1] ?? null;
          const legal = topCardId ? golfPlaysOnWaste(topCardId, wasteTop ?? undefined) : false;
          return (
            <Pressable
              key={col}
              onPress={() => topCardId && onPlayColumn(col)}
              disabled={!topCardId}
              accessibilityRole="button"
              accessibilityLabel={`Play column ${col + 1}`}
              style={styles.golfColumn}
            >
              {cards.length === 0 ? (
                <View style={styles.golfEmptySlot} />
              ) : (
                cards.map((cardId, idx) => {
                  const card = state.cards[cardId];
                  if (!card) return null;
                  const isTop = idx === cards.length - 1;
                  return (
                    <View key={cardId} style={[styles.golfCardPos, { top: idx * 12 }]}>
                      <MiniCard
                        cardId={cardId}
                        face={card.face}
                        size="xs"
                        highlight={isTop && legal}
                      />
                    </View>
                  );
                })
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Action bar (stock draw + finish)
// ---------------------------------------------------------------------------

function SolitaireActionBar({
  state,
  game,
  onAction,
  viewportWidth,
}: {
  state: GameState;
  game: SolitaireGame;
  onAction: (action: GameAction) => void;
  viewportWidth: number;
}) {
  const rules = getGameRules(state.config.presetId);
  const actions = rules.actions(state, state.meta.hostId);

  if (actions.length === 0) {
    return (
      <View style={styles.solActionBar}>
        <Text style={styles.solHintText}>Tap a card, then tap a destination</Text>
      </View>
    );
  }

  return (
    <View style={styles.solActionBar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.solActions}>
        {actions.map((spec) => (
          <CardButton
            key={spec.id}
            variant="primary"
            size="sm"
            haptic="medium"
            onPress={() => onAction(spec.id)}
            style={styles.solActionBtn}
          >
            <Text style={styles.solActionText} numberOfLines={1}>{spec.label}</Text>
          </CardButton>
        ))}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    marginBottom: space.sm,
  },
  backChip: {
    paddingHorizontal: 0,
  },
  backText: {
    color: colors.inkMuted,
    fontSize: fontSizes.small,
    fontFamily: fonts.medium,
    marginLeft: space.xs,
  },
  eyebrow: {
    fontSize: fontSizes.caption,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.caps,
    color: colors.inkMuted,
  },
  headerActions: {
    flexDirection: 'row',
    gap: space.sm,
  },
  iconBtn: {
    padding: space.xs,
    borderRadius: radii.md,
  },
  readoutBar: {
    paddingHorizontal: space.lg,
    paddingVertical: space.xs,
    marginBottom: space.sm,
  },
  readoutText: {
    fontSize: fontSizes.small,
    fontFamily: fonts.medium,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  boardScroll: {
    flex: 1,
  },
  boardContent: {
    paddingBottom: space.xl,
  },
  cardPressable: {
    borderRadius: radii.card,
  },
  cardSelected: {
    opacity: 0.6,
  },

  // Pile slots
  pileSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySlot: {
    width: 60,
    height: 84,
    borderRadius: radii.card,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: alpha.inkOverlay12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySlotLabel: {
    fontSize: fontSizes.caption,
    fontFamily: fonts.bold,
    color: colors.inkMuted,
    letterSpacing: letterSpacing.caps,
  },
  slotSelected: {
    borderColor: colors.brand,
  },
  pileCount: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.surface,
    backgroundColor: alpha.inkOverlay45,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },

  // Klondike
  klondikeBoard: {
    gap: space.lg,
  },
  klondikeTopRow: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
  },
  klondikeSpacer: {
    flex: 1,
  },
  klondikeTableau: {
    flexDirection: 'row',
    gap: space.sm,
    justifyContent: 'center',
  },
  tableauColumn: {
    width: 60,
    minHeight: 200,
    position: 'relative',
    borderRadius: radii.card,
  },
  freeCellColumn: {
    width: 60,
    minHeight: 200,
    position: 'relative',
    borderRadius: radii.card,
  },
  columnSelected: {
    backgroundColor: alpha.brand10,
  },
  tableauCard: {
    position: 'absolute',
    left: 0,
  },

  // FreeCell
  freeCellBoard: {
    gap: space.lg,
  },
  freeCellTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 8,
  },
  freeCellTopSlot: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
    // Overlap the next slot so 8 piles fit in 375px: 8×60 − 7×18 = 354
    // (+16px padding) — the standard mobile freecell pile look.
    marginRight: -18,
  },
  freeCellTableau: {
    flexDirection: 'row',
    gap: space.sm,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },

  // Pyramid
  pyramidBoard: {
    gap: space.xl,
    alignItems: 'center',
  },
  pyramidStack: {
    alignItems: 'center',
    gap: 2,
  },
  pyramidRow: {
    flexDirection: 'row',
    gap: 4,
  },
  pyramidCardWrap: {
    padding: 0,
  },
  pyramidCardBlocked: {
    opacity: 0.4,
  },
  pyramidEmptySlot: {
    width: 36,
    height: 50,
  },
  pyramidStockRow: {
    flexDirection: 'row',
    gap: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Golf
  golfBoard: {
    gap: space.xl,
  },
  golfTopRow: {
    flexDirection: 'row',
    gap: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  golfTableau: {
    flexDirection: 'row',
    gap: space.xs,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  golfColumn: {
    width: 36,
    minHeight: 140,
    position: 'relative',
    borderRadius: radii.card,
  },
  golfCardPos: {
    position: 'absolute',
    left: 0,
  },
  golfEmptySlot: {
    width: 36,
    height: 50,
    borderRadius: radii.card,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: alpha.inkOverlay12,
  },

  // Action bar
  solActionBar: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderTopWidth: 1,
    borderTopColor: alpha.inkOverlay06,
  },
  solActions: {
    gap: space.sm,
    alignItems: 'center',
  },
  solActionBtn: {
    minWidth: 80,
  },
  solActionText: {
    color: colors.surface,
    fontFamily: fonts.bold,
    fontSize: fontSizes.small,
    letterSpacing: letterSpacing.caps,
  },
  solHintText: {
    fontSize: fontSizes.small,
    color: colors.inkMuted,
    fontFamily: fonts.medium,
    textAlign: 'center',
    paddingVertical: space.xs,
  },

  // Win banner
  winBanner: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha.inkOverlay20,
  },
  winCard: {
    backgroundColor: colors.bg,
    borderRadius: radii.lg,
    padding: space.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: alpha.inkOverlay12,
    marginHorizontal: space.xl,
    maxWidth: 320,
  },
  winEyebrow: {
    fontSize: fontSizes.caption,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.caps,
    color: colors.brand,
    marginBottom: space.sm,
  },
  winTitle: {
    fontSize: 22,
    fontFamily: fonts.extra,
    color: colors.ink,
    textAlign: 'center',
    marginBottom: space.xs,
  },
  winMeta: {
    fontSize: fontSizes.small,
    color: colors.inkMuted,
    marginBottom: space.lg,
  },
  winCta: {
    minWidth: 160,
  },
  winCtaText: {
    color: colors.surface,
    fontFamily: fonts.bold,
  },
});