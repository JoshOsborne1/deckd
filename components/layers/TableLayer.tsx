import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { ChevronLeft, Clock, Menu, Shuffle } from 'lucide-react-native';
import { AvatarPlaceholder } from '@components/AvatarPlaceholder';
import { CardButton } from '@components/CardButton';
import { CardSection } from '@components/CardSection';
import { PlayingCard } from '@components/PlayingCard';
import { EventHistoryModal } from '@components/EventHistoryModal';
import { HandFan } from '@components/HandFan';
import { HandStack } from '@components/HandStack';
import { useLayerSurfaceEntrance } from '@hooks/useLayerSurfaceEntrance';
import { useMotion } from '@hooks/useMotion';
import { useUiStore } from '@store/uiStore';
import { useGameStore } from '@store/gameStore';
import {
  parseCardId,
  parseJokerId,
  selectCardFace,
  selectCurrentPlayerId,
  selectDiscardTopCard,
  selectDrawPileCount,
  selectDrawTopCardId,
  selectIsMyTurn,
  selectLocalHand,
  selectNextPlayerId,
  selectOpponentHandSize,
  selectOpponents,
} from '@engine/selectors';
import {
  ZONE_DISCARD,
  handZoneId,
  type CardFace,
  type CardId,
  type CardInstance,
} from '@engine/types';
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
} from '@theme';

interface TableLayerProps {
  active: boolean;
  topInset: number;
  bottomInset: number;
}

export function TableLayer({ active, topInset, bottomInset }: TableLayerProps) {
  const { haptic } = useMotion();
  const setViewMode = useUiStore((s) => s.setViewMode);
  const openPass = useUiStore((s) => s.openPass);
  const [historyOpen, setHistoryOpen] = useState(false);

  const state = useGameStore((s) => s.state);
  const events = useGameStore((s) => s.events);
  const seq = useGameStore((s) => s.seq);
  const dealCard = useGameStore((s) => s.dealCard);
  const flipCard = useGameStore((s) => s.flipCard);
  const moveCard = useGameStore((s) => s.moveCard);
  const endTurn = useGameStore((s) => s.endTurn);
  const dispatch = useGameStore((s) => s.dispatch);
  const reorderHand = useGameStore((s) => s.reorderHand);

  /** Device owner / session host — shuffle authority. */
  const hostPlayerId = state.meta.hostId || null;
  /**
   * Pass-and-play: the shared phone shows the **current** player's hand.
   * Other modes: treat the host as the local viewer until BLE/online split.
   */
  const viewerId =
    state.meta.mode === 'pass' && state.currentPlayerId ? state.currentPlayerId : hostPlayerId;
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
  const nextPlayerId = useMemo(() => selectNextPlayerId(state), [state]);
  const isHost = Boolean(hostPlayerId && viewerId === hostPlayerId);
  const isPassMode = state.meta.mode === 'pass';

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
    if (!isMyTurn || !viewerId) return;
    const topCardId = selectDrawTopCardId(state);
    if (!topCardId) return;
    haptic('medium');
    dealCard(topCardId, handZoneId(viewerId), 'up');
  }, [isMyTurn, viewerId, state, haptic, dealCard]);

  const handleCardPress = useCallback(
    (cardId: string) => {
      if (!viewerId) return;
      const card = state.cards[cardId];
      if (!card) return;
      if (card.zoneId === handZoneId(viewerId)) {
        haptic('light');
        flipCard(cardId);
      }
    },
    [viewerId, state.cards, haptic, flipCard],
  );

  const handleCardLongPress = useCallback(
    (cardId: string) => {
      haptic('medium');
      moveCard(cardId, ZONE_DISCARD, 'up');
    },
    [haptic, moveCard],
  );

  const handlePassTurn = useCallback(() => {
    if (!viewerId || !nextPlayerId) return;
    const next = state.players.find((p) => p.id === nextPlayerId);
    if (!next) return;
    haptic('success');
    endTurn(viewerId);
    useGameStore.getState().enterPrivacy(next.id);
    openPass({
      recipientId: next.id,
      recipientName: next.name,
      recipientSeed: next.avatarSeed,
    });
  }, [viewerId, nextPlayerId, state.players, haptic, endTurn, openPass]);

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
        style={[styles.root, surfaceStyle]}
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
      style={[styles.root, surfaceStyle]}
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
                    style={{ transform: [{ rotate: '-8deg' }, { translateX: 4 }] }}
                  />
                )}
                {handSize > 1 && <PlayingCard face="down" size="xs" />}
              </View>
            </View>
          );
        })}
      </View>

      {/* Table middle */}
      <View style={styles.table}>
        {/* Draw pile */}
        <Pressable
          onPress={handleDrawCard}
          disabled={!isMyTurn || drawCount === 0}
          style={({ pressed }) => [
            styles.deckStack,
            pressed && { opacity: 0.85 },
            (!isMyTurn || drawCount === 0) && { opacity: 0.5 },
          ]}
        >
          <PlayingCard face="down" size="md" />
          <Text style={styles.deckLeftText}>{drawCount} LEFT</Text>
        </Pressable>

        {/* Discard slot */}
        {discardTop && discardParsed ? (
          <View style={styles.activeSlot}>
            <PlayingCard
              rank={discardParsed.rank}
              suit={discardParsed.suit}
              face={discardTop.face}
              size="lg"
              elevated
            />
          </View>
        ) : discardTop && discardJoker ? (
          <View style={styles.activeSlot}>
            <PlayingCard
              jokerColor={discardJoker}
              face={discardTop.face}
              size="lg"
              elevated
            />
          </View>
        ) : (
          <View style={styles.discardSlot}>
            <Text style={styles.discardLabel}>DISCARD</Text>
          </View>
        )}
      </View>

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

        {isPassMode ? (
          <CardButton
            variant="primary"
            size="md"
            haptic="medium"
            onPress={handlePassTurn}
            disabled={!isMyTurn}
            style={{
              ...styles.passBtn,
              ...(isMyTurn ? undefined : { opacity: 0.5 }),
            }}
          >
            <Text style={styles.passBtnText}>PASS TURN »</Text>
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
            size="lg"
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
            size="lg"
          />
        )}
        {!handLocked && localHand.length > 0 ? (
          <Text style={styles.handHint} accessibilityRole="text">
            Tap flip · swipe up discard · drag sideways to reorder
          </Text>
        ) : null}
      </View>

      {/* Dev-only event log debug */}
      {__DEV__ && (
        <Pressable
          onPress={() => {
            console.log(`[DEV] events: ${events.length}, seq: ${seq}`);
          }}
          style={styles.devChip}
        >
          <Text style={styles.devText}>
            EVT:{events.length} SEQ:{seq}
          </Text>
        </Pressable>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    gap: space.xxl,
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
  activeSlot: {
    padding: space.xs,
    borderWidth: 2,
    borderColor: alpha.brand10,
    borderRadius: radii.lg,
    borderStyle: 'dashed',
  },
  discardSlot: {
    width: 110,
    height: 160,
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
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xl,
    paddingTop: space.md,
  },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  passBtn: {
    paddingHorizontal: space.xxxl,
  },
  passBtnText: {
    color: colors.surface,
    fontSize: fontSizes.small + 1,
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
  devChip: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: alpha.inkOverlay20,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radii.xs,
  },
  devText: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.surface,
  },
});

export default TableLayer;
