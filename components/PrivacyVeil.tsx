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
import Eye from 'lucide-react-native/icons/eye';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMotion } from '@hooks/useMotion';
import { EASING_EMPHASIZED, PASS_VEIL_OFFSET_Y } from '@lib/motion';
import { alpha, colors, fonts, letterSpacing, motion, radii, shadow, space } from '@theme';

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
 * Pass-and-play privacy gate. The table is covered by a quiet felt seal while
 * the phone changes hands. A 600ms long-press makes revealing the hand feel
 * intentional instead of like an accidental tap.
 */
export function PrivacyVeil({
  visible,
  recipientName,
  phaseLabel = 'NEXT PLAYER',
  headline = 'PASS TO',
  onReveal,
}: PrivacyVeilProps) {
  const { haptic, reduceMotion } = useMotion();
  const insets = useSafeAreaInsets();
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
    }

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
  }, [visible, fade, mountScale, mountTranslateY, progress, reduceMotion]);

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

  const markPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, 1.04]) }],
  }));

  if (!mounted) return null;

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.root,
        {
          paddingTop: insets.top + space.sm,
          paddingBottom: Math.max(insets.bottom, space.lg),
        },
        rootStyle,
      ]}
    >
      <View pointerEvents="none" style={styles.backdrop} />

      <View style={styles.seal}>
        <View style={styles.sealContent}>
          <View style={styles.identity}>
            <Text style={styles.phase}>{phaseLabel}</Text>
            <Animated.View style={[styles.sealMark, markPulseStyle]}>
              <Eye size={32} color={colors.surface} strokeWidth={1.7} />
            </Animated.View>
            <View style={styles.recipientBlock}>
              <Text style={styles.headline}>{headline}</Text>
              <Text style={styles.recipientName}>{recipientName}</Text>
            </View>
          </View>

          <View style={styles.bottom}>
            <GestureDetector gesture={longPress}>
              <Animated.View
                accessible
                accessibilityRole="button"
                accessibilityLabel="Hold to reveal your hand"
                accessibilityHint="Keep holding for 0.6 seconds to reveal the next hand."
                style={[styles.revealButton, buttonScaleStyle]}
              >
                <Animated.View style={[styles.revealFill, fillStyle]} />
                <View style={styles.revealContent}>
                  <Text style={styles.revealText}>Hold to reveal</Text>
                </View>
              </Animated.View>
            </GestureDetector>

            <Text style={styles.hint}>HOLD FOR {HOLD_MS / 1000}s</Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    backgroundColor: colors.surfaceAlt,
    zIndex: 100,
    elevation: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: alpha.brand10,
  },
  seal: {
    flex: 1,
    width: '100%',
    maxWidth: 560,
    maxHeight: 680,
    minHeight: 0,
    marginVertical: space.md,
    overflow: 'hidden',
    borderRadius: radii.xxl + space.sm,
    borderWidth: 1,
    borderColor: alpha.whiteOverlay20,
    backgroundColor: colors.tableFelt,
    ...shadow.passGlow,
  },
  sealContent: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: space.xl,
    paddingTop: space.xl,
    paddingBottom: space.x5l,
  },
  identity: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 0,
  },
  phase: {
    color: alpha.whiteOverlay80,
    fontSize: 12,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.caps,
    textAlign: 'center',
    marginBottom: space.lg,
  },
  sealMark: {
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: alpha.whiteOverlay45,
    backgroundColor: alpha.whiteOverlay20,
    marginBottom: space.xl,
  },
  recipientBlock: {
    alignItems: 'center',
  },
  headline: {
    color: alpha.whiteOverlay80,
    fontSize: 13,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.caps,
    textAlign: 'center',
  },
  recipientName: {
    color: colors.surface,
    fontSize: 32,
    lineHeight: 40,
    fontFamily: fonts.extra,
    letterSpacing: letterSpacing.tight,
    textAlign: 'center',
    marginTop: space.xs,
  },
  bottom: {
    width: '100%',
    alignItems: 'center',
    paddingTop: space.xl,
  },
  revealButton: {
    width: '100%',
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: alpha.whiteOverlay20,
    backgroundColor: colors.ink,
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
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  revealText: {
    color: colors.surface,
    fontSize: 18,
    fontFamily: fonts.bold,
  },
  hint: {
    color: alpha.whiteOverlay80,
    fontSize: 11,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.capLoose,
    textAlign: 'center',
    marginTop: space.lg,
    marginBottom: space.x5l,
  },
});
