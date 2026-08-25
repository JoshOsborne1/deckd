/**
 * StackSurface — a column of sequentially stacked cards.
 *
 * Holds the exposed lead card and drags the legal run beneath it as one body
 * (Klondike tableau columns, suit runs). The lead card is the grip; the legal
 * run rides attached to the same translation. Releases that miss a legal run
 * target spring the whole stack home as one.
 *
 * Phase 1 scope: single-card lead + zero-or-more follower art; legality of
 * "which run may be dragged" comes from the provider via the lead card, the
 * surface never decides.
 */

import React, { useCallback, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { CardZone } from '@components/card/CardZone';
import { useMotion } from '@hooks/useMotion';
import {
  nextPhysicalIntentId,
  type LegalTargetsProvider,
  type PhysicalIntent,
} from '@lib/physicalIntents';
import { motion } from '@theme';

export interface StackSurfaceCard {
  id: string;
  render: () => React.ReactNode;
  accessibilityLabel?: string;
}

export interface StackSurfaceProps {
  zoneId: string;
  actorId: string;
  /** Lead (exposed) card first; followers ride underneath in `run`. */
  lead: StackSurfaceCard;
  run: readonly StackSurfaceCard[];
  legalTargets: LegalTargetsProvider;
  dispatchIntent: (intent: PhysicalIntent) => void;
  /** Vertical spacing between stacked cards. */
  offset?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function StackSurface({
  zoneId,
  actorId,
  lead,
  run,
  legalTargets,
  dispatchIntent,
  offset = 22,
  style,
  testID,
}: StackSurfaceProps) {
  const { haptic, reduceMotion, announce } = useMotion();
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const lifted = useSharedValue(false);

  const cardIds = useMemo(() => [lead.id, ...run.map((card) => card.id)], [lead.id, run]);

  // Ask the provider for the lead's legal targets; the run follows the lead.
  const runTargets = useMemo(
    () => legalTargets({ cardId: lead.id, fromZoneId: zoneId }).zoneIds,
    [lead.id, legalTargets, zoneId],
  );

  const commitRun = useCallback(
    (targetZoneId: string) => {
      haptic('success');
      announce(`Moved ${lead.accessibilityLabel ?? lead.id} stack to ${targetZoneId}`);
      dispatchIntent({
        id: nextPhysicalIntentId(),
        type: 'card.move',
        actorId,
        cardIds,
        from: zoneId,
        to: targetZoneId,
      });
    },
    [actorId, announce, cardIds, dispatchIntent, haptic, lead.accessibilityLabel, lead.id, zoneId],
  );

  const cancelRun = useCallback(() => {
    haptic('soft');
  }, [haptic]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .withTestId(`${testID ?? `stack-${zoneId}`}-drag`)
        .activateAfterLongPress(160)
        .minDistance(8)
        .onStart(() => {
          'worklet';
          lifted.value = true;
          runOnJS(haptic)('light');
        })
        .onUpdate((event) => {
          'worklet';
          translateX.value = event.translationX;
          translateY.value = event.translationY;
        })
        .onEnd((event) => {
          'worklet';
          lifted.value = false;
          // The engine-owned provider decides the only destinations this run
          // may use. The gesture owns motion thresholds, never game legality.
          const travel = Math.abs(event.translationX) + Math.abs(event.translationY);
          const committed = travel > 56 || Math.abs(event.velocityY) > 800;
          const duration = reduceMotion ? 120 : 240;
          translateX.value = withSpring(0, { ...motion.spring.card });
          translateY.value = withSpring(0, { ...motion.spring.card }, (finished) => {
            'worklet';
            if (!finished) return;
            runOnJS(committed ? commitRun : cancelRun)(runTargets[0] ?? zoneId);
          });
          void duration;
        }),
    [cancelRun, commitRun, haptic, lifted, reduceMotion, runTargets, testID, translateX, translateY, zoneId],
  );

  const stackAnimated = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: lifted.value ? 1.04 : 1 },
      ],
      zIndex: lifted.value ? 1000 : 0,
    };
  });

  return (
    <CardZone zoneId={zoneId} testID={testID ?? `stack-${zoneId}`}>
      <View style={[styles.root, style]}>
        <GestureDetector gesture={gesture}>
          <Animated.View style={[styles.stack, stackAnimated]}>
            {/* Followers ride with the lead through the same transform. */}
            {run.map((card, index) => (
              <View
                key={card.id}
                pointerEvents="none"
                style={[styles.follower, { top: (index + 1) * offset }]}
              >
                {card.render()}
              </View>
            ))}
            <View pointerEvents="none">{lead.render()}</View>
          </Animated.View>
        </GestureDetector>
      </View>
    </CardZone>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  stack: {
    position: 'relative',
  },
  follower: {
    position: 'absolute',
    left: 0,
  },
});

export default StackSurface;
