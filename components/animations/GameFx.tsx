import React, { useEffect } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { alpha, colors, motion, radii } from '@theme';

/**
 * Reusable game choreography primitives for the per-game animation passes.
 * All of them respect `reduceMotion`: rings become a fade-out, shakes
 * become nothing, and pops become short fades. No new deps, no raw hex.
 */

interface FxBaseProps {
  reduceMotion: boolean;
  /** Change this key to replay the effect. */
  trigger: string | null;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Expanding crimson ring that fades out (suit-change on 8s, sevens opens).
 * Renders only while `trigger` is set; the ring expands once and fades.
 * Under reduced motion it is a short fade-out instead of an expansion.
 */
export function RingPulse({ reduceMotion, trigger, style }: FxBaseProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(progress);
    if (!trigger) return;
    progress.value = 0;
    progress.value = withTiming(1, { duration: reduceMotion ? motion.duration.fast : motion.duration.slow });
  }, [progress, reduceMotion, trigger]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: reduceMotion
      ? []
      : [{ scale: 1 + progress.value * 1.6 }, { rotate: `${progress.value * 90}deg` }],
  }));

  if (!trigger) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        styles.ring,
        reduceMotion && styles.ringReduced,
        ringStyle,
        style,
      ]}
    />
  );
}

/** Scale pop to 1.06 with a settle — winner cards, hand-over emphasis. */
export function CardPop({ reduceMotion, trigger, children, style }: FxBaseProps) {
  const scale = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(scale);
    if (!trigger || reduceMotion) {
      scale.value = 1;
      return;
    }
    scale.value = 1;
    scale.value = withSequence(
      withSpring(1.06, motion.spring.card),
      withSpring(1, motion.spring.card),
    );
  }, [reduceMotion, scale, trigger]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>;
}

/** Hand shake: x ±3px, 3 cycles. Falls back to nothing under reduced motion. */
export function HandShake({
  reduceMotion,
  trigger,
  children,
  style,
  amplitude = 3,
  cycles = 3,
}: FxBaseProps & { amplitude?: number; cycles?: number }) {
  const translateX = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(translateX);
    if (!trigger || reduceMotion) {
      translateX.value = 0;
      return;
    }
    const timings: Parameters<typeof withSequence>[number][] = [];
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      timings.push(withTiming(amplitude, { duration: 45 }));
      timings.push(withTiming(-amplitude, { duration: 45 }));
    }
    timings.push(withTiming(0, { duration: 45 }));
    // All steps are numbers; withSequence's tuple typing widens to
    // AnimatableValue, so narrow back for the number shared value.
    translateX.value = withSequence(...timings) as number;
  }, [amplitude, cycles, reduceMotion, translateX, trigger]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>;
}

/**
 * Crimson ring flash on a value pill (bust). The pill's own background
 * style stays untouched (the caller turns it ink on bust); this adds a
 * brief crimson border + glow that works on iOS and Android.
 */
export function CrimsonFlash({ reduceMotion, trigger, children, style }: FxBaseProps) {
  const flash = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(flash);
    if (!trigger) {
      flash.value = 0;
      return;
    }
    if (reduceMotion) {
      // Reduced motion: a gentle colour pulse instead of a flash.
      flash.value = 0;
      flash.value = withSequence(
        withTiming(1, { duration: motion.duration.fast }),
        withTiming(0, { duration: motion.duration.slow }),
      );
      return;
    }
    flash.value = 1;
    flash.value = withTiming(0, { duration: motion.duration.slow });
  }, [flash, reduceMotion, trigger]);

  const animatedStyle = useAnimatedStyle(() => ({
    borderColor: flash.value > 0.5 ? colors.brand : 'transparent',
    borderWidth: flash.value > 0.5 ? 2 : 0,
    shadowColor: colors.brand,
    shadowOpacity: flash.value * 0.45,
    shadowRadius: 6,
    elevation: flash.value > 0.5 ? 6 : 0,
  }));

  return <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>;
}

/** Chips / pot pulse on CALL/RAISE (scale 1.04). */
export function PotPulse({
  reduceMotion,
  trigger,
  children,
  style,
}: FxBaseProps) {
  const scale = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(scale);
    if (!trigger || reduceMotion) {
      scale.value = 1;
      return;
    }
    scale.value = 1;
    scale.value = withSequence(
      withSpring(1.04, motion.spring.press),
      withSpring(1, motion.spring.card),
    );
  }, [reduceMotion, scale, trigger]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>;
}

/** Label pop — small scale+opacity settle for FeltStack labels. */
export function LabelPop({
  reduceMotion,
  trigger,
  children,
  style,
}: FxBaseProps) {
  const scale = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(scale);
    if (!trigger || reduceMotion) {
      scale.value = 1;
      return;
    }
    scale.value = 0.92;
    scale.value = withSpring(1, motion.spring.card);
  }, [reduceMotion, scale, trigger]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  ring: {
    borderWidth: 2,
    borderColor: alpha.brand45,
    borderRadius: radii.pill,
  },
  ringReduced: {
    borderWidth: 1,
    borderColor: alpha.brand30,
  },
});
