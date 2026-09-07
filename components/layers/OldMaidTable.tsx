import React, { useCallback, useEffect, useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { AvatarPlaceholder } from '@components/AvatarPlaceholder';
import { CardButton } from '@components/CardButton';
import { HandFan } from '@components/HandFan';
import { PlayingCard } from '@components/PlayingCard';
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
  parseJokerId,
  selectCardFace,
  selectCurrentPlayerId,
  selectIsMyTurn,
  selectLocalHand,
  selectOpponentHandSize,
  selectOpponents,
} from '@engine/selectors';
import {
  handZoneId,
  tableZoneId,
  type CardFace,
  type CardId,
  type CardInstance,
  type GameState,
} from '@engine/types';
import { getGameRules, type GameAction, type GameActionSpec } from '@engine/rules';
import { alpha, colors, fonts, fontSizes, letterSpacing, motion, radii, shadow, space } from '@theme';

interface OldMaidTableProps {
  active: boolean;
  topInset: number;
  bottomInset: number;
}

interface PairGroup {
  rank: string;
  cardIds: CardId[];
}

/**
 * Old Maid is a physical draw-and-pair table. Matching cards land in a felt
 * pair well, while the next player's face-down hand is the draw object. The
 * action rail is deliberately gone: cards and piles are the controls, with
 * accessible Pressable surfaces as their keyboard/screen-reader fallback.
 */
export function OldMaidTable({ active, topInset, bottomInset }: OldMaidTableProps) {
  const { width: viewportWidth } = useWindowDimensions();
  const compact = viewportWidth <= 480;
  const { haptic, reduceMotion } = useMotion();
  const surfaceStyle = useLayerSurfaceEntrance(active);
  const setViewMode = useUiStore((s) => s.setViewMode);
  const openPass = useUiStore((s) => s.openPass);
  const equippedBackId = useCosmeticsStore((s) => s.equippedBackId);

  const state = useGameStore((s) => s.state);
  const gameAction = useGameStore((s) => s.gameAction);
  const replaySession = useGameStore((s) => s.replaySession);
  const { viewerId, isRemoteGuest: isGuest, isSharedDevice, lobbySession } = useTableSession();

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
  const handLocked = state.privacySeat !== null;
  const hasSession = state.phase !== 'idle';
  const canInteract = !handLocked && state.phase === 'playing' && isMyTurn;

  const pairGroups = useMemo(() => matchingPairs(localHand.map((card) => card.id)), [localHand]);
  const pairCardIds = useMemo(
    () => new Set<CardId>(pairGroups.flatMap((pair) => pair.cardIds)),
    [pairGroups],
  );
  const pairAction = canInteract ? ruleActions.find((spec) => spec.id === 'pair') ?? null : null;
  const drawAction = canInteract ? ruleActions.find((spec) => spec.id === 'draw') ?? null : null;
  const finishAction = canInteract ? ruleActions.find((spec) => spec.id === 'end') ?? null : null;
  const targetOpponent = useMemo(
    () => opponents.find((player) => selectOpponentHandSize(state, player.id) > 0) ?? null,
    [opponents, state],
  );
  const targetHandSize = targetOpponent ? selectOpponentHandSize(state, targetOpponent.id) : 0;
  const currentPlayerName = useMemo(
    () => state.players.find((player) => player.id === currentPlayerId)?.name ?? '',
    [currentPlayerId, state.players],
  );
  const dealTrigger = state.meta.id || null;

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
      if (!ok) {
        haptic('error');
        return;
      }
      // Old Maid changes the active seat with `turn/set`, so a hot-seat
      // session still needs the same privacy hand-off as PASS TURN.
      if (isSharedDevice) {
        const nextState = useGameStore.getState().state;
        const nextPlayer = nextState.phase === 'playing'
          && nextState.currentPlayerId !== viewerId
          ? nextState.players.find((player) => player.id === nextState.currentPlayerId)
          : undefined;
        if (nextPlayer) {
          useGameStore.getState().enterPrivacy(nextPlayer.id);
          openPass({
            recipientId: nextPlayer.id,
            recipientName: nextPlayer.name,
            recipientSeed: nextPlayer.avatarSeed,
          });
        }
      }
    },
    [gameAction, haptic, isGuest, isSharedDevice, lobbySession, openPass, viewerId],
  );

  const handlePair = useCallback(() => {
    if (pairAction) handleGameAction(pairAction.id);
  }, [handleGameAction, pairAction]);

  const handleDraw = useCallback(() => {
    if (drawAction) handleGameAction(drawAction.id);
  }, [drawAction, handleGameAction]);

  const handleFinish = useCallback(() => {
    if (finishAction) handleGameAction(finishAction.id);
  }, [finishAction, handleGameAction]);

  const handleHandCardPress = useCallback(
    (cardId: CardId) => {
      if (pairAction && pairCardIds.has(cardId)) handlePair();
      else if (finishAction && parseJokerId(cardId)) handleFinish();
    },
    [finishAction, handleFinish, handlePair, pairAction, pairCardIds],
  );

  const handleBackToHub = useCallback(() => {
    haptic('light');
    setViewMode('hub');
  }, [haptic, setViewMode]);

  const actionKey = pairAction
    ? `pair-${pairGroups.length}`
    : drawAction
      ? `draw-${targetOpponent?.id ?? 'none'}-${targetHandSize}`
      : finishAction
        ? 'finish'
        : `wait-${currentPlayerId ?? 'none'}`;
  const actionScale = useSharedValue(1);
  useEffect(() => {
    cancelAnimation(actionScale);
    if (reduceMotion) {
      actionScale.value = withTiming(1, { duration: motion.duration.fast });
      return;
    }
    actionScale.value = 0.96;
    actionScale.value = withSpring(1, motion.spring.card);
  }, [actionKey, actionScale, reduceMotion]);
  const actionMotionStyle = useAnimatedStyle(() => ({
    transform: reduceMotion ? [] : [{ scale: actionScale.value }],
  }));

  if (!hasSession || !viewerId) return null;

  const readout = rules.readout?.(state, viewerId) ?? `PAIRS ${Math.floor((state.zones[tableZoneId(viewerId)]?.cardIds.length ?? 0) / 2)} · HAND ${localHand.length}`;
  const maidHolder = state.phase === 'ended' ? findMaidHolder(state) : null;
  const actionLabel = state.phase === 'ended'
    ? 'ROUND COMPLETE'
    : pairAction
      ? 'PAIR CARDS'
      : drawAction
        ? `DRAW FROM ${targetOpponent?.name.toUpperCase() ?? 'NEXT HAND'}`
        : finishAction
          ? 'FINISH WITH THE MAID'
          : `WAITING FOR ${currentPlayerName.toUpperCase() || 'THE NEXT PLAYER'}`;
  const handHint = handLocked
    ? 'HAND LOCKED · REVEAL TO CONTINUE'
    : pairAction
      ? 'Tap a highlighted pair or the pair well'
      : drawAction
        ? `Tap ${targetOpponent?.name ?? 'the next hand'} to draw one card`
        : finishAction
          ? 'The maid is the last card · tap it to finish'
          : `Waiting for ${currentPlayerName || 'the next player'} · keep your maid hidden`;

  return (
    <Animated.View
      pointerEvents={active ? 'auto' : 'none'}
      style={[styles.root, { bottom: bottomInset }, surfaceStyle]}
    >
      <TableShell
        title="OLD MAID"
        turnLabel={state.phase === 'ended' ? 'ROUND COMPLETE' : undefined}
        active={active}
        topInset={topInset}
        bottomInset={0}
        onBackToHub={handleBackToHub}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.opponentsScroll}
          contentContainerStyle={styles.opponents}
          accessibilityLabel="Opponent hands"
          testID="old-maid-opponents"
        >
          {opponents.map((opponent) => {
            const handSize = selectOpponentHandSize(state, opponent.id);
            const isTarget = targetOpponent?.id === opponent.id && drawAction !== null;
            return (
              <View key={opponent.id} style={[styles.opponent, isTarget && styles.opponentTarget]}>
                <AvatarPlaceholder seed={opponent.avatarSeed} label={opponent.name} size={compact ? 38 : 46} />
                <Text style={styles.opponentName} numberOfLines={1}>{opponent.name}</Text>
                <Text style={styles.opponentCount}>{handSize} {handSize === 1 ? 'CARD' : 'CARDS'}</Text>
              </View>
            );
          })}
        </ScrollView>

        <View testID="old-maid-table" style={[styles.table, compact && styles.tableCompact]}>
          <View style={styles.turnStrip} accessible accessibilityRole="text" accessibilityLabel={actionLabel}>
            <Text style={styles.turnEyebrow}>{state.phase === 'ended' ? 'ROUND COMPLETE' : isMyTurn ? 'YOUR TURN' : 'TABLE STATE'}</Text>
            <Text style={styles.turnLabel} numberOfLines={1}>{actionLabel}</Text>
          </View>

          <View style={[styles.objectRow, compact && styles.objectRowCompact]}>
            {finishAction ? (
              <Animated.View style={[styles.objectMotion, actionMotionStyle]}>
                <FinishObject
                  onPress={handleFinish}
                  compact={compact}
                  accessibilityLabel="Finish the round with the maid"
                />
              </Animated.View>
            ) : (
              <Animated.View style={[styles.objectMotion, actionMotionStyle]}>
                <PairObject
                  pairGroups={pairGroups}
                  state={state}
                  enabled={pairAction !== null}
                  compact={compact}
                  onPress={handlePair}
                />
              </Animated.View>
            )}

            <View style={styles.objectDivider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>THEN</Text>
              <View style={styles.dividerLine} />
            </View>

            <Animated.View style={[styles.objectMotion, actionMotionStyle]}>
              <DrawObject
                target={targetOpponent}
                count={targetHandSize}
                back={equippedBackId}
                enabled={drawAction !== null}
                compact={compact}
                onPress={handleDraw}
              />
            </Animated.View>
          </View>

          <PairStacks state={state} viewerId={viewerId} compact={compact} />

          <View style={styles.readoutPill} accessible accessibilityRole="text" accessibilityLabel={readout}>
            <Text style={styles.readoutText}>{readout}</Text>
          </View>
        </View>

        <View testID="old-maid-hand" style={styles.hand}>
          {handLocked ? (
            <View style={styles.hiddenHand}>
              <Text style={styles.hiddenText}>HAND LOCKED · REVEAL TO CONTINUE</Text>
            </View>
          ) : (
            <HandFan
              cards={localHand}
              viewerId={viewerId}
              faceFor={faceFor}
              fanStyle="wide"
              size="md"
              dealTrigger={dealTrigger}
              highlightCardIds={pairAction ? pairCardIds : undefined}
              onCardPress={isMyTurn ? handleHandCardPress : undefined}
            />
          )}
          {state.phase !== 'ended' && (
            <Text testID="old-maid-hand-hint" style={styles.handHint} accessibilityRole="text">{handHint}</Text>
          )}
        </View>

        {state.phase === 'ended' && (
          <View style={styles.endedOverlay} pointerEvents="auto">
            <View style={styles.endedCard}>
              <Text style={styles.endedEyebrow}>SESSION OVER</Text>
              <Text style={styles.endedTitle}>
                {maidHolder?.id === viewerId
                  ? 'The maid stays with you'
                  : state.winnerId === viewerId
                    ? 'You dodged the maid'
                    : maidHolder
                      ? `${maidHolder.name} keeps the maid`
                      : state.winnerId
                        ? `${state.players.find((player) => player.id === state.winnerId)?.name ?? 'Winner'} dodged the maid`
                        : 'The table is cleared'}
              </Text>
              {maidHolder && (
                <View
                  style={styles.maidReveal}
                  accessible
                  accessibilityRole="text"
                  accessibilityLabel={`The maid stays with ${maidHolder.name}`}
                >
                  <PlayingCard jokerColor="red" face="up" size="sm" />
                  <Text style={styles.maidRevealText}>
                    {maidHolder.id === viewerId ? 'YOU HOLD THE MAID' : `THE MAID STAYS WITH ${maidHolder.name.toUpperCase()}`}
                  </Text>
                </View>
              )}
              <Text style={styles.endedMeta}>
                {state.winnerId ? `${Math.floor((state.zones[tableZoneId(state.winnerId)]?.cardIds.length ?? 0) / 2)} PAIRS · ` : ''}
                Round complete · {state.turn} {state.turn === 1 ? 'turn' : 'turns'}
              </Text>
              <CardButton variant="primary" size="md" haptic="medium" onPress={replaySession} style={styles.endedCta}>
                <Text style={styles.endedCtaText}>Replay table</Text>
              </CardButton>
              <Pressable
                onPress={handleBackToHub}
                accessibilityRole="button"
                accessibilityLabel="Back to setup"
                style={({ pressed }) => [styles.endedSecondary, pressed && styles.endedSecondaryPressed]}
              >
                <Text style={styles.endedSecondaryText}>Back to setup</Text>
              </Pressable>
            </View>
          </View>
        )}
      </TableShell>
    </Animated.View>
  );
}

function matchingPairs(cardIds: CardId[]): PairGroup[] {
  const byRank = new Map<string, CardId[]>();
  for (const cardId of cardIds) {
    const parsed = parseCardId(cardId);
    if (!parsed) continue;
    const cards = byRank.get(parsed.rank) ?? [];
    cards.push(cardId);
    byRank.set(parsed.rank, cards);
  }
  return [...byRank.entries()].flatMap(([rank, ids]) => {
    const pairs: PairGroup[] = [];
    for (let index = 0; index + 1 < ids.length; index += 2) {
      pairs.push({ rank, cardIds: [ids[index]!, ids[index + 1]!] });
    }
    return pairs;
  });
}

function findMaidHolder(state: GameState) {
  return state.players.find((player) => (
    state.zones[handZoneId(player.id)]?.cardIds.some((cardId) => parseJokerId(cardId) !== null) ?? false
  )) ?? null;
}

function PairObject({
  pairGroups,
  state,
  enabled,
  compact,
  onPress,
}: {
  pairGroups: PairGroup[];
  state: GameState;
  enabled: boolean;
  compact: boolean;
  onPress: () => void;
}) {
  const previewIds = pairGroups.slice(0, compact ? 2 : 3).flatMap((pair) => pair.cardIds);
  return (
    <Pressable
      testID="old-maid-pair-object"
      accessibilityRole="button"
      accessibilityLabel={enabled ? `Pair up ${pairGroups.length} ${pairGroups.length === 1 ? 'pair' : 'pairs'}` : 'Pair well'
      }
      accessibilityHint={enabled ? 'Tap to lay down every matching pair.' : 'No matching pair is ready.'}
      disabled={!enabled}
      onPress={onPress}
      style={({ pressed }) => [styles.pairObject, enabled && styles.objectReady, pressed && styles.objectPressed, !enabled && styles.objectDisabled]}
    >
      <ZoneWell fill active={enabled} style={styles.pairWell} />
      {enabled ? (
        <View style={styles.pairPreview} pointerEvents="none">
          {previewIds.map((cardId, index) => {
            const card = state.cards[cardId];
            return card ? <CardPreview key={cardId} card={card} size="sm" style={{ marginLeft: index === 0 ? 0 : -34 }} /> : null;
          })}
        </View>
      ) : (
        <Text style={styles.emptyObjectText}>NO PAIR YET</Text>
      )}
      <Text style={styles.objectTitle}>{enabled ? 'PAIR UP' : 'PAIR WELL'}</Text>
      <Text style={styles.objectSubline}>{enabled ? `${pairGroups.length} READY` : 'MATCHED CARDS LAND HERE'}</Text>
    </Pressable>
  );
}

function DrawObject({
  target,
  count,
  back,
  enabled,
  compact,
  onPress,
}: {
  target: { id: string; name: string; avatarSeed: string } | null;
  count: number;
  back: string;
  enabled: boolean;
  compact: boolean;
  onPress: () => void;
}) {
  const name = target?.name ?? 'NEXT HAND';
  return (
    <Pressable
      testID="old-maid-draw-object"
      accessibilityRole="button"
      accessibilityLabel={enabled ? `Draw a card from ${name}` : `Waiting for ${name}`}
      accessibilityHint={enabled ? `Tap the ${name} hand to draw one card.` : 'Wait for the current turn.'}
      disabled={!enabled}
      onPress={onPress}
      style={({ pressed }) => [styles.drawObject, enabled && styles.objectReady, pressed && styles.objectPressed, !enabled && styles.objectDisabled]}
    >
      <View style={styles.targetCards} pointerEvents="none">
        <PlayingCard face="down" size={compact ? 'sm' : 'md'} back={back} style={styles.targetBackOne} />
        <PlayingCard face="down" size={compact ? 'sm' : 'md'} back={back} style={styles.targetBackTwo} />
        <View style={styles.targetCount}>
          <Text style={styles.targetCountText}>{count}</Text>
        </View>
      </View>
      <Text style={styles.objectTitle}>{enabled ? 'DRAW CARD' : 'DRAW PILE'}</Text>
      <Text style={styles.objectSubline} numberOfLines={1}>{name.toUpperCase()}</Text>
    </Pressable>
  );
}

function FinishObject({
  onPress,
  compact,
  accessibilityLabel,
}: {
  onPress: () => void;
  compact: boolean;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      testID="old-maid-finish-object"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Tap to end the round while holding the maid."
      onPress={onPress}
      style={({ pressed }) => [styles.finishObject, styles.objectReady, pressed && styles.objectPressed]}
    >
      <View pointerEvents="none">
        <PlayingCard jokerColor="red" face="up" size={compact ? 'sm' : 'md'} elevated />
      </View>
      <Text style={styles.objectTitle}>FINISH</Text>
      <Text style={styles.objectSubline}>THE MAID STAYS</Text>
    </Pressable>
  );
}

function CardPreview({ card, size, style }: { card: CardInstance; size: 'xs' | 'sm' | 'md'; style?: ViewStyle }) {
  const parsed = parseCardId(card.id);
  const joker = parseJokerId(card.id);
  if (parsed) return <PlayingCard rank={parsed.rank} suit={parsed.suit} face="up" size={size} elevated style={style} />;
  if (joker) return <PlayingCard jokerColor={joker} face="up" size={size} elevated style={style} />;
  return <PlayingCard face="down" size={size} style={style} />;
}

function PairStacks({ state, viewerId, compact }: { state: GameState; viewerId: string; compact: boolean }) {
  const rows = state.players
    .map((player) => {
      const cardIds = state.zones[tableZoneId(player.id)]?.cardIds ?? [];
      return {
        player,
        cards: cardIds.map((cardId) => state.cards[cardId]).filter((card): card is CardInstance => Boolean(card)),
      };
    })
    .filter((row) => row.cards.length > 0);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.pairStacksScroll}
      contentContainerStyle={styles.pairStacks}
      testID="old-maid-pairs"
      accessibilityLabel="Pairs on the felt"
    >
      {rows.length === 0 ? (
        <View style={styles.pairStacksEmpty} accessible accessibilityRole="text" accessibilityLabel="No pairs on the felt yet">
          <Text style={styles.pairStacksEmptyText}>PAIRS LAND HERE</Text>
        </View>
      ) : rows.map(({ player, cards }) => {
        const pairCount = Math.floor(cards.length / 2);
        return (
          <View
            key={player.id}
            style={styles.pairStack}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${player.name}, ${pairCount} PAIRS cards on the felt`}
          >
            <View style={styles.pairStackCards}>
              {cards.slice(0, compact ? 6 : 8).map((card, index) => (
                <CardPreview key={card.id} card={card} size="xs" style={{ marginLeft: index === 0 ? 0 : -7 }} />
              ))}
            </View>
            <Text style={styles.pairStackLabel} numberOfLines={1}>
              {player.id === viewerId ? 'YOU' : player.name.toUpperCase()} · {pairCount} {pairCount === 1 ? 'PAIR' : 'PAIRS'}
            </Text>
          </View>
        );
      })}
    </ScrollView>
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
  opponentsScroll: {
    flexGrow: 0,
    width: '100%',
    minHeight: 66,
  },
  opponents: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.lg,
    minWidth: '100%',
    minHeight: 66,
    paddingTop: space.sm,
    paddingHorizontal: space.lg,
  },
  opponent: {
    minWidth: 58,
    alignItems: 'center',
    opacity: 0.62,
  },
  opponentTarget: {
    opacity: 1,
  },
  opponentName: {
    maxWidth: 82,
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
    alignSelf: 'center',
    width: '100%',
    maxWidth: 640,
    paddingHorizontal: space.xl,
    minHeight: 0,
  },
  tableCompact: {
    justifyContent: 'flex-start',
    paddingTop: space.xs,
    paddingBottom: space.xs,
  },
  turnStrip: {
    alignItems: 'center',
    minHeight: 38,
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  turnEyebrow: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: letterSpacing.caps,
  },
  turnLabel: {
    marginTop: 2,
    maxWidth: 300,
    fontSize: fontSizes.small,
    fontFamily: fonts.semibold,
    color: colors.ink,
    letterSpacing: letterSpacing.cap,
  },
  objectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    width: '100%',
    maxWidth: 520,
  },
  objectRowCompact: {
    gap: space.xs,
  },
  objectMotion: {
    alignItems: 'center',
  },
  pairObject: {
    width: 156,
    minHeight: 150,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
    paddingVertical: space.xs,
  },
  drawObject: {
    width: 124,
    minHeight: 150,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
    paddingVertical: space.xs,
  },
  finishObject: {
    width: 156,
    minHeight: 150,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
    paddingVertical: space.xs,
  },
  objectReady: {
    borderWidth: 1,
    borderColor: alpha.brand45,
    backgroundColor: alpha.brand10,
  },
  objectPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.97 }],
  },
  objectDisabled: {
    opacity: 0.58,
  },
  pairWell: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 26,
    width: undefined,
    height: undefined,
  },
  pairPreview: {
    height: 86,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: space.xs,
  },
  emptyObjectText: {
    marginTop: space.md,
    fontSize: fontSizes.micro,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.cap,
  },
  targetCards: {
    position: 'relative',
    width: 90,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetBackOne: {
    position: 'absolute',
    transform: [{ translateX: -12 }, { rotate: '-7deg' }],
  },
  targetBackTwo: {
    position: 'absolute',
    transform: [{ translateX: 12 }, { rotate: '7deg' }],
  },
  targetCount: {
    position: 'absolute',
    right: 0,
    top: 0,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetCountText: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.surface,
  },
  objectTitle: {
    marginTop: space.xs,
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: letterSpacing.cap,
  },
  objectSubline: {
    marginTop: 2,
    maxWidth: 140,
    fontSize: 9,
    fontFamily: fonts.semibold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.cap,
    textAlign: 'center',
  },
  objectDivider: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    width: 30,
  },
  dividerLine: {
    width: 1,
    height: 18,
    backgroundColor: colors.borderStrong,
  },
  dividerText: {
    fontSize: 8,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.cap,
  },
  pairStacksScroll: {
    width: '100%',
    marginTop: space.sm,
    maxHeight: 48,
  },
  pairStacks: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: space.md,
    paddingHorizontal: space.sm,
    minWidth: '100%',
  },
  pairStacksEmpty: {
    minHeight: 38,
    minWidth: 180,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radii.md,
    backgroundColor: alpha.inkOverlay06,
  },
  pairStacksEmptyText: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.cap,
  },
  pairStack: {
    alignItems: 'center',
    maxWidth: 150,
  },
  pairStackCards: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  pairStackLabel: {
    marginTop: 2,
    maxWidth: 150,
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.inkMuted,
    letterSpacing: letterSpacing.cap,
    textAlign: 'center',
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
    justifyContent: 'flex-end',
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    minHeight: 190,
    paddingTop: space.xs,
    paddingBottom: space.xl,
  },
  handHint: {
    marginTop: -space.sm,
    marginBottom: space.xs,
    textAlign: 'center',
    fontSize: fontSizes.micro,
    fontFamily: fonts.medium,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.cap,
    paddingHorizontal: space.xl,
  },
  hiddenHand: {
    height: 176,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha.inkOverlay06,
    borderRadius: radii.lg,
    marginHorizontal: space.xl,
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
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
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
  maidReveal: {
    alignItems: 'center',
    gap: space.xs,
    marginBottom: space.md,
  },
  maidRevealText: {
    maxWidth: 260,
    fontSize: fontSizes.micro,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: letterSpacing.cap,
    textAlign: 'center',
  },
  endedMeta: {
    marginBottom: space.md,
    fontSize: fontSizes.micro,
    fontFamily: fonts.semibold,
    color: colors.inkMuted,
    textAlign: 'center',
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
  endedSecondaryPressed: {
    backgroundColor: alpha.inkOverlay06,
  },
  endedSecondaryText: {
    fontSize: fontSizes.small,
    fontFamily: fonts.semibold,
    color: colors.inkMuted,
  },
});

export default OldMaidTable;
