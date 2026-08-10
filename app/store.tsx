import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check, Lock } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { CardButton } from '@components/CardButton';
import { CardSection } from '@components/CardSection';
import { FlipCard } from '@components/FlipCard';
import { PlayingCard } from '@components/PlayingCard';
import { useMotion } from '@hooks/useMotion';
import { isIapConfigured, purchaseProduct, restorePurchases } from '@lib/iap';
import { syncMasterPassFromCustomerInfo } from '@lib/entitlement';
import { useProfileStore } from '@store/profileStore';
import { useCosmeticsStore } from '@store/cosmeticsStore';
import { BUILTIN_CARD_BACKS, BUILTIN_TABLE_THEMES } from '@engine/visuals';
import { alpha, colors, fontSizes, fonts, letterSpacing, motion as motionTokens, radii, shadow, space, textStyles } from '@theme';

interface StoreItem {
  id: string;
  title: string;
  price: string;
  back: string;
  tint: string;
}

const CATALOGUE_ITEMS: StoreItem[] = BUILTIN_CARD_BACKS.map((back) => ({
  id: back.id,
  title: back.name,
  price: back.unlockedByDefault ? 'FREE' : '£1.99',
  back: back.id,
  tint: back.palette?.[0] ?? alpha.brand20,
}));

const TABLE_THEME_ITEMS = BUILTIN_TABLE_THEMES.map((theme) => ({
  id: theme.id,
  title: theme.name,
  price: theme.unlockedByDefault ? 'FREE' : '£2.99',
  theme,
}));

const BUNDLES = [
  { id: 'deckd_pass_deal', title: 'Deal Pass', summary: 'Host lobbies for 24 hours', price: '£0.99' },
  { id: 'deckd_pass_draw', title: 'Draw Pass', summary: 'Host lobbies for 3 days', price: '£2.99' },
  { id: 'deckd_pass_shuffle', title: 'Shuffle Pass', summary: 'Host lobbies for 30 days', price: '£5.99' },
  { id: 'deckd_master', title: 'Master Pass', summary: 'Host lobbies forever', price: '£24.99' },
];

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <Pressable onPress={onFlip}>
        {/* rank/suit give the face side real artwork — without them PlayingCard
            renders the back on BOTH sides and the flip looks like nothing. */}
        <FlipCard face={face} back={back} rank="K" suit="spades" size="lg" />
      </Pressable>
      <Text style={styles.previewHint}>Tap the card to flip it</Text>
    </Animated.View>
  );
}

export default function StoreScreen() {
  const insets = useSafeAreaInsets();
  const { reduceMotion, haptic } = useMotion();
  const hapticsEnabled = useProfileStore((s) => s.hapticsEnabled);
  const buttonHaptic = hapticsEnabled && !reduceMotion ? 'light' : false;

  const ownedBacks = useCosmeticsStore((s) => s.ownedBackIds);
  const selectedBackId = useCosmeticsStore((s) => s.equippedBackId);
  const selectedThemeId = useCosmeticsStore((s) => s.equippedTableThemeId);
  const ownedThemeIds = useCosmeticsStore((s) => s.ownedTableThemeIds);
  const equipBack = useCosmeticsStore((s) => s.equipBack);
  const equipTableTheme = useCosmeticsStore((s) => s.equipTableTheme);
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
      // Re-sync hasMasterPass from the restored entitlement. The
      // customer-info listener also fires, but we do it here too so the
      // flag is correct before the user dismisses the alert.
      syncMasterPassFromCustomerInfo(customerInfo);
      Alert.alert('Store', 'Restore completed.');
    } catch (e) {
      Alert.alert('Store', e instanceof Error ? e.message : 'Restore failed');
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.x5l * 3 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>STORE</Text>
        <Text style={styles.title}>Tune your table</Text>

        <CardSection
          variant="brand"
          tab
          eyebrow="FEATURED"
          title="Deckd Master"
          style={styles.section}
        >
          <View style={styles.bullets}>
            <Text style={styles.heroBullet}>• Host multiplayer lobbies</Text>
            <Text style={styles.heroBullet}>• Friends join free, from anywhere</Text>
            <Text style={styles.heroBullet}>• Premium felts and exclusive card backs</Text>
          </View>
          <CardButton
            variant="secondary"
            size="md"
            haptic={buttonHaptic}
            onPress={() => showPlaceholder('deckd_master')}
            style={styles.heroCta}
            innerStyle={{ backgroundColor: alpha.whiteOverlay20, borderColor: 'transparent' }}
          >
            <Text style={[styles.heroCtaLabel, { color: colors.surface }]}>Become a Master</Text>
          </CardButton>
        </CardSection>

        <CardSection
          variant="surface"
          eyebrow="CATALOGUE"
          title="Card backs"
          style={styles.section}
        >
          <View style={styles.catalogueGrid}>
            {CATALOGUE_ITEMS.map((item) => {
              const owned = ownedBacks.includes(item.id);
              const equipped = selectedBackId === item.id;
              return (
                <CardSection key={item.id} variant="surface" style={styles.catalogueItem}>
                  <Pressable
                    onPress={() => {
                      setPreviewBack(item.back);
                      setPreviewFace('down');
                    }}
                  >
                    <View style={[styles.cardPreviewWrap, { borderColor: item.tint }]}>
                      <PlayingCard face="down" back={item.back} size="sm" elevated />
                      {!owned && (
                        <View style={styles.lockOverlay} pointerEvents="none">
                          <Lock size={20} color={colors.surface} />
                        </View>
                      )}
                    </View>
                  </Pressable>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={equipped ? `${item.title} equipped` : `Equip ${item.title}`}
                    disabled={!owned || equipped}
                    onPress={() => {
                      if (hapticsEnabled) haptic('light');
                      equipBack(item.id);
                    }}
                    style={[
                      styles.pricePill,
                      owned && { backgroundColor: colors.brand, borderColor: colors.brand },
                    ]}
                  >
                    <Text
                      style={[styles.priceLabel, owned && { color: colors.surface }]}
                    >
                      {equipped ? 'Equipped' : owned ? 'Tap to equip' : item.price}
                    </Text>
                  </Pressable>
                </CardSection>
              );
            })}
          </View>
        </CardSection>

        <CardSection
          variant="surface"
          eyebrow="TABLES"
          title="Table themes"
          style={styles.section}
        >
          <View style={styles.themeRail}>
            {TABLE_THEME_ITEMS.map((item) => {
              const owned = ownedThemeIds.includes(item.id);
              const equipped = selectedThemeId === item.id;
              return (
                <Pressable
                  key={item.id}
                  style={[styles.themeCard, equipped && styles.themeCardActive]}
                  onPress={() => {
                    if (!owned) return;
                    equipTableTheme(item.id);
                  }}
                >
                  <View style={[styles.themeSwatch, { backgroundColor: item.theme.surfaceBase, borderColor: item.theme.railColor }]}>
                    <View style={[styles.themeWell, { backgroundColor: item.theme.wellColor }]} />
                  </View>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.themeMeta}>{equipped ? 'Equipped' : owned ? 'Owned' : item.price}</Text>
                  {equipped && <Check size={16} color={colors.brand} style={styles.themeCheck} />}
                </Pressable>
              );
            })}
          </View>
        </CardSection>

        <CardSection
          variant="surface"
          eyebrow="PASSES"
          title="Deckd Master passes"
          style={styles.section}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.bundleRow}
          >
            {BUNDLES.map((bundle) => (
              <CardSection key={bundle.id} variant="ink" style={styles.bundleCard}>
                <Text style={styles.bundleTitle}>{bundle.title}</Text>
                <Text style={styles.bundleSummary}>{bundle.summary}</Text>
                <View style={styles.bundlePricePill}>
                  <Text style={styles.bundlePriceLabel}>{bundle.price}</Text>
                </View>
                <CardButton
                  variant="ghost"
                  size="sm"
                  elevated={false}
                  haptic={buttonHaptic}
                  onPress={() => showPlaceholder(bundle.id)}
                  style={styles.bundleButton}
                >
                  <Text style={styles.bundleButtonLabel}>Get pass</Text>
                </CardButton>
              </CardSection>
            ))}
          </ScrollView>
        </CardSection>

        <CardButton
          variant="ghost"
          size="sm"
          elevated={false}
          haptic={buttonHaptic}
          onPress={onRestore}
          style={styles.restoreButton}
        >
          <Text style={styles.restoreLabel}>Restore purchases</Text>
        </CardButton>
      </ScrollView>

      {previewBack && (
        <Pressable style={styles.previewOverlay} onPress={() => setPreviewBack(null)}>
          <PreviewStage
            back={previewBack}
            face={previewFace}
            onFlip={() => setPreviewFace((f) => (f === 'up' ? 'down' : 'up'))}
          />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { paddingHorizontal: space.xl },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.micro,
    letterSpacing: letterSpacing.caps,
    color: colors.inkMuted,
    marginBottom: space.sm,
  },
  title: {
    ...textStyles.h1,
    marginBottom: space.lg,
  },
  section: { marginBottom: space.lg },
  bullets: { gap: space.xs },
  heroBullet: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.body,
    color: alpha.whiteOverlay80,
  },
  heroCta: { marginTop: space.md, alignSelf: 'flex-start' },
  heroCtaLabel: {
    ...textStyles.title,
    fontSize: fontSizes.bodyLg,
  },
  catalogueGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: space.md,
  },
  catalogueItem: {
    width: '48.5%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPreviewWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    paddingVertical: space.sm,
    marginBottom: space.sm,
    backgroundColor: colors.surfaceAlt,
    position: 'relative',
    overflow: 'hidden',
  },
  lockOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: alpha.inkOverlay45,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
  },
  itemTitle: {
    ...textStyles.title,
    fontSize: fontSizes.body,
    marginBottom: space.xs,
  },
  pricePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: alpha.brand10,
    marginBottom: space.sm,
  },
  priceLabel: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.caption,
    color: colors.brand,
    letterSpacing: letterSpacing.cap,
  },
  bundleRow: { gap: space.md },
  themeRail: { gap: space.sm },
  themeCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: space.sm,
    backgroundColor: colors.surface,
    position: 'relative',
  },
  themeCardActive: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  themeSwatch: {
    height: 56,
    borderRadius: radii.md,
    borderWidth: 4,
    marginBottom: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeWell: { width: '54%', height: 26, borderRadius: 999, opacity: 0.72 },
  themeMeta: { fontFamily: fonts.bold, fontSize: fontSizes.micro, color: colors.inkMuted, marginTop: space.xs },
  themeCheck: { position: 'absolute', right: space.sm, top: space.sm },
  bundleCard: {
    width: space.x5l * 5,
    marginRight: space.md,
    borderWidth: 1,
    borderColor: alpha.whiteOverlay20,
  },
  bundleTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.title,
    color: colors.surface,
    marginBottom: space.xs,
  },
  bundleSummary: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.small,
    color: alpha.whiteOverlay80,
    marginBottom: space.md,
  },
  bundlePricePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radii.pill,
    backgroundColor: alpha.whiteOverlay20,
    marginBottom: space.md,
  },
  bundlePriceLabel: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.caption,
    color: colors.surface,
    letterSpacing: letterSpacing.cap,
  },
  bundleButton: {
    alignSelf: 'flex-start',
    ...shadow.none,
    borderColor: alpha.whiteOverlay45,
  },
  bundleButtonLabel: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.caption,
    color: colors.surface,
    letterSpacing: letterSpacing.cap,
  },
  restoreButton: {
    alignSelf: 'center',
    ...shadow.none,
  },
  restoreLabel: {
    ...textStyles.label,
    color: colors.inkMuted,
  },
  previewOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: alpha.inkOverlay45,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  previewStage: {
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.tableFelt,
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
  previewCardWrap: {
    alignItems: 'center',
    gap: space.md,
  },
  previewHint: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.body,
    color: alpha.whiteOverlay80,
  },
});
