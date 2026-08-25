import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { AvatarPlaceholder } from '@components/AvatarPlaceholder';
import { CardButton } from '@components/CardButton';
import { CardDragHand } from '@components/CardDragHand';
import { PlayingCard } from '@components/PlayingCard';
import { RingPulseB, ChipSlideB } from '@components/animations/GameFxB';
import { TableShell } from '@components/table/TableShell';
import { useTableSession } from '@components/table/useTableSession';
import { useGameFxB, useToggleTriggerB } from '@hooks/useGameFxB';
import { useLayerSurfaceEntrance } from '@hooks/useLayerSurfaceEntrance';
import { useMotion } from '@hooks/useMotion';
import { useUiStore } from '@store/uiStore';
import { useGameStore } from '@store/gameStore';
import {
  parseCardId,
  selectCardFace,
  selectCurrentPlayerId,
  selectIsMyTurn,
  selectLocalHand,
  selectOpponentHandSize,
  selectOpponents,
} from '@engine/selectors';
import {
  communalZoneId,
  type CardFace,
  type CardInstance,
  type CardId,
} from '@engine/types';
import { getGameRules, sevensRunLayout, type GameAction, type GameActionSpec } from '@engine/rules';
import { alpha, colors, fonts, fontSizes, letterSpacing, motion, radii, shadow, space } from '@theme';

const SEVENS_SUIT_GLYPHS: Record<string, string> = {
  hearts: '♥',
  diamonds: '♦',
  spades: '♠',
  clubs: '♣',
};

/** Spec 2.8: played cards snake out at 90ms per card. */
const SEVENS_SNAKE_STAGGER_MS = 90;

interface SevensTableProps {
  active: boolean;
  topInset: number;
  bottomInset: number;
}

/**
 * Sevens (Fan Tan) per-game animation pass (spec 2.8):
 * - Seven opens: the first card deals to the centre with a ring pulse.
 * - Runs: played cards snake out left/right at 90ms per card.
 * - Pass: a chip slides to the next player.
 * - Card-based plays are drag & drop (hold + drag to the run board) with
 *   the action rail kept as the accessibility fallback.
 */
export function SevensTable({ active, topInset, bottomInset }: SevensTableProps) {
  const { width: viewportWidth } = useWindowDimensions();
  const compactLayout = viewportWidth <= 480;
  const { haptic, reduceMotion } = useMotion();
  const setViewMode = useUiStore((s) => s.setViewMode);

  const state = useGameStore((s) => s.state);
  const events = useGameStore((s) => s.events);
  const replaySession = useGameStore((s) => s.replaySession);
  const gameAction = useGameStore((s) => s.gameAction);
  const { viewerId, isRemoteGuest: isGuest, lobbySession } = useTableSession(state);

  const { batch } = useGameFxB(viewerId);
  const surfaceStyle = useLayerSurfaceEntrance(active);

  const rules = useMemo(() => getGameRules(state.config.presetId), [state.config.presetId]);
  const ruleActions = useMemo<GameActionSpec[]>(
    () => (viewerId ? rules.actions(state, viewerId) : []),
    [rules, state, viewerId],
  );
  const localHand = useMemo(
    () => (viewerId ? selectLocalHand(state, viewerId) : []),
    [state, viewerId],
  );
  const opponents = useMemo(
    () => (viewerId ? selectOpponents(state, viewerId) : []),
    [state, viewerId],
  );
  const currentPlayerId = useMemo(() => selectCurrentPlayerId(state), [state]);
  const isMyTurn = useMemo(
    () => (viewerId ? selectIsMyTurn(state, viewerId) : false),
    [state, viewerId],
  );

  const communityCards = useMemo(
    () => state.zones[communalZoneId(0)]?.cardIds ?? [],
    [state],
  );
  const currentPlayerName = useMemo(() => {
    const p = state.players.find((pl) => pl.id === currentPlayerId);
    return p?.name ?? '';
  }, [state.players, currentPlayerId]);

  const faceFor = useCallback(
    (card: CardInstance): CardFace => selectCardFace(state, card.id, viewerId),
    [state, viewerId],
  );

  const handleGameAction = useCallback(
    (action: GameAction) => {
      if (!viewerId) return;
      if (isGuest) {
        if (lobbySession) {
          void lobbySession.sendIntent('game_action', { action });
        }
        return;
      }
      haptic('medium');
      const ok = gameAction(action, viewerId);
      if (!ok) haptic('error');
    },
    [viewerId, isGuest, lobbySession, haptic, gameAction],
  );

  const handleBackToHub = useCallback(() => {
    haptic('light');
    setViewMode('hub');
  }, [haptic, setViewMode]);

  // --- Choreography triggers ---
  const playedCount = communityCards.length;
  const prevPlayedCount = useRef(0);
  const [lastPlayKey, setLastPlayKey] = useState<string | null>(null);
  const [lastPlayIsSeven, setLastPlayIsSeven] = useState(false);

  // Track the most recent played card id (the last card in the communal zone).
  const lastPlayedCardId = playedCount > 0 ? communityCards[playedCount - 1]! : null;

  useEffect(() => {
    if (playedCount === prevPlayedCount.current) return;
    const grew = playedCount > prevPlayedCount.current;
    prevPlayedCount.current = playedCount;
    if (grew && lastPlayedCardId) {
      setLastPlayKey(`play-${lastPlayedCardId}-${playedCount}`);
      const parsed = parseCardId(lastPlayedCardId);
      setLastPlayIsSeven(parsed?.rank === '7');
    }
  }, [playedCount, lastPlayedCardId]);

  // Ring pulse on the opening seven (and every seven played).
  const ringTrigger = useToggleTriggerB(lastPlayIsSeven && lastPlayKey !== null);
  // Snake entrance keyed by the latest play.
  const snakeTrigger = lastPlayKey;

  // Pass chip slide: from the viewer's hand area toward the next player.
  const passTrigger = batch?.kind === 'pass' ? batch.key : null;
  const [chipFrom, setChipFrom] = useState({ x: 0, y: 0 });
  const [chipTo, setChipTo] = useState({ x: 0, y: 0 });
  const boardRef = useRef<View>(null);
  const boardDropRef = useRef<View>(null);

  const onBoardLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    boardRef.current?.measureInWindow((x, y) => {
      setChipFrom({ x: x + width / 2, y: y + height - 8 });
      setChipTo({ x: x + width / 2, y: y + 8 });
    });
  }, []);

  // --- Drag & drop: playable cards lift and drop onto the run board ---
  const dragSpecs = useMemo(() => {
    if (!viewerId || !isMyTurn) return new Map<CardId, GameActionSpec>();
    const map = new Map<CardId, GameActionSpec>();
    for (const spec of ruleActions) {
      if (spec.canDrag && spec.id.startsWith('play:')) {
        const cardId = spec.id.slice('play:'.length);
        map.set(cardId, spec);
      }
    }
    return map;
  }, [ruleActions, viewerId, isMyTurn]);

  // Card placement is now a physical drag. Keep only non-card actions in the
  // rail so the UI does not fall back to a row of PLAY buttons.
  const railActions = useMemo(
    () => ruleActions.filter((spec) => !spec.id.startsWith('play:')),
    [ruleActions],
  );
  const playableCardIds = useMemo(
    () => new Set<CardId>(dragSpecs.keys()),
    [dragSpecs],
  );

  const [boardRect, setBoardRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const onBoardMeasure = useCallback(() => {
    boardDropRef.current?.measureInWindow((x, y, width, height) => {
      setBoardRect({ x, y, width, height });
    });
  }, []);

  const dropTargets = useMemo(() => {
    if (!boardRect) return [];
    return [{
      id: communalZoneId(0),
      label: 'Play to the runs',
      x: boardRect.x,
      y: boardRect.y,
      width: boardRect.width,
      height: boardRect.height,
    }];
  }, [boardRect]);

  const handleDrop = useCallback(
    (cardId: string) => {
      const spec = dragSpecs.get(cardId);
      if (!spec) return;
      handleGameAction(spec.id);
    },
    [dragSpecs, handleGameAction],
  );

  const hasSession = events.length > 0 && state.phase !== 'idle';
  if (!hasSession) return null;

  const readout = rules.readout?.(state, viewerId ?? '') ?? null;
  const handLocked = state.privacySeat !== null;

  return (
    <Animated.View
      pointerEvents={active ? 'auto' : 'none'}
      style={[styles.root, { bottom: bottomInset }, surfaceStyle]}
    >
      <TableShell
        title="SEVENS"
        active={active}
        onBackToHub={handleBackToHub}
        topInset={topInset}
        bottomInset={0}
      >

      {/* Opponents */}
      <View style={styles.opponents}>
        {opponents.map((opp) => {
          const handSize = selectOpponentHandSize(state, opp.id);
          return (
            <View key={opp.id} style={styles.opponent}>
              <AvatarPlaceholder seed={opp.avatarSeed} label={opp.name} size={56} />
              <View style={styles.countPill}>
                <Text style={styles.countText}>
                  {handSize} {handSize === 1 ? 'CARD' : 'CARDS'}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Run board */}
      <View
        ref={boardRef}
        style={[styles.table, compactLayout && styles.tableCompact]}
        onLayout={onBoardLayout}
        collapsable={false}
      >
        <View
          ref={boardDropRef}
          style={[styles.boardDropZone, compactLayout && styles.boardDropZoneCompact]}
          onLayout={onBoardMeasure}
          collapsable={false}
        >
          {isMyTurn && dragSpecs.size > 0 && (
            <Text style={styles.dropHint}>DROP A CARD TO BUILD THE RUNS</Text>
          )}
          <SevensRunsB
            tableCardIds={communityCards}
            state={state}
            reduceMotion={reduceMotion}
            snakeTrigger={snakeTrigger}
            snakeStaggerMs={SEVENS_SNAKE_STAGGER_MS}
          />
          {!!lastPlayKey && (
            <RingPulseB
              reduceMotion={reduceMotion}
              trigger={ringTrigger}
              style={styles.ringOverlay}
            />
          )}
        </View>
        <ChipSlideB
          reduceMotion={reduceMotion}
          trigger={passTrigger}
          from={chipFrom}
          to={chipTo}
        />
      </View>

      {/* Ended banner */}
      {state.phase === 'ended' && (
        <View style={styles.endedBanner} pointerEvents="box-none">
          <View style={styles.endedCard}>
            <Text style={styles.endedEyebrow}>SESSION OVER</Text>
            <Text style={styles.endedTitle}>
              {state.winnerId === viewerId
                ? 'You play out first'
                : `${state.players.find((p) => p.id === state.winnerId)?.name ?? 'Winner'} plays out first`}
            </Text>
            <Text style={styles.endedMeta}>
              Round complete · {state.turn} {state.turn === 1 ? 'turn' : 'turns'}
            </Text>
            <View style={styles.endedActions}>
              <CardButton
                variant="primary"
                size="md"
                haptic="medium"
                onPress={replaySession}
                style={styles.endedCta}
              >
                <Text style={styles.endedCtaText}>Replay table</Text>
              </CardButton>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to setup"
                onPress={handleBackToHub}
                style={({ pressed }) => [styles.endedSecondary, pressed && styles.endedSecondaryPressed]}
              >
                <Text style={styles.endedSecondaryText}>Back to setup</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Non-card decisions remain available as an accessibility fallback. */}
      {state.phase !== 'ended' && (
        <View style={[styles.actionBar, { marginBottom: bottomInset > 0 ? 0 : space.lg }]}>
          {railActions.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.ruleActionsScroll}
            contentContainerStyle={styles.ruleActions}
          >
            {railActions.map((spec) => (
              <CardButton
                key={spec.id}
                variant="primary"
                size="sm"
                haptic="medium"
                onPress={() => handleGameAction(spec.id)}
                style={styles.ruleActionBtn}
                innerStyle={styles.ruleActionInner}
              >
                <Text style={styles.ruleActionText} numberOfLines={1}>
                  {spec.label}
                </Text>
              </CardButton>
            ))}
          </ScrollView>
          ) : (
          <View style={styles.ruleWaiting}>
            <Text style={styles.ruleWaitingText}>
              {isMyTurn && dragSpecs.size > 0
                ? 'DRAG A CARD TO THE RUNS'
                : isMyTurn
                  ? 'NO LEGAL CARD · PASS'
                  : `${currentPlayerName.toUpperCase()} · TO PLAY`}
            </Text>
          </View>
          )}
        </View>
      )}

      {/* Local hand with drag handles */}
      <View style={[styles.hand, { paddingBottom: bottomInset + space.lg }]}>
        {handLocked ? (
          <View style={styles.hiddenHand}>
            <Text style={styles.hiddenText}>HAND LOCKED — REVEAL TO CONTINUE</Text>
          </View>
        ) : (
          <CardDragHand
            cards={localHand}
            playableCardIds={playableCardIds}
            faceFor={faceFor}
            dropTargets={dropTargets}
            disabled={!isMyTurn}
            onDrop={handleDrop}
            size="md"
            testID="sevens-card-hand"
          />
        )}
        <Text style={styles.handHint} accessibilityRole="text">
          {isMyTurn
            ? 'Hold a playable card, then drag it into the matching run'
            : `Waiting for ${currentPlayerName || 'the next player'} · watch the runs grow`}
        </Text>
        {!!readout && (
          <View style={styles.valuePill}>
            <Text style={styles.valuePillText}>{readout}</Text>
          </View>
        )}
      </View>

      </TableShell>
    </Animated.View>
  );
}

/**
 * The four suit runs. Each newly played card snakes in from the deck line
 * at 90ms per card (spec 2.8); reduced motion = plain fade.
 */
function SevensRunsB({
  tableCardIds,
  state,
  reduceMotion,
  snakeTrigger,
  snakeStaggerMs,
}: {
  tableCardIds: string[];
  state: import('@engine/types').GameState;
  reduceMotion: boolean;
  snakeTrigger: string | null;
  snakeStaggerMs: number;
}) {
  const runs = useMemo(() => sevensRunLayout(tableCardIds), [tableCardIds]);
  const played = tableCardIds.length;
  if (played === 0) return null;

  return (
    <View
      style={styles.sevensBoard}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${played} cards played across four suit runs`}
    >
      {runs.map((run) => {
        const glyph = SEVENS_SUIT_GLYPHS[run.suit] ?? run.suit;
        return (
          <View key={run.suit} style={styles.sevensLane}>
            <Text style={styles.sevensLaneSuit}>{glyph}</Text>
            <View style={styles.sevensLaneCards}>
              {run.cardIds.length === 0 ? (
                <Text style={styles.sevensLaneEmpty}>—</Text>
              ) : (
                run.cardIds.map((cid, index) => {
                  const card = state.cards[cid];
                  if (!card) return null;
                  const isNewest = snakeTrigger !== null && cid === tableCardIds[tableCardIds.length - 1];
                  return (
                    <SnakeCard
                      key={cid}
                      card={card}
                      reduceMotion={reduceMotion}
                      delay={isNewest ? index * snakeStaggerMs : 0}
                    />
                  );
                })
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function SnakeCard({
  card,
  reduceMotion,
  delay,
}: {
  card: CardInstance;
  reduceMotion: boolean;
  delay: number;
}) {
  const parsed = parseCardId(card.id);
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const translateX = useSharedValue(reduceMotion ? 0 : -14);
  const translateY = useSharedValue(reduceMotion ? 0 : -10);
  const scale = useSharedValue(reduceMotion ? 1 : 0.94);

  useEffect(() => {
    cancelAnimation(opacity);
    cancelAnimation(translateX);
    cancelAnimation(translateY);
    cancelAnimation(scale);
    if (reduceMotion) {
      opacity.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      scale.value = 1;
      return;
    }
    opacity.value = 0;
    translateX.value = -14;
    translateY.value = -10;
    scale.value = 0.94;
    opacity.value = withDelay(delay, withTiming(1, { duration: motion.duration.base }));
    translateX.value = withDelay(delay, withSpring(0, motion.spring.card));
    translateY.value = withDelay(delay, withSpring(0, motion.spring.card));
    scale.value = withDelay(delay, withSpring(1, motion.spring.card));
  }, [card.id, delay, opacity, reduceMotion, scale, translateX, translateY]);

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: reduceMotion
      ? []
      : [
          { translateX: translateX.value },
          { translateY: translateY.value },
          { scale: scale.value },
        ],
  }));

  if (!parsed) return null;
  return (
    <Animated.View style={entranceStyle}>
      <PlayingCard rank={parsed.rank} suit={parsed.suit} face={card.face} size="xs" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    flexDirection: 'column',
  },

  opponents: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
    paddingTop: space.lg,
    gap: space.xxl,
  },
  opponent: {
    alignItems: 'center',
  },
  countPill: {
    marginTop: space.xs,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  countText: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.inkMuted,
    letterSpacing: letterSpacing.cap,
  },
  table: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 760,
    paddingHorizontal: space.xl,
    minHeight: 0,
  },
  tableCompact: {
    flex: 1,
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 96,
    justifyContent: 'flex-start',
  },
  boardDropZone: {
    position: 'relative',
    width: '100%',
    minHeight: 154,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: alpha.brand45,
    borderRadius: radii.lg,
    backgroundColor: alpha.brand10,
  },
  boardDropZoneCompact: {
    minHeight: 96,
  },
  dropHint: {
    position: 'absolute',
    top: space.sm,
    left: space.md,
    right: space.md,
    textAlign: 'center',
    fontSize: fontSizes.micro,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: letterSpacing.cap,
  },
  ringOverlay: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 120,
    height: 120,
    marginLeft: -60,
    marginTop: -60,
  },
  sevensBoard: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: space.sm,
    width: '100%',
    paddingHorizontal: space.md,
  },
  sevensLane: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 22,
  },
  sevensLaneSuit: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    width: 16,
    textAlign: 'center',
  },
  sevensLaneCards: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
    minHeight: 22,
  },
  sevensLaneEmpty: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: alpha.inkOverlay20,
  },
  endedBanner: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '30%',
    alignItems: 'center',
    zIndex: 50,
  },
  endedCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: space.xxl,
    paddingVertical: space.xl,
    alignItems: 'center',
    ...shadow.ctaLift,
  },
  endedEyebrow: {
    fontSize: fontSizes.micro,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: letterSpacing.caps,
    marginBottom: space.xs,
  },
  endedTitle: {
    fontSize: fontSizes.h3,
    fontFamily: fonts.extra,
    color: colors.ink,
    textAlign: 'center',
    marginBottom: space.lg,
  },
  endedMeta: {
    marginBottom: space.md,
    fontSize: fontSizes.caption,
    fontFamily: fonts.semibold,
    color: colors.inkMuted,
    letterSpacing: letterSpacing.cap,
    textTransform: 'uppercase',
  },
  endedActions: {
    alignSelf: 'stretch',
    gap: space.xs,
  },
  endedCta: {
    alignSelf: 'stretch',
  },
  endedCtaText: {
    color: colors.surface,
    fontSize: fontSizes.small + 1,
    fontFamily: fonts.bold,
  },
  endedSecondary: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  endedSecondaryPressed: {
    backgroundColor: alpha.inkOverlay06,
  },
  endedSecondaryText: {
    fontSize: fontSizes.small,
    fontFamily: fonts.semibold,
    color: colors.inkMuted,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: 760,
    paddingHorizontal: space.md,
    gap: space.md,
    paddingTop: space.md,
  },
  ruleActionsScroll: {
    flexShrink: 1,
    flexGrow: 0,
    maxWidth: '100%',
  },
  ruleActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.xs,
  },
  ruleActionBtn: {
    flexShrink: 0,
    minWidth: 0,
  },
  ruleActionInner: {
    paddingHorizontal: space.sm,
  },
  ruleActionText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.caption,
    letterSpacing: letterSpacing.cap,
    color: colors.surface,
  },
  ruleWaiting: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  ruleWaitingText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.micro,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.cap,
  },

  hand: {
    justifyContent: 'center',
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    minHeight: 184,
  },
  handHint: {
    marginTop: space.sm,
    textAlign: 'center',
    fontSize: fontSizes.micro,
    fontFamily: fonts.medium,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.cap,
    paddingHorizontal: space.xl,
  },
  valuePill: {
    alignSelf: 'center',
    marginTop: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.brand,
  },
  valuePillText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.caption,
    letterSpacing: letterSpacing.cap,
    color: colors.surface,
  },
  hiddenHand: {
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha.inkOverlay06,
    borderRadius: radii.lg,
    marginHorizontal: space.xl,
  },
  hiddenText: {
    fontSize: fontSizes.micro,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.caps,
  },
});

export default SevensTable;
