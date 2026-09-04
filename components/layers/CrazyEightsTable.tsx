import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
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
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { AvatarPlaceholder } from '@components/AvatarPlaceholder';
import { CardButton } from '@components/CardButton';
import { CardDragHand } from '@components/CardDragHand';
import { PlayingCard, SIZE_MAP } from '@components/PlayingCard';
import { ZoneWell } from '@components/ZoneWell';
import { TableShell } from '@components/table/TableShell';
import { useTableSession } from '@components/table/useTableSession';
import { useLayerSurfaceEntrance } from '@hooks/useLayerSurfaceEntrance';
import { useMotion } from '@hooks/useMotion';
import { useCosmeticsStore } from '@store/cosmeticsStore';
import { useGameStore } from '@store/gameStore';
import { useUiStore } from '@store/uiStore';
import {
  parseCardId,
  selectCardFace,
  selectCurrentPlayerId,
  selectIsMyTurn,
  selectLocalHand,
  selectOpponentHandSize,
  selectOpponents,
} from '@engine/selectors';
import { ZONE_DISCARD, ZONE_DRAW, type CardFace, type CardId, type CardInstance } from '@engine/types';
import { getGameRules, type GameAction, type GameActionSpec } from '@engine/rules';
import { alpha, colors, fonts, fontSizes, letterSpacing, motion, radii, shadow, space } from '@theme';

interface CrazyEightsTableProps {
  active: boolean;
  topInset: number;
  bottomInset: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Crazy Eights is deliberately its own surface. Playing a card is a physical
 * action: hold a legal card, lift it, drag it into the discard well, release.
 * The draw pile is the only direct action object. There is no PLAY button rail.
 */
export function CrazyEightsTable({ active, topInset, bottomInset }: CrazyEightsTableProps) {
  const { width: viewportWidth } = useWindowDimensions();
  const compact = viewportWidth <= 480;
  const { haptic, reduceMotion } = useMotion();
  const surfaceStyle = useLayerSurfaceEntrance(active);
  const setViewMode = useUiStore((s) => s.setViewMode);
  const equippedBackId = useCosmeticsStore((s) => s.equippedBackId);

  const state = useGameStore((s) => s.state);
  const events = useGameStore((s) => s.events);
  const gameAction = useGameStore((s) => s.gameAction);
  const replaySession = useGameStore((s) => s.replaySession);

  const {
    viewerId,
    isRemoteGuest: isGuest,
    lobbySession,
  } = useTableSession(state);

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
  const drawCount = state.zones[ZONE_DRAW]?.cardIds.length ?? 0;
  const discardCardId = state.zones[ZONE_DISCARD]?.cardIds.at(-1) ?? null;
  const discardCard = discardCardId ? state.cards[discardCardId] : null;
  const hasSession = events.length > 0 && state.phase !== 'idle';
  const handLocked = state.privacySeat !== null;

  const faceFor = useCallback(
    (card: CardInstance): CardFace => selectCardFace(state, card.id, viewerId),
    [state, viewerId],
  );

  const handleGameAction = useCallback(
    (action: GameAction) => {
      if (!viewerId) return;
      if (isGuest) {
        if (lobbySession) void lobbySession.sendIntent('game_action', { action });
        return;
      }
      haptic('medium');
      const ok = gameAction(action, viewerId);
      if (!ok) haptic('error');
    },
    [gameAction, haptic, isGuest, lobbySession, viewerId],
  );

  const handleDraw = useCallback(() => {
    if (!isMyTurn || drawCount === 0 || ruleActions.some((spec) => spec.id.startsWith('play:'))) return;
    handleGameAction('draw');
  }, [drawCount, handleGameAction, isMyTurn, ruleActions]);

  const handleBackToHub = useCallback(() => {
    haptic('light');
    setViewMode('hub');
  }, [haptic, setViewMode]);

  const discardRef = useRef<View>(null);
  const [discardRect, setDiscardRect] = useState<Rect | null>(null);
  const measureDiscard = useCallback(() => {
    discardRef.current?.measureInWindow((x, y, width, height) => {
      setDiscardRect({ x, y, width, height });
    });
  }, []);
  const handleDiscardLayout = useCallback((_event: LayoutChangeEvent) => {
    requestAnimationFrame(measureDiscard);
  }, [measureDiscard]);

  const dragSpecs = useMemo(() => {
    const map = new Map<CardId, GameActionSpec>();
    if (!viewerId || !isMyTurn) return map;
    for (const spec of ruleActions) {
      if (spec.id.startsWith('play:')) map.set(spec.id.slice('play:'.length) as CardId, spec);
    }
    return map;
  }, [isMyTurn, ruleActions, viewerId]);
  const playableCardIds = useMemo(() => new Set<CardId>(dragSpecs.keys()), [dragSpecs]);
  const dropTargets = useMemo(
    () => discardRect && dragSpecs.size > 0
      ? [{
          id: ZONE_DISCARD,
          label: 'Drop on the discard',
          x: discardRect.x,
          y: discardRect.y,
          width: discardRect.width,
          height: discardRect.height,
        }]
      : [],
    [discardRect, dragSpecs.size],
  );
  const handleDrop = useCallback(
    (cardId: CardId, targetId: string) => {
      if (targetId !== ZONE_DISCARD) return;
      const spec = dragSpecs.get(cardId);
      if (spec) handleGameAction(spec.id);
    },
    [dragSpecs, handleGameAction],
  );

  const drawScale = useSharedValue(1);
  const discardEntry = useSharedValue(1);
  const discardScale = useSharedValue(1);
  const discardOpacity = useSharedValue(1);
  const previousDiscard = useRef(discardCardId);

  useEffect(() => {
    if (discardCardId === previousDiscard.current) return;
    previousDiscard.current = discardCardId;
    cancelAnimation(discardEntry);
    cancelAnimation(discardScale);
    cancelAnimation(discardOpacity);
    if (reduceMotion) {
      discardEntry.value = 1;
      discardScale.value = 1;
      discardOpacity.value = withTiming(1, { duration: motion.duration.fast });
      return;
    }
    discardEntry.value = 0;
    discardScale.value = 0.94;
    discardOpacity.value = 0;
    discardEntry.value = withSpring(1, motion.spring.card);
    discardScale.value = withSequence(
      withSpring(1.04, motion.spring.card),
      withSpring(1, motion.spring.card),
    );
    discardOpacity.value = withTiming(1, { duration: motion.duration.fast });
  }, [discardCardId, discardEntry, discardOpacity, discardScale, reduceMotion]);

  const discardMotionStyle = useAnimatedStyle(() => ({
    opacity: discardOpacity.value,
    transform: reduceMotion
      ? []
      : [{ translateY: (1 - discardEntry.value) * -18 }, { scale: discardScale.value }],
  }));
  const drawMotionStyle = useAnimatedStyle(() => ({
    transform: reduceMotion ? [] : [{ scale: drawScale.value }],
  }));
  const drawPressIn = useCallback(() => {
    if (!reduceMotion) drawScale.set(withSpring(0.95, motion.spring.press));
  }, [drawScale, reduceMotion]);
  const drawPressOut = useCallback(() => {
    drawScale.set(withSpring(1, motion.spring.press));
  }, [drawScale]);

  if (!hasSession || !viewerId) return null;

  const readout = rules.readout?.(state, viewerId) ?? `HAND ${localHand.length} · DRAW ${drawCount}`;
  const canDraw = isMyTurn && drawCount > 0 && dragSpecs.size === 0 && ruleActions.some((spec) => spec.id === 'draw');
  return (
    <Animated.View
      pointerEvents={active ? 'auto' : 'none'}
      style={[styles.root, { bottom: bottomInset }, surfaceStyle]}
    >
      <TableShell
        title="CRAZY EIGHTS"
        active={active}
        topInset={topInset}
        bottomInset={0}
        onBackToHub={handleBackToHub}
      >
        <View style={styles.opponents}>
          {opponents.map((opponent) => {
            const handSize = selectOpponentHandSize(state, opponent.id);
            const activeOpponent = currentPlayerId === opponent.id;
            return (
              <View key={opponent.id} style={[styles.opponent, activeOpponent && styles.opponentActive]}>
                <AvatarPlaceholder seed={opponent.avatarSeed} label={opponent.name} size={compact ? 38 : 48} />
                <Text style={styles.opponentName} numberOfLines={1}>{opponent.name}</Text>
                <Text style={styles.opponentCount}>{handSize} {handSize === 1 ? 'CARD' : 'CARDS'}</Text>
              </View>
            );
          })}
        </View>

        <View style={[styles.table, compact && styles.tableCompact]}>
          <View style={styles.playArea}>
            <Animated.View style={[styles.drawObject, drawMotionStyle]}>
              <Pressable
                disabled={!canDraw}
                onPress={handleDraw}
                onPressIn={drawPressIn}
                onPressOut={drawPressOut}
                accessibilityRole="button"
                accessibilityLabel={`Draw pile, ${drawCount} cards left`}
                accessibilityHint={canDraw ? 'Tap to draw a card.' : 'The draw pile is not available right now.'}
                style={[styles.drawPressTarget, !canDraw && styles.disabledObject]}
              >
                <View style={styles.deckStackBack}>
                  <PlayingCard face="down" size={compact ? 'md' : 'lg'} back={equippedBackId} />
                  <View style={styles.deckOffsetCard} />
                </View>
                <Text style={styles.drawCount}>{drawCount} LEFT</Text>
                <Text style={styles.objectLabel}>{canDraw ? 'DRAW' : 'DRAW PILE'}</Text>
              </Pressable>
            </Animated.View>

            <View
              ref={discardRef}
              collapsable={false}
              onLayout={handleDiscardLayout}
              style={[styles.discardTarget, compact && styles.discardTargetCompact, dragSpecs.size > 0 && styles.discardReady]}
              accessible
              accessibilityRole="text"
              accessibilityLabel={dragSpecs.size > 0 ? 'Discard target. Drop a playable card here.' : 'Discard pile'}
            >
              {discardCard ? (
                <Animated.View style={discardMotionStyle}>
                  <DiscardCard card={discardCard} faceFor={faceFor} back={equippedBackId} compact={compact} />
                </Animated.View>
              ) : (
                <ZoneWell
                  width={(compact ? SIZE_MAP.md.width : SIZE_MAP.lg.width) + space.md}
                  height={(compact ? SIZE_MAP.md.height : SIZE_MAP.lg.height) + space.md}
                  label="DISCARD"
                  hint="DROP HERE"
                  active={dragSpecs.size > 0}
                />
              )}
              {dragSpecs.size > 0 && <Text style={styles.dropLabel}>DROP TO PLAY</Text>}
            </View>
          </View>
          <View style={styles.ruleLine}>
            <Text style={styles.ruleLineText}>Match suit or rank</Text>
            <Text style={styles.ruleLineAccent}>EIGHTS ARE WILD</Text>
          </View>
          <View style={styles.readoutPill}>
            <Text style={styles.readoutText}>{readout}</Text>
          </View>
        </View>

        <View style={styles.hand}>
          {handLocked ? (
            <View style={styles.hiddenHand}>
              <Text style={styles.hiddenText}>HAND LOCKED · REVEAL TO CONTINUE</Text>
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
              fan
              testID="crazy-eights-card-hand"
            />
          )}
        </View>

        {state.phase === 'ended' && (
          <View style={styles.endedOverlay} pointerEvents="box-none">
            <View style={styles.endedCard}>
              <Text style={styles.endedEyebrow}>SESSION OVER</Text>
              <Text style={styles.endedTitle}>
                {state.winnerId === viewerId
                  ? 'You played out first'
                  : `${state.players.find((player) => player.id === state.winnerId)?.name ?? 'Winner'} played out first`}
              </Text>
              <Text style={styles.endedMeta}>Round complete · {state.turn} {state.turn === 1 ? 'turn' : 'turns'}</Text>
              <CardButton variant="primary" size="md" haptic="medium" onPress={replaySession} style={styles.endedCta}>
                <Text style={styles.endedCtaText}>Replay table</Text>
              </CardButton>
              <Pressable onPress={handleBackToHub} accessibilityRole="button" accessibilityLabel="Back to setup" style={styles.endedSecondary}>
                <Text style={styles.endedSecondaryText}>Back to setup</Text>
              </Pressable>
            </View>
          </View>
        )}
      </TableShell>
    </Animated.View>
  );
}


function DiscardCard({
  card,
  faceFor,
  back,
  compact,
}: {
  card: CardInstance;
  faceFor: (card: CardInstance) => CardFace;
  back: string;
  compact: boolean;
}) {
  const parsed = parseCardId(card.id);
  if (!parsed) return <PlayingCard face="down" size={compact ? 'md' : 'lg'} back={back} />;
  return <PlayingCard rank={parsed.rank} suit={parsed.suit} face={faceFor(card)} size={compact ? 'md' : 'lg'} elevated />;
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  opponents: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.lg,
    minHeight: 70,
    paddingTop: space.sm,
    paddingHorizontal: space.lg,
  },
  opponent: {
    minWidth: 58,
    alignItems: 'center',
    opacity: 0.68,
  },
  opponentActive: {
    opacity: 1,
  },
  opponentName: {
    maxWidth: 78,
    marginTop: 2,
    fontSize: fontSizes.micro,
    fontFamily: fonts.semibold,
    color: colors.inkMuted,
  },
  opponentCount: {
    marginTop: 1,
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.cap,
  },
  table: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    minHeight: 0,
  },
  tableCompact: {
    paddingTop: space.xs,
    paddingBottom: space.xs,
  },
  tableTitle: {
    marginTop: 2,
    marginBottom: space.sm,
    fontSize: fontSizes.h3,
    fontFamily: fonts.extra,
    color: colors.ink,
  },
  playArea: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    width: '100%',
    maxWidth: 420,
  },
  drawObject: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawPressTarget: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 104,
    minHeight: 154,
  },
  deckStackBack: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deckOffsetCard: {
    position: 'absolute',
    width: 78,
    height: 110,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: alpha.brand30,
    backgroundColor: alpha.brand10,
    transform: [{ translateX: 6 }, { translateY: 6 }, { rotate: '4deg' }],
    zIndex: -1,
  },
  disabledObject: {
    opacity: 0.6,
  },
  drawCount: {
    marginTop: -space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.ink,
    color: colors.surface,
    fontSize: 9,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.cap,
  },
  objectLabel: {
    marginTop: space.xs,
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.cap,
  },
  discardTarget: {
    width: SIZE_MAP.lg.width + space.md,
    height: SIZE_MAP.lg.height + space.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
  },
  discardTargetCompact: {
    width: SIZE_MAP.md.width + space.md,
    height: SIZE_MAP.md.height + space.md,
  },
  discardReady: {
    borderWidth: 1,
    borderColor: colors.brand,
    backgroundColor: alpha.brand10,
  },
  dropLabel: {
    position: 'absolute',
    bottom: -18,
    fontSize: 8,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: letterSpacing.cap,
  },
  ruleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.md,
  },
  ruleLineText: {
    fontSize: fontSizes.micro,
    fontFamily: fonts.medium,
    color: colors.inkSubtle,
  },
  ruleLineAccent: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: letterSpacing.cap,
  },
  readoutPill: {
    marginTop: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.brand,
  },
  readoutText: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.surface,
    letterSpacing: letterSpacing.cap,
  },
  hand: {
    width: '100%',
    minHeight: 178,
    paddingTop: space.xs,
    paddingHorizontal: space.xs,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  hiddenHand: {
    height: 132,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
    backgroundColor: alpha.inkOverlay06,
  },
  hiddenText: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.caps,
  },
  endedOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '24%',
    alignItems: 'center',
    zIndex: 50,
  },
  endedCard: {
    width: '86%',
    maxWidth: 360,
    alignItems: 'center',
    padding: space.xl,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    ...shadow.ctaLift,
  },
  endedEyebrow: {
    fontSize: fontSizes.micro,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: letterSpacing.caps,
  },
  endedTitle: {
    marginTop: space.xs,
    marginBottom: space.md,
    fontSize: fontSizes.h3,
    fontFamily: fonts.extra,
    color: colors.ink,
    textAlign: 'center',
  },
  endedMeta: {
    marginBottom: space.md,
    fontSize: fontSizes.micro,
    fontFamily: fonts.semibold,
    color: colors.inkMuted,
  },
  endedCta: {
    alignSelf: 'stretch',
  },
  endedCtaText: {
    color: colors.surface,
    fontFamily: fonts.bold,
    fontSize: fontSizes.body,
  },
  endedSecondary: {
    minHeight: 44,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  endedSecondaryText: {
    fontSize: fontSizes.small,
    fontFamily: fonts.semibold,
    color: colors.inkMuted,
  },
});

export default CrazyEightsTable;
