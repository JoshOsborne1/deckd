/**
 * TurnToken — the physical pass-turn token.
 *
 * Slide the token toward the handoff edge to pass; tap is the accessible
 * fallback. Both dispatch the SAME `turn.pass` intent. On release without
 * enough travel the token springs home; on pass it slides fully off-screen.
 */

import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useMotion } from '@hooks/useMotion';
import { nextPhysicalIntentId, type PhysicalIntent } from '@lib/physicalIntents';
import { alpha, colors, fonts, motion, radii, shadow, space } from '@theme';

export interface TurnTokenProps {
  actorId: string;
  dispatchIntent: (intent: PhysicalIntent) => void;
  /** Travel needed before the pass commits. */
  threshold?: number;
  disabled?: boolean;
  label?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const DEFAULT_THRESHOLD = 96;

export function TurnToken({
  actorId,
  dispatchIntent,
  threshold = DEFAULT_THRESHOLD,
  disabled = false,
  label = 'Pass turn',
  style,
  testID,
}: TurnTokenProps) {
  const { haptic, announce } = useMotion();
  const travel = useSharedValue(0);
  const passed = useSharedValue(false);

  const firePass = useCallback(() => {
    if (disabled) return;
    haptic('success');
    announce('Turn passed');
    dispatchIntent({
      id: nextPhysicalIntentId(),
      type: 'turn.pass',
      actorId,
    });
  }, [actorId, announce, disabled, dispatchIntent, haptic]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .withTestId(`${testID ?? 'turn-token'}-slide`)
        .enabled(!disabled)
        .activeOffsetX(14)
        .onUpdate((event) => {
          'worklet';
          if (passed.value) return;
          travel.value = Math.max(0, Math.min(threshold, event.translationX));
        })
        .onEnd((event) => {
          'worklet';
          if (passed.value) return;
          const committed =
            event.translationX >= threshold * 0.82 || event.velocityX > 900;
          if (committed) {
            passed.value = true;
            travel.value = withTiming(threshold, { duration: motion.duration.base });
            runOnJS(firePass)();
            return;
          }
          travel.value = withSpring(0, motion.spring.card);
        })
        .onFinalize(() => {
          'worklet';
          if (passed.value) return;
          travel.value = 0;
        }),
    [disabled, firePass, passed, testID, threshold, travel],
  );

  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [{ translateX: travel.value }],
      opacity: 1 - (passed.value ? 0.4 : 0),
    };
  });

  const hintStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      opacity: 1 - travel.value / Math.max(1, threshold),
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Slide right to pass the turn, or double-tap."
        accessibilityActions={[{ name: 'pass', label: 'Pass turn' }]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'pass') firePass();
        }}
        testID={testID ?? 'turn-token'}
        style={[styles.token, disabled && styles.tokenDisabled, style, animatedStyle]}
      >
        <Text style={styles.tokenText}>PASS</Text>
        {/* Slide hint rail that fades as you travel. */}
        <Animated.View pointerEvents="none" style={[styles.hintRail, hintStyle]} />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  token: {
    minWidth: 132,
    minHeight: 48,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.brand,
    ...shadow.cta,
    borderWidth: 1,
    borderColor: alpha.brand45,
    overflow: 'hidden',
  },
  tokenDisabled: {
    opacity: 0.5,
  },
  tokenText: {
    color: colors.surface,
    fontFamily: fonts.extra,
    fontSize: 15,
    letterSpacing: 2,
  },
  hintRail: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 4,
    height: 2,
    backgroundColor: alpha.whiteOverlay45,
  },
});

export default TurnToken;
