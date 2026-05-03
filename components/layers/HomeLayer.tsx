import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { ChevronRight, Lock, Shield, Zap } from 'lucide-react-native';
import { AvatarPlaceholder } from '@components/AvatarPlaceholder';
import { CardButton } from '@components/CardButton';
import { CardSection } from '@components/CardSection';
import { PlayingCard } from '@components/PlayingCard';
import { useSurfaceMorph } from '@components/layers/SurfaceMorphContext';
import { useMotion } from '@hooks/useMotion';
import { useUiStore } from '@store/uiStore';
import { useProfileStore } from '@store/profileStore';
import { EASING_EMPHASIZED } from '@lib/motion';
import { alpha, colors, fonts, motion, radii, shadow, space, textStyles } from '@theme';

interface HomeLayerProps {
  /** True when viewMode === 'home' — drives tap gating. */
  active: boolean;
  /** True when we're in the morph zone (home | hub). When false the whole
   *  layer fades out so it doesn't peek under table/lobby/pass. */
  layerVisible: boolean;
  topInset: number;
  bottomInset: number;
}

const PREVIEW_DECKS = [
  { id: 'brand', label: 'Crimson', back: 'brand' as const },
  { id: 'ink', label: 'Midnight', back: 'ink' as const },
  { id: 'brand2', label: 'Ember', back: 'brand' as const },
  { id: 'ink2', label: 'Onyx', back: 'ink' as const },
];

/** Progress threshold below which Home accepts taps/scroll. */
const HOME_INTERACTIVE_THRESHOLD = 0.15;

/**
 * Ambient home chrome. Sits *above* the persistent game surface and sheds
 * its elements one-by-one as the home -> hub morph runs. Every element
 * interpolates against the single `progress` shared value published by
 * `SurfaceMorphContext`, so the whole layer reads from a single timeline
 * without chained `useEffect`s.
 *
 * Element windows (progress 0 = fully home, 1 = fully hub):
 *   stats banner     [0.00, 0.40]  ty  0 -> -60,  opacity 1 -> 0
 *   hero CTA         [0.00, 1.00]  scale 1 -> 0.88, ty 0 -> +180, rot 0 -> 1.5deg
 *                    opacity window [0.00, 0.85]  1 -> 0
 *   secondary CTA    [0.00, 0.35]  tx  0 -> -40,  opacity 1 -> 0
 *   section divider  [0.05, 0.35]  ty  0 -> -20,  opacity 1 -> 0
 *   carousel         [0.05, 0.45]  tx  0 -> +80,  opacity 1 -> 0
 *   deckd+ tile      [0.10, 0.45]  tx  0 -> -80,  opacity 1 -> 0
 *   sale row         [0.12, 0.45]  ty  0 -> +50,  opacity 1 -> 0
 *
 * If `reduceMotion` is set on the UI thread SV, each element short-circuits
 * to a plain opacity cross-fade within [0, 1].
 */
export function HomeLayer({
  active,
  layerVisible,
  topInset,
  bottomInset,
}: HomeLayerProps) {
  const router = useRouter();
  const setViewMode = useUiStore((s) => s.setViewMode);
  const nickname = useProfileStore((s) => s.nickname);
  const avatarSeed = useProfileStore((s) => s.avatarSeed);
  const level = useProfileStore((s) => s.level);
  const streak = useProfileStore((s) => s.streak);

  const { progress, reduceMotion } = useSurfaceMorph();
  const { reduceMotion: reduceMotionSystem } = useMotion();

  // Whole-layer fade. Only fires when we leave the home/hub morph zone for
  // table/lobby/pass — inside the zone the per-element windows own opacity.
  const layerOpacity = useSharedValue(layerVisible ? 1 : 0);
  useEffect(() => {
    const dur = reduceMotionSystem ? motion.duration.fast : motion.duration.layerCross;
    layerOpacity.value = withTiming(layerVisible ? 1 : 0, {
      duration: dur,
      easing: reduceMotionSystem ? undefined : EASING_EMPHASIZED,
    });
  }, [layerVisible, layerOpacity, reduceMotionSystem]);

  const rootStyle = useAnimatedStyle(() => ({ opacity: layerOpacity.value }));

  // Mirror the progress threshold onto a JS-side state so the scrollview's
  // `pointerEvents` / `scrollEnabled` props can flip without re-rendering on
  // every animated frame. Combined with the JS-only `active` prop, this means
  // taps mid-slide on the "wrong" layer are impossible.
  const [gateOpen, setGateOpen] = useState(
    progress.value < HOME_INTERACTIVE_THRESHOLD,
  );
  useAnimatedReaction(
    () => progress.value < HOME_INTERACTIVE_THRESHOLD,
    (open, prev) => {
      if (open !== prev) runOnJS(setGateOpen)(open);
    },
    [],
  );
  const interactive = active && gateOpen;

  const statsBannerStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (reduceMotion.value === 1) {
      return { opacity: interpolate(p, [0, 1], [1, 0], Extrapolation.CLAMP) };
    }
    return {
      opacity: interpolate(p, [0, 0.4], [1, 0], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(p, [0, 0.4], [0, -60], Extrapolation.CLAMP) },
      ],
    };
  });

  const heroCtaStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (reduceMotion.value === 1) {
      return { opacity: interpolate(p, [0, 1], [1, 0], Extrapolation.CLAMP) };
    }
    return {
      opacity: interpolate(p, [0, 0.85], [1, 0], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(p, [0, 1], [0, 180], Extrapolation.CLAMP) },
        { scale: interpolate(p, [0, 1], [1, 0.88], Extrapolation.CLAMP) },
        {
          rotate: `${interpolate(
            p,
            [0, 1],
            [0, 1.5],
            Extrapolation.CLAMP,
          )}deg`,
        },
      ],
    };
  });

  const secondaryCtaStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (reduceMotion.value === 1) {
      return { opacity: interpolate(p, [0, 1], [1, 0], Extrapolation.CLAMP) };
    }
    return {
      opacity: interpolate(p, [0, 0.35], [1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: interpolate(p, [0, 0.35], [0, -40], Extrapolation.CLAMP) },
      ],
    };
  });

  const sectionDividerStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (reduceMotion.value === 1) {
      return { opacity: interpolate(p, [0, 1], [1, 0], Extrapolation.CLAMP) };
    }
    return {
      opacity: interpolate(p, [0.05, 0.35], [1, 0], Extrapolation.CLAMP),
      transform: [
        {
          translateY: interpolate(
            p,
            [0.05, 0.35],
            [0, -20],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  const carouselStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (reduceMotion.value === 1) {
      return { opacity: interpolate(p, [0, 1], [1, 0], Extrapolation.CLAMP) };
    }
    return {
      opacity: interpolate(p, [0.05, 0.45], [1, 0], Extrapolation.CLAMP),
      transform: [
        {
          translateX: interpolate(
            p,
            [0.05, 0.45],
            [0, 80],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  const plusTileStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (reduceMotion.value === 1) {
      return { opacity: interpolate(p, [0, 1], [1, 0], Extrapolation.CLAMP) };
    }
    return {
      opacity: interpolate(p, [0.1, 0.45], [1, 0], Extrapolation.CLAMP),
      transform: [
        {
          translateX: interpolate(
            p,
            [0.1, 0.45],
            [0, -80],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  const saleRowStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (reduceMotion.value === 1) {
      return { opacity: interpolate(p, [0, 1], [1, 0], Extrapolation.CLAMP) };
    }
    return {
      opacity: interpolate(p, [0.12, 0.45], [1, 0], Extrapolation.CLAMP),
      transform: [
        {
          translateY: interpolate(
            p,
            [0.12, 0.45],
            [0, 50],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents={interactive ? 'auto' : 'none'}
      style={[styles.root, rootStyle]}
    >
      <ScrollView
        pointerEvents={interactive ? 'auto' : 'none'}
        scrollEnabled={interactive}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: topInset + space.md, paddingBottom: bottomInset + 140 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={statsBannerStyle}>
          <CardSection
            variant="surface"
            padded={false}
            style={styles.statsBanner}
          >
            <View style={styles.statsInner}>
              <AvatarPlaceholder
                seed={avatarSeed}
                label={nickname}
                size={40}
                ring="soft"
              />
              <View style={styles.statsChips}>
                <View style={styles.statChip}>
                  <Text style={styles.statValue}>{`Lv. ${level}`}</Text>
                </View>
                <View style={styles.statChip}>
                  <Zap size={14} color={colors.warn} />
                  <Text style={styles.statValue}>{streak}</Text>
                </View>
              </View>
            </View>
          </CardSection>
        </Animated.View>

        <View style={styles.heroSection}>
          <Animated.View style={[styles.heroCta, heroCtaStyle]}>
            <CardButton
              variant="primary"
              size="xl"
              elevated
              haptic="medium"
              onPress={() => setViewMode('hub')}
              style={styles.heroCtaFill}
              innerStyle={styles.heroInner}
            >
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>Deal the deck</Text>
                <Text style={styles.heroSub}>Tap to drop into the table</Text>
              </View>
              <View style={styles.heroPreview}>
                <PlayingCard
                  face="down"
                  size="sm"
                  style={styles.heroPreviewCard1}
                />
                <PlayingCard
                  face="up"
                  rank="A"
                  suit="hearts"
                  size="sm"
                  style={styles.heroPreviewCard2}
                />
              </View>
            </CardButton>
          </Animated.View>

          <Animated.View style={secondaryCtaStyle}>
            <CardButton
              variant="secondary"
              size="md"
              elevated={false}
              haptic="light"
              onPress={() => setViewMode('lobby')}
              style={styles.secondaryCta}
            >
              <Text style={styles.secondaryText}>Deal to friends</Text>
              <Lock
                size={14}
                color={colors.inkMuted}
                style={{ marginLeft: 6 }}
              />
            </CardButton>
          </Animated.View>
        </View>

        <Animated.View style={[styles.sectionDivider, sectionDividerStyle]}>
          <View style={styles.cardEdge} />
          <Text style={styles.sectionHeader}>STORE PREVIEW</Text>
          <View style={styles.cardEdge} />
        </Animated.View>

        <Animated.View style={carouselStyle}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carousel}
          >
            {PREVIEW_DECKS.map((deck) => (
              <View key={deck.id} style={styles.cardTile}>
                <PlayingCard face="down" back={deck.back} size="md" />
                <Text style={styles.cardTileText}>{deck.label}</Text>
              </View>
            ))}
          </ScrollView>
        </Animated.View>

        <Animated.View style={plusTileStyle}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/store')}
            style={({ pressed }) => [
              styles.plusCard,
              pressed && { opacity: 0.95 },
            ]}
          >
            <View style={styles.plusHeader}>
              <Shield size={20} color={colors.surface} />
              <Text style={styles.plusTitle}>Deckd+</Text>
            </View>
            <Text style={styles.plusDesc}>
              Unlock premium felts & exclusive card backs.
            </Text>
          </Pressable>
        </Animated.View>

        <Animated.View style={saleRowStyle}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/store')}
            style={({ pressed }) => [styles.saleRow, pressed && { opacity: 0.96 }]}
          >
            <View style={styles.saleBadge}>
              <Text style={styles.saleBadgeText}>SALE</Text>
            </View>
            <Text style={styles.saleText}>Starter Bundle — 50% off</Text>
            <ChevronRight size={20} color={colors.inkSubtle} />
          </Pressable>
        </Animated.View>
      </ScrollView>
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
  scrollContent: {
    paddingHorizontal: space.xl,
  },
  statsBanner: {
    marginBottom: space.x4l,
  },
  statsInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.sm,
    paddingHorizontal: space.md,
  },
  statsChips: {
    flexDirection: 'row',
    gap: space.sm,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radii.md,
    gap: space.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.inkSoft,
  },
  heroSection: {
    marginBottom: space.x4l,
    alignItems: 'center',
  },
  heroCta: {
    width: '100%',
    marginBottom: space.lg,
  },
  heroCtaFill: {
    width: '100%',
  },
  heroInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.xxl,
  },
  heroText: {
    flex: 1,
  },
  heroTitle: {
    color: colors.surface,
    fontSize: 28,
    fontFamily: fonts.extra,
    marginBottom: space.xs,
    letterSpacing: -0.5,
  },
  heroSub: {
    color: alpha.whiteOverlay80,
    fontSize: 14,
    fontFamily: fonts.medium,
  },
  heroPreview: {
    width: 72,
    height: 90,
    position: 'relative',
  },
  heroPreviewCard1: {
    position: 'absolute',
    right: 10,
    top: 6,
    transform: [{ rotate: '-10deg' }],
  },
  heroPreviewCard2: {
    position: 'absolute',
    right: -4,
    top: -2,
    transform: [{ rotate: '8deg' }],
  },
  secondaryCta: {
    paddingHorizontal: space.xxl,
  },
  secondaryText: {
    ...textStyles.title,
    color: colors.inkMuted,
    fontSize: 15,
    fontFamily: fonts.semibold,
  },
  sectionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.xl,
    gap: space.md,
  },
  cardEdge: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderStrong,
  },
  sectionHeader: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: 1.5,
  },
  carousel: {
    paddingBottom: space.xxl,
    gap: space.lg,
  },
  cardTile: {
    alignItems: 'center',
    marginRight: space.lg,
    gap: space.sm,
  },
  cardTileText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.inkSoft,
  },
  plusCard: {
    backgroundColor: colors.ink,
    borderRadius: radii.lg,
    padding: space.xl,
    marginBottom: space.lg,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
    }),
  },
  plusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.sm,
  },
  plusTitle: {
    color: colors.surface,
    fontSize: 18,
    fontFamily: fonts.bold,
  },
  plusDesc: {
    color: colors.inkSubtle,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.regular,
  },
  saleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: space.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  saleBadge: {
    backgroundColor: colors.brand,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radii.xs + 2,
    marginRight: space.md,
  },
  saleBadgeText: {
    color: colors.surface,
    fontSize: 10,
    fontFamily: fonts.extra,
  },
  saleText: {
    flex: 1,
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: colors.inkSoft,
  },
});

export default HomeLayer;
