import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { ArrowDownAZ } from 'lucide-react-native';
import { AvatarPlaceholder } from '@components/AvatarPlaceholder';
import { CardButton } from '@components/CardButton';
import { CardSection } from '@components/CardSection';
import { TableSurface } from '@components/TableSurface';
import { PlayingCard } from '@components/PlayingCard';

import { KlondikeLayout } from '@components/KlondikeLayout';
import { HandFan } from '@components/HandFan';
import { HandStack } from '@components/HandStack';
import { SolitaireBoard } from '@components/SolitaireBoard';
import { BlackjackTable } from '@components/layers/BlackjackTable';
import { CrazyEightsTable } from '@components/layers/CrazyEightsTable';
import { TableShell } from '@components/table/TableShell';
import { useTableSession } from '@components/table/useTableSession';
import { GoFishTable } from '@components/layers/GoFishTable';
import { SevensTable } from '@components/layers/SevensTable';
import { WarTable } from '@components/layers/WarTable';
import { PokerTable } from '@components/layers/PokerTable';
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
  selectIsMyTurn,
  selectLocalHand,
  selectNextPlayerId,
  selectOpponentHandSize,
  selectOpponents,
  selectSuggestedAction,
  sortHandCards,
  type HandSortMode,
  type TableAction,
} from '@engine/selectors';
import {
  ZONE_DISCARD,
  handZoneId,
  tableZoneId,
  type CardFace,
  type CardId,
  type CardInstance,
} from '@engine/types';
import {
  getGameRules,
  type GameAction,
  type GameActionSpec,
} from '@engine/rules';
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


interface FeltStackProps {
  playerName: string;
  cards: CardInstance[];
  /** Label shown under the stack, e.g. "BOOK" for four-of-a-kind. */
  kindLabel: string;
  back: string;
  reduceMotion: boolean;
}

/** Max cards shown in the fan. Books are exactly 4; pairs grow (2 per pair). */
const FELT_FAN_CAP = 8;

/**
 * A player's collected books (Go Fish) or pairs (Old Maid) sitting on the
 * felt. Cards are laid face-up in a fan so the rank is readable; the label
 * names the pile so QA and assistive tech can find it. Grouped per player so
 * the table shows whose collection is whose at a glance.
 */
function FeltStack({ playerName, cards, kindLabel, back, reduceMotion }: FeltStackProps) {
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const translateY = useSharedValue(reduceMotion ? 0 : 12);

  useEffect(() => {
    cancelAnimation(opacity);
    cancelAnimation(translateY);
    if (reduceMotion) {
      opacity.value = withTiming(1, { duration: motion.duration.fast });
      translateY.value = 0;
      return;
    }
    opacity.value = withTiming(1, { duration: motion.duration.base });
    translateY.value = withSpring(0, motion.spring.card);
  }, [cards.length, opacity, reduceMotion, translateY]);

  const motionStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: reduceMotion ? [] : [{ translateY: translateY.value }],
  }));

  if (cards.length === 0) return null;

  return (
    <Animated.View
      style={[styles.feltStack, motionStyle]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${playerName}, ${cards.length} ${kindLabel} cards on the felt`}
    >
      <View style={styles.feltStackFan}>
        {cards.slice(0, FELT_FAN_CAP).map((card, index) => {
          const parsed = parseCardId(card.id);
          if (!parsed) return null;
          return (
            <View
              key={card.id}
              style={[styles.feltStackCard, { transform: [{ rotate: `${(index - (Math.min(cards.length, FELT_FAN_CAP) - 1) / 2) * 4}deg` }, { translateX: index * 9 }] }]}
            >
              <PlayingCard
                rank={parsed.rank}
                suit={parsed.suit}
                face="up"
                size="xs"
                back={back}
              />
            </View>
          );
        })}
      </View>
      <Text style={styles.feltStackLabel}>{playerName.toUpperCase()} · {kindLabel}</Text>
    </Animated.View>
  );
}

export function TableLayer({ active, topInset, bottomInset }: TableLayerProps) {
  const { haptic, reduceMotion } = useMotion();
  const setViewMode = useUiStore((s) => s.setViewMode);
  const equippedBackId = useCosmeticsStore((s) => s.equippedBackId);
  const openPass = useUiStore((s) => s.openPass);

  const state = useGameStore((s) => s.state);
  const events = useGameStore((s) => s.events);
  const dealCard = useGameStore((s) => s.dealCard);
  const flipCard = useGameStore((s) => s.flipCard);
  const moveCard = useGameStore((s) => s.moveCard);
  const endTurn = useGameStore((s) => s.endTurn);
  const startNextHand = useGameStore((s) => s.startNextHand);
  const replaySession = useGameStore((s) => s.replaySession);
  const dispatch = useGameStore((s) => s.dispatch);
  const reorderHand = useGameStore((s) => s.reorderHand);

  const lobbyStatus = useLobbyStore((s) => s.status);
  const {
    viewerId,
    hostPlayerId,
    isRemoteGuest: isGuest,
    isSharedDevice: isPassMode,
    isSolo,
    isNetworked: isOnline,
    lobbySession,
  } = useTableSession(state);

  const handSortMode = useUiStore((s) => s.handSortMode);
  const toggleHandSortMode = useUiStore((s) => s.toggleHandSortMode);

  // Return to hub cleanly when the relay room closes or the session ends.
  useEffect(() => {
    if (lobbyStatus === 'closed' && isOnline) {
      setViewMode('hub');
    }
  }, [isOnline, lobbyStatus, setViewMode]);

  const hasSession = events.length > 0 && state.phase !== 'idle';

  // --- Solitaire games render their own dedicated board (FreeCell/Pyramid/Golf).
  // Klondike renders through KlondikeLayout (main's suit-based implementation). ---
  const isSolitaire = ['freecell', 'pyramid', 'golf'].includes(state.config.presetId ?? '');
  /** Blackjack gets its own per-game animation pass (spec 2.2). */
  const isBlackjackTable = state.config.presetId === 'blackjack';
  /** Crazy Eights gets a physical card-play surface, not the generic rule rail. */
  const isCrazyEightsTable = state.config.presetId === 'crazy-eights';
  /** Sevens gets its own per-game animation pass (spec 2.8). */
  const isSevensTable = state.config.presetId === 'sevens';
  /** Poker gets its own per-game animation pass (spec 2.3). */
  const isPokerTable = state.config.presetId === 'poker';

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
  const canUseGenericHandActions = !['war', 'go-fish', 'old-maid', 'crazy-eights', 'sevens', 'klondike'].includes(state.config.presetId ?? '');
  const canFlipHand = canUseGenericHandActions && availableActions.has('flip');
  const canDiscardHand = canUseGenericHandActions && availableActions.has('discard');
  const canReorderHand = canUseGenericHandActions && availableActions.has('reorder');
  const suggestedAction = useMemo(
    () => (viewerId ? selectSuggestedAction(state, viewerId) : null),
    [state, viewerId],
  );

  // --- Per-game rule actions (blackjack twist/stick, poker burn/flop/...) ---
  const rules = useMemo(() => getGameRules(state.config.presetId), [state.config.presetId]);
  const isWar = rules.id === 'war';
  const isGoFishTable = rules.id === 'go-fish';
  const isKlondike = rules.id === 'klondike';
  const isContextualGame = rules.id === 'old-maid';
  const usesRuleActionBar = rules.id === 'old-maid' || isKlondike;
  const ruleActions = useMemo<GameActionSpec[]>(
    () => (viewerId ? rules.actions(state, viewerId) : []),
    [rules, state, viewerId],
  );
  const { width: viewportWidth } = useWindowDimensions();
  const compactRuleActions = viewportWidth < 420 && ruleActions.length > 3;
  const gameAction = useGameStore((s) => s.gameAction);
  const handleGameAction = useCallback(
    (action: GameAction) => {
      if (!viewerId) return;
      if (isGuest) {
        // Guests never mutate their local mirror. If the relay has gone away,
        // keep the table read-only until the room reconnects instead of
        // accidentally forking a private hand on this device.
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
  const myHandValue = useMemo(
    () => (viewerId ? rules.readout?.(state, viewerId) ?? null : null),
    [rules, state, viewerId],
  );
  const myBust = myHandValue !== null && myHandValue.includes('BUST');
  // --- Old Maid: who is stuck with the maid joker at the end? ---
  const maidHolder = useMemo(() => {
    if (rules.id !== 'old-maid' || state.phase !== 'ended') return null;
    for (const player of state.players) {
      const hand = state.zones[handZoneId(player.id)]?.cardIds ?? [];
      if (hand.some((cardId) => parseJokerId(cardId) !== null)) return player;
    }
    return null;
  }, [rules.id, state.phase, state.players, state.zones]);
  const nextPlayerId = useMemo(() => selectNextPlayerId(state), [state]);
  const isHost = Boolean(hostPlayerId && viewerId === hostPlayerId);
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
  const discardEntry = useSharedValue(1);
  const endedOpacity = useSharedValue(0);
  const endedTranslateY = useSharedValue(10);
  const previousDiscardId = useRef(discardTop?.id ?? null);

  const drawMotionStyle = useAnimatedStyle(() => ({
    opacity: drawOpacity.value,
    transform: reduceMotion ? [] : [{ scale: drawScale.value }],
  }));
  const discardMotionStyle = useAnimatedStyle(() => ({
    opacity: discardOpacity.value,
    transform: reduceMotion
      ? []
      : [
          { translateY: (1 - discardEntry.value) * -48 },
          { rotate: `${(1 - discardEntry.value) * -7}deg` },
          { scale: discardEntry.value * discardScale.value },
        ],
  }));
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

  useEffect(() => {
    const nextDiscardId = discardTop?.id ?? null;
    const previousId = previousDiscardId.current;
    previousDiscardId.current = nextDiscardId;
    if (!nextDiscardId || nextDiscardId === previousId) return;

    if (reduceMotion) {
       
      discardEntry.value = 1;
       
      discardOpacity.value = withTiming(0.72, { duration: motion.duration.fast }, () => {
        discardOpacity.value = withTiming(1, { duration: motion.duration.fast });
      });
      return;
    }

    cancelAnimation(discardScale);
    cancelAnimation(discardEntry);
    // Reanimated shared values are intentionally mutable inside effects.
     
    discardScale.value = 1;
    discardEntry.value = 0;
    discardEntry.value = withSpring(1, motion.spring.card);
    discardScale.value = withSequence(
      withTiming(DISCARD_PULSE_SCALE, { duration: motion.duration.fast }),
      withTiming(1, { duration: motion.duration.fast }),
    );
  }, [discardEntry, discardOpacity, discardScale, discardTop?.id, previousDiscardId, reduceMotion]);

  const handleDrawPressIn = useCallback(() => {
    if (reduceMotion) {
       
      drawOpacity.value = withTiming(0.72, { duration: motion.duration.fast });
      return;
    }
     
    drawScale.value = withSpring(0.96, motion.spring.press);
  }, [drawOpacity, drawScale, reduceMotion]);

  const handleDrawPressOut = useCallback(() => {
     
    drawOpacity.value = withTiming(1, { duration: motion.duration.fast });
    if (!reduceMotion) {
       
      drawScale.value = withSpring(1, motion.spring.press);
    }
  }, [drawOpacity, drawScale, reduceMotion]);

  const currentPlayerName = useMemo(() => {
    const p = state.players.find((pl) => pl.id === currentPlayerId);
    return p?.name ?? '';
  }, [state.players, currentPlayerId]);

  const surfaceStyle = useLayerSurfaceEntrance(active);

  // --- Card face resolver for HandFan ---
  const faceFor = useCallback(
    (card: CardInstance): CardFace => selectCardFace(state, card.id, viewerId),
    [state, viewerId],
  );

  // --- Handlers ---
  const handleDrawCard = useCallback(() => {
    if (!isMyTurn || !viewerId || !canUseGenericHandActions) return;
    if (isGuest && lobbySession) {
      void lobbySession.sendIntent('draw_card', {});
      return;
    }
    const topCardId = selectDrawTopCardId(state);
    if (!topCardId) return;
    haptic('medium');
    dealCard(topCardId, handZoneId(viewerId), 'up');
  }, [isMyTurn, viewerId, canUseGenericHandActions, isGuest, lobbySession, state, haptic, dealCard]);

  const handleCardPress = useCallback(
    (cardId: string) => {
      if (!viewerId || !isMyTurn || !canFlipHand) return;
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
    [viewerId, isMyTurn, canFlipHand, state.cards, isGuest, lobbySession, haptic, flipCard],
  );

  const handleCardLongPress = useCallback(
    (cardId: string) => {
      if (!viewerId || !isMyTurn || !canDiscardHand) return;
      if (isGuest && lobbySession) {
        void lobbySession.sendIntent('move_card', { cardId, toZoneId: ZONE_DISCARD, face: 'up' });
        return;
      }
      haptic('medium');
      moveCard(cardId, ZONE_DISCARD, 'up');
    },
    [viewerId, isMyTurn, canDiscardHand, isGuest, lobbySession, haptic, moveCard],
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

  const canSortHand = canUseGenericHandActions && localHand.length > 1 && isMyTurn;
  const handleSortHand = useCallback(() => {
    if (!viewerId || !canSortHand) return;
    haptic('light');
    const nextMode: HandSortMode = handSortMode === 'rank' ? 'suit' : 'rank';
    toggleHandSortMode();
    const sortedIds = sortHandCards(localHand.map((c) => c.id), nextMode);
    reorderHand(viewerId, sortedIds);
  }, [viewerId, canSortHand, haptic, handSortMode, toggleHandSortMode, localHand, reorderHand]);


  const handleBackToHub = useCallback(() => {
    haptic('light');
    setViewMode('hub');
  }, [haptic, setViewMode]);

  const handleReorder = useCallback(
    (order: CardId[]) => {
      if (!viewerId || !canReorderHand) return;
      reorderHand(viewerId, order);
    },
    [viewerId, canReorderHand, reorderHand],
  );

  const handHint = isKlondike
    ? 'Tap a face-up card, then a foundation or tableau destination'
    : rules.id === 'old-maid'
      ? !isMyTurn
        ? `Waiting for ${currentPlayerName || 'the next player'} · keep your maid hidden`
        : 'Pair up first · then draw one card from the next hand'
    : !isMyTurn
      ? `Waiting for ${currentPlayerName || 'the next player'} · your hand stays ready`
      : 'Tap flip · swipe up discard · drag sideways to reorder';
  /** While a recipient must long-press to reveal, hide the hand under the veil. */
  const handLocked = state.privacySeat !== null;
  const shouldShowHandHint = !handLocked && (localHand.length > 0 || isContextualGame);

  // --- Empty / loading fallback ---
  if (!hasSession) {
    return (
      <Animated.View
        pointerEvents={active ? 'auto' : 'none'}
        style={[styles.root, { bottom: bottomInset }, surfaceStyle]}
      >
        <TableSurface mode="play" />
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
  const tableTitle = (state.config.presetId ?? 'table').replace(/-/g, ' ').toUpperCase();

  // --- Crazy Eights: dedicated physical card-play surface. ---
  if (isCrazyEightsTable && viewerId) {
    return (
      <CrazyEightsTable
        active={active}
        topInset={topInset}
        bottomInset={bottomInset}
      />
    );
  }

  // --- War: dedicated physical battle surface. ---
  if (isWar && viewerId) {
    return (
      <WarTable
        active={active}
        topInset={topInset}
        bottomInset={bottomInset}
      />
    );
  }

  // --- Go Fish: dedicated ask surface (target block + books strip). ---
  if (isGoFishTable && viewerId) {
    return (
      <GoFishTable
        active={active}
        topInset={topInset}
        bottomInset={bottomInset}
      />
    );
  }

  // --- Sevens: dedicated per-game animation pass (ring pulse, 90ms snake,
  // pass chip slide, drag & drop plays). ---
  if (isSevensTable && viewerId) {
    return (
      <SevensTable
        active={active}
        topInset={topInset}
        bottomInset={bottomInset}
      />
    );
  }

  // --- Solitaire games: render the dedicated solitaire board ---
  if (isSolitaire && viewerId) {
    return (
      <Animated.View
        pointerEvents={active ? 'auto' : 'none'}
        style={[styles.root, { bottom: bottomInset }, surfaceStyle]}
      >
        <TableShell
          title={tableTitle}
          active={active}
          onBackToHub={handleBackToHub}
          topInset={topInset}
          bottomInset={0}
        >
          <SolitaireBoard
            state={state}
            viewerId={viewerId}
          />
        </TableShell>
      </Animated.View>
    );
  }

  // --- Blackjack: dedicated per-game animation pass (twist cascade, dealer
  // auto-play, bust shake/flash, hand-over pop). ---
  if (isBlackjackTable && viewerId) {
    return (
      <BlackjackTable
        active={active}
        topInset={topInset}
        bottomInset={bottomInset}
      />
    );
  }

  // --- Poker: dedicated per-game animation pass (burn slide, flop fan,
  // turn/river settle, showdown cascade, pot pulse). ---
  if (isPokerTable && viewerId) {
    return (
      <PokerTable
        active={active}
        topInset={topInset}
        bottomInset={bottomInset}
      />
    );
  }

  return (
    <Animated.View
      pointerEvents={active ? 'auto' : 'none'}
      style={[styles.root, { bottom: bottomInset }, surfaceStyle]}
    >
      <TableShell
        title={tableTitle}
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
        {isKlondike ? (
          <KlondikeLayout state={state} onAction={handleGameAction} back={equippedBackId} />
        ) : rules.id === 'old-maid' ? (
          <View style={styles.contextualPiles}>
            {/* Collected Old Maid pairs stay visible on the felt. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.feltStacks}
            >
              {state.players.map((player) => {
                const collected = state.zones[tableZoneId(player.id)]?.cardIds ?? [];
                if (collected.length === 0) return null;
                return (
                  <FeltStack
                    key={player.id}
                    playerName={player.name}
                    cards={collected.map((cardId) => state.cards[cardId]).filter((card): card is CardInstance => Boolean(card))}
                    kindLabel="PAIRS"
                    back={equippedBackId}
                    reduceMotion={reduceMotion}
                  />
                );
              })}
            </ScrollView>
          </View>
        ) : (
          <View style={styles.tablePiles}>
            {/* Generic draw pile. Dedicated games return before this surface. */}
            {!isContextualGame && (
              <Animated.View
                style={[
                  styles.deckStack,
                  drawMotionStyle,
                  suggestedAction === 'draw' && styles.suggestedDeck,
                ]}
              >
                <Pressable
                  onPress={handleDrawCard}
                  onLongPress={isHost ? handleShuffle : undefined}
                  onPressIn={handleDrawPressIn}
                  onPressOut={handleDrawPressOut}
                  disabled={!isMyTurn || drawCount === 0 || !canUseGenericHandActions}
                  accessibilityRole="button"
                  accessibilityLabel={`Draw pile, ${drawCount} cards left`}
                  accessibilityHint={
                    suggestedAction === 'draw'
                      ? `Suggested next move. Tap to draw a card.${isHost ? ' Hold to shuffle.' : ''}`
                      : `Tap to draw a card when it is your turn.${isHost ? ' Hold to shuffle.' : ''}`
                  }
                  style={[
                    styles.deckTrigger,
                    (!isMyTurn || drawCount === 0 || !canUseGenericHandActions) && { opacity: 0.5 },
                  ]}
                >
                  <PlayingCard face="down" size="md" back={equippedBackId} />
                  <Text style={styles.deckLeftText}>{drawCount} LEFT</Text>
                </Pressable>
              </Animated.View>
            )}

            {/* Discard slot */}
            {discardTop && discardParsed ? (
              <Animated.View key={`discard-${discardTop.id}`} style={[styles.activeSlot, discardMotionStyle]}>
                <PlayingCard
                  rank={discardParsed.rank}
                  suit={discardParsed.suit}
                  face={discardTop.face}
                  size="lg"
                  elevated
                />
              </Animated.View>
            ) : discardTop && discardJoker ? (
              <Animated.View key={`discard-${discardTop.id}`} style={[styles.activeSlot, discardMotionStyle]}>
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
        )}

      </View>

      {/* Ended banner */}
      {state.phase === 'ended' && (
        <Animated.View style={[styles.endedBanner, endedMotionStyle]} pointerEvents="box-none">
          <View style={styles.endedCard}>
            <Text style={styles.endedEyebrow}>
              {isKlondike ? 'TABLE OVER' : isSolo ? 'HAND OVER' : 'SESSION OVER'}
            </Text>
            <Text style={styles.endedTitle}>
              {isKlondike
                ? state.winnerId === viewerId
                  ? 'Foundations complete'
                  : 'Table cleared'
                : isSolo
                ? state.winnerId === viewerId
                  ? 'You beat the house'
                  : 'House wins this hand'
                : rules.id === 'old-maid'
                ? state.winnerId === viewerId
                  ? 'You dodged the maid'
                  : `${state.players.find((p) => p.id === state.winnerId)?.name ?? 'Winner'} dodged the maid`
                : state.winnerId
                  ? state.winnerId === viewerId
                    ? 'You take the table'
                    : `${state.players.find((p) => p.id === state.winnerId)?.name ?? 'Winner'} takes the table`
                  : 'Table cleared'}
            </Text>
            {rules.id === 'old-maid' && maidHolder && (
              <View style={styles.maidReveal} accessible accessibilityRole="text" accessibilityLabel={`The maid stays with ${maidHolder.name}`}>
                <PlayingCard jokerColor="red" face="up" size="sm" />
                <Text style={styles.maidRevealText}>
                  {maidHolder.id === viewerId ? 'You hold the maid' : `The maid stays with ${maidHolder.name}`}
                </Text>
              </View>
            )}
            <Text style={styles.endedMeta}>
              {rules.id === 'old-maid'
                ? `${Math.floor((state.zones[tableZoneId(state.winnerId ?? '')]?.cardIds.length ?? 0) / 2)} pairs · `
                : ''}
              Round complete · {state.turn} {state.turn === 1 ? 'turn' : 'turns'}
            </Text>
            {isPassMode ? (
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
                    startNextHand();
                  } else {
                    setViewMode('hub');
                  }
                }}
                style={styles.endedCta}
              >
                <Text style={styles.endedCtaText}>
                  {state.meta.mode === 'solo' ? (isKlondike ? 'New deal' : 'Next hand') : 'Back to setup'}
                </Text>
              </CardButton>
            )}
          </View>
        </Animated.View>
      )}
      {/* Game decisions stay separate from the shell's single utility trigger. */}
      {state.phase !== 'ended' && (usesRuleActionBar || isPassMode || isOnline) && (
        <View style={[styles.actionBar, { marginBottom: bottomInset > 0 ? 0 : space.lg }]}>
          {usesRuleActionBar ? (
            ruleActions.length > 0 ? (
              compactRuleActions ? (
                <View style={[styles.ruleActions, styles.ruleActionsCompact]}>
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
                      <Text style={styles.ruleActionText} numberOfLines={1}>{spec.label}</Text>
                    </CardButton>
                  ))}
                </View>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.ruleActionsScroll}
                  contentContainerStyle={styles.ruleActions}
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
                      <Text style={styles.ruleActionText} numberOfLines={1}>{spec.label}</Text>
                    </CardButton>
                  ))}
                </ScrollView>
              )
            ) : (
              <Text style={styles.ruleWaitingText}>
                {isMyTurn ? 'WAITING FOR THE NEXT MOVE' : `${currentPlayerName.toUpperCase()} · TO PLAY`}
              </Text>
            )
          ) : (
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
          )}
        </View>
      )}

      {/* Local hand */}
      {!isKlondike && <View style={[styles.hand, { paddingBottom: bottomInset + space.lg }]}>
        {handLocked ? (
          <View style={styles.hiddenHand}>
            <Text style={styles.hiddenText}>HAND LOCKED — REVEAL TO CONTINUE</Text>
          </View>
        ) : state.config.fanStyle === 'stacked' ? (
          <HandStack
            cards={localHand}
            faceFor={faceFor}
            onCardPress={canFlipHand ? handleCardPress : undefined}
            onCardLongPress={canDiscardHand ? handleCardLongPress : undefined}
            onReorder={handleReorder}
            reorderEnabled={canReorderHand}
            size="md"
            dealTrigger={dealTrigger}
          />
        ) : (
          <HandFan
            cards={localHand}
            viewerId={viewerId}
            faceFor={faceFor}
            fanStyle={state.config.fanStyle}
            onCardPress={canFlipHand ? handleCardPress : undefined}
            onCardLongPress={canDiscardHand ? handleCardLongPress : undefined}
            onReorder={handleReorder}
            reorderEnabled={canReorderHand}
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
        {shouldShowHandHint ? (
          <Text style={styles.handHint} accessibilityRole="text">
            {handHint}
          </Text>
        ) : null}
        {rules.readout && (localHand.length > 0 || isContextualGame || isKlondike) && myHandValue !== null && (
          <View style={[styles.valuePill, myBust && styles.valuePillBust]}>
            <Text style={styles.valuePillText}>{myHandValue}</Text>
          </View>
        )}
      </View>}

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
  contextualPiles: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    width: '100%',
  },
  feltStacks: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: space.lg,
    paddingHorizontal: space.md,
  },
  feltStack: {
    alignItems: 'center',
    maxWidth: 120,
  },
  feltStackFan: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 26,
  },
  feltStackCard: {
    marginLeft: -6,
  },
  feltStackLabel: {
    marginTop: space.xs,
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.inkMuted,
    letterSpacing: letterSpacing.caps,
    textAlign: 'center',
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
    color: colors.inkSubtle,
    fontSize: 10,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.caps,
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

  ruleActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: space.xs,
    paddingHorizontal: space.xs,
  },
  ruleActionsCompact: {
    flexWrap: 'wrap',
    justifyContent: 'center',
    maxWidth: 160,
  },
  ruleActionsScroll: {
    flexShrink: 1,
    flexGrow: 0,
    maxWidth: '100%',
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
  ruleWaitingText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.micro,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.cap,
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
  endedActions: {
    alignSelf: 'stretch',
    gap: space.xs,
  },
  endedCtaText: {
    color: colors.surface,
    fontSize: fontSizes.small + 1,
    fontFamily: fonts.bold,
  },
  endedMeta: {
    marginBottom: space.md,
    fontSize: fontSizes.caption,
    fontFamily: fonts.semibold,
    color: colors.inkMuted,
    letterSpacing: letterSpacing.cap,
    textTransform: 'uppercase',
  },
  maidReveal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radii.md,
    backgroundColor: alpha.inkOverlay06,
  },
  maidRevealText: {
    fontSize: fontSizes.caption,
    fontFamily: fonts.semibold,
    color: colors.ink,
    letterSpacing: letterSpacing.cap,
    textTransform: 'uppercase',
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
  valuePill: {
    alignSelf: 'center',
    marginTop: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.brand,
  },
  valuePillBust: {
    backgroundColor: colors.ink,
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
