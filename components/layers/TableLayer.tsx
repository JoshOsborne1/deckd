import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { ChevronLeft, Clock, Flag, Menu, Shuffle } from 'lucide-react-native';
import { AvatarPlaceholder } from '@components/AvatarPlaceholder';
import { CardButton } from '@components/CardButton';
import { CardSection } from '@components/CardSection';
import { PlayingCard } from '@components/PlayingCard';

import { EventHistoryModal } from '@components/EventHistoryModal';
import { HandFan } from '@components/HandFan';
import { HandStack } from '@components/HandStack';
import { useLayerSurfaceEntrance } from '@hooks/useLayerSurfaceEntrance';
import { useMotion } from '@hooks/useMotion';
import { DISCARD_PULSE_SCALE } from '@lib/motion';
import { useUiStore } from '@store/uiStore';
import { useCosmeticsStore } from '@store/cosmeticsStore';
import { useGameStore } from '@store/gameStore';
import { useLobbyStore } from '@store/lobbyStore';
import {
  parseCardId,
  parseJokerId,
  selectCardFace,
  selectCurrentPlayerId,
  selectDiscardTopCard,
  selectDrawPileCount,
  selectDrawTopCardId,
  selectAvailableActions,
  selectGuidanceState,
  selectIsMyTurn,
  selectLocalHand,
  selectNextPlayerId,
  selectOpponentHandSize,
  selectOpponents,
  selectSuggestedAction,
} from '@engine/selectors';
import {
  ZONE_DISCARD,
  handZoneId,
  type CardFace,
  type CardId,
  type CardInstance,
} from '@engine/types';
import type { GuidancePhase, TableAction } from '@engine/selectors';
import { makeSeed, mulberry32, shuffleInPlace, ZONE_DRAW } from '@engine/index';
import {
  alpha,
  colors,
  fonts,
  fontSizes,
  letterSpacing,
  radii,
  shadow,
  space,
  motion,
} from '@theme';

interface TableLayerProps {
  active: boolean;
  topInset: number;
  bottomInset: number;
}

const ACTION_LABELS: Record<TableAction, string> = {
  draw: 'DRAW',
  flip: 'FLIP',
  discard: 'DISCARD',
  reorder: 'REORDER',
  pass: 'PASS',
  shuffle: 'SHUFFLE',
  end: 'END TABLE',
};

interface GuidanceCopy {
  eyebrow: string;
  title: string;
  detail: string;
}

export function TableLayer({ active, topInset, bottomInset }: TableLayerProps) {
  const { haptic, reduceMotion } = useMotion();
  const setViewMode = useUiStore((s) => s.setViewMode);
  const equippedBackId = useCosmeticsStore((s) => s.equippedBackId);
  const openPass = useUiStore((s) => s.openPass);
  const [historyOpen, setHistoryOpen] = useState(false);

  const state = useGameStore((s) => s.state);
  const events = useGameStore((s) => s.events);
  const dealCard = useGameStore((s) => s.dealCard);
  const flipCard = useGameStore((s) => s.flipCard);
  const moveCard = useGameStore((s) => s.moveCard);
  const endTurn = useGameStore((s) => s.endTurn);
  const endSession = useGameStore((s) => s.endSession);
  const dispatch = useGameStore((s) => s.dispatch);
  const reorderHand = useGameStore((s) => s.reorderHand);

  const lobbyStatus = useLobbyStore((s) => s.status);
  const lobbySession = useLobbyStore((s) => s.session);
  const localClientId = useLobbyStore((s) => s.localClientId);

  /** True when there is an active relay session (online multiplayer). */
  const isOnline = lobbySession !== null && (lobbyStatus === 'connected' || lobbyStatus === 'connecting');
  /** Guest view: the relay session is a guest role. */
  const isGuest = lobbySession?.role === 'guest';

  // Return to hub cleanly when the relay room closes or the session ends.
  useEffect(() => {
    if (lobbyStatus === 'closed' && isOnline) {
      setViewMode('hub');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyStatus]);

  /** Device owner / session host — shuffle authority. */
  const hostPlayerId = state.meta.hostId || null;
  /**
   * Pass-and-play: the shared phone shows the **current** player's hand.
   * Online: the guest views as their own clientId (which is their playerId);
   * the host views as the host playerId.
   */
  const viewerId = isOnline
    ? isGuest
      ? localClientId
      : hostPlayerId
    : state.meta.mode === 'pass' && state.currentPlayerId
      ? state.currentPlayerId
      : hostPlayerId;
  const hasSession = events.length > 0 && state.phase !== 'idle';

  // --- Selectors (memoized off state) ---
  const drawCount = useMemo(() => selectDrawPileCount(state), [state]);
  const discardTop = useMemo(() => selectDiscardTopCard(state), [state]);
  const opponents = useMemo(
    () => (viewerId ? selectOpponents(state, viewerId) : []),
    [state, viewerId],
  );
  const localHand = useMemo(
    () => (viewerId ? selectLocalHand(state, viewerId) : []),
    [state, viewerId],
  );
  const currentPlayerId = useMemo(() => selectCurrentPlayerId(state), [state]);
  const isMyTurn = useMemo(
    () => (viewerId ? selectIsMyTurn(state, viewerId) : false),
    [state, viewerId],
  );
  const availableActions = useMemo<ReadonlySet<TableAction>>(
    () => (viewerId ? selectAvailableActions(state, viewerId) : new Set<TableAction>()),
    [state, viewerId],
  );
  const suggestedAction = useMemo(
    () => (viewerId ? selectSuggestedAction(state, viewerId) : null),
    [state, viewerId],
  );
  const guidanceState = useMemo<GuidancePhase>(
    () => (viewerId ? selectGuidanceState(state, viewerId) : 'waiting'),
    [state, viewerId],
  );
  const nextPlayerId = useMemo(() => selectNextPlayerId(state), [state]);
  const isHost = Boolean(hostPlayerId && viewerId === hostPlayerId);
  const isPassMode = state.meta.mode === 'pass';
  const dealTrigger = useMemo(() => {
    const sessionStart = events.find((event) => event.type === 'session/start');
    // Event sequence numbers restart for each session, so use the unique
    // session id rather than `event-1` as the replay key.
    return sessionStart?.meta.id ?? sessionStart?.id ?? state.meta.id ?? null;
  }, [events, state.meta.id]);

  const drawScale = useSharedValue(1);
  const drawOpacity = useSharedValue(1);
  const discardScale = useSharedValue(1);
  const discardOpacity = useSharedValue(1);
  const previousDiscardId = useRef(discardTop?.id ?? null);

  const drawMotionStyle = useAnimatedStyle(() => ({
    opacity: drawOpacity.value,
    transform: reduceMotion ? [] : [{ scale: drawScale.value }],
  }));
  const discardMotionStyle = useAnimatedStyle(() => ({
    opacity: discardOpacity.value,
    transform: reduceMotion ? [] : [{ scale: discardScale.value }],
  }));

  useEffect(() => {
    const nextDiscardId = discardTop?.id ?? null;
    const previousId = previousDiscardId.current;
    previousDiscardId.current = nextDiscardId;
    if (!nextDiscardId || nextDiscardId === previousId) return;

    if (reduceMotion) {
      // eslint-disable-next-line react-hooks/immutability
      discardOpacity.value = withTiming(0.72, { duration: motion.duration.fast }, () => {
        discardOpacity.value = withTiming(1, { duration: motion.duration.fast });
      });
      return;
    }

    cancelAnimation(discardScale);
    // eslint-disable-next-line react-hooks/immutability
    discardScale.value = 1;
    discardScale.value = withSequence(
      withTiming(DISCARD_PULSE_SCALE, { duration: motion.duration.fast }),
      withTiming(1, { duration: motion.duration.fast }),
    );
  }, [discardOpacity, discardScale, discardTop?.id, previousDiscardId, reduceMotion]);

  const handleDrawPressIn = useCallback(() => {
    if (reduceMotion) {
      // eslint-disable-next-line react-hooks/immutability
      drawOpacity.value = withTiming(0.72, { duration: motion.duration.fast });
      return;
    }
    // eslint-disable-next-line react-hooks/immutability
    drawScale.value = withSpring(0.96, motion.spring.press);
  }, [drawOpacity, drawScale, reduceMotion]);

  const handleDrawPressOut = useCallback(() => {
    // eslint-disable-next-line react-hooks/immutability
    drawOpacity.value = withTiming(1, { duration: motion.duration.fast });
    if (!reduceMotion) {
      // eslint-disable-next-line react-hooks/immutability
      drawScale.value = withSpring(1, motion.spring.press);
    }
  }, [drawOpacity, drawScale, reduceMotion]);

  const currentPlayerName = useMemo(() => {
    const p = state.players.find((pl) => pl.id === currentPlayerId);
    return p?.name ?? '';
  }, [state.players, currentPlayerId]);

  const guidanceCopy = useMemo<GuidanceCopy>(() => {
    const alternatives = Array.from(availableActions)
      .filter((action) => action !== suggestedAction)
      .map((action) => ACTION_LABELS[action].toLowerCase());
    const visibleAlternatives = alternatives.slice(0, 3);
    const remainingAlternatives = alternatives.length - visibleAlternatives.length;
    const alternativeCopy = visibleAlternatives.length > 0
      ? `Also open: ${visibleAlternatives.join(' · ')}${remainingAlternatives > 0 ? ` +${remainingAlternatives} more` : ''}.`
      : '';
    const withAlternatives = (detail: string) =>
      alternativeCopy ? `${detail} ${alternativeCopy}` : detail;

    switch (guidanceState) {
      case 'draw':
        return {
          eyebrow: 'NEXT USEFUL MOVE',
          title: 'Draw a card',
          detail: withAlternatives('Take the top card, then choose what to do with it.'),
        };
      case 'flip':
        return {
          eyebrow: 'NEXT USEFUL MOVE',
          title: 'Reveal a card',
          detail: withAlternatives('Tap a face-down card, or follow another open move.'),
        };
      case 'discard':
        return {
          eyebrow: 'NEXT USEFUL MOVE',
          title: 'Play from your hand',
          detail: withAlternatives('Swipe a card up to discard it, or choose another move.'),
        };
      case 'pass':
        return {
          eyebrow: 'NEXT USEFUL MOVE',
          title: 'Pass the table',
          detail: withAlternatives('The draw pile is empty; pass to keep the round moving.'),
        };
      case 'end':
        return {
          eyebrow: 'TABLE CLEAR',
          title: 'End or reset the table',
          detail: withAlternatives('Return to setup when you are ready to deal again.'),
        };
      case 'waiting': {
        const waitingFor = currentPlayerName || 'The next player';
        return {
          eyebrow: 'PASS THE TABLE',
          title: `${waitingFor} is choosing`,
          detail: alternativeCopy || 'Review the table; your hand will be ready after the pass.',
        };
      }
      case 'ended':
        return {
          eyebrow: 'SESSION OVER',
          title: 'Choose what comes next',
          detail: 'Return to setup or inspect the event log.',
        };
      case 'idle':
      default:
        return {
          eyebrow: 'READY TO DEAL',
          title: 'Set up the table',
          detail: 'Deal a session to see the next useful move.',
        };
    }
  }, [availableActions, currentPlayerName, guidanceState, suggestedAction]);

  const surfaceStyle = useLayerSurfaceEntrance(active);

  // --- Card face resolver for HandFan ---
  const faceFor = useCallback(
    (card: CardInstance): CardFace => selectCardFace(state, card.id, viewerId),
    [state, viewerId],
  );

  // --- Handlers ---
  const handleDrawCard = useCallback(() => {
    if (!isMyTurn || !viewerId) return;
    if (isGuest && lobbySession) {
      void lobbySession.sendIntent('draw_card', {});
      return;
    }
    const topCardId = selectDrawTopCardId(state);
    if (!topCardId) return;
    haptic('medium');
    dealCard(topCardId, handZoneId(viewerId), 'up');
  }, [isMyTurn, viewerId, isGuest, lobbySession, state, haptic, dealCard]);

  const handleCardPress = useCallback(
    (cardId: string) => {
      if (!viewerId) return;
      const card = state.cards[cardId];
      if (!card) return;
      if (card.zoneId === handZoneId(viewerId)) {
        if (isGuest && lobbySession) {
          void lobbySession.sendIntent('flip_card', { cardId });
          return;
        }
        haptic('light');
        flipCard(cardId);
      }
    },
    [viewerId, state.cards, isGuest, lobbySession, haptic, flipCard],
  );

  const handleCardLongPress = useCallback(
    (cardId: string) => {
      if (isGuest && lobbySession) {
        void lobbySession.sendIntent('move_card', { cardId, toZoneId: ZONE_DISCARD, face: 'up' });
        return;
      }
      haptic('medium');
      moveCard(cardId, ZONE_DISCARD, 'up');
    },
    [isGuest, lobbySession, haptic, moveCard],
  );

  const handlePassTurn = useCallback(() => {
    if (!viewerId || !nextPlayerId) return;
    const next = state.players.find((p) => p.id === nextPlayerId);
    if (!next) return;
    if (isGuest && lobbySession) {
      void lobbySession.sendIntent('end_turn', { playerId: viewerId });
      return;
    }
    haptic('success');
    endTurn(viewerId);
    // Online host: no privacy veil — each player is on their own device.
    if (!isOnline) {
      useGameStore.getState().enterPrivacy(next.id);
      openPass({
        recipientId: next.id,
        recipientName: next.name,
        recipientSeed: next.avatarSeed,
      });
    }
  }, [viewerId, nextPlayerId, state.players, isGuest, lobbySession, isOnline, haptic, endTurn, openPass]);

  const handleShuffle = useCallback(() => {
    if (!isHost || !viewerId) return;
    const drawZone = state.zones[ZONE_DRAW];
    if (!drawZone || drawZone.cardIds.length === 0) return;
    haptic('heavy');
    const seed = makeSeed();
    const rng = mulberry32(seed);
    const newOrder = shuffleInPlace(drawZone.cardIds.slice(), rng);
    dispatch({
      type: 'deck/shuffle',
      actorId: viewerId,
      zoneId: ZONE_DRAW,
      newOrder,
    });
  }, [isHost, viewerId, state.zones, haptic, dispatch]);

  const handleHistory = useCallback(() => {
    haptic('light');
    setHistoryOpen(true);
  }, [haptic]);

  const handleEndSession = useCallback(() => {
    haptic('heavy');
    endSession(viewerId ?? undefined);
  }, [haptic, endSession, viewerId]);

  const handleBackToHub = useCallback(() => {
    haptic('light');
    setViewMode('hub');
  }, [haptic, setViewMode]);

  const handleReorder = useCallback(
    (order: CardId[]) => {
      if (!viewerId || !isMyTurn) return;
      reorderHand(viewerId, order);
    },
    [viewerId, isMyTurn, reorderHand],
  );

  /** While a recipient must long-press to reveal, hide the hand under the veil. */
  const handLocked = state.privacySeat !== null;

  // --- Empty / loading fallback ---
  if (!hasSession) {
    return (
      <Animated.View
        pointerEvents={active ? 'auto' : 'none'}
        style={[styles.root, { bottom: bottomInset }, surfaceStyle]}
      >
        <View style={[styles.emptyWrap, { paddingTop: topInset + space.x5l }]}>
          <CardSection variant="surface" padded>
            <Text style={styles.emptyTitle}>Ready to deal</Text>
            <Text style={styles.emptyDesc}>
              Set up a session in the hub to start playing.
            </Text>
            <CardButton
              variant="primary"
              size="md"
              haptic="light"
              onPress={() => setViewMode('hub')}
              style={styles.emptyCta}
            >
              <Text style={styles.emptyCtaText}>Start setup</Text>
            </CardButton>
          </CardSection>
        </View>
      </Animated.View>
    );
  }

  // --- Discard top parsed ---
  const discardParsed = discardTop ? parseCardId(discardTop.id) : null;
  const discardJoker = discardTop ? parseJokerId(discardTop.id) : null;

  return (
    <Animated.View
      pointerEvents={active ? 'auto' : 'none'}
      style={[styles.root, { bottom: bottomInset }, surfaceStyle]}
    >
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
              <View style={styles.stubCards}>
                {handSize > 0 && (
                  <PlayingCard
                    face="down"
                    size="xs"
                    back={equippedBackId}
                    style={{ transform: [{ rotate: '-8deg' }, { translateX: 4 }] }}
                  />
                )}
                {handSize > 1 && <PlayingCard face="down" size="xs" back={equippedBackId} />}
              </View>
            </View>
          );
        })}
      </View>

      {/* Table middle */}
      <View style={styles.table}>
        <View style={styles.tablePiles}>
          {/* Draw pile */}
          <Animated.View
            style={[
              styles.deckStack,
              drawMotionStyle,
              suggestedAction === 'draw' && styles.suggestedDeck,
            ]}
          >
            <Pressable
              onPress={handleDrawCard}
              onPressIn={handleDrawPressIn}
              onPressOut={handleDrawPressOut}
              disabled={!isMyTurn || drawCount === 0}
              accessibilityRole="button"
              accessibilityLabel={`Draw pile, ${drawCount} cards left`}
              accessibilityHint={
                suggestedAction === 'draw'
                  ? 'Suggested next move. Tap to draw a card.'
                  : 'Tap to draw a card when it is your turn.'
              }
              style={[
                styles.deckTrigger,
                (!isMyTurn || drawCount === 0) && { opacity: 0.5 },
              ]}
            >
              <PlayingCard face="down" size="md" back={equippedBackId} />
              <Text style={styles.deckLeftText}>{drawCount} LEFT</Text>
            </Pressable>
          </Animated.View>

          {/* Discard slot */}
          {discardTop && discardParsed ? (
            <Animated.View style={[styles.activeSlot, discardMotionStyle]}>
              <PlayingCard
                rank={discardParsed.rank}
                suit={discardParsed.suit}
                face={discardTop.face}
                size="lg"
                elevated
              />
            </Animated.View>
          ) : discardTop && discardJoker ? (
            <Animated.View style={[styles.activeSlot, discardMotionStyle]}>
              <PlayingCard
                jokerColor={discardJoker}
                face={discardTop.face}
                size="lg"
                elevated
              />
            </Animated.View>
          ) : (
            <Animated.View style={[styles.discardSlot, discardMotionStyle]}>
              <Text style={styles.discardLabel}>DISCARD</Text>
            </Animated.View>
          )}
        </View>

      </View>

      {/* Ended banner */}
      {state.phase === 'ended' && (
        <View style={styles.endedBanner} pointerEvents="box-none">
          <View style={styles.endedCard}>
            <Text style={styles.endedEyebrow}>SESSION OVER</Text>
            <Text style={styles.endedTitle}>
              {state.winnerId
                ? `${state.players.find((p) => p.id === state.winnerId)?.name ?? 'Winner'} takes the table`
                : 'Table cleared'}
            </Text>
            <CardButton
              variant="primary"
              size="md"
              haptic="medium"
              onPress={() => setViewMode('hub')}
              style={styles.endedCta}
            >
              <Text style={styles.endedCtaText}>Back to setup</Text>
            </CardButton>
          </View>
        </View>
      )}

      {/* Action bar */}
      <View style={[styles.actionBar, { marginBottom: bottomInset > 0 ? 0 : space.lg }]}>
        <Pressable
          onPress={handleShuffle}
          disabled={!isHost}
          style={({ pressed }) => [
            styles.iconBtn,
            pressed && { opacity: 0.85 },
            !isHost && { opacity: 0.5 },
          ]}
        >
          <Shuffle size={20} color={colors.inkMuted} />
        </Pressable>

        {isPassMode || isOnline ? (
          <CardButton
            variant="primary"
            size="md"
            haptic="medium"
            onPress={handlePassTurn}
            disabled={!isMyTurn}
            style={{
              ...styles.passBtn,
              ...(suggestedAction === 'pass' ? styles.suggestedPass : undefined),
              ...(isMyTurn ? undefined : { opacity: 0.5 }),
            }}
            innerStyle={styles.passBtnInner}
          >
            <Text style={styles.passBtnText} numberOfLines={1}>PASS TURN »</Text>
          </CardButton>
        ) : (
          <Pressable
            onPress={handleHistory}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.85 }]}
          >
            <Menu size={20} color={colors.inkMuted} />
          </Pressable>
        )}

        <Pressable
          onPress={handleHistory}
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.85 }]}
        >
          <Clock size={20} color={colors.inkMuted} />
        </Pressable>

        {isHost && (
          <Pressable
            onPress={handleEndSession}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.85 }]}
          >
            <Flag size={20} color={colors.brand} />
          </Pressable>
        )}
      </View>

      {/* Local hand */}
      <View style={[styles.hand, { paddingBottom: bottomInset + space.lg }]}>
        {handLocked ? (
          <View style={styles.hiddenHand}>
            <Text style={styles.hiddenText}>HAND LOCKED — REVEAL TO CONTINUE</Text>
          </View>
        ) : state.config.fanStyle === 'stacked' ? (
          <HandStack
            cards={localHand}
            faceFor={faceFor}
            onCardPress={handleCardPress}
            onCardLongPress={handleCardLongPress}
            onReorder={handleReorder}
            reorderEnabled={isMyTurn}
            size="md"
            dealTrigger={dealTrigger}
          />
        ) : (
          <HandFan
            cards={localHand}
            viewerId={viewerId}
            faceFor={faceFor}
            fanStyle={state.config.fanStyle}
            onCardPress={handleCardPress}
            onCardLongPress={handleCardLongPress}
            onReorder={handleReorder}
            reorderEnabled={isMyTurn}
            size="md"
            dealTrigger={dealTrigger}
          />
        )}
        {!handLocked && localHand.length > 0 ? (
          <Text style={styles.handHint} accessibilityRole="text">
            Tap flip · swipe up discard · drag sideways to reorder
          </Text>
        ) : null}
      </View>

      {hasSession && guidanceState !== 'ended' && (
        <View
          style={styles.guidance}
          pointerEvents="none"
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${guidanceCopy.title}. ${guidanceCopy.detail}`}
        >
          <View style={styles.guidanceMark} />
          <View style={styles.guidanceCopy}>
            <Text style={styles.guidanceEyebrow}>{guidanceCopy.eyebrow}</Text>
            <Text style={styles.guidanceTitle} numberOfLines={1}>
              {guidanceCopy.title}
            </Text>
            <Text style={styles.guidanceDetail} numberOfLines={2}>
              {guidanceCopy.detail}
            </Text>
          </View>
        </View>
      )}

      <EventHistoryModal
        visible={historyOpen}
        events={events}
        onClose={() => setHistoryOpen(false)}
      />
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
  stubCards: {
    flexDirection: 'row',
    marginTop: space.xs,
    height: 24,
  },
  table: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    gap: space.md,
    minHeight: 0,
  },
  tablePiles: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xxl,
  },
  deckStack: {
    alignItems: 'center',
  },
  suggestedDeck: {
    borderWidth: 1,
    borderColor: alpha.brand30,
    borderRadius: radii.lg,
    padding: space.xs,
  },
  deckTrigger: {
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
  activeSlot: {
    padding: space.xs,
    borderWidth: 2,
    borderColor: alpha.brand10,
    borderRadius: radii.lg,
    borderStyle: 'dashed',
  },
  discardSlot: {
    width: 110,
    height: 154,
    borderRadius: radii.card,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  discardLabel: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.caps,
  },
  guidance: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    bottom: 0,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 320,
    minHeight: 58,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.inkOverlay12,
    backgroundColor: alpha.whiteOverlay45,
  },
  guidanceMark: {
    width: 3,
    height: 34,
    borderRadius: radii.xs,
    backgroundColor: colors.brand,
  },
  guidanceCopy: {
    flex: 1,
    minWidth: 0,
  },
  guidanceEyebrow: {
    fontSize: 9,
    lineHeight: 12,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: letterSpacing.cap,
  },
  guidanceTitle: {
    marginTop: 1,
    fontSize: fontSizes.small,
    lineHeight: 17,
    fontFamily: fonts.extra,
    color: colors.ink,
  },
  guidanceDetail: {
    fontSize: fontSizes.micro,
    lineHeight: 16,
    fontFamily: fonts.regular,
    color: colors.inkMuted,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    width: '100%',
    paddingHorizontal: space.md,
    gap: space.md,
    paddingTop: space.md,
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
  endedCta: {
    alignSelf: 'stretch',
  },
  endedCtaText: {
    color: colors.surface,
    fontSize: fontSizes.small + 1,
    fontFamily: fonts.bold,
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
  passBtn: {
    minWidth: 128,
    maxWidth: 168,
    flexShrink: 1,
  },
  suggestedPass: {
    borderWidth: 1,
    borderColor: alpha.whiteOverlay80,
  },
  passBtnInner: {
    minWidth: 0,
    paddingHorizontal: space.sm,
  },
  passBtnText: {
    color: colors.surface,
    fontSize: fontSizes.small,
    fontFamily: fonts.extra,
    letterSpacing: letterSpacing.cap,
  },
  hand: {
    justifyContent: 'center',
    minHeight: 180,
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
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  emptyTitle: {
    fontSize: fontSizes.h3,
    fontFamily: fonts.extra,
    color: colors.ink,
    marginBottom: space.sm,
  },
  emptyDesc: {
    fontSize: fontSizes.body,
    fontFamily: fonts.regular,
    color: colors.inkMuted,
    marginBottom: space.lg,
  },
  emptyCta: {
    alignSelf: 'flex-start',
  },
  emptyCtaText: {
    color: colors.surface,
    fontSize: fontSizes.body,
    fontFamily: fonts.bold,
  },
});

export default TableLayer;
