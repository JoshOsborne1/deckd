import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check, Lock } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardButton } from '@components/CardButton';
import { CardSection } from '@components/CardSection';
import { FlipCard } from '@components/FlipCard';
import { PlayingCard } from '@components/PlayingCard';
import { isIapConfigured, purchaseProduct, restorePurchases } from '@lib/iap';
import { useProfileStore } from '@store/profileStore';
import { useCosmeticsStore } from '@store/cosmeticsStore';
import { BUILTIN_CARD_BACKS, BUILTIN_TABLE_THEMES } from '@engine/visuals';
import { alpha, colors, fontSizes, fonts, letterSpacing, radii, shadow, space, textStyles } from '@theme';

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
  price: back.unlockedByDefault ? 'FREE' : '$1.99',
  back: back.id,
  tint: back.palette?.[0] ?? alpha.brand20,
}));

const TABLE_THEME_ITEMS = BUILTIN_TABLE_THEMES.map((theme) => ({
  id: theme.id,
  title: theme.name,
  price: theme.unlockedByDefault ? 'FREE' : '$2.99',
  theme,
}));

const BUNDLES = [
  { id: 'starter', title: 'Starter Bundle', summary: '3 backs for $2.99', price: '$2.99' },
  { id: 'table-pack', title: 'Table Pack', summary: 'Felts + backs for your next night', price: '$4.99' },
  { id: 'pro-upgrade', title: 'Pro Upgrade', summary: 'Deckd+ unlock and priority support', price: '$9.99' },
];

export default function StoreScreen() {
  const insets = useSafeAreaInsets();
  const hapticsEnabled = useProfileStore((s) => s.hapticsEnabled);
  const buttonHaptic = hapticsEnabled ? 'light' : false;

  const ownedBacks = useCosmeticsStore((s) => s.ownedBackIds);
  const selectedBackId = useCosmeticsStore((s) => s.equippedBackId);
  const selectedThemeId = useCosmeticsStore((s) => s.equippedTableThemeId);
  const ownedThemeIds = useCosmeticsStore((s) => s.ownedTableThemeIds);
  const equipBack = useCosmeticsStore((s) => s.equipBack);
  const equipTableTheme = useCosmeticsStore((s) => s.equipTableTheme);
  const [previewBack, setPreviewBack] = useState<string | null>(null);
  const [previewFace, setPreviewFace] = useState<'up' | 'down'>('down');

  const showPlaceholder = async () => {
    if (!isIapConfigured()) {
      Alert.alert('Store', 'Purchases are unavailable in this build. Free cosmetics can be equipped now.');
      return;
    }
    try {
      await purchaseProduct('deckd_plus');
    } catch (e) {
      Alert.alert('Store', e instanceof Error ? e.message : 'Purchase failed');
    }
  };

  const onRestore = async () => {
    try {
      await restorePurchases();
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
          title="Deckd+"
          style={styles.section}
        >
          <View style={styles.bullets}>
            <Text style={styles.heroBullet}>• Premium felts and layouts</Text>
            <Text style={styles.heroBullet}>• Exclusive card backs</Text>
            <Text style={styles.heroBullet}>• Priority support queue</Text>
          </View>
          <CardButton
            variant="secondary"
            size="md"
            haptic={buttonHaptic}
            onPress={showPlaceholder}
            style={styles.heroCta}
            innerStyle={{ backgroundColor: alpha.whiteOverlay20, borderColor: 'transparent' }}
          >
            <Text style={[styles.heroCtaLabel, { color: colors.surface }]}>Go Pro</Text>
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
                  <View
                    style={[
                      styles.pricePill,
                      owned && { backgroundColor: colors.brand, borderColor: colors.brand },
                    ]}
                  >
                    <Text
                      style={[styles.priceLabel, owned && { color: colors.surface }]}
                    >
                      {equipped ? 'Equipped' : owned ? 'Owned' : item.price}
                    </Text>
                  </View>
                  <CardButton
                    variant={equipped ? 'primary' : owned ? 'secondary' : 'ghost'}
                    size="sm"
                    elevated={false}
                    haptic={buttonHaptic}
                    onPress={() => {
                      if (equipped) return;
                      if (owned) {
                        equipBack(item.id);
                        return;
                      }
                      void showPlaceholder();
                    }}
                    style={styles.itemAction}
                  >
                    <Text style={equipped ? styles.itemActionTextActive : styles.itemActionText}>
                      {equipped ? 'Equipped' : owned ? 'Equip' : 'Unlock'}
                    </Text>
                  </CardButton>
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
                    if (owned) {
                      equipTableTheme(item.id);
                      return;
                    }
                    void showPlaceholder();
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
          eyebrow="BUNDLES"
          title="Quick unlock packs"
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
                  onPress={showPlaceholder}
                  style={styles.bundleButton}
                >
                  <Text style={styles.bundleButtonLabel}>View bundle</Text>
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
          <View style={styles.previewCardWrap}>
            <Pressable onPress={() => setPreviewFace((f) => (f === 'up' ? 'down' : 'up'))}>
              <FlipCard face={previewFace} back={previewBack} size="lg" />
            </Pressable>
            <Text style={styles.previewHint}>Tap to flip</Text>
          </View>
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
    ...StyleSheet.absoluteFillObject,
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
  itemAction: {
    alignSelf: 'stretch',
    ...shadow.none,
  },
  itemActionText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.caption,
    color: colors.inkMuted,
    letterSpacing: letterSpacing.cap,
  },
  itemActionTextActive: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.caption,
    color: colors.surface,
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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: alpha.inkOverlay45,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  previewCardWrap: {
    alignItems: 'center',
    gap: space.md,
  },
  previewHint: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.body,
    color: colors.surface,
  },
});
