import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { FlipCard } from '@components/FlipCard';
import { NAV_BAR_BOTTOM_GUTTER, NAV_BAR_RESERVE } from '@components/GlobalNavBar';
import { PlayingCard } from '@components/PlayingCard';
import { useMotion } from '@hooks/useMotion';
import { brand } from '@lib/assets';
import { isIapConfigured, purchaseProduct, restorePurchases } from '@lib/iap';
import { syncMasterPassFromCustomerInfo } from '@lib/entitlement';
import { BUILTIN_CARD_BACKS } from '@engine/visuals';
import { useCosmeticsStore } from '@store/cosmeticsStore';
import { useGameStore } from '@store/gameStore';
import { useProfileStore } from '@store/profileStore';
import { useUiStore } from '@store/uiStore';
import {
  alpha,
  colors,
  fontSizes,
  fonts,
  letterSpacing,
  motion as motionTokens,
  radii,
  shadow,
  space,
} from '@theme';

/**
 * Pass catalogue. Durations are spelled out — "-24h / -Lifetime" read as
 * negative durations. Timed passes are host passes; Master is the lifetime
 * bundle, described by the two benefit tiles that follow the row.
 */
const PASSES = [
  { id: 'deckd_pass_deal', title: 'Deal', subtitle: 'Host pass', duration: '24 hours', price: '£0.99' },
  { id: 'deckd_pass_draw', title: 'Draw', subtitle: 'Host pass', duration: '3 days', price: '£2.99' },
  { id: 'deckd_pass_shuffle', title: 'Shuffle', subtitle: 'Host pass', duration: '30 days', price: '£5.99' },
  { id: 'deckd_master', title: 'Master', subtitle: 'Every host pass', duration: 'Lifetime', price: '£24.99' },
];

/**
 * Master benefits, split into two honest tiles instead of one flattened
 * "Host + Cosmetic" card. Capacity numbers are the real product limits:
 * relay rooms cap at 8 players (server/index.js MAX_PLAYERS_PER_ROOM),
 * pass-and-play tables cap at 6. Cosmetics that exist today are card backs;
 * no invented items.
 */
const MASTER_BENEFITS: { head: string; lines: string[] }[] = [
  { head: 'Host any table', lines: ['8 players online', '6 players offline'] },
  { head: 'Every deck', lines: ['All card backs', 'Always included'] },
];

type PassTile =
  | (typeof PASSES)[number] & { kind: 'pass' }
  | (typeof MASTER_BENEFITS)[number] & { kind: 'benefit' };

/** Single ordered list: four pass tiles then the two Master benefit tiles. */
const PASS_TILES: PassTile[] = [
  ...PASSES.map((p) => ({ ...p, kind: 'pass' as const })),
  ...MASTER_BENEFITS.map((b) => ({ ...b, kind: 'benefit' as const })),
];

const DECKS = BUILTIN_CARD_BACKS.map((back) => ({
  id: back.id,
  title: back.name,
  back: back.id,
}));

function DealIn({
  delay,
  reduceMotion,
  children,
}: {
  delay: number;
  reduceMotion: boolean;
  children: ReactNode;
}) {
  const progress = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    progress.value = reduceMotion
      ? withSpring(1, motionTokens.spring.layerSoft)
      : withDelay(delay, withSpring(1, motionTokens.spring.navDeal));
  }, [delay, progress, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: interpolate(progress.value, [0, 1], [28, 0]) }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

function PreviewStage({
  back,
  face,
  onFlip,
}: {
  back: string;
  face: 'up' | 'down';
  onFlip: () => void;
}) {
  const { reduceMotion } = useMotion();
  const stage = useSharedValue(0);
  const fanL = useSharedValue(0);
  const fanR = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      stage.value = 1;
      fanL.value = 1;
      fanR.value = 1;
      return;
    }
    stage.value = withSpring(1, motionTokens.spring.layerSoft);
    fanL.value = withDelay(90, withSpring(1, motionTokens.spring.card));
    fanR.value = withDelay(140, withSpring(1, motionTokens.spring.card));

  }, [fanL, fanR, reduceMotion, stage]);

  const stageStyle = useAnimatedStyle(() => ({
    opacity: interpolate(stage.value, [0, 1], [0, 1]),
    transform: [
      { scale: interpolate(stage.value, [0, 1], [0.92, 1]) },
      { translateY: interpolate(stage.value, [0, 1], [24, 0]) },
    ],
  }));
  const fanLeftStyle = useAnimatedStyle(() => ({
    opacity: fanL.value,
    transform: [
      { translateX: interpolate(fanL.value, [0, 1], [-70, -34]) },
      { rotate: `${interpolate(fanL.value, [0, 1], [-24, -10])}deg` },
    ],
  }));
  const fanRightStyle = useAnimatedStyle(() => ({
    opacity: fanR.value,
    transform: [
      { translateX: interpolate(fanR.value, [0, 1], [70, 34]) },
      { rotate: `${interpolate(fanR.value, [0, 1], [24, 10])}deg` },
    ],
  }));

  return (
    <Animated.View style={[styles.previewStage, stageStyle]}>
      <View style={styles.previewFan}>
        <Animated.View style={[styles.previewFanCard, fanLeftStyle]}>
          <PlayingCard face="down" back="back-noir" size="sm" elevated />
        </Animated.View>
        <Animated.View style={[styles.previewFanCard, fanRightStyle]}>
          <PlayingCard face="down" back="back-crimson" size="sm" elevated />
        </Animated.View>
      </View>
      <Pressable onPress={onFlip} accessibilityRole="button" accessibilityLabel="Flip preview card">
        <FlipCard face={face} back={back} rank="A" suit="spades" size="lg" />
      </Pressable>
      <Text style={styles.previewHint}>Tap the card to flip it</Text>
    </Animated.View>
  );
}

export default function StoreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: viewportWidth } = useWindowDimensions();
  const desktop = viewportWidth >= 900;
  const navBottomReserve = Math.max(insets.bottom, NAV_BAR_BOTTOM_GUTTER) + NAV_BAR_RESERVE;
  const { reduceMotion, haptic } = useMotion();
  const hapticsEnabled = useProfileStore((s) => s.hapticsEnabled);
  const setViewMode = useUiStore((s) => s.setViewMode);
  const eventCount = useGameStore((s) => s.events.length);
  const gamePhase = useGameStore((s) => s.state.phase);
  const sessionActive = eventCount > 0 && gamePhase !== 'idle';

  const ownedBacks = useCosmeticsStore((s) => s.ownedBackIds);
  const selectedBackId = useCosmeticsStore((s) => s.equippedBackId);
  const equipBack = useCosmeticsStore((s) => s.equipBack);
  const unlockBack = useCosmeticsStore((s) => s.unlockBack);
  const [previewBack, setPreviewBack] = useState<string | null>(null);
  const [previewFace, setPreviewFace] = useState<'up' | 'down'>('down');

  const showPlaceholder = async (productId: string) => {
    if (!isIapConfigured()) {
      Alert.alert('Store', 'In-app purchases are not configured yet. Add RevenueCat keys in app.json extra.');
      return;
    }
    try {
      await purchaseProduct(productId);
    } catch (e) {
      Alert.alert('Store', e instanceof Error ? e.message : 'Purchase failed');
    }
  };

  const onRestore = async () => {
    try {
      const customerInfo = await restorePurchases();
      syncMasterPassFromCustomerInfo(customerInfo);
      Alert.alert('Store', 'Restore completed.');
    } catch (e) {
      Alert.alert('Store', e instanceof Error ? e.message : 'Restore failed');
    }
  };

  const resumeTable = () => {
    setViewMode('table');
    router.push('/');
  };

  const onDeckPress = (id: string, back: string) => {
    if (hapticsEnabled) haptic('light');
    setPreviewBack(back);
    setPreviewFace('down');
    if (!ownedBacks.includes(id)) unlockBack(id);
  };

  const onDeckPrice = (id: string, owned: boolean, equipped: boolean) => {
    if (hapticsEnabled) haptic('light');
    if (!owned) {
      unlockBack(id);
      return;
    }
    if (!equipped) equipBack(id);
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={{ marginBottom: navBottomReserve }}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + space.xl,
            paddingBottom: space.xxl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View testID="store-content-column" style={styles.column}>
          <DealIn delay={40} reduceMotion={reduceMotion}>
            <View style={styles.header}>
              <Text style={styles.headerEyebrow}>STORE</Text>
              <Text style={styles.headerTitle}>Passes and decks</Text>
            </View>
          </DealIn>

          <DealIn delay={90} reduceMotion={reduceMotion}>
            {/* Tiles wrap (2-per-row mobile, 3-per-row desktop) so every tile
                is on screen — no hidden horizontal scroll, no clipped end. */}
            <View style={styles.passGrid}>
              {PASS_TILES.map((tile) =>
                tile.kind === 'pass' ? (
                  <Pressable
                    key={tile.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${tile.title} pass ${tile.price}`}
                    onPress={() => {
                      if (hapticsEnabled) haptic('light');
                      void showPlaceholder(tile.id);
                    }}
                    style={({ pressed }) => [
                      styles.passCard,
                      desktop && styles.passTileDesktop,
                      pressed && styles.passCardPressed,
                    ]}
                  >
                    <Text style={styles.passTitle}>{tile.title}</Text>
                    <Text style={styles.passSubtitle}>{tile.subtitle}</Text>
                    <Text style={styles.passDuration}>{tile.duration}</Text>
                    <Text style={styles.passPrice}>{tile.price}</Text>
                  </Pressable>
                ) : (
                  <View key={tile.head} style={[styles.benefitCard, desktop && styles.passTileDesktop]}>
                    <Text style={styles.benefitHead}>{tile.head}</Text>
                    {tile.lines.map((line) => (
                      <Text key={line} style={styles.benefitLine}>
                        {line}
                      </Text>
                    ))}
                    <Text style={styles.benefitFoot}>With Master</Text>
                  </View>
                ),
              )}
            </View>
          </DealIn>

          <DealIn delay={150} reduceMotion={reduceMotion}>
            <Text style={styles.sectionTitle}>Decks</Text>
            {desktop ? (
              // Desktop: pairs wrap and center — no left-anchored half-empty
              // carousel row.
              <View style={styles.deckGridDesktop}>
                {DECKS.map((deck, deckIndex) => {
                  const owned = ownedBacks.includes(deck.id);
                  const equipped = selectedBackId === deck.id;
                  return (
                    <View
                      key={deck.id}
                      style={[styles.deckItem, deckIndex % 2 === 0 ? styles.deckItemLeft : styles.deckItemRight]}
                    >
                      <View testID="deck-stage" style={styles.deckStage}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Preview ${deck.title}`}
                          onPress={() => onDeckPress(deck.id, deck.back)}
                          style={[styles.deckPair, deckIndex % 2 === 0 ? styles.deckPairLeft : styles.deckPairRight]}
                        >
                          <View style={styles.deckBack}>
                            <PlayingCard face="down" back={deck.back} size="sm" overlapped />
                          </View>
                          <View style={styles.deckFace}>
                            <PlayingCard face="up" rank="A" suit="spades" size="sm" overlapped />
                          </View>
                        </Pressable>
                      </View>
                      <Text style={styles.deckName}>{deck.title}</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={
                          equipped
                            ? `${deck.title} equipped`
                            : owned
                              ? `Equip ${deck.title}`
                              : `${deck.title} £1.99`
                        }
                        onPress={() => onDeckPrice(deck.id, owned, equipped)}
                        style={[
                          styles.deckPill,
                          equipped ? styles.deckPillEquipped : owned ? styles.deckPillEquip : styles.deckPillPrice,
                        ]}
                      >
                        <Text
                          style={[
                            styles.deckPillText,
                            equipped ? styles.deckPillTextEquipped : owned ? styles.deckPillTextEquip : styles.deckPillTextPrice,
                          ]}
                        >
                          {equipped ? 'Equipped' : owned ? 'Equip' : '£1.99'}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.deckRow}
              >
                {DECKS.map((deck, deckIndex) => {
                  const owned = ownedBacks.includes(deck.id);
                  const equipped = selectedBackId === deck.id;
                  return (
                    <View
                      key={deck.id}
                      style={[styles.deckItem, deckIndex % 2 === 0 ? styles.deckItemLeft : styles.deckItemRight]}
                    >
                      <View testID="deck-stage" style={styles.deckStage}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Preview ${deck.title}`}
                          onPress={() => onDeckPress(deck.id, deck.back)}
                          style={[styles.deckPair, deckIndex % 2 === 0 ? styles.deckPairLeft : styles.deckPairRight]}
                        >
                          <View style={styles.deckBack}>
                            <PlayingCard face="down" back={deck.back} size="sm" overlapped />
                          </View>
                          <View style={styles.deckFace}>
                            <PlayingCard face="up" rank="A" suit="spades" size="sm" overlapped />
                          </View>
                        </Pressable>
                      </View>
                      <Text style={styles.deckName}>{deck.title}</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={
                          equipped
                            ? `${deck.title} equipped`
                            : owned
                              ? `Equip ${deck.title}`
                              : `${deck.title} £1.99`
                        }
                        onPress={() => onDeckPrice(deck.id, owned, equipped)}
                        style={[
                          styles.deckPill,
                          equipped ? styles.deckPillEquipped : owned ? styles.deckPillEquip : styles.deckPillPrice,
                        ]}
                      >
                        <Text
                          style={[
                            styles.deckPillText,
                            equipped ? styles.deckPillTextEquipped : owned ? styles.deckPillTextEquip : styles.deckPillTextPrice,
                          ]}
                        >
                          {equipped ? 'Equipped' : owned ? 'Equip' : '£1.99'}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </DealIn>

          {sessionActive ? (
            <DealIn delay={210} reduceMotion={reduceMotion}>
              <View style={styles.resumeCard}>
                <View style={styles.resumeRow}>
                  <View style={styles.resumeCopy}>
                    <Text style={styles.resumeEyebrow}>GAME IN PROGRESS</Text>
                    <Text style={styles.resumeTitle}>Pick up where you stopped</Text>
                    <Text style={styles.resumeMeta}>
                      {eventCount} {eventCount === 1 ? 'event' : 'events'} in the log
                    </Text>
                  </View>
                  <View style={styles.resumeMark}>
                    <Image source={brand.logo} resizeMode="contain" style={styles.resumeLogo} />
                  </View>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Resume table"
                  onPress={resumeTable}
                  style={({ pressed }) => [styles.resumeButton, pressed && styles.resumeButtonPressed]}
                >
                  <Text style={styles.resumeButtonText}>Resume</Text>
                </Pressable>
              </View>
            </DealIn>
          ) : null}

          <DealIn delay={sessionActive ? 270 : 210} reduceMotion={reduceMotion}>
            <Text style={styles.previewNote}>
              Everything is free in this preview. Purchases arrive at launch.
            </Text>
            <Pressable
              testID="restore-purchases"
              accessibilityRole="button"
              accessibilityLabel="Restore purchases"
              onPress={() => {
                void onRestore();
              }}
              style={styles.restoreButton}
            >
              <Text style={styles.restoreLabel}>Restore purchases</Text>
            </Pressable>
          </DealIn>
        </View>
      </ScrollView>

      {previewBack ? (
        <Pressable style={styles.previewOverlay} onPress={() => setPreviewBack(null)}>
          <PreviewStage
            back={previewBack}
            face={previewFace}
            onFlip={() => setPreviewFace((f) => (f === 'up' ? 'down' : 'up'))}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  scrollContent: {
    paddingHorizontal: space.xl,
    alignItems: 'center',
    flexGrow: 1,
  },
  /** Centered column, capped like home — desktop gets no left-anchored void. */
  column: {
    width: '100%',
    maxWidth: 840,
    alignSelf: 'center',
  },
  header: {
    marginBottom: space.xl,
  },
  headerEyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: letterSpacing.caps,
    color: colors.brand,
  },
  headerTitle: {
    marginTop: 4,
    fontFamily: fonts.bold,
    fontSize: 26,
    letterSpacing: -0.5,
    color: colors.ink,
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 22,
    letterSpacing: -0.4,
    color: colors.ink,
    marginBottom: space.md,
  },
  /** Tiles wrap 2-per-row (mobile) / 3-per-row (desktop), nothing hidden. */
  passGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginBottom: space.xxl,
  },
  /** Desktop: 3 tiles per row (32% + 2*8px gaps fits the 840px column). */
  passTileDesktop: {
    flexBasis: '32%',
  },
  passCard: {
    flexBasis: '48.5%',
    flexGrow: 1,
    minHeight: 128,
    paddingHorizontal: space.md,
    paddingTop: space.lg,
    paddingBottom: space.md,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.navCardEdge,
    backgroundColor: colors.surface,
    borderCurve: 'continuous',
    justifyContent: 'space-between',
  },
  passCardPressed: {
    transform: [{ scale: 0.97 }],
  },
  passTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.ink,
  },
  passSubtitle: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.inkSubtle,
    marginTop: 2,
  },
  passDuration: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.inkMuted,
    marginTop: 2,
  },
  passPrice: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
    marginTop: space.md,
  },
  benefitCard: {
    flexBasis: '48.5%',
    flexGrow: 1,
    minHeight: 128,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.navCardEdge,
    backgroundColor: colors.surface,
    borderCurve: 'continuous',
    justifyContent: 'space-between',
  },
  benefitHead: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.ink,
  },
  benefitLine: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.inkMuted,
    marginTop: 3,
  },
  benefitFoot: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: letterSpacing.caps,
    color: colors.brand,
    marginTop: space.sm,
  },
  deckRow: {
    gap: space.md,
    paddingRight: space.lg,
    paddingTop: space.sm,
    marginBottom: space.xxl,
    alignItems: 'flex-start',
  },
  /** Desktop: deck pairs wrap, centered — fills the column, no void. */
  deckGridDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space.lg,
    paddingTop: space.sm,
    marginBottom: space.xxl,
  },
  deckItem: {
    width: 154,
    alignItems: 'center',
  },
  deckItemLeft: {
    transform: [{ translateY: 2 }],
  },
  deckItemRight: {
    transform: [{ translateY: -2 }],
  },
  /** Inset stage behind the pairs so the cream back reads against a wash. */
  deckStage: {
    width: 154,
    paddingVertical: space.sm,
    alignItems: 'center',
    borderRadius: radii.lg,
    backgroundColor: alpha.wellWash06,
  },
  deckPair: {
    width: 138,
    height: 108,
    position: 'relative',
  },
  deckPairLeft: {
    transform: [{ rotate: '-1.5deg' }],
  },
  deckPairRight: {
    transform: [{ rotate: '1.5deg' }],
  },
  deckBack: {
    position: 'absolute',
    left: 6,
    top: 10,
    transform: [{ rotate: '-10deg' }],
  },
  deckFace: {
    position: 'absolute',
    left: 46,
    top: -1,
    transform: [{ rotate: '8deg' }],
  },
  deckName: {
    marginTop: space.sm,
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
    textAlign: 'center',
  },
  deckPill: {
    marginTop: space.xs,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radii.pill,
  },
  deckPillEquipped: {
    backgroundColor: colors.brand,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  deckPillEquip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  deckPillPrice: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.navCardEdge,
  },
  deckPillText: {
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  deckPillTextEquipped: {
    color: colors.surface,
  },
  deckPillTextEquip: {
    color: colors.brand,
  },
  deckPillTextPrice: {
    color: colors.ink,
  },
  resumeCard: {
    backgroundColor: colors.ink,
    borderRadius: radii.xl,
    padding: space.lg,
    marginBottom: space.xxl,
    borderCurve: 'continuous',
    ...shadow.cardStrong,
  },
  resumeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    marginBottom: space.lg,
  },
  resumeCopy: {
    flex: 1,
    minWidth: 0,
  },
  resumeEyebrow: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1.4,
    color: alpha.whiteOverlay45,
    marginBottom: 6,
  },
  resumeTitle: {
    fontFamily: fonts.bold,
    fontSize: 20,
    letterSpacing: -0.3,
    color: colors.surface,
    marginBottom: 4,
  },
  resumeMeta: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: alpha.whiteOverlay80,
  },
  resumeMark: {
    width: 54,
    height: 72,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.brandHot,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '8deg' }],
  },
  resumeLogo: {
    width: 28,
    height: 28,
  },
  resumeButton: {
    height: 46,
    borderRadius: radii.pill,
    backgroundColor: colors.brandHot,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumeButtonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.92,
  },
  resumeButtonText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.surface,
  },
  previewNote: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.small,
    lineHeight: 18,
    color: colors.inkSubtle,
    textAlign: 'center',
    marginBottom: space.md,
  },
  restoreButton: {
    alignSelf: 'center',
    paddingVertical: space.md,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.navCardEdge,
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  restoreLabel: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.caption,
    letterSpacing: letterSpacing.capLoose,
    color: colors.inkMuted,
  },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: alpha.inkOverlay45,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  previewStage: {
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.ink,
    borderRadius: radii.lg,
    paddingVertical: space.xl,
    paddingHorizontal: space.xl,
    borderWidth: 1,
    borderColor: alpha.whiteOverlay20,
    ...shadow.cardStrong,
  },
  previewFan: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 84,
    marginBottom: -space.sm,
  },
  previewFanCard: {
    position: 'absolute',
  },
  previewHint: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.body,
    color: alpha.whiteOverlay80,
  },
});