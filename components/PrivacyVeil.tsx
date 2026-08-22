import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
import { EASING_EMPHASIZED, PASS_VEIL_OFFSET_Y } from '@lib/motion';
import { alpha, colors, fonts, letterSpacing, motion, radii, shadow, space, textStyles } from '@theme';

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
  const progress = useSharedValue(0);
  const fade = useSharedValue(visible ? 1 : 0);
  const mountScale = useSharedValue(visible ? 1 : 0.985);
  const mountTranslateY = useSharedValue(visible ? 0 : PASS_VEIL_OFFSET_Y);

  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      cancelAnimation(fade);
      cancelAnimation(mountScale);
      cancelAnimation(mountTranslateY);
      if (reduceMotion) {
        mountScale.value = 1;
        mountTranslateY.value = 0;
        fade.value = withTiming(1, { duration: motion.duration.base });
      } else {
        mountScale.value = 0.985;
        mountTranslateY.value = PASS_VEIL_OFFSET_Y;
        fade.value = withTiming(1, {
          duration: motion.duration.slow,
          easing: EASING_EMPHASIZED,
        });
        mountScale.value = withSpring(1, motion.spring.veil);
        mountTranslateY.value = withSpring(0, motion.spring.veil);
      }
      const t = setTimeout(() => setMounted(true), 0);
      return () => clearTimeout(t);
    } else {
      cancelAnimation(fade);
      cancelAnimation(mountScale);
      cancelAnimation(mountTranslateY);
      fade.value = withTiming(0, {
        duration: motion.duration.base,
        easing: EASING_EMPHASIZED,
      });
      if (!reduceMotion) {
        mountScale.value = withTiming(0.992, { duration: motion.duration.fast });
        mountTranslateY.value = withTiming(PASS_VEIL_OFFSET_Y * 0.5, {
          duration: motion.duration.base,
          easing: EASING_EMPHASIZED,
        });
      } else {
        mountScale.value = 1;
        mountTranslateY.value = 0;
      }
      cancelAnimation(progress);
      progress.value = 0;
      const t = setTimeout(() => setMounted(false), motion.duration.slow);
      return () => clearTimeout(t);
    }
  }, [visible, fade, mountScale, mountTranslateY, progress, reduceMotion]);

  const longPress = Gesture.LongPress()
    .minDuration(HOLD_MS)
    .maxDistance(20)
    .onBegin(() => {
      // Shared value mutation is the canonical Reanimated gesture pattern.
       
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
    transform: reduceMotion
      ? []
      : [{ translateY: mountTranslateY.value }, { scale: mountScale.value }],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    width: `${interpolate(progress.value, [0, 1], [0, 100], Extrapolation.CLAMP)}%`,
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
      <View pointerEvents="none" style={styles.tableAtmosphere}>
        <View style={styles.tableGlow} />
        <View style={styles.outerRail} />
        <View style={styles.innerRail} />
        <View style={styles.tableWell} />
        <View style={styles.topRule} />
        <View style={styles.bottomRule} />
      </View>
      <View style={styles.content}>
        <Animated.View style={[styles.hero, heroPulseStyle]}>
          <Text style={styles.turnLabel}>Player turn</Text>
          <AvatarPlaceholder
            seed={recipientSeed ?? recipientName}
            label={recipientName}
            size={96}
            ring="soft"
          />
          <Text style={[textStyles.h1, styles.recipientName]}>{recipientName}</Text>
        </Animated.View>

        <Text style={styles.phase}>{phaseLabel}</Text>
        <Text style={styles.headline}>{headline}</Text>

        <Text style={styles.description}>
          Hand the phone over.{'\n'}Your cards stay hidden behind this veil.
        </Text>
      </View>

      <View style={styles.bottom}>
        <GestureDetector gesture={longPress}>
          <Animated.View style={[styles.revealButton, buttonScaleStyle]}>
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
    backgroundColor: colors.surfaceAlt,
    zIndex: 100,
    elevation: 24,
  },
  tableAtmosphere: {
    ...StyleSheet.absoluteFillObject,
  },
  tableGlow: {
    position: 'absolute',
    left: '12%',
    right: '12%',
    top: '18%',
    height: '64%',
    borderRadius: 999,
    backgroundColor: colors.surface,
    opacity: 0.62,
  },
  outerRail: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '21%',
    height: '64%',
    borderRadius: 280,
    borderWidth: 18,
    borderColor: colors.borderStrong,
    opacity: 0.42,
  },
  innerRail: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '29%',
    height: '50%',
    borderRadius: 240,
    borderWidth: 1,
    borderColor: alpha.brand20,
    opacity: 0.55,
  },
  tableWell: {
    position: 'absolute',
    left: 38,
    right: 38,
    top: '34%',
    height: '38%',
    borderRadius: 220,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    opacity: 0.42,
  },
  topRule: {
    position: 'absolute',
    top: 88,
    left: space.xxxl,
    right: space.xxxl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: alpha.brand20,
    opacity: 0.7,
  },
  bottomRule: {
    position: 'absolute',
    bottom: 104,
    left: space.xxxl,
    right: space.xxxl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: alpha.brand20,
    opacity: 0.7,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xxxl,
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
  description: {
    fontSize: 15,
    color: colors.inkMuted,
    textAlign: 'center',
    lineHeight: 22,
    fontFamily: fonts.regular,
    marginTop: space.xl,
  },
  bottom: {
    paddingHorizontal: space.xxxl,
    paddingBottom: space.x5l,
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
    backgroundColor: colors.brand,
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
