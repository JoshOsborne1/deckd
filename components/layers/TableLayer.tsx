import React, { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { ChevronLeft, Clock, Menu, Shuffle, X } from 'lucide-react-native';
import { AvatarPlaceholder } from '@components/AvatarPlaceholder';
import { CardButton } from '@components/CardButton';
import { CardSection } from '@components/CardSection';
import { PlayingCard, SIZE_MAP, type PlayingCardSize } from '@components/PlayingCard';
import { EventHistoryModal } from '@components/EventHistoryModal';
import { HandFan } from '@components/HandFan';
import { HandStack } from '@components/HandStack';
import { useLayerSurfaceEntrance } from '@hooks/useLayerSurfaceEntrance';
import { useMotion } from '@hooks/useMotion';
import { useUiStore } from '@store/uiStore';
import { useCosmeticsStore } from '@store/cosmeticsStore';
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
  const equippedBackId = useCosmeticsStore((s) => s.equippedBackId);
  const openPass = useUiStore((s) => s.openPass);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { width, height } = useWindowDimensions();

  const state = useGameStore((s) => s.state);
  const events = useGameStore((s) => s.events);
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
  const compactHeight = height < 700;
  const narrowWidth = width < 380;
  const handCardSize: 'md' | 'lg' =
    compactHeight || narrowWidth || localHand.length >= 7 ? 'md' : 'lg';
  const tableCardSize: PlayingCardSize = compactHeight || narrowWidth ? 'md' : 'lg';
  const drawCardSize: PlayingCardSize = compactHeight || narrowWidth ? 'sm' : 'md';
  const handHeight = handCardSize === 'md' ? 148 : 180;
  const tableGap = narrowWidth ? space.lg : space.xxl;
  const discardSpec = SIZE_MAP[tableCardSize];

  const currentPlayerName = useMemo(() => {
    const p = state.players.find((pl) => pl.id === currentPlayerId);
    return p?.name ?? '';
  }, [state.players, currentPlayerId]);

  const surfaceStyle = useLayerSurfaceEntrance(active);

  React.useEffect(() => {
    if (!active) {
      setMenuOpen(false);
      setHistoryOpen(false);
    }
  }, [active]);

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
      if (!viewerId || !isMyTurn) return;
      const card = state.cards[cardId];
      if (!card || card.zoneId !== handZoneId(viewerId)) return;
      haptic('medium');
      moveCard(cardId, ZONE_DISCARD, 'up');
    },
    [viewerId, isMyTurn, state.cards, haptic, moveCard],
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

  const handleMenu = useCallback(() => {
    haptic('light');
    setMenuOpen(true);
  }, [haptic]);

  const handleMenuHistory = useCallback(() => {
    haptic('light');
    setMenuOpen(false);
    setHistoryOpen(true);
  }, [haptic]);

  const handleBackToHub = useCallback(() => {
    haptic('light');
    setMenuOpen(false);
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
      <ScrollView
        horizontal
        style={styles.opponentsRail}
        contentContainerStyle={styles.opponentsContent}
        showsHorizontalScrollIndicator={false}
      >
        {opponents.map((opp) => {
          const handSize = selectOpponentHandSize(state, opp.id);
          return (
            <View key={opp.id} style={styles.opponent}>
              <AvatarPlaceholder
                seed={opp.avatarSeed}
                label={opp.name}
                size={compactHeight || narrowWidth ? 44 : 56}
              />
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
                {handSize > 1 && !narrowWidth ? (
                  <PlayingCard face="down" size="xs" back={equippedBackId} />
                ) : null}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Table middle */}
      <View style={[styles.table, compactHeight && styles.tableCompact, { gap: tableGap }]}>
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
          <PlayingCard face="down" size={drawCardSize} back={equippedBackId} />
          <Text style={styles.deckLeftText}>{drawCount} LEFT</Text>
        </Pressable>

        {/* Discard slot */}
        {discardTop && discardParsed ? (
          <View style={styles.activeSlot}>
            <PlayingCard
              rank={discardParsed.rank}
              suit={discardParsed.suit}
              face={discardTop.face}
              size={tableCardSize}
              elevated
            />
          </View>
        ) : discardTop && discardJoker ? (
          <View style={styles.activeSlot}>
            <PlayingCard
              jokerColor={discardJoker}
              face={discardTop.face}
              size={tableCardSize}
              elevated
            />
          </View>
        ) : (
          <View
            style={[
              styles.discardSlot,
              { width: discardSpec.width, height: discardSpec.height },
            ]}
          >
            <Text style={styles.discardLabel}>DISCARD</Text>
          </View>
        )}
      </View>

      {/* Action bar */}
      <View style={[styles.actionBar, compactHeight && styles.actionBarCompact]}>
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
            <Text style={styles.passBtnText}>Pass turn</Text>
          </CardButton>
        ) : (
          <Pressable
            onPress={handleMenu}
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
      <View
        style={[
          styles.hand,
          {
            minHeight: handHeight,
            paddingBottom: bottomInset + (compactHeight ? space.sm : space.lg),
          },
        ]}
      >
        {handLocked ? (
          <View style={[styles.hiddenHand, { height: handHeight }]}>
            <Text style={styles.hiddenText}>HAND LOCKED — REVEAL TO CONTINUE</Text>
          </View>
        ) : state.config.fanStyle === 'stacked' ? (
          <HandStack
            cards={localHand}
            faceFor={faceFor}
            onCardPress={handleCardPress}
            onCardLongPress={isMyTurn ? handleCardLongPress : undefined}
            onReorder={handleReorder}
            reorderEnabled={isMyTurn}
            size={handCardSize}
          />
        ) : (
          <HandFan
            cards={localHand}
            viewerId={viewerId}
            faceFor={faceFor}
            fanStyle={state.config.fanStyle}
            onCardPress={handleCardPress}
            onCardLongPress={isMyTurn ? handleCardLongPress : undefined}
            onReorder={handleReorder}
            reorderEnabled={isMyTurn}
            size={handCardSize}
          />
        )}
        {!handLocked && localHand.length > 0 ? (
          <Text style={styles.handHint} accessibilityRole="text">
            {isMyTurn
              ? 'Tap flip · swipe up discard · drag sideways to reorder'
              : 'Tap flip · wait for your turn to play cards'}
          </Text>
        ) : null}
      </View>

      <EventHistoryModal
        visible={historyOpen}
        events={events}
        onClose={() => setHistoryOpen(false)}
      />

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <View style={styles.menuBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Close table menu"
            onPress={() => setMenuOpen(false)}
          />
          <View style={[styles.menuSheet, { paddingBottom: bottomInset + space.xl }]}>
            <View style={styles.menuHeader}>
              <View>
                <Text style={styles.menuEyebrow}>TABLE MENU</Text>
                <Text style={styles.menuTitle}>Round controls</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close table menu"
                onPress={() => setMenuOpen(false)}
                style={({ pressed }) => [styles.menuClose, pressed && { opacity: 0.75 }]}
              >
                <X size={20} color={colors.inkMuted} />
              </Pressable>
            </View>
            <View style={styles.menuActions}>
              <CardButton
                variant="secondary"
                size="md"
                elevated={false}
                haptic="light"
                onPress={handleMenuHistory}
                style={styles.menuAction}
              >
                <Clock size={18} color={colors.inkMuted} />
                <Text style={styles.menuActionText}>View history</Text>
              </CardButton>
              <CardButton
                variant="ghost"
                size="md"
                elevated={false}
                haptic="light"
                onPress={handleBackToHub}
                style={styles.menuAction}
              >
                <ChevronLeft size={18} color={colors.inkMuted} />
                <Text style={styles.menuActionText}>Back to hub</Text>
              </CardButton>
            </View>
          </View>
        </View>
      </Modal>
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
  opponentsRail: {
    flexGrow: 0,
    flexShrink: 0,
  },
  opponentsContent: {
    flexGrow: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    gap: space.lg,
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
    minHeight: 150,
  },
  tableCompact: {
    paddingHorizontal: space.lg,
    minHeight: 120,
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
  actionBarCompact: {
    gap: space.md,
    paddingTop: space.xs,
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
  menuBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: alpha.inkOverlay45,
  },
  menuSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingTop: space.lg,
    paddingHorizontal: space.lg,
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.lg,
  },
  menuEyebrow: {
    fontSize: fontSizes.caption,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.caps,
  },
  menuTitle: {
    marginTop: space.xs,
    fontSize: fontSizes.h3,
    fontFamily: fonts.extra,
    color: colors.ink,
  },
  menuClose: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuActions: {
    gap: space.sm,
  },
  menuAction: {
    width: '100%',
  },
  menuActionText: {
    marginLeft: space.sm,
    fontSize: fontSizes.body,
    fontFamily: fonts.semibold,
    color: colors.inkMuted,
  },
});

export default TableLayer;
