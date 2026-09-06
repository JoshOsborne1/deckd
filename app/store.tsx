import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
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
import { PRESET_BACKS } from '@lib/presetAssets';
import { builtinPresets } from '@engine/index';
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

const PASSES = [
  { id: 'deckd_pass_deal', title: 'Deal', duration: '-24h', price: '£0.99' },
  { id: 'deckd_pass_draw', title: 'Draw', duration: '-3d', price: '£2.99' },
  { id: 'deckd_pass_shuffle', title: 'Shuffle', duration: '-30d', price: '£5.99' },
  { id: 'deckd_master', title: 'Master', duration: '-Lifetime', price: '£24.99' },
];

const DECKS = BUILTIN_CARD_BACKS.map((back) => ({
  id: back.id,
  title: back.name,
  price: back.unlockedByDefault ? 'FREE' : '£1.99',
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
     
  }, []);

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
  const navBottomReserve = Math.max(insets.bottom, NAV_BAR_BOTTOM_GUTTER) + NAV_BAR_RESERVE;
  const { reduceMotion, haptic } = useMotion();
  const hapticsEnabled = useProfileStore((s) => s.hapticsEnabled);
  const setViewMode = useUiStore((s) => s.setViewMode);
  const events = useGameStore((s) => s.events);
  const gamePhase = useGameStore((s) => s.state.phase);
  const sessionActive = events.length > 0 && gamePhase !== 'idle';

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

  const goHome = () => {
    setViewMode('home');
    router.push('/');
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
            paddingTop: insets.top + space.md,
            paddingBottom: space.xxl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <DealIn delay={40} reduceMotion={reduceMotion}>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to Home"
              onPress={goHome}
              style={({ pressed }) => [styles.backPill, pressed && styles.backPillPressed]}
            >
              <ChevronLeft size={16} color={colors.inkMuted} strokeWidth={2.2} />
              <Text style={styles.backText}>Home</Text>
            </Pressable>
            <Text style={styles.headerEyebrow}>STORE</Text>
          </View>
        </DealIn>

        <DealIn delay={90} reduceMotion={reduceMotion}>
          <Text style={styles.sectionTitle}>Passes</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.passRow}
          >
            {PASSES.map((pass) => (
              <Pressable
                key={pass.id}
                accessibilityRole="button"
                accessibilityLabel={`${pass.title} pass ${pass.price}`}
                onPress={() => {
                  if (hapticsEnabled) haptic('light');
                  void showPlaceholder(pass.id);
                }}
                style={({ pressed }) => [styles.passCard, pressed && styles.passCardPressed]}
              >
                <Text style={styles.passTitle}>{pass.title}</Text>
                <Text style={styles.passDuration}>{pass.duration}</Text>
                <Text style={styles.passPrice}>{pass.price}</Text>
              </Pressable>
            ))}
            <View style={styles.extraCard}>
              <View style={styles.extraCols}>
                <View style={styles.extraCol}>
                  <Text style={styles.extraHead}>Host</Text>
                  <Text style={styles.extraLine}>8 players</Text>
                  <Text style={styles.extraLine}>Online</Text>
                  <Text style={styles.extraLine}>6 players</Text>
                  <Text style={styles.extraLine}>Offline</Text>
                </View>
                <View style={styles.extraRule} />
                <View style={styles.extraCol}>
                  <Text style={styles.extraHead}>Cosmetic</Text>
                  <Text style={styles.extraLine}>New deck</Text>
                  <Text style={styles.extraLine}>Spin</Text>
                  <Text style={styles.extraLine}>Random</Text>
                  <Text style={styles.extraLine}>Icon</Text>
                </View>
              </View>
            </View>
          </ScrollView>
        </DealIn>

        <DealIn delay={150} reduceMotion={reduceMotion}>
          <Text style={styles.sectionTitle}>Decks</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.deckRow}
          >
            {DECKS.map((deck, deckIndex) => {
              const owned = ownedBacks.includes(deck.id);
              const equipped = selectedBackId === deck.id;
              return (
                <View key={deck.id} style={[styles.deckItem, deckIndex % 2 === 0 ? styles.deckItemLeft : styles.deckItemRight]}>
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
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      equipped ? `${deck.title} equipped` : owned ? `Equip ${deck.title}` : `${deck.title} ${deck.price}`
                    }
                    onPress={() => onDeckPrice(deck.id, owned, equipped)}
                    style={styles.deckPriceHit}
                  >
                    <Text style={styles.deckPrice}>{equipped ? 'Equipped' : owned ? deck.price : deck.price}</Text>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
        </DealIn>

        {sessionActive ? (
          <DealIn delay={210} reduceMotion={reduceMotion}>
            <View style={styles.resumeCard}>
              <View style={styles.resumeRow}>
                <View style={styles.resumeCopy}>
                  <Text style={styles.resumeEyebrow}>GAME IN PROGRESS</Text>
                  <Text style={styles.resumeTitle}>Pick up where you stopped</Text>
                  <Text style={styles.resumeMeta}>
                    {events.length} {events.length === 1 ? 'event' : 'events'} in the log
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
          <View style={styles.recipeHead}>
            <View style={styles.recipeHeadCopy}>
              <Text style={styles.recipeTitle}>Choose a recipe</Text>
              <Text style={styles.recipeKicker}>FLIP A DECK TO PREVIEW</Text>
            </View>
            <Text style={styles.recipeIndex}>0{builtinPresets.length}</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recipeRow}
          >
            {builtinPresets.slice(0, 6).map((preset) => (
              <Pressable
                key={preset.id}
                accessibilityRole="button"
                accessibilityLabel={`Open ${preset.name}`}
                onPress={() => router.push('/list')}
                style={styles.recipeCard}
              >
                <PlayingCard
                  face="down"
                  back={PRESET_BACKS[preset.id] ?? 'back-brand'}
                  size="sm"
                  elevated
                />
              </Pressable>
            ))}
          </ScrollView>
        </DealIn>

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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.xl,
  },
  backPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: space.sm,
    paddingRight: space.md,
    height: 36,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.navCardEdge,
    backgroundColor: colors.surface,
    gap: 2,
  },
  backPillPressed: {
    transform: [{ scale: 0.97 }],
  },
  backText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.inkSoft,
  },
  headerEyebrow: {
    marginLeft: 'auto',
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: letterSpacing.caps,
    color: colors.inkSubtle,
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 22,
    letterSpacing: -0.4,
    color: colors.ink,
    marginBottom: space.md,
  },
  passRow: {
    gap: space.sm,
    paddingRight: space.lg,
    marginBottom: space.xxl,
  },
  passCard: {
    width: 92,
    minHeight: 108,
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
  extraCard: {
    width: 168,
    minHeight: 108,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.navCardEdge,
    backgroundColor: colors.surface,
    borderCurve: 'continuous',
    justifyContent: 'center',
  },
  extraCols: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: space.sm,
  },
  extraCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  extraRule: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.navCardEdge,
  },
  extraHead: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.ink,
    marginBottom: 4,
  },
  extraLine: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.inkMuted,
  },
  deckRow: {
    gap: space.md,
    paddingRight: space.lg,
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
  deckPriceHit: {
    marginTop: space.xs,
    minHeight: 32,
    justifyContent: 'center',
  },
  deckPrice: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.ink,
    textAlign: 'center',
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
  recipeHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: space.md,
    gap: space.md,
  },
  recipeHeadCopy: {
    flex: 1,
    minWidth: 0,
  },
  recipeTitle: {
    fontFamily: fonts.bold,
    fontSize: 22,
    letterSpacing: -0.4,
    color: colors.ink,
  },
  recipeKicker: {
    marginTop: 4,
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1.3,
    color: colors.inkSubtle,
  },
  recipeIndex: {
    fontFamily: fonts.bold,
    fontSize: 13,
    letterSpacing: 1,
    color: colors.brand,
    paddingBottom: 2,
  },
  recipeRow: {
    gap: space.sm,
    paddingRight: space.lg,
    paddingBottom: space.xs,
  },
  recipeCard: {
    padding: 2,
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
