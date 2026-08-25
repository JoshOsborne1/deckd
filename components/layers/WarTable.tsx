import React, { useCallback, useEffect, useMemo } from 'react';
import {
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
import { CardButton } from '@components/CardButton';
import { PlayingCard } from '@components/PlayingCard';
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
 * centre well where the played cards land, and one primary action: tapping
 * your own pile. The cards are the controls; there is no detached action dock.
 */
export function WarTable({ active, topInset, bottomInset }: WarTableProps) {
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
  const opponents = useMemo(
    () => (viewerId ? selectOpponents(state, viewerId) : []),
    [state, viewerId],
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
      <TableShell
        title="WAR"
        active={active}
        topInset={topInset}
        bottomInset={0}
        onBackToHub={handleBackToHub}
      >
      <View style={[styles.table, compact && styles.tableCompact]}>
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
          <Pressable
            style={[styles.pileBlock, flipSpec && styles.pileBlockReady]}
            onPress={handleFlip}
            disabled={!flipSpec}
            accessibilityRole="button"
            accessibilityLabel={`Play the top card from your pile, ${myPile.length} cards remain`}
            accessibilityHint={flipSpec ? 'Tap to send the top card into battle.' : 'Wait for your turn.'}
          >
            <View style={styles.pileStack}>
              <PlayingCard face="down" size="sm" back={equippedBackId} />
              <View style={styles.pileCountChip}>
                <Text style={styles.pileCountText}>{myPile.length}</Text>
              </View>
            </View>
            <Text style={styles.pileName}>{flipSpec ? 'TAP TO PLAY' : 'YOU'}</Text>
          </Pressable>
          <View style={styles.vsMark}>
            <Text style={styles.vsText}>VS</Text>
          </View>
          <View style={styles.pileBlock}>
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
  pileBlockReady: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.brand,
    padding: space.xs,
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
