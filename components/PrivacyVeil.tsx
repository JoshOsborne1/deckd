import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Extrapolation,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Eye } from 'lucide-react-native';
import { AvatarPlaceholder } from '@components/AvatarPlaceholder';
import { useMotion } from '@hooks/useMotion';
import { EASING_EMPHASIZED } from '@lib/motion';
import { colors, fonts, letterSpacing, motion, radii, shadow, space, textStyles } from '@theme';

export interface PrivacyVeilProps {
  visible: boolean;
  recipientName: string;
  recipientSeed?: string;
  phaseLabel?: string;
  headline?: string;
  onReveal: () => void;
  onCancel?: () => void;
  children?: React.ReactNode;
}

const HOLD_MS = 600;

/**
 * Pass-and-play privacy gate. Requires a 600ms long-press with a progress
 * fill so the reveal feels intentional. Fires `onReveal` once the gesture
 * completes (success haptic).
 */
export function PrivacyVeil({
  visible,
  recipientName,
  recipientSeed,
  phaseLabel = 'PASSING PHASE',
  headline = 'PASS DEVICE TO',
  onReveal,
}: PrivacyVeilProps) {
  const { haptic, reduceMotion } = useMotion();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const progress = useSharedValue(0);
  const fade = useSharedValue(visible ? 1 : 0);
  const mountScale = useSharedValue(visible ? 1 : 0.985);
  const buttonWidth = useSharedValue(0);

  const [mounted, setMounted] = useState(visible);
  const compactHeight = height < 700;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      if (reduceMotion) {
        mountScale.value = 1;
        fade.value = withTiming(1, { duration: motion.duration.base });
      } else {
        mountScale.value = 0.985;
        fade.value = withTiming(1, {
          duration: motion.duration.slow,
          easing: EASING_EMPHASIZED,
        });
        mountScale.value = withSpring(1, motion.spring.veil);
      }
    } else {
      fade.value = withTiming(0, {
        duration: motion.duration.base,
        easing: EASING_EMPHASIZED,
      });
      if (!reduceMotion) {
        mountScale.value = withTiming(0.992, { duration: motion.duration.fast });
      }
      cancelAnimation(progress);
      progress.value = 0;
      const t = setTimeout(() => setMounted(false), motion.duration.slow);
      return () => clearTimeout(t);
    }
  }, [visible, fade, progress, mountScale, reduceMotion]);

  const longPress = Gesture.LongPress()
    .minDuration(HOLD_MS)
    .maxDistance(20)
    .onBegin(() => {
      progress.value = withTiming(1, { duration: HOLD_MS });
      runOnJS(haptic)('light');
    })
    .onStart(() => {
      runOnJS(haptic)('success');
      runOnJS(onReveal)();
    })
    .onFinalize((_event, success) => {
      if (!success) {
        progress.value = withTiming(0, { duration: motion.duration.base });
      }
    });

  const rootStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ scale: mountScale.value }],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    opacity: buttonWidth.value > 0 ? 1 : 0,
    transform: [
      {
        translateX: interpolate(
          progress.value,
          [0, 1],
          [-buttonWidth.value, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const buttonScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, 0.98]) }],
  }));

  const heroPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, 1.04]) }],
  }));

  if (!mounted) return null;

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[styles.root, rootStyle]}
    >
      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + space.xl,
            paddingHorizontal: compactHeight ? space.xl : space.xxxl,
          },
        ]}
      >
        <Animated.View style={[styles.hero, heroPulseStyle]}>
          <Text style={styles.turnLabel}>Player turn</Text>
          <AvatarPlaceholder
            seed={recipientSeed ?? recipientName}
            label={recipientName}
            size={compactHeight ? 76 : 96}
            ring="soft"
          />
          <Text
            style={[textStyles.h1, styles.recipientName, compactHeight && styles.recipientNameCompact]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {recipientName}
          </Text>
        </Animated.View>

        <Text style={styles.phase}>{phaseLabel}</Text>
        <Text style={[styles.headline, compactHeight && styles.headlineCompact]}>
          {headline}
        </Text>

        <Text style={styles.description}>
          Hand the phone over.{'\n'}Your cards stay hidden behind this veil.
        </Text>
      </View>

      <View
        style={[
          styles.bottom,
          {
            paddingHorizontal: compactHeight ? space.xl : space.xxxl,
            paddingBottom: insets.bottom + (compactHeight ? space.xl : space.x5l),
          },
        ]}
      >
        <GestureDetector gesture={longPress}>
          <Animated.View
            onLayout={(e) => {
              buttonWidth.value = e.nativeEvent.layout.width;
            }}
            style={[styles.revealButton, compactHeight && styles.revealButtonCompact, buttonScaleStyle]}
          >
            <Animated.View style={[styles.revealFill, fillStyle]} />
            <View style={styles.revealContent}>
              <Text style={styles.revealText}>Hold to reveal</Text>
              <Eye size={20} color={colors.surface} style={{ marginLeft: space.sm }} />
            </View>
          </Animated.View>
        </GestureDetector>

        <Text style={styles.hint}>PRESS AND HOLD FOR {Math.round(HOLD_MS / 100) / 10}s</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
    zIndex: 100,
    elevation: 24,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
  },
  hero: {
    alignItems: 'center',
    gap: space.lg,
    marginBottom: space.xl,
  },
  turnLabel: {
    ...textStyles.eyebrow,
    color: colors.brand,
  },
  recipientName: {
    color: colors.brand,
    textAlign: 'center',
    maxWidth: '100%',
  },
  recipientNameCompact: {
    fontSize: 24,
  },
  phase: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.inkMuted,
    letterSpacing: letterSpacing.caps,
    marginBottom: space.sm,
  },
  headline: {
    fontSize: 28,
    fontFamily: fonts.extra,
    color: colors.ink,
    letterSpacing: letterSpacing.tight,
    textAlign: 'center',
  },
  headlineCompact: {
    fontSize: 24,
  },
  description: {
    fontSize: 15,
    color: colors.inkMuted,
    textAlign: 'center',
    lineHeight: 22,
    fontFamily: fonts.regular,
    marginTop: space.xl,
  },
  bottom: {
    alignItems: 'center',
  },
  revealButton: {
    width: '100%',
    height: 72,
    borderRadius: radii.xxl + 6,
    backgroundColor: colors.brandDark,
    overflow: 'hidden',
    justifyContent: 'center',
    ...shadow.ctaLift,
  },
  revealFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: '100%',
    backgroundColor: colors.brand,
  },
  revealButtonCompact: {
    height: 64,
  },
  revealContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  revealText: {
    color: colors.surface,
    fontSize: 18,
    fontFamily: fonts.bold,
  },
  hint: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.capLoose,
    marginTop: space.lg,
    marginBottom: space.xxl,
  },
});
