import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { BookOpen, ChevronLeft, Clock, Flag, Undo2 } from 'lucide-react-native';
import { CardButton } from '@components/CardButton';
import { EventHistoryModal } from '@components/EventHistoryModal';
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
  selectOpponents,
} from '@engine/selectors';
import {
  communalZoneId,
  tableZoneId,
  type CardFace,
  type CardId,
  type CardInstance,
} from '@engine/types';
import { getGameRules, type GameAction, type GameActionSpec } from '@engine/rules';
import { alpha, colors, fonts, fontSizes, letterSpacing, motion, radii, shadow, space } from '@theme';

interface WarTableProps {
  active: boolean;
  topInset: number;
  bottomInset: number;
}

/**
 * War is its own surface. The battle is the whole game: two mouth piles, a
 * centre well where the played cards land, and one primary action — FLIP.
 * No guidance box, no duplicated pile counts, no card buttons on top of
 * cards. The count lives on each pile once, and the button IS the instruction.
 */
export function WarTable({ active, topInset, bottomInset }: WarTableProps) {
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

  const flipSpec = ruleActions.find((spec) => spec.id === 'flip') ?? null;
  const hasSession = events.length > 0 && state.phase !== 'idle';

  const myPile = useMemo(
    () => (viewerId ? state.zones[tableZoneId(viewerId)]?.cardIds ?? [] : []),
    [state, viewerId],
  );
  const opponent = opponents[0] ?? null;
  const opponentPile = useMemo(
    () => (opponent ? state.zones[tableZoneId(opponent.id)]?.cardIds ?? [] : []),
    [opponent, state],
  );
  const battleIds = useMemo(
    () => state.zones[communalZoneId(0)]?.cardIds ?? [],
    [state],
  );
  const street = state.game?.street ?? 0;
  const streetLabel = battleIds.length > 0 ? (street >= 2 ? 'WAR' : 'BATTLE') : null;
  const isWarDown = street === 2 || street === 3;

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

  const handleFlip = useCallback(() => {
    if (flipSpec) handleGameAction(flipSpec.id);
  }, [flipSpec, handleGameAction]);

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

  // Battle cards pop in as they land.
  const battleKey = battleIds.length > 0 ? battleIds.join(',') : 'empty';
  const battleEntry = useSharedValue(1);
  useEffect(() => {
    cancelAnimation(battleEntry);
    battleEntry.value = 0;
    battleEntry.value = withSpring(1, motion.spring.card);
  }, [battleEntry, battleKey]);
  const battleMotionStyle = useAnimatedStyle(() => ({
    opacity: battleEntry.value,
    transform: reduceMotion ? [] : [{ scale: 0.8 + battleEntry.value * 0.2 }],
  }));

  const flipScale = useSharedValue(1);
  const flipMotionStyle = useAnimatedStyle(() => ({
    transform: reduceMotion ? [] : [{ scale: flipScale.value }],
  }));
  const flipPressIn = useCallback(() => {
    if (!reduceMotion) flipScale.set(withSpring(0.96, motion.spring.press));
  }, [flipScale, reduceMotion]);
  const flipPressOut = useCallback(() => {
    flipScale.set(withSpring(1, motion.spring.press));
  }, [flipScale]);

  if (!hasSession || !viewerId) return null;

  const battleCard = (cardId: CardId | null, index: number) => {
    if (!cardId) {
      return (
        <View key={`slot-${index}`} style={styles.battleSlot}>
          <View style={styles.battlePlaceholder} />
          <Text style={styles.battleSlotLabel}>{index === 0 ? 'YOUR CARD' : 'THEIR CARD'}</Text>
        </View>
      );
    }
    const card = state.cards[cardId];
    if (!card) return null;
    const parsed = parseCardId(card.id);
    return (
      <View key={`slot-${index}`} style={styles.battleSlot}>
        <Animated.View style={battleMotionStyle}>
          {parsed ? (
            <PlayingCard
              rank={parsed.rank}
              suit={parsed.suit}
              face={faceFor(card)}
              size={compact ? 'md' : 'lg'}
              elevated
            />
          ) : (
            <PlayingCard face="down" size={compact ? 'md' : 'lg'} back={equippedBackId} />
          )}
        </Animated.View>
        <Text style={styles.battleSlotLabel}>{index === 0 ? 'YOU' : opponent?.name ?? 'THEM'}</Text>
      </View>
    );
  };

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

      <View style={[styles.table, compact && styles.tableCompact]}>
        <Text style={styles.tableEyebrow}>WAR</Text>
        <Text style={styles.tableTitle}>
          {isMyTurn ? (isWarDown ? 'Set a card down' : 'Flip to battle') : 'Watch the battle'}
        </Text>

        <View style={styles.playArea}>
          {battleCard(battleIds.at(-2) ?? null, 0)}
          <View style={styles.streetChip}>
            <Text style={styles.streetChipText}>{streetLabel ?? 'READY'}</Text>
          </View>
          {battleCard(battleIds.at(-1) ?? null, 1)}
        </View>

        <View style={styles.ruleLine}>
          <Text style={styles.ruleLineText}>Higher card takes the spoils</Text>
          <Text style={styles.ruleLineAccent}>TIE · THREE DOWN · ONE MORE</Text>
        </View>

        <View style={styles.pileRow}>
          <View style={styles.pileBlock}>
            <View style={styles.pileStack}>
              <PlayingCard face="down" size="sm" back={equippedBackId} />
              <View style={styles.pileCountChip}>
                <Text style={styles.pileCountText}>{myPile.length}</Text>
              </View>
            </View>
            <Text style={styles.pileName}>YOU</Text>
          </View>
          <View style={styles.vsMark}>
            <Text style={styles.vsText}>VS</Text>
          </View>          <View style={styles.pileBlock}>
            <View style={styles.pileStack}>
              <PlayingCard face="down" size="sm" back={equippedBackId} />
              <View style={styles.pileCountChip}>
                <Text style={styles.pileCountText}>{opponentPile.length}</Text>
              </View>
            </View>
            <Text style={styles.pileName} numberOfLines={1}>
              {opponent?.name ?? 'THEM'}
            </Text>
          </View>
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
        {!isMyTurn && (
          <View style={styles.utilityMessage}>
            <Text style={styles.utilityText} numberOfLines={1}>
              {`Waiting for ${currentPlayerName || 'the next player'}`}
            </Text>
          </View>
        )}
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

      <View style={styles.actionDock}>
        <Animated.View style={flipMotionStyle}>
          <CardButton
            variant="primary"
            size="lg"
            haptic="medium"
            onPress={handleFlip}
            disabled={!flipSpec}
            onPressIn={flipPressIn}
            onPressOut={flipPressOut}
            style={flipSpec ? styles.flipBtn : { ...styles.flipBtn, ...styles.flipBtnDisabled }}
            innerStyle={styles.flipBtnInner}
          >
            <Text style={styles.flipLabelText}>
              {isWarDown ? 'DOWN CARD' : 'FLIP'}
            </Text>
            <Text style={styles.flipBtnHint} numberOfLines={1}>
              {isMyTurn ? 'PLAY THE TOP CARD' : 'WAITING FOR THE NEXT FLIP'}
            </Text>
          </CardButton>
        </Animated.View>
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
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: space.sm,
    width: '100%',
    maxWidth: 420,
  },
  battleSlot: {
    alignItems: 'center',
    gap: space.xs,
    minWidth: 110,
  },
  battlePlaceholder: {
    width: 110,
    height: 154,
    borderRadius: radii.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: alpha.inkOverlay20,
    backgroundColor: alpha.whiteOverlay45,
  },
  battleSlotLabel: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.cap,
    maxWidth: 110,
  },
  streetChip: {
    marginBottom: 52,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.ink,
  },
  streetChipText: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.surface,
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
  pileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    marginTop: space.md,
  },
  pileBlock: {
    alignItems: 'center',
    gap: space.xs,
    minWidth: 76,
  },
  pileStack: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pileCountChip: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pileCountText: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.surface,
  },
  pileName: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.inkMuted,
    letterSpacing: letterSpacing.cap,
    maxWidth: 76,
  },
  vsMark: {
    paddingHorizontal: space.xs,
    marginBottom: 44,
  },
  vsText: {
    fontSize: 10,
    fontFamily: fonts.extra,
    color: colors.inkSubtle,
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
  actionDock: {
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  flipBtn: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 360,
  },
  flipBtnDisabled: {
    opacity: 0.45,
  },
  flipBtnInner: {
    alignItems: 'center',
    paddingVertical: space.sm,
  },
  flipLabelText: {
    color: colors.surface,
    fontFamily: fonts.extra,
    fontSize: fontSizes.h3,
    letterSpacing: letterSpacing.caps,
  },
  flipBtnHint: {
    marginTop: 2,
    fontSize: 9,
    fontFamily: fonts.bold,
    color: alpha.whiteOverlay80,
    letterSpacing: letterSpacing.cap,
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

export default WarTable;
