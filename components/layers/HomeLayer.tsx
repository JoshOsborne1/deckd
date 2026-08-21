import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { AvatarPlaceholder } from '@components/AvatarPlaceholder';
import { PlayingCard } from '@components/PlayingCard';
import { TableSurface } from '@components/TableSurface';
import { useSurfaceMorph } from '@components/layers/SurfaceMorphContext';
import { useMotion } from '@hooks/useMotion';
import { useUiStore } from '@store/uiStore';
import { useProfileStore } from '@store/profileStore';
import { EASING_EMPHASIZED } from '@lib/motion';
import { useGameStore } from '@store/gameStore';
import { alpha, colors, fonts, motion, radii, space } from '@theme';

interface HomeLayerProps {
  /** True when viewMode === 'home' — drives tap gating. */
  active: boolean;
  /** True when we're in the morph zone (home | hub). When false the whole
   *  layer fades out so it doesn't peek under table/lobby/pass. */
  layerVisible: boolean;
  topInset: number;
  bottomInset: number;
}

/** Progress threshold below which Home accepts taps/scroll. */
const HOME_INTERACTIVE_THRESHOLD = 0.15;

const RECIPE_LABELS: Record<string, string> = {
  'deal-two-each': 'Deal 2 each',
  'crazy-eights': 'Crazy Eights',
  'go-fish': 'Go Fish',
  'old-maid': 'Old Maid',
  klondike: 'Klondike',
};

function formatRecipeName(recipeId: string): string {
  return (
    RECIPE_LABELS[recipeId] ??
    recipeId
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  );
}

/**
 * Table-native home chrome. The deck is the primary object, while the small
 * table marker, setup hint, resume slip, and shared-table action shed in
 * sequence as Home morphs into Hub. Every element reads the same shared
 * progress timeline so the surface never feels like a separate marketing
 * page sitting above the game.
 */
export function HomeLayer({
  active,
  layerVisible,
  topInset,
  bottomInset,
}: HomeLayerProps) {
  const setViewMode = useUiStore((s) => s.setViewMode);
  const firstRunHintDismissed = useUiStore((s) => s.firstRunHintDismissed);
  const dismissFirstRunHint = useUiStore((s) => s.dismissFirstRunHint);
  const nickname = useProfileStore((s) => s.nickname);
  const avatarSeed = useProfileStore((s) => s.avatarSeed);
  const level = useProfileStore((s) => s.level);
  const streak = useProfileStore((s) => s.streak);
  const gameState = useGameStore((s) => s.state);
  const gameEvents = useGameStore((s) => s.events);
  const hasResumableTable = gameEvents.length > 0 && gameState.phase !== 'ended';
  const currentRecipeName = gameState.config.presetId
    ? formatRecipeName(gameState.config.presetId)
    : 'Freeplay';

  const { progress, reduceMotion } = useSurfaceMorph();
  const { reduceMotion: reduceMotionSystem } = useMotion();

  // Whole-layer fade. Only fires when we leave the home/hub morph zone for
  // table/lobby/pass — inside the zone the per-element windows own opacity.
  const layerOpacity = useSharedValue(layerVisible ? 1 : 0);
  useEffect(() => {
    const dur = reduceMotionSystem ? motion.duration.fast : motion.duration.layerCross;
    layerOpacity.value = withTiming(layerVisible ? 1 : 0, {
      duration: dur,
      easing: EASING_EMPHASIZED,
    });
  }, [layerVisible, layerOpacity, reduceMotionSystem]);

  const rootStyle = useAnimatedStyle(() => ({ opacity: layerOpacity.value }));


  // Mirror the progress threshold onto a JS-side state so the scrollview's
  // `pointerEvents` / `scrollEnabled` props can flip without re-rendering on
  // every animated frame. Combined with the JS-only `active` prop, this means
  // taps mid-slide on the "wrong" layer are impossible.
  const [gateOpen, setGateOpen] = useState(false);
  useAnimatedReaction(
    () => progress.value < HOME_INTERACTIVE_THRESHOLD,
    (open, prev) => {
      if (open !== prev) scheduleOnRN(setGateOpen, open);
    },
    [],
  );
  const interactive = active && gateOpen;

  const tableMarkerStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (reduceMotion.value === 1) {
      return { opacity: interpolate(p, [0, 1], [1, 0], Extrapolation.CLAMP) };
    }
    return {
      opacity: interpolate(p, [0, 0.42], [1, 0], Extrapolation.CLAMP),
      transform: [{ translateY: interpolate(p, [0, 0.42], [0, -34], Extrapolation.CLAMP) }],
    };
  });

  const deckStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (reduceMotion.value === 1) {
      return { opacity: interpolate(p, [0, 1], [1, 0], Extrapolation.CLAMP) };
    }
    return {
      opacity: interpolate(p, [0, 0.86], [1, 0], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(p, [0, 1], [0, 150], Extrapolation.CLAMP) },
        { scale: interpolate(p, [0, 1], [1, 0.9], Extrapolation.CLAMP) },
        { rotate: `${interpolate(p, [0, 1], [0, 2], Extrapolation.CLAMP)}deg` },
      ],
    };
  });

  const supportStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (reduceMotion.value === 1) {
      return { opacity: interpolate(p, [0, 1], [1, 0], Extrapolation.CLAMP) };
    }
    return {
      opacity: interpolate(p, [0.08, 0.5], [1, 0], Extrapolation.CLAMP),
      transform: [{ translateY: interpolate(p, [0.08, 0.5], [0, -18], Extrapolation.CLAMP) }],
    };
  });

  const resumeStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (reduceMotion.value === 1) {
      return { opacity: interpolate(p, [0, 1], [1, 0], Extrapolation.CLAMP) };
    }
    return {
      opacity: interpolate(p, [0.05, 0.44], [1, 0], Extrapolation.CLAMP),
      transform: [{ translateX: interpolate(p, [0.05, 0.44], [0, 40], Extrapolation.CLAMP) }],
    };
  });

  return (
    <Animated.View
      pointerEvents={interactive ? 'auto' : 'none'}
      style={[styles.root, { bottom: bottomInset }, rootStyle]}
    >
      <TableSurface mode="setup" />
      <ScrollView
        pointerEvents={interactive ? 'auto' : 'none'}
        scrollEnabled={interactive}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: topInset + space.xl, paddingBottom: bottomInset + space.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={tableMarkerStyle}>
          <View style={styles.tableHeader}>
            <AvatarPlaceholder
              seed={avatarSeed}
              label={nickname}
              size={38}
              ring="soft"
            />
            <View style={styles.tableHeaderCopy}>
              <Text style={styles.tableEyebrow}>DECKD TABLE</Text>
              <Text style={styles.tableHeaderTitle}>Your table, ready when you are</Text>
            </View>
            <View style={styles.tableStats}>
              <Text style={styles.tableStat}>{`LV. ${level}`}</Text>
              <Text style={styles.tableStat}>{`STREAK ${streak}`}</Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View style={[styles.tableEntry, deckStyle]}>
          <View style={styles.entryCopy} pointerEvents="none">
            <Text style={styles.entryEyebrow}>THE DECK IS THE DOOR</Text>
            <Text style={styles.entryTitle}>One deck. Your table.</Text>
            <Text style={styles.entryDetail}>
              Deal into setup, choose a recipe, and keep the same table beneath you.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Deal the deck"
            onPress={() => {
              dismissFirstRunHint();
              setViewMode('hub');
            }}
            style={({ pressed }) => [
              styles.deckObjectButton,
              pressed && styles.deckObjectPressed,
            ]}
          >
            <View style={styles.deckObject} pointerEvents="none">
              <PlayingCard
                face="down"
                back="back-crimson"
                size="md"
                overlapped
                style={styles.deckBackCard}
              />
              <PlayingCard
                face="down"
                back="back-brand"
                size="md"
                overlapped
                style={styles.deckFrontCard}
              />
            </View>
            <Text style={styles.deckObjectLabel}>DEAL</Text>
          </Pressable>
        </Animated.View>

        <Animated.View style={[styles.supportLine, supportStyle]}>
          <View style={styles.supportRule} />
          <Text style={styles.supportText}>PICK A RECIPE AFTER THE DEAL</Text>
          <View style={styles.supportRule} />
        </Animated.View>

        {interactive && !firstRunHintDismissed && (
          <Pressable
            onPress={() => {
              dismissFirstRunHint();
              setViewMode('hub');
            }}
            accessibilityRole="button"
            accessibilityLabel="Tap the deck to deal. Dismiss hint."
            style={styles.firstRunHint}
          >
            <Text style={styles.firstRunHintText}>Tap the deck to deal</Text>
            <Text style={styles.firstRunHintDetail}>Setup stays on this table</Text>
          </Pressable>
        )}

        {hasResumableTable && (
          <Animated.View style={[styles.resumeSlip, resumeStyle]}>
            <View style={styles.resumeCopy}>
              <Text style={styles.resumeEyebrow}>TABLE IN PROGRESS</Text>
              <Text style={styles.resumeTitle}>{currentRecipeName}</Text>
              <Text style={styles.resumeDetail}>
                {gameState.players.length} {gameState.players.length === 1 ? 'seat' : 'seats'} · {gameState.turn} turns played
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Resume table"
              onPress={() => setViewMode('table')}
              style={({ pressed }) => [styles.resumeButton, pressed && styles.resumeButtonPressed]}
            >
              <Text style={styles.resumeButtonText}>RESUME</Text>
            </Pressable>
          </Animated.View>
        )}

        <Animated.View style={[styles.supportAction, supportStyle]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Host a lobby"
            onPress={() => setViewMode('lobby')}
            style={({ pressed }) => [styles.friendAction, pressed && styles.friendActionPressed]}
          >
            <Text style={styles.friendActionEyebrow}>WITH FRIENDS</Text>
            <Text style={styles.friendActionText}>Host a shared table</Text>
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
    overflow: 'hidden',
  },
  scrollContent: {
    paddingHorizontal: space.xl,
    alignItems: 'stretch',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: alpha.inkOverlay12,
  },
  tableHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  tableEyebrow: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: 1.8,
  },
  tableHeaderTitle: {
    marginTop: 3,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: fonts.semibold,
    color: colors.ink,
  },
  tableStats: {
    alignItems: 'flex-end',
    gap: 3,
  },
  tableStat: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: 1.1,
  },
  tableEntry: {
    minHeight: 360,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.x4l,
  },
  entryCopy: {
    alignItems: 'center',
    maxWidth: 292,
    marginBottom: space.xxl,
  },
  entryEyebrow: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: 1.8,
  },
  entryTitle: {
    marginTop: space.sm,
    fontSize: 29,
    lineHeight: 34,
    fontFamily: fonts.extra,
    color: colors.ink,
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  entryDetail: {
    marginTop: space.sm,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: fonts.regular,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  deckObjectButton: {
    minWidth: 124,
    minHeight: 188,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  deckObjectPressed: {
    transform: [{ translateY: 3 }, { scale: 0.96 }],
  },
  deckObject: {
    width: 112,
    height: 148,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deckBackCard: {
    position: 'absolute',
    top: 8,
    left: 17,
    transform: [{ rotate: '8deg' }],
  },
  deckFrontCard: {
    position: 'absolute',
    top: 0,
    left: 7,
    transform: [{ rotate: '-6deg' }],
  },
  deckObjectLabel: {
    marginTop: space.xs,
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: 1.8,
  },
  supportLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.lg,
  },
  supportRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: alpha.inkOverlay12,
  },
  supportText: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: 1.4,
  },
  firstRunHint: {
    alignItems: 'center',
    alignSelf: 'center',
    minHeight: 58,
    marginBottom: space.lg,
    paddingHorizontal: space.xl,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.brand20,
  },
  firstRunHintText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.brand,
    letterSpacing: 0.3,
  },
  firstRunHintDetail: {
    marginTop: 3,
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.inkMuted,
  },
  resumeSlip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.inkOverlay12,
    backgroundColor: alpha.whiteOverlay45,
  },
  resumeCopy: {
    flex: 1,
    minWidth: 0,
  },
  resumeEyebrow: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: 1.4,
  },
  resumeTitle: {
    marginTop: 3,
    fontSize: 16,
    fontFamily: fonts.extra,
    color: colors.ink,
  },
  resumeDetail: {
    marginTop: 2,
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.inkMuted,
  },
  resumeButton: {
    minWidth: 78,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.brand,
  },
  resumeButtonPressed: {
    backgroundColor: colors.brandDark,
    transform: [{ scale: 0.97 }],
  },
  resumeButtonText: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.surface,
    letterSpacing: 1.2,
  },
  supportAction: {
    alignItems: 'center',
    marginTop: space.xs,
    paddingBottom: space.md,
  },
  friendAction: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
    paddingVertical: space.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: alpha.inkOverlay12,
    backgroundColor: alpha.whiteOverlay45,
  },
  friendActionPressed: {
    backgroundColor: alpha.inkOverlay06,
    transform: [{ scale: 0.97 }],
  },
  friendActionEyebrow: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: 1.4,
  },
  friendActionText: {
    marginTop: 3,
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.inkMuted,
  },
});

export default HomeLayer;
