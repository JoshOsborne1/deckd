import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Shuffle, ArrowDownAZ } from 'lucide-react-native';
import { AvatarPlaceholder } from '@components/AvatarPlaceholder';
import { CardButton } from '@components/CardButton';
import { FlipCard } from '@components/FlipCard';
import { HandFan } from '@components/HandFan';
import { HandStack } from '@components/HandStack';
import { PlayingCard } from '@components/PlayingCard';
import { CardPop, CrimsonFlash, HandShake } from '@components/animations/GameFx';
import { TableShell } from '@components/table/TableShell';
import { useTableSession } from '@components/table/useTableSession';
import { useLayerSurfaceEntrance } from '@hooks/useLayerSurfaceEntrance';
import { useMotion } from '@hooks/useMotion';
import { useGameAnimations, useToggleTrigger } from '@hooks/useGameAnimations';
import { useCosmeticsStore } from '@store/cosmeticsStore';
import { useGameStore } from '@store/gameStore';
import { useUiStore } from '@store/uiStore';
import { parseCardId, selectLocalHand, sortHandCards, type HandSortMode } from '@engine/selectors';
import { getGameRules, handValue, isBust, type GameAction, type GameActionSpec } from '@engine/rules';
import { makeSeed, mulberry32, shuffleInPlace } from '@engine/index';
import { handZoneId, type CardInstance } from '@engine/types';
import { alpha, colors, fonts, fontSizes, letterSpacing, motion, radii, shadow, space } from '@theme';

/**
 * Blackjack per-game animation pass (spec 2.2).
 *
 * - TWIST: the card slides from the deck line into the hand and settles
 *   (HandFan/HandStack deal-entry already flies drawn cards from the deck
 *   object; later draws use a zero-delay spring so they never replay the
 *   opening batch).
 * - Dealer auto-play: one card per 250ms cascade; the hole card is a
 *   FlipCard and springs up when the house reveals.
 * - Bust: the hand shakes (x ±3px, 3 cycles) and the value pill flashes
 *   crimson before settling ink.
 * - Hand over: winner cards pop scale 1.06; the banner springs in.
 *
 * The deck object here is display-only: TWIST/STICK are rail actions so a
 * bare deck tap can never bypass the rules engine's bust/21 auto-end.
 */

interface TableProps {
  active: boolean;
  topInset: number;
  bottomInset: number;
}

const DEALER_CASCADE_MS = 250;

interface DealerCardProps {
  card: CardInstance;
  delay: number;
  reduceMotion: boolean;
}

/** A dealer hand card that lands from the deck line with a per-card delay. */
function DealerCard({ card, delay, reduceMotion }: DealerCardProps) {
  const parsed = parseCardId(card.id);
  const entry = useSharedValue(reduceMotion ? 1 : 0);
  const translateY = useSharedValue(reduceMotion ? 0 : -18);

  useEffect(() => {
    cancelAnimation(entry);
    cancelAnimation(translateY);
    if (reduceMotion) {
      entry.value = 1;
      translateY.value = 0;
      return;
    }
    entry.value = 0;
    translateY.value = -18;
    entry.value = withDelay(delay, withTiming(1, { duration: motion.duration.base }));
    translateY.value = withDelay(delay, withSpring(0, motion.spring.card));
  }, [card.id, delay, entry, reduceMotion, translateY]);

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: entry.value,
    transform: reduceMotion ? [] : [{ translateY: translateY.value }],
  }));

  if (!parsed) return null;

  return (
    <Animated.View style={entranceStyle}>
      <FlipCard rank={parsed.rank} suit={parsed.suit} face={card.face} size="md" />
    </Animated.View>
  );
}

/** Value pill with the bust choreography (shake + crimson flash). */
function BustPill({
  value,
  bust,
  reduceMotion,
  haptic,
}: {
  value: string | null;
  bust: boolean;
  reduceMotion: boolean;
  haptic: (intensity?: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' | 'success' | 'warn' | 'error' | 'select') => void;
}) {
  const bustTrigger = useToggleTrigger(bust);

  useEffect(() => {
    if (bustTrigger) haptic('warn');
  }, [bustTrigger, haptic]);

  if (!value) return null;
  return (
    <HandShake reduceMotion={reduceMotion} trigger={bustTrigger} style={styles.pillShake}>
      <CrimsonFlash reduceMotion={reduceMotion} trigger={bustTrigger} style={styles.valuePillFlash}>
        <Text style={styles.valuePillText}>{value}</Text>
      </CrimsonFlash>
    </HandShake>
  );
}

export function BlackjackTable({ active, topInset, bottomInset }: TableProps) {
  const { haptic, reduceMotion } = useMotion();
  const setViewMode = useUiStore((s) => s.setViewMode);
  const equippedBackId = useCosmeticsStore((s) => s.equippedBackId);

  const state = useGameStore((s) => s.state);
  const events = useGameStore((s) => s.events);
  const startNextHand = useGameStore((s) => s.startNextHand);
  const replaySession = useGameStore((s) => s.replaySession);
  const gameAction = useGameStore((s) => s.gameAction);
  const handSortMode = useUiStore((s) => s.handSortMode);
  const toggleHandSortMode = useUiStore((s) => s.toggleHandSortMode);
  const reorderHand = useGameStore((s) => s.reorderHand);
  const {
    viewerId,
    hostPlayerId,
    isRemoteGuest: isGuest,
    lobbySession,
  } = useTableSession(state);

  const rules = getGameRules(state.config.presetId);
  const dealer = state.players[state.players.length - 1] ?? null;
  const isMyTurn = viewerId !== null && state.currentPlayerId === viewerId;
  const localHand = useMemo(
    () => (viewerId ? selectLocalHand(state, viewerId) : []),
    [state, viewerId],
  );
  const dealerHand = useMemo<CardInstance[]>(
    () => (dealer ? (state.zones[handZoneId(dealer.id)]?.cardIds ?? []).map((id) => state.cards[id]).filter((card): card is CardInstance => Boolean(card)) : []),
    [dealer, state],
  );
  const opponents = useMemo(
    () => (viewerId ? state.players.filter((player) => player.id !== viewerId && player.id !== dealer?.id) : []),
    [dealer?.id, state.players, viewerId],
  );
  const ruleActions = useMemo<GameActionSpec[]>(
    () => (viewerId ? rules.actions(state, viewerId) : []),
    [rules, state, viewerId],
  );
  const myHandValue = useMemo(
    () => (viewerId && localHand.length > 0 ? rules.readout?.(state, viewerId) ?? null : null),
    [localHand.length, rules, state, viewerId],
  );
  const myBust = myHandValue !== null && myHandValue.includes('BUST');
  const dealerValue = dealer && dealerHand.length > 0 ? handValue(state, dealer.id) : null;
  const dealerBust = dealerValue !== null && isBust(dealerValue);
  const drawCount = state.zones.draw?.cardIds.length ?? 0;

  const dealTrigger = useMemo(() => {
    const sessionStart = events.find((event) => event.type === 'session/start');
    return sessionStart?.meta.id ?? sessionStart?.id ?? state.meta.id ?? null;
  }, [events, state.meta.id]);

  const { batch } = useGameAnimations(viewerId);

  // Dealer cascade delays: cards that just entered the house hand land one
  // per 250ms; cards already on the felt keep their original delay so a
  // face change (hole-card reveal) never replays their entrance.
  const prevDealerIds = useRef<string[]>([]);
  const [dealerDelays, setDealerDelays] = useState<Record<string, number>>({});
  useEffect(() => {
    const ids = dealerHand.map((card) => card.id);
    const prev = prevDealerIds.current;
    const fresh = prev.length === 0 ? ids : ids.filter((id) => !prev.includes(id));
    if (fresh.length === 0) return;
    const nextDelays = { ...dealerDelays };
    let step = 0;
    ids.forEach((id) => {
      if (fresh.includes(id)) {
        nextDelays[id] = step * DEALER_CASCADE_MS;
        step += 1;
      }
    });
    prevDealerIds.current = ids;
    setDealerDelays(nextDelays);
     
  }, [dealerHand]);

  // Hand-over: winner cards pop; banner springs (endedBanner below).
  const myWinPop = batch?.kind === 'session-end' && batch.winnerId === viewerId ? batch.key : null;
  const dealerWinPop = batch?.kind === 'session-end' && batch.winnerId === dealer?.id ? batch.key : null;

  const isHost = Boolean(hostPlayerId && viewerId === hostPlayerId);

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


  const handleBackToHub = useCallback(() => {
    haptic('light');
    setViewMode('hub');
  }, [haptic, setViewMode]);

  const canSortHand = localHand.length > 1 && isMyTurn;
  const handleSortHand = useCallback(() => {
    if (!viewerId || !canSortHand) return;
    haptic('light');
    const nextMode: HandSortMode = handSortMode === 'rank' ? 'suit' : 'rank';
    toggleHandSortMode();
    const sortedIds = sortHandCards(localHand.map((card) => card.id), nextMode);
    reorderHand(viewerId, sortedIds);
  }, [viewerId, canSortHand, haptic, handSortMode, toggleHandSortMode, localHand, reorderHand]);

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
      // Reanimated shared values are intentionally mutable inside effects.
       
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

  const endedTitle = state.meta.mode === 'solo'
    ? state.winnerId === viewerId
      ? 'You beat the house'
      : 'House wins this hand'
    : state.winnerId
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
        title="BLACKJACK"
        active={active}
        onBackToHub={handleBackToHub}
        topInset={topInset}
        bottomInset={0}
      >

      {/* Other opponents (the dealer renders as the felt hand below) */}
      {opponents.length > 0 && (
        <View style={styles.opponents}>
          {opponents.map((opponent) => (
            <View key={opponent.id} style={styles.opponent}>
              <AvatarPlaceholder seed={opponent.avatarSeed} label={opponent.name} size={48} />
              <View style={styles.countPill}>
                <Text style={styles.countText}>
                  {(state.zones[handZoneId(opponent.id)]?.cardIds.length ?? 0)} CARDS
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Dealer felt hand */}
      <View style={styles.dealerZone}>
        <View style={styles.dealerLabelRow}>
          <Text style={styles.dealerLabel}>{dealer?.name.toUpperCase() ?? 'HOUSE'}</Text>
          {dealerValue !== null && (
            <View style={[styles.dealerValuePill, dealerBust && styles.dealerValuePillBust]}>
              <Text style={styles.dealerValueText}>{dealerValue}{dealerBust ? ' · BUST' : ''}</Text>
            </View>
          )}
        </View>
        <CardPop reduceMotion={reduceMotion} trigger={dealerWinPop} style={styles.dealerHand}>
          {dealerHand.length === 0 ? (
            <View style={styles.dealerEmpty}>
              <Text style={styles.dealerEmptyText}>HOUSE HAND</Text>
            </View>
          ) : (
            dealerHand.map((card, index) => (
              <View
                key={card.id}
                style={[
                  styles.dealerCardSlot,
                  { marginLeft: index === 0 ? 0 : -space.xl },
                ]}
              >
                <DealerCard card={card} delay={dealerDelays[card.id] ?? 0} reduceMotion={reduceMotion} />
              </View>
            ))
          )}
        </CardPop>
      </View>

      {/* Middle: the shoe remains the shuffle control; TWIST stays rule-owned. */}
      <View style={styles.middle}>
        <Pressable
          onPress={handleShuffle}
          disabled={!isHost}
          accessibilityRole="button"
          accessibilityLabel={`Shoe, ${drawCount} cards left`}
          accessibilityHint={isHost ? 'Tap to shuffle the shoe' : undefined}
          style={({ pressed }) => [styles.deckStack, pressed && isHost && { opacity: 0.82 }]}
        >
          <PlayingCard face="down" size="md" back={equippedBackId} />
          <Text style={styles.deckLeftText}>{drawCount} LEFT</Text>
          {isHost && (
            <View style={styles.shoeAffordance}>
              <Shuffle size={13} color={colors.inkMuted} />
              <Text style={styles.shoeAffordanceText}>SHUFFLE</Text>
            </View>
          )}
        </Pressable>
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
        </View>
      )}

      {/* Local hand */}
      <CardPop reduceMotion={reduceMotion} trigger={myWinPop} style={styles.hand}>
        {state.config.fanStyle === 'stacked' ? (
          <HandStack
            cards={localHand}
            faceFor={(card) => card.face}
            size="md"
            dealTrigger={dealTrigger}
          />
        ) : (
          <HandFan
            cards={localHand}
            viewerId={viewerId}
            faceFor={(card) => card.face}
            fanStyle={state.config.fanStyle}
            size="md"
            dealTrigger={dealTrigger}
          />
        )}
        {canSortHand && (
          <Pressable
            onPress={handleSortHand}
            accessibilityRole="button"
            accessibilityLabel={`Sort hand by ${handSortMode === 'rank' ? 'suit' : 'rank'}`}
            style={({ pressed }) => [styles.sortHandButton, pressed && { opacity: 0.82 }]}
          >
            <ArrowDownAZ size={14} color={colors.inkMuted} />
            <Text style={styles.sortHandText}>SORT {handSortMode === 'rank' ? 'BY SUIT' : 'BY RANK'}</Text>
          </Pressable>
        )}
        <BustPill value={myHandValue} bust={myBust} reduceMotion={reduceMotion} haptic={haptic} />
      </CardPop>


      {/* Ended banner */}
      {state.phase === 'ended' && (
        <Animated.View style={[styles.endedBanner, endedMotionStyle]} pointerEvents="box-none">
          <View style={styles.endedCard}>
            <Text style={styles.endedEyebrow}>{state.meta.mode === 'solo' ? 'HAND OVER' : 'SESSION OVER'}</Text>
            <Text style={styles.endedTitle}>{endedTitle}</Text>
            <Text style={styles.endedMeta}>
              {dealerBust ? 'The house busts · ' : ''}Round complete · {state.turn} {state.turn === 1 ? 'turn' : 'turns'}
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
                onPress={startNextHand}
                style={styles.endedCta}
              >
                <Text style={styles.endedCtaText}>Next hand</Text>
              </CardButton>
            )}
          </View>
        </Animated.View>
      )}

      </TableShell>
    </Animated.View>
  );
}

// --- Store helpers (kept local so TableLayer wiring stays a one-liner) ---

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
  dealerZone: {
    alignItems: 'center',
    marginTop: space.lg,
  },
  dealerLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.xs,
  },
  dealerLabel: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.inkMuted,
    letterSpacing: letterSpacing.caps,
  },
  dealerValuePill: {
    backgroundColor: colors.brand,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  dealerValuePillBust: {
    backgroundColor: colors.ink,
  },
  dealerValueText: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.surface,
    letterSpacing: letterSpacing.cap,
  },
  dealerHand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 140,
  },
  dealerCardSlot: {
    padding: 2,
  },
  dealerEmpty: {
    width: 180,
    height: 126,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dealerEmptyText: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.caps,
  },
  middle: {
    flex: 1,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 0,
  },
  deckStack: {
    alignItems: 'center',
  },
  deckLeftText: {
    marginTop: -18,
    color: colors.surface,
    fontSize: 10,
    fontFamily: fonts.bold,
    backgroundColor: alpha.brand45,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radii.xs,
    overflow: 'hidden',
    letterSpacing: letterSpacing.cap,
  },
  shoeAffordance: {
    marginTop: space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  shoeAffordanceText: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.inkMuted,
    letterSpacing: letterSpacing.cap,
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
  sortHandButton: {
    alignSelf: 'center',
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  sortHandText: {
    fontFamily: fonts.bold,
    fontSize: 9,
    color: colors.inkMuted,
    letterSpacing: letterSpacing.cap,
  },
  hand: {
    justifyContent: 'center',
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    minHeight: 180,
    alignItems: 'center',
  },
  pillShake: {
    alignItems: 'center',
  },
  valuePillFlash: {
    alignSelf: 'center',
    marginTop: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radii.pill,
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

export default BlackjackTable;
