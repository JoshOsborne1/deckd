import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { BookOpen, ChevronLeft, Clock, Flag, Undo2 } from 'lucide-react-native';
import { AvatarPlaceholder } from '@components/AvatarPlaceholder';
import { CardButton } from '@components/CardButton';
import { EventHistoryModal } from '@components/EventHistoryModal';
import { HandFan } from '@components/HandFan';
import { PlayingCard } from '@components/PlayingCard';
import { RulesSheet } from '@components/RulesSheet';
import { TableSurface } from '@components/TableSurface';
import { useLayerSurfaceEntrance } from '@hooks/useLayerSurfaceEntrance';
import { useMotion } from '@hooks/useMotion';
import { useCosmeticsStore } from '@store/cosmeticsStore';
import { useGameStore } from '@store/gameStore';
import { useLobbyStore } from '@store/lobbyStore';
import { useUiStore } from '@store/uiStore';
import {
  parseCardId,
  selectCanUndo,
  selectCardFace,
  selectCurrentPlayerId,
  selectIsMyTurn,
  selectLocalHand,
  selectOpponentHandSize,
  selectOpponents,
} from '@engine/selectors';
import {
  ZONE_DRAW,
  tableZoneId,
  type CardFace,
  type CardInstance,
  type GameState,
} from '@engine/types';
import { getGameRules, type GameAction, type GameActionSpec } from '@engine/rules';
import { alpha, colors, fonts, fontSizes, letterSpacing, motion, radii, shadow, space } from '@theme';

interface GoFishTableProps {
  active: boolean;
  topInset: number;
  bottomInset: number;
}

/**
 * Go Fish is its own surface. The ask is a question, not a pile of buttons
 * glued over the deck: a target block on the felt, the draw pile beside it,
 * and the rank choices in their own dock under the board. Books collect on
 * the felt as face-up fans. No guidance box, no duplicate status lines.
 */
export function GoFishTable({ active, topInset, bottomInset }: GoFishTableProps) {
  const { width: viewportWidth } = useWindowDimensions();
  const compact = viewportWidth <= 480;
  const { haptic, reduceMotion } = useMotion();
  const surfaceStyle = useLayerSurfaceEntrance(active);
  const setViewMode = useUiStore((s) => s.setViewMode);
  const equippedBackId = useCosmeticsStore((s) => s.equippedBackId);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const state = useGameStore((s) => s.state);
  const events = useGameStore((s) => s.events);
  const gameAction = useGameStore((s) => s.gameAction);
  const replaySession = useGameStore((s) => s.replaySession);
  const undoLastAction = useGameStore((s) => s.undoLastAction);
  const endSession = useGameStore((s) => s.endSession);

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
  const canUndo = useMemo(
    () => (viewerId ? selectCanUndo(state, viewerId) : false),
    [state, viewerId],
  );
  const currentPlayerName = useMemo(
    () => state.players.find((player) => player.id === currentPlayerId)?.name ?? '',
    [currentPlayerId, state.players],
  );

  const drawCount = state.zones[ZONE_DRAW]?.cardIds.length ?? 0;
  const askActions = ruleActions.filter((spec) => spec.id.startsWith('ask:'));
  const drawAction = ruleActions.find((spec) => spec.id === 'draw') ?? null;
  const endAction = ruleActions.find((spec) => spec.id === 'end') ?? null;
  const askTargetId = askActions[0]?.id.split(':')[1] ?? null;
  const askTarget = askTargetId
    ? state.players.find((player) => player.id === askTargetId)
    : null;
  const targetOpponent = askTarget ?? opponents[0] ?? null;
  const hasSession = events.length > 0 && state.phase !== 'idle';
  const handLocked = state.privacySeat !== null;
  const dealTrigger = useMemo(() => {
    const sessionStart = events.find((event) => event.type === 'session/start');
    return sessionStart?.meta.id ?? sessionStart?.id ?? state.meta.id ?? null;
  }, [events, state.meta.id]);

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

  const handleBackToHub = useCallback(() => {
    haptic('light');
    setViewMode('hub');
  }, [haptic, setViewMode]);

  const handleUndo = useCallback(() => {
    haptic('medium');
    undoLastAction();
  }, [haptic, undoLastAction]);

  const handleEndSession = useCallback(() => {
    Alert.alert(
      'End the table?',
      'This ends the session for everyone. You can start a new one from the hub.',
      [
        { text: 'Keep playing', style: 'cancel' },
        { text: 'End table', style: 'destructive', onPress: () => endSession(viewerId ?? undefined) },
      ],
    );
  }, [endSession, viewerId]);

  const drawScale = useSharedValue(1);
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
  const canDraw = isMyTurn && drawCount > 0 && drawAction !== null;

  const askTitle = isMyTurn
    ? askActions.length > 0
      ? 'Ask for a rank'
      : drawAction
        ? 'Draw a card'
        : endAction
          ? 'Score the books'
          : 'Watch the table'
    : 'Watch the table';
  const askHint = isMyTurn
    ? askActions.length > 0
      ? `Ask ${targetOpponent?.name ?? 'your opponent'}`
      : drawAction
        ? 'No matches in hand — draw one'
        : 'Finish and count the books'
    : `Waiting for ${currentPlayerName || 'the next player'}`;

  return (
    <Animated.View
      pointerEvents={active ? 'auto' : 'none'}
      style={[styles.root, { bottom: bottomInset }, surfaceStyle]}
    >
      <TableSurface mode="play" />

      <View style={[styles.header, { paddingTop: topInset + space.sm }]}>
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
        <Text style={styles.eyebrow}>{isMyTurn ? 'YOUR TURN' : `${currentPlayerName.toUpperCase()} · TO PLAY`}</Text>
        {lobbyStatus === 'connected' && <View style={styles.syncDot} />}
      </View>

      {opponents.length > 1 && (
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
      )}

      <View style={[styles.table, compact && styles.tableCompact]}>
        <Text style={styles.tableEyebrow}>GO FISH</Text>
        <Text style={styles.tableTitle}>{askTitle}</Text>

        <View style={styles.playArea}>
          <Animated.View style={[styles.drawObject, drawMotionStyle]}>
            <Pressable
              disabled={!canDraw}
              onPress={() => drawAction && handleGameAction(drawAction.id)}
              onPressIn={drawPressIn}
              onPressOut={drawPressOut}
              accessibilityRole="button"
              accessibilityLabel={`Draw pile, ${drawCount} cards left`}
              accessibilityHint={canDraw ? 'Tap to draw a card.' : 'The draw pile is not available right now.'}
              style={[styles.drawPressTarget, !canDraw && styles.disabledObject]}
            >
              <View style={styles.deckStackBack}>
                <PlayingCard face="down" size="sm" back={equippedBackId} />
                <View style={styles.deckOffsetCard} />
              </View>
              <Text style={styles.drawCount}>{drawCount} LEFT</Text>
              <Text style={styles.objectLabel}>{canDraw ? 'DRAW' : 'DRAW PILE'}</Text>
            </Pressable>
          </Animated.View>

          <View style={styles.targetBlock}>
            <AvatarPlaceholder
              seed={targetOpponent?.avatarSeed ?? 'p'}
              label={targetOpponent?.name ?? 'Player'}
              size={compact ? 44 : 52}
            />
            <View style={styles.targetHand}>
              {[0, 1].map((i) => (
                <PlayingCard key={i} face="down" size="xs" back={equippedBackId} style={i === 0 ? { transform: [{ translateX: 6 }] } : undefined} />
              ))}
            </View>
            <Text style={styles.targetName} numberOfLines={1}>
              {targetOpponent?.name ?? 'No target'}
            </Text>
            <Text style={styles.targetCount}>
              {targetOpponent ? `${selectOpponentHandSize(state, targetOpponent.id)} CARDS` : ''}
            </Text>
          </View>
        </View>

        <BooksStrip
          state={state}
          viewerId={viewerId}
          compact={compact}
          reduceMotion={reduceMotion}
        />

        <View style={styles.ruleLine}>
          <Text style={styles.ruleLineText}>Collect four of a kind for a book</Text>
          <Text style={styles.ruleLineAccent}>MISS · GO FISH</Text>
        </View>

        <View style={styles.readoutPill}>
          <Text style={styles.readoutText}>{readout}</Text>
        </View>
      </View>

      <View style={styles.utilityRail}>
        <Pressable
          onPress={handleUndo}
          disabled={!canUndo}
          accessibilityRole="button"
          accessibilityLabel="Undo last action"
          style={[styles.utilityButton, !canUndo && styles.utilityDisabled]}
        >
          <Undo2 size={19} color={colors.brand} />
        </Pressable>
        <View style={styles.utilityMessage}>
          <Text style={styles.utilityText} numberOfLines={1}>{askHint}</Text>
        </View>
        <Pressable onPress={() => setHistoryOpen(true)} accessibilityRole="button" accessibilityLabel="Open event log" style={styles.utilityButton}>
          <Clock size={19} color={colors.inkMuted} />
        </Pressable>
        <Pressable onPress={() => setRulesOpen(true)} accessibilityRole="button" accessibilityLabel="Read table rules" style={styles.utilityButton}>
          <BookOpen size={19} color={colors.inkMuted} />
        </Pressable>
        <Pressable onPress={handleEndSession} accessibilityRole="button" accessibilityLabel="End table" style={styles.utilityButton}>
          <Flag size={19} color={colors.brand} />
        </Pressable>
      </View>

      <View style={styles.askDock}>
        {isMyTurn && askActions.length > 0 ? (
          <View style={styles.askRow}>
            {askActions.map((spec) => (
              <CardButton
                key={spec.id}
                variant="primary"
                size="sm"
                haptic="medium"
                onPress={() => handleGameAction(spec.id)}
                style={styles.askBtn}
              >
                <Text style={styles.askBtnText}>{spec.label}</Text>
              </CardButton>
            ))}
          </View>
        ) : isMyTurn && drawAction ? (
          <View style={styles.askHintRow}>
            <Text style={styles.askHintText}>No matches — draw from the pile</Text>
          </View>
        ) : isMyTurn && endAction ? (
          <View style={styles.askHintRow}>
            <CardButton
              variant="secondary"
              size="sm"
              haptic="medium"
              onPress={() => handleGameAction(endAction.id)}
              style={styles.askBtn}
            >
              <Text style={styles.askBtnText}>{endAction.label}</Text>
            </CardButton>
          </View>
        ) : (
          <View style={styles.askHintRow}>
            <Text style={styles.askHintText}>
              {isMyTurn ? 'No ranks in hand — draw' : `Waiting for ${currentPlayerName || 'the next player'}`}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.hand}>
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
          />
        )}
      </View>

      {state.phase === 'ended' && (
        <View style={styles.endedOverlay} pointerEvents="box-none">
          <View style={styles.endedCard}>
            <Text style={styles.endedEyebrow}>SESSION OVER</Text>
            <Text style={styles.endedTitle}>
              {state.winnerId === viewerId
                ? 'You take the table'
                : `${state.players.find((player) => player.id === state.winnerId)?.name ?? 'Winner'} takes the table`}
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

      <EventHistoryModal visible={historyOpen} events={events} onClose={() => setHistoryOpen(false)} />
      <RulesSheet visible={rulesOpen} presetId={state.config.presetId} onClose={() => setRulesOpen(false)} />
    </Animated.View>
  );
}

function BooksStrip({
  state,
  viewerId,
  compact,
  reduceMotion,
}: {
  state: GameState;
  viewerId: string;
  compact: boolean;
  reduceMotion: boolean;
}) {
  const rows = state.players
    .map((player) => {
      const ids = state.zones[tableZoneId(player.id)]?.cardIds ?? [];
      return {
        player,
        cards: ids.map((cardId) => state.cards[cardId]).filter((card): card is CardInstance => Boolean(card)),
      };
    })
    .filter((entry) => entry.cards.length > 0);
  if (rows.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.booksRow}
      style={styles.booksScroll}
    >      {rows.map(({ player, cards }) => (
        <View key={player.id} style={styles.bookBlock} accessible accessibilityRole="text" accessibilityLabel={`${player.name}, ${Math.floor(cards.length / 4)} books`}>
          <View style={styles.bookFan}>
            {cards.slice(0, 8).map((card, index) => {
              const parsed = parseCardId(card.id);
              return (
                <View key={card.id} style={[styles.bookCard, { marginLeft: index === 0 ? 0 : -34 }]}>                  {parsed ? (
                    <PlayingCard rank={parsed.rank} suit={parsed.suit} face="up" size={compact ? 'xs' : 'sm'} />
                  ) : (
                    <PlayingCard face="down" size={compact ? 'xs' : 'sm'} />
                  )}
                </View>
              );
            })}
          </View>
          <Text style={styles.bookLabel} numberOfLines={1}>
            {player.id === viewerId ? 'YOU' : player.name} · {Math.floor(cards.length / 4)} {Math.floor(cards.length / 4) === 1 ? 'BOOK' : 'BOOKS'}
          </Text>
        </View>
      ))}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  backChip: {
    minWidth: 72,
    paddingHorizontal: space.sm,
  },
  backText: {
    marginLeft: 2,
    fontSize: fontSizes.small,
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
  syncDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand,
  },
  opponents: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.lg,
    minHeight: 62,
    paddingTop: space.xs,
    paddingHorizontal: space.lg,
  },
  opponent: {
    minWidth: 50,
    alignItems: 'center',
    opacity: 0.68,
  },
  opponentActive: {
    opacity: 1,
  },
  opponentName: {
    maxWidth: 72,
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
  tableEyebrow: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: letterSpacing.caps,
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
    gap: space.xl,
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
    minWidth: 96,
    minHeight: 146,
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
  targetBlock: {
    alignItems: 'center',
    gap: 2,
    minWidth: 96,
  },
  targetHand: {
    flexDirection: 'row',
    marginTop: 4,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetName: {
    marginTop: 4,
    fontSize: fontSizes.small,
    fontFamily: fonts.bold,
    color: colors.ink,
    maxWidth: 96,
  },
  targetCount: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.cap,
  },
  booksScroll: {
    width: '100%',
    marginTop: space.md,
  },
  booksRow: {
    flexDirection: 'row',
    gap: space.md,
    paddingHorizontal: space.lg,
    alignItems: 'flex-start',
  },
  bookCard: {
    position: 'relative',
  },
  bookFan: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bookBlock: {
    alignItems: 'center',
    gap: 2,
    marginRight: space.md,
  },
  bookLabel: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.inkMuted,
    letterSpacing: letterSpacing.cap,
    maxWidth: 120,
  },
  ruleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.sm,
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
  utilityRail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.lg,
    minHeight: 52,
  },
  utilityButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  utilityDisabled: {
    opacity: 0.4,
  },
  utilityMessage: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: space.xs,
  },
  utilityEyebrow: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: letterSpacing.cap,
  },
  utilityText: {
    marginTop: 2,
    fontSize: fontSizes.micro,
    fontFamily: fonts.semibold,
    color: colors.ink,
  },
  askDock: {
    minHeight: 54,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  askRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space.sm,
    alignItems: 'center',
    paddingVertical: space.xs,
  },
  askBtn: {
    minWidth: 84,
  },
  askBtnText: {
    color: colors.surface,
    fontFamily: fonts.bold,
    fontSize: fontSizes.small,
    letterSpacing: letterSpacing.cap,
  },
  askHintRow: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  askHintText: {
    fontSize: fontSizes.micro,
    fontFamily: fonts.semibold,
    color: colors.inkSubtle,
  },
  hand: {
    width: '100%',
    minHeight: 168,
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

export default GoFishTable;
