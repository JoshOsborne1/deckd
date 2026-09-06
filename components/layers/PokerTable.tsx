import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { AvatarPlaceholder } from '@components/AvatarPlaceholder';
import { CardButton } from '@components/CardButton';
import { HandFan } from '@components/HandFan';
import { HandStack } from '@components/HandStack';
import { ZoneWell } from '@components/ZoneWell';
import { PlayingCard } from '@components/PlayingCard';
import { PotPulse } from '@components/animations/GameFx';
import { TableShell } from '@components/table/TableShell';
import { useTableSession } from '@components/table/useTableSession';
import { useLayerSurfaceEntrance } from '@hooks/useLayerSurfaceEntrance';
import { useMotion } from '@hooks/useMotion';
import { useGameAnimations } from '@hooks/useGameAnimations';
import { useCosmeticsStore } from '@store/cosmeticsStore';
import { useGameStore } from '@store/gameStore';
import { useUiStore } from '@store/uiStore';
import { parseCardId, selectCardFace, selectLocalHand } from '@engine/selectors';
import { checkPokerBet } from '@engine/pokerBetting';
import { evaluatePokerHand, getGameRules, type GameAction, type GameActionSpec } from '@engine/rules';
import {
  communalZoneId,
  handZoneId,
  ZONE_MUCK,
  type CardFace,
  type CardInstance,
  type GameState,
  type PlayerId,
} from '@engine/types';
import { alpha, colors, fonts, fontSizes, letterSpacing, motion, radii, shadow, space } from '@theme';

/**
 * Poker / Hold'em per-game animation pass (spec 2.3).
 *
 * - BURN: the top card slides into the muck with a 90° rotation.
 * - FLOP: three cards fan open from the deck line — middle card first,
 *   wings 80ms later.
 * - TURN/RIVER: single cards slide in with a small settle.
 * - Showdown: hole cards flip in a 200ms cascade; the best-hand pill
 *   pulses crimson.
 * - Bet action: the pot chips pulse scale 1.04 on CALL/RAISE.
 *
 * All choreography respects reduceMotion (plain fades, no rotation arcs).
 */

interface TableProps {
  active: boolean;
  topInset: number;
  bottomInset: number;
}

const FLOP_FAN_DELAYS = [80, 0, 160];
const SHOWDOWN_CASCADE_MS = 200;

/** A community card that lands from the deck line. Flop cards fan (middle
 * first, wings 80ms later); turn/river cards slide in with a settle. */
function PokerCommunityCard({
  card,
  delay,
  reduceMotion,
}: {
  card: CardInstance;
  delay: number;
  reduceMotion: boolean;
}) {
  const parsed = parseCardId(card.id);
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const translateY = useSharedValue(reduceMotion ? 0 : -14);
  const scale = useSharedValue(reduceMotion ? 1 : 0.96);

  useEffect(() => {
    cancelAnimation(opacity);
    cancelAnimation(translateY);
    cancelAnimation(scale);
    if (reduceMotion) {
      opacity.value = withTiming(1, { duration: motion.duration.fast });
      translateY.value = 0;
      scale.value = 1;
      return;
    }
    opacity.value = 0;
    translateY.value = -14;
    scale.value = 0.96;
    opacity.value = withDelay(delay, withTiming(1, { duration: motion.duration.base }));
    translateY.value = withDelay(delay, withSpring(0, motion.spring.card));
    scale.value = withDelay(delay, withSpring(1, motion.spring.card));
  }, [card.id, delay, opacity, reduceMotion, scale, translateY]);

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: reduceMotion ? [] : [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  if (!parsed) return null;
  return (
    <Animated.View style={entranceStyle}>
      <PlayingCard rank={parsed.rank} suit={parsed.suit} face={card.face} size="xs" />
    </Animated.View>
  );
}

/** The muck pile: a proper inset zone with a visible burned-card stack. */
function MuckPile({
  count,
  burnTrigger,
  reduceMotion,
  back,
}: {
  count: number;
  burnTrigger: string | null;
  reduceMotion: boolean;
  back: string;
}) {
  const rotation = useSharedValue(0);
  const translateX = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(rotation);
    cancelAnimation(translateX);
    if (!burnTrigger || reduceMotion) {
      rotation.value = 0;
      translateX.value = 0;
      return;
    }
    rotation.value = 0;
    translateX.value = 0;
    rotation.value = withTiming(90, { duration: motion.duration.base });
    translateX.value = withTiming(6, { duration: motion.duration.base });
    rotation.value = withDelay(motion.duration.base, withSpring(0, motion.spring.card));
    translateX.value = withDelay(motion.duration.base, withSpring(0, motion.spring.card));
  }, [burnTrigger, reduceMotion, rotation, translateX]);

  const motionStyle = useAnimatedStyle(() => ({
    transform: reduceMotion ? [] : [{ translateX: translateX.value }, { rotate: `${rotation.value}deg` }],
  }));

  return (
    <View
      style={styles.muck}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Muck zone, ${count} burned ${count === 1 ? 'card' : 'cards'}`}
    >
      <ZoneWell width={72} height={96} radius={radii.md} style={styles.muckWell}>
        <View style={styles.muckCardStack} pointerEvents="none">
          {count > 1 && (
            <PlayingCard
              face="down"
              size="sm"
              back={back}
              style={styles.muckBackCard}
            />
          )}
          {count > 0 ? (
            <Animated.View style={motionStyle}>
              <PlayingCard face="down" size="sm" back={back} />
            </Animated.View>
          ) : (
            <Text style={styles.muckEmpty}>EMPTY</Text>
          )}
        </View>
      </ZoneWell>
      <View style={styles.muckCaption} pointerEvents="none">
        <Text style={styles.muckLabel}>MUCK</Text>
        <Text style={styles.muckCount}>{count}</Text>
      </View>
    </View>
  );
}

/** Best-hand pill shown at showdown; pulses crimson once. */
function BestHandPill({
  label,
  trigger,
  reduceMotion,
}: {
  label: string | null;
  trigger: string | null;
  reduceMotion: boolean;
}) {
  const scale = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(scale);
    if (!trigger || reduceMotion) {
      scale.value = 1;
      return;
    }
    scale.value = 1;
    scale.value = withSequence(
      withSpring(1.06, motion.spring.card),
      withSpring(1, motion.spring.card),
    );
  }, [reduceMotion, scale, trigger]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (!label) return null;
  return (
    <Animated.View
      style={[styles.bestHandPill, pulseStyle]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Best hand: ${label}`}
    >
      <Text style={styles.bestHandText}>{label.toUpperCase()}</Text>
    </Animated.View>
  );
}

/** Keep bet amounts visible without duplicating the rules source of truth. */
function pokerActionLabel(spec: GameActionSpec, state: GameState, viewerId: PlayerId): string {
  if (spec.id === 'call') {
    const verdict = checkPokerBet(state, viewerId, 'call');
    return verdict.ok ? `${spec.label} ${verdict.amount}` : spec.label;
  }
  if (spec.id === 'raise') {
    const verdict = checkPokerBet(state, viewerId, 'raise');
    return verdict.ok ? `${spec.label} TO ${verdict.raiseTo ?? verdict.amount}` : spec.label;
  }
  return spec.label;
}

export function PokerTable({ active, topInset, bottomInset }: TableProps) {
  const { haptic, reduceMotion } = useMotion();
  const setViewMode = useUiStore((s) => s.setViewMode);
  const equippedBackId = useCosmeticsStore((s) => s.equippedBackId);

  const state = useGameStore((s) => s.state);
  const events = useGameStore((s) => s.events);
  const replaySession = useGameStore((s) => s.replaySession);
  const gameAction = useGameStore((s) => s.gameAction);
  const { viewerId, isRemoteGuest: isGuest, lobbySession } = useTableSession(state);

  const rules = getGameRules(state.config.presetId);
  const betting = state.game?.betting ?? null;
  const communityCards = useMemo(
    () => state.zones[communalZoneId(0)]?.cardIds ?? [],
    [state],
  );
  const muckCount = state.zones[ZONE_MUCK]?.cardIds.length ?? 0;
  const localHand = useMemo(
    () => (viewerId ? selectLocalHand(state, viewerId) : []),
    [state, viewerId],
  );
  const opponents = useMemo(
    () => (viewerId ? state.players.filter((player) => player.id !== viewerId) : []),
    [state.players, viewerId],
  );
  const isMyTurn = viewerId !== null && state.currentPlayerId === viewerId;
  const currentPlayerName = useMemo(
    () => state.players.find((player) => player.id === state.currentPlayerId)?.name ?? '',
    [state.currentPlayerId, state.players],
  );
  const turnStatus = isMyTurn
    ? 'YOUR TURN'
    : currentPlayerName
      ? `${currentPlayerName.toUpperCase()} · TO PLAY`
      : 'TABLE ACTIVE';
  const turnHint = isMyTurn
    ? 'CHOOSE A MOVE'
    : currentPlayerName
      ? `WAITING FOR ${currentPlayerName.toUpperCase()}`
      : 'WAITING FOR THE TABLE';
  const ruleActions = useMemo<GameActionSpec[]>(
    () => (viewerId ? rules.actions(state, viewerId) : []),
    [rules, state, viewerId],
  );

  const { batch } = useGameAnimations(viewerId);

  // --- Street choreography: remember which cards arrived in which street so
  // the flop can fan (middle first) while turn/river slide in. ---
  const [cardDelays, setCardDelays] = useState<Record<string, number>>({});
  const prevCommunityIds = useRef<string[]>([]);
  useEffect(() => {
    const ids = communityCards;
    const prev = prevCommunityIds.current;
    const fresh = prev.length === 0 ? ids : ids.filter((id) => !prev.includes(id));
    prevCommunityIds.current = ids;
    if (fresh.length === 0) return;
    setCardDelays((current) => {
      const next = { ...current };
      // FLOP: three cards, middle first, wings 80ms later.
      if (fresh.length === 3) {
        fresh.forEach((id, index) => {
          next[id] = FLOP_FAN_DELAYS[index] ?? 0;
        });
      } else {
        fresh.forEach((id) => {
          next[id] = 0;
        });
      }
      return next;
    });
  }, [communityCards]);

  // --- Burn trigger: the muck pile rotates its top card in. ---
  const burnTrigger = batch?.kind === 'burn' ? batch.key : null;

  // --- Pot pulse on CALL/RAISE. ---
  const potTrigger =
    batch?.kind === 'bet' && (batch.action === 'call' || batch.action === 'raise')
      ? batch.key
      : null;

  // --- Showdown: hole cards flip in a 200ms cascade. ---
  const showdownCardIds = batch?.kind === 'session-end' ? batch.cardIds : [];
  const [revealStep, setRevealStep] = useState(-1);
  const revealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    // All state writes are deferred out of the effect body (the lint rule
    // forbids synchronous setState during commit). The cascade starts on the
    // next tick; an empty batch resets the step the same way.
    const start = setTimeout(() => {
      if (showdownCardIds.length === 0) {
        setRevealStep(-1);
        return;
      }
      setRevealStep(0);
      revealTimerRef.current = setInterval(() => {
        setRevealStep((step) => {
          if (step >= showdownCardIds.length - 1) {
            if (revealTimerRef.current) clearInterval(revealTimerRef.current);
            return step;
          }
          return step + 1;
        });
      }, SHOWDOWN_CASCADE_MS);
    }, 0);
    return () => {
      clearTimeout(start);
      if (revealTimerRef.current) clearInterval(revealTimerRef.current);
      revealTimerRef.current = null;
    };
  }, [showdownCardIds]);

  const faceFor = useCallback(
    (card: CardInstance): CardFace => {
      const base = selectCardFace(state, card.id, viewerId);
      if (base === 'up') return 'up';
      // Hole cards reveal one per cascade step.
      const index = showdownCardIds.indexOf(card.id);
      if (index >= 0 && index <= revealStep) return 'up';
      return 'down';
    },
    [revealStep, showdownCardIds, state, viewerId],
  );

  // --- Best-hand pill at showdown. ---
  const bestHandLabel = useMemo(() => {
    if (state.phase !== 'ended' || !viewerId) return null;
    const winnerId = state.winnerId;
    if (!winnerId) return null;
    const winnerHand = state.zones[handZoneId(winnerId)]?.cardIds ?? [];
    const score = evaluatePokerHand([...winnerHand, ...communityCards]);
    return score.label;
  }, [communityCards, state, viewerId]);
  const bestHandTrigger = batch?.kind === 'session-end' ? batch.key : null;

  const dealTrigger = useMemo(() => {
    const sessionStart = events.find((event) => event.type === 'session/start');
    return sessionStart?.meta.id ?? sessionStart?.id ?? state.meta.id ?? null;
  }, [events, state.meta.id]);

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

  // Ended banner state.
  const endedOpacity = useSharedValue(0);
  const endedTranslateY = useSharedValue(10);
  const endedMotionStyle = useAnimatedStyle(() => ({
    opacity: endedOpacity.value,
    transform: reduceMotion ? [] : [{ translateY: endedTranslateY.value }],
  }));
  useEffect(() => {
    cancelAnimation(endedOpacity);
    cancelAnimation(endedTranslateY);
    if (state.phase !== 'ended') {
       
      endedOpacity.value = 0;
       
      endedTranslateY.value = 10;
      return;
    }
    if (reduceMotion) {
      endedOpacity.value = withTiming(1, { duration: motion.duration.fast });
      endedTranslateY.value = 0;
      return;
    }
    endedOpacity.value = withTiming(1, { duration: motion.duration.base });
    endedTranslateY.value = withSpring(0, motion.spring.sheet);
  }, [endedOpacity, endedTranslateY, reduceMotion, state.phase]);

  const surfaceStyle = useLayerSurfaceEntrance(active);
  if (!viewerId) return null;

  const streetLabel = state.game?.street
    ? ['FLOP', 'TURN', 'RIVER'][state.game.street - 1] ?? null
    : null;
  const endedTitle = state.winnerId
    ? state.winnerId === viewerId
      ? 'You take the table'
      : `${state.players.find((player) => player.id === state.winnerId)?.name ?? 'Winner'} takes the table`
    : 'Stand off';

  return (
    <Animated.View
      pointerEvents={active ? 'auto' : 'none'}
      style={[styles.root, { bottom: bottomInset }, surfaceStyle]}
    >
      <TableShell
        title="HOLD'EM"
        turnLabel=""
        active={active}
        onBackToHub={handleBackToHub}
        topInset={topInset}
        bottomInset={0}
      >
        <View style={styles.pokerContent}>

        {/* Opponents */}
        <View style={styles.opponents}>
        {opponents.map((opponent) => {
          const stack = betting?.stacks[opponent.id] ?? 0;
          return (
            <View key={opponent.id} style={styles.opponent}>
              <AvatarPlaceholder seed={opponent.avatarSeed} label={opponent.name} size={48} />
              <View style={styles.countPill}>
                <Text style={styles.countText}>{stack} CHIPS</Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Table middle */}
      <View style={styles.table}>
        {betting && (
          <PotPulse reduceMotion={reduceMotion} trigger={potTrigger} style={styles.ledgerWrap}>
            <View
              style={styles.pokerLedger}
              accessible
              accessibilityRole="text"
              accessibilityLabel={`Pot ${state.game?.pot ?? 0} chips. Current bet ${betting.currentBet} chips. Your stack ${betting.stacks[viewerId] ?? 0} chips.`}
            >
              <View style={styles.pokerMetric}>
                <Text style={styles.pokerMetricLabel}>POT</Text>
                <Text style={styles.pokerMetricValue}>{state.game?.pot ?? 0}</Text>
              </View>
              <View style={styles.pokerMetricRule} />
              <View style={styles.pokerMetric}>
                <Text style={styles.pokerMetricLabel}>BET</Text>
                <Text style={styles.pokerMetricValue}>{betting.currentBet}</Text>
              </View>
              <View style={styles.pokerMetricRule} />
              <View style={styles.pokerMetric}>
                <Text style={styles.pokerMetricLabel}>YOUR STACK</Text>
                <Text style={styles.pokerMetricValue}>{betting.stacks[viewerId] ?? 0}</Text>
              </View>
            </View>
          </PotPulse>
        )}

        <View style={styles.communityRow}>
          <MuckPile
            count={muckCount}
            burnTrigger={burnTrigger}
            reduceMotion={reduceMotion}
            back={equippedBackId}
          />
          <View style={styles.communityWell}>
            <ZoneWell
              fill
              radius={radii.md}
              label={communityCards.length === 0 ? 'COMMUNITY' : undefined}
              hint={communityCards.length === 0 ? 'BOARD EMPTY' : undefined}
            />
            {communityCards.length > 0 && (
              <View style={styles.communityCards}>
                {communityCards.map((cid) => {
                  const card = state.cards[cid];
                  if (!card) return null;
                  return (
                    <PokerCommunityCard
                      key={cid}
                      card={card}
                      delay={cardDelays[cid] ?? 0}
                      reduceMotion={reduceMotion}
                    />
                  );
                })}
              </View>
            )}
          </View>
          <View style={styles.muckSpacer} />
        </View>

        {!!streetLabel && (
          <Text style={styles.streetLabel} accessibilityRole="text">
            {streetLabel}
          </Text>
        )}
        <BestHandPill label={bestHandLabel} trigger={bestHandTrigger} reduceMotion={reduceMotion} />
      </View>

      {/* Action rail */}
      {state.phase !== 'ended' && (
        <View style={styles.actionDock}>
          <View style={styles.actionHeading}>
            <View style={styles.turnStatusRow}>
              <View style={[styles.turnDot, isMyTurn && styles.turnDotActive]} />
              <Text style={[styles.turnStatus, isMyTurn && styles.turnStatusActive]}>{turnStatus}</Text>
            </View>
            <Text style={styles.turnHint}>{turnHint}</Text>
          </View>
          {ruleActions.length > 0 ? (
            <View style={styles.ruleRail}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.ruleRailContent}
              >
                {ruleActions.map((spec) => {
                  const displayLabel = pokerActionLabel(spec, state, viewerId);
                  return (
                    <CardButton
                      key={spec.id}
                      variant={spec.kind === 'host' ? 'secondary' : 'primary'}
                      size="sm"
                      haptic="medium"
                      accessibilityLabel={displayLabel}
                      accessibilityHint={spec.hint}
                      onPress={() => handleGameAction(spec.id)}
                      style={styles.ruleActionBtn}
                      innerStyle={styles.ruleActionInner}
                    >
                      <Text
                        style={[styles.ruleActionText, spec.kind === 'host' && styles.ruleActionTextHost]}
                        numberOfLines={1}
                      >
                        {displayLabel}
                      </Text>
                    </CardButton>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
        </View>
      )}

      {/* Local hand */}
      <View style={styles.hand}>
        {state.config.fanStyle === 'stacked' ? (
          <HandStack
            cards={localHand}
            faceFor={faceFor}
            size="md"
            dealTrigger={dealTrigger}
          />
        ) : (
          <HandFan
            cards={localHand}
            viewerId={viewerId}
            faceFor={faceFor}
            fanStyle={state.config.fanStyle}
            size="md"
            dealTrigger={dealTrigger}
          />
        )}
      </View>

      {/* Ended banner */}
      {state.phase === 'ended' && (
        <Animated.View style={[styles.endedBanner, endedMotionStyle]} pointerEvents="box-none">
          <View style={styles.endedCard}>
            <Text style={styles.endedEyebrow}>SESSION OVER</Text>
            <Text style={styles.endedTitle}>{endedTitle}</Text>
            <Text style={styles.endedMeta}>
              Pot {state.game?.pot ?? 0} chips · Round complete · {state.turn} {state.turn === 1 ? 'turn' : 'turns'}
            </Text>
            {state.meta.mode === 'pass' ? (
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
            ) : (
              <CardButton
                variant="primary"
                size="md"
                haptic="medium"
                onPress={() => {
                  if (state.meta.mode === 'solo') {
                    useGameStore.getState().startNextHand();
                  } else {
                    setViewMode('hub');
                  }
                }}
                style={styles.endedCta}
              >
                <Text style={styles.endedCtaText}>Next hand</Text>
              </CardButton>
            )}
          </View>
        </Animated.View>
      )}

        </View>
      </TableShell>
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
  pokerContent: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'center',
    gap: space.md,
  },
  opponents: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
    paddingTop: space.md,
    gap: space.xl,
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
    flexGrow: 0,
    flexShrink: 0,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 760,
    paddingHorizontal: space.xl,
    gap: space.md,
    minHeight: 0,
  },
  ledgerWrap: {
    alignSelf: 'stretch',
  },
  pokerLedger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 360,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.inkOverlay12,
    backgroundColor: alpha.whiteOverlay45,
  },
  pokerMetric: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  pokerMetricLabel: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.cap,
  },
  pokerMetricValue: {
    fontSize: fontSizes.body,
    fontFamily: fonts.extra,
    color: colors.ink,
  },
  pokerMetricRule: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: alpha.inkOverlay12,
  },
  communityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  communityWell: {
    position: 'relative',
    width: 116,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  communityCards: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  muck: {
    alignItems: 'center',
    width: 76,
    gap: space.xs,
  },
  muckWell: {
    overflow: 'hidden',
  },
  muckCardStack: {
    width: 60,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  muckBackCard: {
    position: 'absolute',
    transform: [{ translateX: -3 }, { translateY: -2 }, { rotate: '-5deg' }],
  },
  muckEmpty: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.cap,
  },
  muckCaption: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.xs,
  },
  muckLabel: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.ink,
    letterSpacing: letterSpacing.caps,
  },
  muckCount: {
    fontSize: 9,
    fontFamily: fonts.semibold,
    color: colors.inkMuted,
  },
  muckSpacer: {
    width: 76,
  },
  streetLabel: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: letterSpacing.caps,
  },
  bestHandPill: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.brand,
  },
  bestHandText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.caption,
    letterSpacing: letterSpacing.cap,
    color: colors.surface,
  },
  actionDock: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 560,
    paddingHorizontal: space.lg,
    gap: space.xs,
  },
  actionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 28,
    gap: space.sm,
  },
  turnStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    flexShrink: 1,
  },
  turnDot: {
    width: 8,
    height: 8,
    borderRadius: radii.xs,
    backgroundColor: colors.inkSubtle,
  },
  turnDotActive: {
    backgroundColor: colors.brand,
  },
  turnStatus: {
    fontSize: fontSizes.caption,
    fontFamily: fonts.bold,
    color: colors.inkMuted,
    letterSpacing: letterSpacing.cap,
  },
  turnStatusActive: {
    color: colors.brand,
  },
  turnHint: {
    flexShrink: 1,
    fontSize: fontSizes.micro,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.cap,
    textAlign: 'right',
  },
  ruleRail: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 560,
  },
  ruleRailContent: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: space.xs,
    paddingHorizontal: space.xs,
  },
  ruleActionBtn: {
    flexShrink: 0,
    minWidth: 0,
  },
  ruleActionInner: {
    paddingHorizontal: space.md,
  },
  ruleActionText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.caption,
    letterSpacing: letterSpacing.cap,
    color: colors.surface,
  },
  ruleActionTextHost: {
    color: colors.ink,
  },

  hand: {
    justifyContent: 'center',
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    minHeight: 164,
    alignItems: 'center',
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
});

export default PokerTable;
