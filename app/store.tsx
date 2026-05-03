import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Lock } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardButton } from '@components/CardButton';
import { CardSection } from '@components/CardSection';
import { FlipCard } from '@components/FlipCard';
import { PlayingCard } from '@components/PlayingCard';
import { useMotion } from '@hooks/useMotion';
import { isIapConfigured, purchaseProduct, restorePurchases } from '@lib/iap';
import { useProfileStore } from '@store/profileStore';
import { alpha, colors, fontSizes, fonts, letterSpacing, radii, shadow, space, textStyles } from '@theme';

interface StoreItem {
  id: string;
  title: string;
  price: string;
  back: 'brand' | 'ink';
  tint: string;
}

const CATALOGUE_ITEMS: StoreItem[] = [
  { id: 'crimson', title: 'Crimson', price: 'FREE', back: 'brand', tint: alpha.brand20 },
  { id: 'midnight', title: 'Midnight', price: '$1.99', back: 'ink', tint: alpha.inkOverlay12 },
  { id: 'ember', title: 'Ember', price: '$1.99', back: 'brand', tint: alpha.brand30 },
  { id: 'onyx', title: 'Onyx', price: '$1.99', back: 'ink', tint: alpha.inkOverlay20 },
  { id: 'ivory-linen', title: 'Ivory Linen', price: '$1.99', back: 'brand', tint: alpha.whiteOverlay45 },
  { id: 'smoked-oak', title: 'Smoked Oak', price: '$1.99', back: 'ink', tint: alpha.inkOverlay08 },
];

const BUNDLES = [
  { id: 'starter', title: 'Starter Bundle', summary: '3 backs for $2.99', price: '$2.99' },
  { id: 'table-pack', title: 'Table Pack', summary: 'Felts + backs for your next night', price: '$4.99' },
  { id: 'pro-upgrade', title: 'Pro Upgrade', summary: 'Deckd+ unlock and priority support', price: '$9.99' },
];

export default function StoreScreen() {
  const insets = useSafeAreaInsets();
  const { reduceMotion } = useMotion();
  const hapticsEnabled = useProfileStore((s) => s.hapticsEnabled);
  const buttonHaptic = hapticsEnabled && !reduceMotion ? 'light' : false;

  const [ownedBacks] = useState(['crimson']);
  const [previewBack, setPreviewBack] = useState<string | null>(null);
  const [previewFace, setPreviewFace] = useState<'up' | 'down'>('down');

  const showPlaceholder = async () => {
    if (!isIapConfigured()) {
      Alert.alert('Store', 'In-app purchases are not configured yet. See MONETIZATION.md.');
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
              const owned = item.price === 'FREE' || ownedBacks.includes(item.id);
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
                      {owned ? 'Owned' : item.price}
                    </Text>
                  </View>
                </CardSection>
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
              <FlipCard face={previewFace} back={previewBack as 'brand' | 'ink'} size="lg" />
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
  bundleRow: { gap: space.md },
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
