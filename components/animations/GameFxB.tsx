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
import { alpha, colors, motion, radii, shadow } from '@theme';

/**
 * Lane-B game choreography primitives (spec section 2, games B half).
 *
 * Distinct names from the parallel lane's GameFx.tsx (RingPulse, CardPop,
 * HandShake, ...) so both branches merge into main without add/add
 * conflicts. All primitives respect `reduceMotion`: rings become fades,
 * slides become snaps, shakes/wiggles become nothing. No new deps, no raw
 * hex — tokens only.
 */

interface FxBProps {
  reduceMotion: boolean;
  /** Change this key to replay the effect. Null hides the effect. */
  trigger: string | null;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Expanding crimson ring that fades out — sevens opening, suit-change
 * moments. Renders only while `trigger` is set. Reduced motion = a short
 * fade-out instead of an expansion.
 */
export function RingPulseB({ reduceMotion, trigger, style }: FxBProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(progress);
    if (!trigger) return;
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: reduceMotion ? motion.duration.fast : motion.duration.slow,
    });
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

/** Scale pop to 1.06 with a settle — winner cards, matched-pair emphasis. */
export function CardPopB({ reduceMotion, trigger, children, style }: FxBProps) {
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

/**
 * A chip (pass token) slides from one point to another and fades out —
 * sevens pass ritual, hand-over cue. Points are in the parent's coordinate
 * space. Reduced motion = the chip fades in place at the destination.
 */
export function ChipSlideB({
  reduceMotion,
  trigger,
  from,
  to,
  style,
}: FxBProps & { from: { x: number; y: number }; to: { x: number; y: number } }) {
  const progress = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(progress);
    cancelAnimation(opacity);
    if (!trigger) {
      progress.value = 0;
      opacity.value = 0;
      return;
    }
    if (reduceMotion) {
      progress.value = 1;
      opacity.value = withSequence(
        withTiming(1, { duration: motion.duration.fast }),
        withTiming(0, { duration: motion.duration.slow }),
      );
      return;
    }
    progress.value = 0;
    opacity.value = 1;
    progress.value = withTiming(1, { duration: motion.duration.slow + 120 }, (finished) => {
      'worklet';
      if (finished) {
        opacity.value = withTiming(0, { duration: motion.duration.fast });
      }
    });
  }, [opacity, progress, reduceMotion, trigger]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: from.x + (to.x - from.x) * progress.value },
      { translateY: from.y + (to.y - from.y) * progress.value },
    ],
  }));

  if (!trigger) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.chip, animatedStyle, style]}
      accessibilityElementsHidden
    />
  );
}

/**
 * Table-clear sweep: the wrapped board content slides down toward the deck
 * line and fades while the session ends. Reduced motion = plain fade.
 */
export function SweepClearB({ reduceMotion, trigger, children, style }: FxBProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(progress);
    if (!trigger) {
      progress.value = 0;
      return;
    }
    progress.value = withTiming(1, {
      duration: reduceMotion ? motion.duration.fast : 420,
    });
  }, [progress, reduceMotion, trigger]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: reduceMotion
      ? []
      : [
          { translateY: progress.value * 36 },
          { scale: 1 - progress.value * 0.04 },
        ],
  }));

  return (
    <Animated.View
      style={[animatedStyle, style]}
      pointerEvents={trigger ? 'none' : 'auto'}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Reorder wiggle: a quick ±2° rotation that plays when a hand card is
 * lifted for reordering. Reduced motion = nothing (the lift itself stays).
 */
export function WiggleB({
  reduceMotion,
  trigger,
  children,
  style,
  amplitude = 2,
  cycles = 2,
}: FxBProps & { amplitude?: number; cycles?: number }) {
  const rotate = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(rotate);
    if (!trigger || reduceMotion) {
      rotate.value = 0;
      return;
    }
    const timings: number[] = [];
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      timings.push(withTiming(amplitude, { duration: 60 }));
      timings.push(withTiming(-amplitude, { duration: 60 }));
    }
    timings.push(withTiming(0, { duration: 60 }));
    // All steps are numbers; withSequence's tuple typing widens, so narrow
    // back for the number shared value.
    rotate.value = withSequence(...timings) as number;
  }, [amplitude, cycles, reduceMotion, rotate, trigger]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotate.value}deg` }],
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
  chip: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 26,
    height: 26,
    borderRadius: radii.pill,
    backgroundColor: colors.brand,
    borderWidth: 1,
    borderColor: alpha.whiteOverlay80,
    ...shadow.elevated,
  },
});
