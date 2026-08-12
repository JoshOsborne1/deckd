import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, Alert } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { BookOpen, ChevronLeft, Clock, Flag, Menu, Shuffle, Undo2, ArrowDownAZ } from 'lucide-react-native';
import { AvatarPlaceholder } from '@components/AvatarPlaceholder';
import { CardButton } from '@components/CardButton';
import { CardSection } from '@components/CardSection';
import { TableSurface } from '@components/TableSurface';
import { PlayingCard } from '@components/PlayingCard';

import { EventHistoryModal } from '@components/EventHistoryModal';
import { RulesSheet } from '@components/RulesSheet';
import { KlondikeLayout } from '@components/KlondikeLayout';
import { HandFan } from '@components/HandFan';
import { HandStack } from '@components/HandStack';
import { SolitaireBoard } from '@components/SolitaireBoard';
import { BlackjackTable } from '@components/layers/BlackjackTable';
import { SevensTable } from '@components/layers/SevensTable';
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
  selectCanUndo,
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
  sortHandCards,
  type GuidancePhase,
  type HandSortMode,
  type TableAction,
} from '@engine/selectors';
import {
  ZONE_DISCARD,
  communalZoneId,
  handZoneId,
  tableZoneId,
  type CardFace,
  type CardId,
  type CardInstance,
  type GameState,
} from '@engine/types';
import {
  getGameRules,
  sevensRunLayout,
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

interface CommunityStreetCardProps {
  card: CardInstance;
  delay: number;
  reduceMotion: boolean;
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

/**
 * A street card lands from the deck line instead of appearing as a static
 * row. Each keyed card owns its entrance so a later turn/river card settles
 * into the existing community row without replaying the opening deal.
 */
function CommunityStreetCard({ card, delay, reduceMotion }: CommunityStreetCardProps) {
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
      <PlayingCard
        rank={parsed.rank}
        suit={parsed.suit}
        face={card.face}
        size="xs"
      />
    </Animated.View>
  );
}

const SEVENS_SUIT_GLYPHS: Record<string, string> = {
  hearts: '♥',
  diamonds: '♦',
  spades: '♠',
  clubs: '♣',
};

/**
 * Sevens (Fan Tan) board: the four suit runs growing outward from the 7s.
 * Each lane is a row of xs cards anchored by its 7, so the run structure is
 * readable at a glance instead of a flat pile. Cards land with the same
 * settle entrance as the community row; reduced motion = plain fade.
 */
function SevensRuns({ tableCardIds, state, reduceMotion }: { tableCardIds: string[]; state: GameState; reduceMotion: boolean }) {
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
                  return (
                    <CommunityStreetCard
                      key={cid}
                      card={card}
                      delay={index * motion.stagger.deal}
                      reduceMotion={reduceMotion}
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

export function TableLayer({ active, topInset, bottomInset }: TableLayerProps) {
  const { haptic, reduceMotion } = useMotion();
  const setViewMode = useUiStore((s) => s.setViewMode);
  const equippedBackId = useCosmeticsStore((s) => s.equippedBackId);
  const openPass = useUiStore((s) => s.openPass);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const state = useGameStore((s) => s.state);
  const events = useGameStore((s) => s.events);
  const dealCard = useGameStore((s) => s.dealCard);
  const flipCard = useGameStore((s) => s.flipCard);
  const moveCard = useGameStore((s) => s.moveCard);
  const endTurn = useGameStore((s) => s.endTurn);
  const endSession = useGameStore((s) => s.endSession);
  const startNextHand = useGameStore((s) => s.startNextHand);
  const replaySession = useGameStore((s) => s.replaySession);
  const dispatch = useGameStore((s) => s.dispatch);
  const reorderHand = useGameStore((s) => s.reorderHand);
  const undoLastAction = useGameStore((s) => s.undoLastAction);

  const lobbyStatus = useLobbyStore((s) => s.status);
  const lobbySession = useLobbyStore((s) => s.session);
  const localClientId = useLobbyStore((s) => s.localClientId);

  const handSortMode = useUiStore((s) => s.handSortMode);
  const toggleHandSortMode = useUiStore((s) => s.toggleHandSortMode);

  /** True when the current game is an online relay session. Derived from the
   *  game mode, not the session object, so it stays true when the socket
   *  drops and the session is torn down (prevents the host-view fallback). */
  const isOnline = state.meta.mode === 'online-host' || state.meta.mode === 'online-guest';
  /** Guest view: the game was started as an online guest. */
  const isGuest = state.meta.mode === 'online-guest';

  // Return to hub cleanly when the relay room closes or the session ends.
  useEffect(() => {
    if (lobbyStatus === 'closed' && isOnline) {
      setViewMode('hub');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyStatus, isOnline]);

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

  // --- Solitaire games render their own dedicated board (FreeCell/Pyramid/Golf).
  // Klondike renders through KlondikeLayout (main's suit-based implementation). ---
  const isSolitaire = ['freecell', 'pyramid', 'golf'].includes(state.config.presetId ?? '');
  /** Blackjack gets its own per-game animation pass (spec 2.2). */
  const isBlackjackTable = state.config.presetId === 'blackjack';
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
  const canUndo = useMemo(
    () => (viewerId ? selectCanUndo(state, viewerId) : false),
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
  const isKlondike = rules.id === 'klondike';
  const isContextualGame = ['go-fish', 'old-maid', 'crazy-eights', 'sevens'].includes(rules.id);
  const usesRuleActionBar = [
    'blackjack',
    'poker',
    'war',
    'go-fish',
    'old-maid',
    'crazy-eights',
    'sevens',
    'klondike',
  ].includes(rules.id);
  const ruleActions = useMemo<GameActionSpec[]>(
    () => (viewerId ? rules.actions(state, viewerId) : []),
    [rules, state, viewerId],
  );
  const isPoker = rules.id === 'poker';
  const pokerBetting = isPoker ? state.game?.betting : undefined;
  const opponentStackLabel = opponents.length === 1 ? 'OPP STACK' : 'LIVE SEATS';
  const opponentStackValue = pokerBetting
    ? opponents.length === 1
      ? pokerBetting.stacks[opponents[0]?.id ?? ''] ?? 0
      : opponents.length
    : null;
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
    () => (viewerId && !isPoker ? rules.readout?.(state, viewerId) ?? null : null),
    [isPoker, rules, state, viewerId],
  );
  const myBust = myHandValue !== null && myHandValue.includes('BUST');
  const communityCards = useMemo(
    () => state.zones[communalZoneId(0)]?.cardIds ?? [],
    [state],
  );
  const warPiles = useMemo(
    () => (isWar
      ? state.players.map((player) => {
          const pile = state.zones[tableZoneId(player.id)];
          return {
            player,
            topCardId: pile?.cardIds[0] ?? null,
            count: pile?.cardIds.length ?? 0,
          };
        })
      : []),
    [isWar, state],
  );
  const streetLabel = isWar
    ? (communityCards.length > 0 ? (state.game?.street && state.game.street >= 2 ? 'WAR' : 'BATTLE') : null)
    : state.game?.street
      ? ['FLOP', 'TURN', 'RIVER'][state.game.street - 1] ?? null
      : null;
  const guidanceState = useMemo<GuidancePhase>(
    () => (viewerId ? selectGuidanceState(state, viewerId) : 'waiting'),
    [state, viewerId],
  );
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

  useEffect(() => {
    const nextDiscardId = discardTop?.id ?? null;
    const previousId = previousDiscardId.current;
    previousDiscardId.current = nextDiscardId;
    if (!nextDiscardId || nextDiscardId === previousId) return;

    if (reduceMotion) {
      // eslint-disable-next-line react-hooks/immutability
      discardEntry.value = 1;
      // eslint-disable-next-line react-hooks/immutability
      discardOpacity.value = withTiming(0.72, { duration: motion.duration.fast }, () => {
        discardOpacity.value = withTiming(1, { duration: motion.duration.fast });
      });
      return;
    }

    cancelAnimation(discardScale);
    cancelAnimation(discardEntry);
    // Reanimated shared values are intentionally mutable inside effects.
    // eslint-disable-next-line react-hooks/immutability
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

    if (isContextualGame && guidanceState !== 'ended') {
      if (!isMyTurn) {
        const waitingFor = currentPlayerName || 'The next player';
        return {
          eyebrow: 'PASS THE TABLE',
          title: waitingFor === 'You' ? "You're choosing" : `${waitingFor} is choosing`,
          detail: 'Watch the table; your hand will be ready when the turn comes around.',
        };
      }
      const firstAction = ruleActions[0];
      return {
        eyebrow: 'YOUR TURN',
        title: rules.id === 'go-fish'
          ? 'Ask for a rank'
          : rules.id === 'old-maid'
            ? 'Pair before you draw'
            : rules.id === 'crazy-eights'
              ? 'Play to the discard'
              : 'Build the runs',
        detail: firstAction?.hint ?? 'Choose the next move from the action rail.',
      };
    }

    if (isPoker && guidanceState !== 'ended') {
      const hasStreetControl = ruleActions.some((action) => action.kind === 'host');
      if (hasStreetControl) {
        return {
          eyebrow: 'TABLE READY',
          title: 'Advance the hand',
          detail: ruleActions[0]?.hint ?? 'Burn, deal the next street, or reveal at showdown.',
        };
      }
      if (!isMyTurn) {
        const waitingFor = currentPlayerName || 'The next player';
        return {
          eyebrow: 'BETTING ROUND',
          title: `${waitingFor} is choosing`,
          detail: 'Watch the pot and stack ledger; the next action will appear when the table is passed.',
        };
      }
      return {
        eyebrow: 'YOUR TURN',
        title: 'Choose your bet',
        detail: ruleActions[0]?.hint ?? 'Fold, check, call, or raise.',
      };
    }

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
          title:
            waitingFor === 'You' ? "You're choosing" : `${waitingFor} is choosing`,
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
  }, [availableActions, currentPlayerName, guidanceState, isContextualGame, isMyTurn, isPoker, ruleActions, rules.id, suggestedAction]);

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

  const handleHistory = useCallback(() => {
    haptic('light');
    setHistoryOpen(true);
  }, [haptic]);

  const handleUndo = useCallback(() => {
    haptic('medium');
    undoLastAction();
  }, [haptic, undoLastAction]);

  const canSortHand = canUseGenericHandActions && localHand.length > 1 && isMyTurn;
  const handleSortHand = useCallback(() => {
    if (!viewerId || !canSortHand) return;
    haptic('light');
    const nextMode: HandSortMode = handSortMode === 'rank' ? 'suit' : 'rank';
    toggleHandSortMode();
    const sortedIds = sortHandCards(localHand.map((c) => c.id), nextMode);
    reorderHand(viewerId, sortedIds);
  }, [viewerId, canSortHand, haptic, handSortMode, toggleHandSortMode, localHand, reorderHand]);

  const handleRules = useCallback(() => {
    haptic('light');
    setRulesOpen(true);
  }, [haptic]);

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

  const handleReorder = useCallback(
    (order: CardId[]) => {
      if (!viewerId || !canReorderHand) return;
      reorderHand(viewerId, order);
    },
    [viewerId, canReorderHand, reorderHand],
  );

  const handHint = isWar
    ? !isMyTurn
      ? `Waiting for ${currentPlayerName || 'the next player'} · watch the battle`
      : 'Tap FLIP to play the top card · highest rank takes the battle'
    : isKlondike
      ? 'Tap a face-up card, then a foundation or tableau destination'
    : rules.id === 'go-fish'
      ? !isMyTurn
        ? `Waiting for ${currentPlayerName || 'the next player'} · listen for the ask`
        : 'Ask for a rank · collect four to make a book'
    : rules.id === 'old-maid'
      ? !isMyTurn
        ? `Waiting for ${currentPlayerName || 'the next player'} · keep your maid hidden`
        : 'Pair up first · then draw one card from the next hand'
    : rules.id === 'crazy-eights'
      ? !isMyTurn
        ? `Waiting for ${currentPlayerName || 'the next player'} · watch the discard`
        : 'Match suit or rank · eights are wild'
    : rules.id === 'sevens'
      ? !isMyTurn
        ? `Waiting for ${currentPlayerName || 'the next player'} · watch the runs grow`
        : 'Play a seven to open · then build each suit outward'
    : !isMyTurn
      ? `Waiting for ${currentPlayerName || 'the next player'} · your hand stays ready`
      : 'Tap flip · swipe up discard · drag sideways to reorder';
  /** While a recipient must long-press to reveal, hide the hand under the veil. */
  const handLocked = state.privacySeat !== null;
  const shouldShowHandHint = !handLocked && (localHand.length > 0 || isWar || isContextualGame);

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
        <TableSurface mode="play" />
        <SolitaireBoard
          state={state}
          viewerId={viewerId}
          topInset={topInset}
          bottomInset={bottomInset}
        />
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
        {opponents.map((opp) => {
          const handSize = selectOpponentHandSize(state, opp.id);
          return (
            <View key={opp.id} style={styles.opponent}>
              <AvatarPlaceholder seed={opp.avatarSeed} label={opp.name} size={56} />
              {!isPoker && (
                <View style={styles.countPill}>
                  <Text style={styles.countText}>
                    {handSize} {handSize === 1 ? 'CARD' : 'CARDS'}
                  </Text>
                </View>
              )}
              {!isPoker && (
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
              )}
            </View>
          );
        })}
      </View>

      {/* Table middle */}
      <View style={styles.table}>
        {isPoker && pokerBetting && (
          <View
            style={styles.pokerLedger}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`Pot ${state.game?.pot ?? 0} chips. Current bet ${pokerBetting.currentBet} chips. Your stack ${pokerBetting.stacks[viewerId ?? ''] ?? 0} chips. ${opponentStackLabel} ${opponentStackValue ?? 0}.`}
          >
            <View style={styles.pokerMetric}>
              <Text style={styles.pokerMetricLabel}>POT</Text>
              <Text style={styles.pokerMetricValue}>{state.game?.pot ?? 0}</Text>
            </View>
            <View style={styles.pokerMetricRule} />
            <View style={styles.pokerMetric}>
              <Text style={styles.pokerMetricLabel}>BET</Text>
              <Text style={styles.pokerMetricValue}>{pokerBetting.currentBet}</Text>
            </View>
            <View style={styles.pokerMetricRule} />
            <View style={styles.pokerMetric}>
              <Text style={styles.pokerMetricLabel}>YOUR STACK</Text>
              <Text style={styles.pokerMetricValue}>{pokerBetting.stacks[viewerId ?? ''] ?? 0}</Text>
            </View>
            <View style={styles.pokerMetricRule} />
            <View style={styles.pokerMetric}>
              <Text style={styles.pokerMetricLabel}>{opponentStackLabel}</Text>
              <Text style={styles.pokerMetricValue}>{opponentStackValue ?? 0}</Text>
            </View>
          </View>
        )}
        {isWar ? (
          <View style={styles.warPiles}>
            {warPiles.map(({ player, count }) => (
              <View
                key={player.id}
                style={styles.warPile}
                accessible
                accessibilityRole="text"
                accessibilityLabel={`${player.name}, ${count} cards left`}
              >
                <View style={[styles.warPileCard, count === 0 && styles.warPileCardEmpty]}>
                  <PlayingCard face="down" size="md" back={equippedBackId} />
                </View>
                <Text style={styles.warPileName}>{player.name.toUpperCase()}</Text>
                <Text style={styles.warPileCount}>{count} {count === 1 ? 'CARD' : 'CARDS'}</Text>
              </View>
            ))}
          </View>
        ) : isKlondike ? (
          <KlondikeLayout state={state} onAction={handleGameAction} back={equippedBackId} />
        ) : rules.id === 'sevens' ? (
          <SevensRuns tableCardIds={communityCards} state={state} reduceMotion={reduceMotion} />
        ) : rules.id === 'go-fish' || rules.id === 'old-maid' ? (
          <View style={styles.contextualPiles}>
            {/* Books (Go Fish) / pairs (Old Maid) collected on the felt */}
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
                    kindLabel={rules.id === 'go-fish' ? 'BOOK' : 'PAIRS'}
                    back={equippedBackId}
                    reduceMotion={reduceMotion}
                  />
                );
              })}
            </ScrollView>
            {/* Draw pile — Old Maid deals the whole deck, so there is no
                pile to draw from; hide it instead of showing a dead button */}
            {rules.id !== 'old-maid' && (
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
                  disabled={!isMyTurn || drawCount === 0 || !canUseGenericHandActions}
                  accessibilityRole="button"
                  accessibilityLabel={`Draw pile, ${drawCount} cards left`}
                  accessibilityHint={
                    suggestedAction === 'draw'
                      ? 'Suggested next move. Tap to draw a card.'
                      : 'Tap to draw a card when it is your turn.'
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
          </View>
        ) : (
          <View style={styles.tablePiles}>
            {/* Draw pile — contextual rule games (crazy-eights, sevens)
                draw through their action rail; a static deck object here
                would be a dead button. The pile count lives in the
                readout instead. */}
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
                  onPressIn={handleDrawPressIn}
                  onPressOut={handleDrawPressOut}
                  disabled={!isMyTurn || drawCount === 0 || !canUseGenericHandActions}
                  accessibilityRole="button"
                  accessibilityLabel={`Draw pile, ${drawCount} cards left`}
                  accessibilityHint={
                    suggestedAction === 'draw'
                      ? 'Suggested next move. Tap to draw a card.'
                      : 'Tap to draw a card when it is your turn.'
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

        {/* Community cards (poker flop/turn/river) — Sevens renders its own suit runs */}
        {communityCards.length > 0 && rules.id !== 'sevens' && (
          <View style={styles.communityRow} pointerEvents="none">
            <Text style={styles.communityLabel}>{streetLabel}</Text>
            <View style={styles.communityCards}>
              {communityCards.map((cid, index) => {
                const card = state.cards[cid];
                if (!card) return null;
                return (
                  <CommunityStreetCard
                    key={cid}
                    card={card}
                    delay={index * motion.stagger.deal}
                    reduceMotion={reduceMotion}
                  />
                );
              })}
            </View>
          </View>
        )}
      </View>

      {/* Ended banner */}
      {state.phase === 'ended' && (
        <Animated.View style={[styles.endedBanner, endedMotionStyle]} pointerEvents="box-none">
          <View style={styles.endedCard}>
            <Text style={styles.endedEyebrow}>
              {isKlondike ? 'TABLE OVER' : state.meta.mode === 'solo' ? 'HAND OVER' : 'SESSION OVER'}
            </Text>
            <Text style={styles.endedTitle}>
              {isKlondike
                ? state.winnerId === viewerId
                  ? 'Foundations complete'
                  : 'Table cleared'
                : state.meta.mode === 'solo'
                ? state.winnerId === viewerId
                  ? 'You beat the house'
                  : 'House wins this hand'
                : rules.id === 'old-maid'
                ? state.winnerId === viewerId
                  ? 'You dodged the maid'
                  : `${state.players.find((p) => p.id === state.winnerId)?.name ?? 'Winner'} dodged the maid`
                : rules.id === 'crazy-eights'
                ? state.winnerId === viewerId
                  ? 'You play out first'
                  : `${state.players.find((p) => p.id === state.winnerId)?.name ?? 'Winner'} plays out first`
                : rules.id === 'sevens'
                ? state.winnerId === viewerId
                  ? 'You play out first'
                  : `${state.players.find((p) => p.id === state.winnerId)?.name ?? 'Winner'} plays out first`
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
              {isPoker ? `Pot ${state.game?.pot ?? 0} chips · ` : ''}
              {rules.id === 'go-fish' && state.winnerId
                ? `${Math.floor((state.zones[tableZoneId(state.winnerId)]?.cardIds.length ?? 0) / 4)} books · `
                : rules.id === 'old-maid'
                  ? `${Math.floor((state.zones[tableZoneId(state.winnerId ?? '')]?.cardIds.length ?? 0) / 2)} pairs · `
                  : ''}
              Round complete · {state.turn} {state.turn === 1 ? 'turn' : 'turns'}
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

      {isPoker && state.phase !== 'ended' && ruleActions.length > 0 && (
        <View style={styles.pokerActionsRail}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pokerActionsContent}
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

      {/* Action bar */}
      <View style={[styles.actionBar, isPoker && styles.pokerUtilityBar, { marginBottom: bottomInset > 0 ? 0 : space.lg }]}>
        <Pressable
          onPress={handleShuffle}
          disabled={!isHost}
          accessibilityRole="button"
          accessibilityLabel="Shuffle deck"
          style={({ pressed }) => [
            styles.iconBtn,
            pressed && { opacity: 0.85 },
            !isHost && { opacity: 0.5 },
          ]}
        >
          <Shuffle size={20} color={colors.inkMuted} />
        </Pressable>

        {canUndo && (
          <Pressable
            onPress={handleUndo}
            accessibilityRole="button"
            accessibilityLabel="Undo last action"
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.85 }]}
          >
            <Undo2 size={20} color={colors.brand} />
          </Pressable>
        )}

        {canSortHand && (
          <Pressable
            onPress={handleSortHand}
            accessibilityRole="button"
            accessibilityLabel={`Sort hand by ${handSortMode === 'rank' ? 'suit' : 'rank'}`}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.85 }]}
          >
            <ArrowDownAZ size={20} color={colors.inkMuted} />
          </Pressable>
        )}

        {usesRuleActionBar && !isPoker && state.phase !== 'ended' ? (
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
                    <Text style={styles.ruleActionText} numberOfLines={1}>
                      {spec.label}
                    </Text>
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
                    <Text style={styles.ruleActionText} numberOfLines={1}>
                      {spec.label}
                    </Text>
                  </CardButton>
                ))}
              </ScrollView>
            )
          ) : (
            <View style={styles.ruleWaiting}>
              <Text style={styles.ruleWaitingText}>
                {isMyTurn ? 'WAITING FOR THE NEXT MOVE' : `${currentPlayerName.toUpperCase()} · TO PLAY`}
              </Text>
            </View>
          )
        ) : isPoker ? (
          <View style={styles.pokerUtilitySpacer} />
        ) : (isPassMode || isOnline) && state.phase !== 'ended' ? (
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
            accessibilityRole="button"
            accessibilityLabel="Open event log"
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.85 }]}
          >
            <Menu size={20} color={colors.inkMuted} />
          </Pressable>
        )}

        <Pressable
          onPress={handleHistory}
          accessibilityRole="button"
          accessibilityLabel="Open event log"
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.85 }]}
        >
          <Clock size={20} color={colors.inkMuted} />
        </Pressable>

        <Pressable
          onPress={handleRules}
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel="Read table rules"
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
        {shouldShowHandHint ? (
          <Text style={styles.handHint} accessibilityRole="text">
            {handHint}
          </Text>
        ) : null}
        {rules.readout && (localHand.length > 0 || isWar || isContextualGame || isKlondike) && myHandValue !== null && (
          <View style={[styles.valuePill, myBust && styles.valuePillBust]}>
            <Text style={styles.valuePillText}>{myHandValue}</Text>
          </View>
        )}
      </View>}

      {hasSession && guidanceState !== 'ended' && !isKlondike && (
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
      <RulesSheet
        visible={rulesOpen}
        presetId={state.config.presetId}
        onClose={() => setRulesOpen(false)}
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
  pokerLedger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 360,
    marginTop: space.sm,
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
  warPiles: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: space.xxl,
  },
  warPile: {
    alignItems: 'center',
    minWidth: 110,
  },
  warPileCard: {
    borderRadius: radii.card,
    ...shadow.card,
  },
  warPileCardEmpty: {
    opacity: 0.4,
  },
  warPileName: {
    marginTop: space.sm,
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.inkMuted,
    letterSpacing: letterSpacing.caps,
  },
  warPileCount: {
    marginTop: 2,
    fontSize: 10,
    fontFamily: fonts.semibold,
    color: colors.brand,
    letterSpacing: letterSpacing.cap,
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
  communityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  communityLabel: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.caps,
  },
  communityCards: {
    flexDirection: 'row',
    gap: space.xs,
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
  guidance: {
    position: 'absolute',
    left: '50%',
    right: undefined,
    bottom: 0,
    alignSelf: 'center',
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 320,
    minHeight: 58,
    transform: [{ translateX: -160 }],
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
  pokerActionsRail: {
    alignSelf: 'stretch',
    paddingHorizontal: space.md,
    paddingTop: space.xs,
  },
  pokerActionsContent: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: space.xs,
    paddingHorizontal: space.xs,
  },
  pokerUtilityBar: {
    paddingTop: space.xs,
  },
  pokerUtilitySpacer: {
    flex: 1,
    minWidth: 0,
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
