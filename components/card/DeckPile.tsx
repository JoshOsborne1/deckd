/**
 * DeckPile — the physical deck.
 *
 * Primary draw gesture is a short downward pull from the top card toward the
 * hand; tap is the accessible/fatigue fallback. Both dispatch the SAME typed
 * `pile.draw` intent. The pile itself never moves — the draw journey is owned
 * by the motion coordinator after the intent commits.
 */

import React, { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { CardZone } from '@components/card/CardZone';
import { useMotion } from '@hooks/useMotion';
import {
  nextPhysicalIntentId,
  type PhysicalIntent,
} from '@lib/physicalIntents';
import { motion } from '@theme';

export interface DeckPileProps {
  zoneId: string;
  actorId: string;
  /** Zone the drawn card should land in (typically the current hand). */
  drawToZoneId: string;
  /** Render the deck's top card face/back and any stockpile stack effect. */
  children: React.ReactNode;
  /** Cards remaining; drives accessibility copy and disables at 0. */
  count: number;
  dispatchIntent: (intent: PhysicalIntent) => void;
  label?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const DRAW_PULL_DISTANCE = 72;

export function DeckPile({
  zoneId,
  actorId,
  drawToZoneId,
  children,
  count,
  dispatchIntent,
  label = 'Deck',
  style,
  testID,
}: DeckPileProps) {
  const { haptic, announce } = useMotion();
  const disabled = count <= 0;
  const pullY = useSharedValue(0);

  const fireDraw = useCallback(() => {
    if (disabled) return;
    haptic('medium');
    announce(`Drew a card from ${label}`);
    dispatchIntent({
      id: nextPhysicalIntentId(),
      type: 'pile.draw',
      actorId,
      pileId: zoneId,
      to: drawToZoneId,
    });
  }, [actorId, announce, disabled, dispatchIntent, drawToZoneId, haptic, label, zoneId]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .withTestId(`${testID ?? `deck-pile-${zoneId}`}-pull`)
        .enabled(!disabled)
        .activeOffsetY(24)
        .onUpdate((event) => {
          'worklet';
          // Visual pull feedback: the stack squashes down slightly 1:1 below 72.
          pullY.value = Math.min(DRAW_PULL_DISTANCE, Math.max(0, event.translationY)) / DRAW_PULL_DISTANCE;
        })
        .onEnd((event) => {
          'worklet';
          const pulled = event.translationY >= DRAW_PULL_DISTANCE || event.velocityY > 900;
          pullY.value = withTiming(0, { duration: motion.duration.fast });
          if (pulled) runOnJS(fireDraw)();
        })
        .onFinalize(() => {
          'worklet';
          pullY.value = withSpring(0, motion.spring.card);
        }),
    [disabled, fireDraw, pullY, testID, zoneId],
  );

  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [
        { translateY: pullY.value * 14 },
        { scale: 1 - pullY.value * 0.04 },
      ],
    };
  });

  return (
    <CardZone zoneId={zoneId} active={!disabled} testID={testID ?? `deck-pile-${zoneId}`}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.root, style, animatedStyle]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label}${count > 0 ? `, ${count} cards` : ', empty'}`}
            accessibilityHint="Swipe down to draw, or double-tap."
            disabled={disabled}
            onPress={fireDraw}
            testID={`${testID ?? `deck-pile-${zoneId}`}-tap`}
            style={({ pressed }) => [
              styles.pressTarget,
              pressed && styles.pressed,
            ]}
          >
            <View pointerEvents="none" style={styles.stack}>
              {children}
            </View>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </CardZone>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressTarget: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 96,
    minHeight: 132,
    padding: 4,
  },
  pressed: {
    opacity: 0.94,
  },
  stack: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default DeckPile;
