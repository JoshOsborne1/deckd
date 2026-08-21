import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { BookOpen, ChevronLeft, Clock, Flag, Shuffle } from 'lucide-react-native';
import { AvatarPlaceholder } from '@components/AvatarPlaceholder';
import { CardButton } from '@components/CardButton';
import { EventHistoryModal } from '@components/EventHistoryModal';
import { FlipCard } from '@components/FlipCard';
import { HandFan } from '@components/HandFan';
import { HandStack } from '@components/HandStack';
import { PlayingCard } from '@components/PlayingCard';
import { RulesSheet } from '@components/RulesSheet';
import { TableSurface } from '@components/TableSurface';
import { CardPop, PotPulse } from '@components/animations/GameFx';
import { useLayerSurfaceEntrance } from '@hooks/useLayerSurfaceEntrance';
import { useMotion } from '@hooks/useMotion';
import { useGameAnimations } from '@hooks/useGameAnimations';
import { useCosmeticsStore } from '@store/cosmeticsStore';
import { useGameStore } from '@store/gameStore';
import { useLobbyStore } from '@store/lobbyStore';
import { useUiStore } from '@store/uiStore';
import { parseCardId, selectCardFace, selectLocalHand, type HandSortMode } from '@engine/selectors';
import { evaluatePokerHand, getGameRules, type GameAction, type GameActionSpec } from '@engine/rules';
import { makeSeed, mulberry32, shuffleInPlace } from '@engine/index';
import { communalZoneId, handZoneId, ZONE_MUCK, type CardFace, type CardInstance } from '@engine/types';
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

/** The muck pile: a small face-down stack. The top card rotates 90° in on
 * each burn so the burn reads as a slide-to-muck instead of a pop. */
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
      accessibilityLabel={`Muck pile, ${count} burned cards`}
    >
      <Animated.View style={motionStyle}>
        <PlayingCard face="down" size="xs" back={back} />
      </Animated.View>
      <Text style={styles.muckLabel}>MUCK</Text>
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

export function PokerTable({ active, topInset, bottomInset }: TableProps) {
  const { haptic, reduceMotion } = useMotion();
  const setViewMode = useUiStore((s) => s.setViewMode);
  const equippedBackId = useCosmeticsStore((s) => s.equippedBackId);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const state = useGameStore((s) => s.state);
  const events = useGameStore((s) => s.events);
  const endSession = useGameStore((s) => s.endSession);
  const replaySession = useGameStore((s) => s.replaySession);
  const gameAction = useGameStore((s) => s.gameAction);

  const lobbyStatus = useLobbyStore((s) => s.status);
  const lobbySession = useLobbyStore((s) => s.session);
  const localClientId = useLobbyStore((s) => s.localClientId);

  const isOnline = state.meta.mode === 'online-host' || state.meta.mode === 'online-guest';
  const isGuest = state.meta.mode === 'online-guest';
  const hostPlayerId = state.meta.hostId || null;
  const viewerId = isOnline
    ? isGuest
      ? localClientId
      : hostPlayerId
    : state.meta.mode === 'pass' && state.currentPlayerId
      ? state.currentPlayerId
      : hostPlayerId;

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
  const ruleActions = useMemo<GameActionSpec[]>(
    () => (viewerId ? rules.actions(state, viewerId) : []),
    [rules, state, viewerId],
  );
  const isMyTurn = viewerId !== null && state.currentPlayerId === viewerId;
  const isHost = Boolean(hostPlayerId && viewerId === hostPlayerId);
  const isPassMode = state.meta.mode === 'pass';

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

  const handleShuffle = useCallback(() => {
    if (!isHost || !viewerId) return;
    const drawZone = state.zones.draw;
    if (!drawZone || drawZone.cardIds.length === 0) return;
    haptic('heavy');
    const seed = makeSeed();
    const rng = mulberry32(seed);
    const newOrder = shuffleInPlace(drawZone.cardIds.slice(), rng);
    useGameStore.getState().dispatch({
      type: 'deck/shuffle',
      actorId: viewerId,
      zoneId: 'draw',
      newOrder,
    });
  }, [isHost, viewerId, state.zones, haptic]);

  const handleEndSession = useCallback(() => {
    Alert.alert(
      'End the table?',
      'This ends the session for everyone. You can start a new one from the hub.',
      [
        { text: 'Keep playing', style: 'cancel' },
        {
          text: 'End table',
          style: 'destructive',
          onPress: () => {
            haptic('heavy');
            endSession(viewerId ?? undefined);
          },
        },
      ],
    );
  }, [haptic, endSession, viewerId]);

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
      // eslint-disable-next-line react-hooks/immutability
      endedOpacity.value = 0;
      // eslint-disable-next-line react-hooks/immutability
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
  const currentPlayerName = state.players.find((player) => player.id === state.currentPlayerId)?.name ?? '';
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
      <TableSurface mode="play" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topInset + space.md }]}>
        <CardButton
          variant="ghost"
          size="sm"
          elevated={false}
          haptic="light"
          onPress={handleBackToHub}
          style={styles.backChip}
        >
          <ChevronLeft size={18} color={colors.inkMuted} />
          <Text style={styles.backText}>Hub</Text>
        </CardButton>
        <Text style={styles.eyebrow}>
          {isMyTurn ? 'YOUR TURN' : `${currentPlayerName.toUpperCase()} · TO PLAY`}
        </Text>
        {lobbyStatus === 'connected' && (
          <View style={styles.syncChip}>
            <View style={styles.syncDot} />
            <Text style={styles.syncText}>SYNCED</Text>
          </View>
        )}
      </View>

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
          <View style={styles.communityCards}>
            {communityCards.length === 0 ? (
              <View style={styles.communityEmpty}>
                <Text style={styles.communityEmptyText}>COMMUNITY</Text>
              </View>
            ) : (
              communityCards.map((cid) => {
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
              })
            )}
          </View>
          <View style={styles.muckSpacer} />
        </View>

        {streetLabel && (
          <Text style={styles.streetLabel} accessibilityRole="text">
            {streetLabel}
          </Text>
        )}
        <BestHandPill label={bestHandLabel} trigger={bestHandTrigger} reduceMotion={reduceMotion} />
      </View>

      {/* Action rail */}
      {state.phase !== 'ended' && ruleActions.length > 0 && (
        <View style={styles.ruleRail}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.ruleRailContent}
          >
            {ruleActions.map((spec) => (
              <CardButton
                key={spec.id}
                variant={spec.kind === 'host' ? 'secondary' : 'primary'}
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
        </View>
      )}

      {/* Utility bar */}
      <View style={[styles.actionBar, { marginBottom: bottomInset > 0 ? 0 : space.lg }]}>
        <Pressable
          onPress={handleShuffle}
          disabled={!isHost}
          accessibilityRole="button"
          accessibilityLabel="Shuffle deck"
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.85 }, !isHost && { opacity: 0.5 }]}
        >
          <Shuffle size={20} color={colors.inkMuted} />
        </Pressable>
        {isPassMode && state.phase !== 'ended' && ruleActions.length === 0 && (
          <View style={styles.ruleWaiting}>
            <Text style={styles.ruleWaitingText}>
              {isMyTurn ? 'WAITING FOR THE NEXT MOVE' : `${currentPlayerName.toUpperCase()} · TO PLAY`}
            </Text>
          </View>
        )}
        <Pressable
          onPress={() => setHistoryOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Open event log"
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.85 }]}
        >
          <Clock size={20} color={colors.inkMuted} />
        </Pressable>
        <Pressable
          onPress={() => setRulesOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Read table rules"
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.85 }]}
        >
          <BookOpen size={20} color={colors.inkMuted} />
        </Pressable>
        {isHost && (
          <Pressable
            onPress={handleEndSession}
            accessibilityRole="button"
            accessibilityLabel="End table"
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.85 }]}
          >
            <Flag size={20} color={colors.brand} />
          </Pressable>
        )}
      </View>

      {/* Local hand */}
      <View style={[styles.hand, { paddingBottom: bottomInset + space.lg }]}>
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
        {rules.readout && localHand.length > 0 && (
          <View style={styles.valuePill}>
            <Text style={styles.valuePillText}>{rules.readout(state, viewerId)}</Text>
          </View>
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

      <EventHistoryModal visible={historyOpen} events={events} onClose={() => setHistoryOpen(false)} />
      <RulesSheet visible={rulesOpen} presetId={state.config.presetId} onClose={() => setRulesOpen(false)} />
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.xl,
    gap: space.md,
  },
  backChip: {
    paddingHorizontal: space.md,
  },
  backText: {
    marginLeft: 4,
    fontSize: fontSizes.small + 1,
    fontFamily: fonts.semibold,
    color: colors.inkMuted,
  },
  eyebrow: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSizes.caption,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.caps,
  },
  syncChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: alpha.brand10,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  syncDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brand,
  },
  syncText: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: letterSpacing.caps,
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
    flex: 1,
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
    gap: space.md,
  },
  communityCards: {
    flexDirection: 'row',
    gap: space.xs,
    minHeight: 22,
    minWidth: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  communityEmpty: {
    minWidth: 110,
    height: 22,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  communityEmptyText: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.caps,
  },
  muck: {
    alignItems: 'center',
    width: 40,
  },
  muckLabel: {
    marginTop: 2,
    fontSize: 8,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.caps,
  },
  muckSpacer: {
    width: 40,
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
  ruleRail: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 460,
    paddingHorizontal: space.md,
    paddingTop: space.xs,
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
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 760,
    paddingHorizontal: space.md,
    gap: space.md,
    paddingTop: space.md,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  hand: {
    justifyContent: 'center',
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    minHeight: 180,
    alignItems: 'center',
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
