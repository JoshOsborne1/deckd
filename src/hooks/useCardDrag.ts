/* eslint-disable react-hooks/immutability */

import { useCallback, useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import {
  CARD_DRAG_HOLD_MS,
  CARD_DRAG_LIFT_SCALE,
  CARD_DRAG_MIN_DISTANCE,
  CARD_DRAG_SETTLE_PX,
  getDropTargetAtPoint,
  getLandingTranslation,
  type CardDropTarget,
  type CardPoint,
  type CardSlot,
} from '@lib/cardDrag';
import { useMotion } from '@hooks/useMotion';
import { motion } from '@theme';

export interface CardDragCallbacks {
  onDrop?: (targetId: string) => void;
  onCancel?: () => void;
  onLift?: () => void;
}

export interface UseCardDragOptions extends CardDragCallbacks {
  cardId: string;
  cardSize: Pick<CardSlot, 'width' | 'height'>;
  slot: Pick<CardSlot, 'x' | 'y'>;
  dropTargets?: readonly CardDropTarget[];
  disabled?: boolean;
}

export interface CardDragMotion {
  gesture: ReturnType<typeof Gesture.Pan>;
  animatedStyle: ReturnType<typeof useAnimatedStyle>;
  activeTargetId: SharedValue<string | null>;
  isDragging: SharedValue<boolean>;
}

function pointAtTranslation(
  slot: Pick<CardSlot, 'x' | 'y'>,
  cardSize: Pick<CardSlot, 'width' | 'height'>,
  translationX: number,
  translationY: number,
): CardPoint {
  'worklet';
  return {
    x: slot.x + cardSize.width / 2 + translationX,
    y: slot.y + cardSize.height / 2 + translationY,
  };
}

/**
 * Shared card movement primitive. The pan does not activate until the player
 * has held for 120ms and moved at least 6px, leaving ordinary taps intact.
 */
export function useCardDrag({
  cardId,
  cardSize,
  slot,
  dropTargets = [],
  disabled = false,
  onDrop,
  onCancel,
  onLift,
}: UseCardDragOptions): CardDragMotion {
  const { haptic, reduceMotion } = useMotion();
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const isDragging = useSharedValue(false);
  const activeTargetId = useSharedValue<string | null>(null);

  const finishDrop = useCallback(
    (targetId: string) => {
      haptic('success');
      onDrop?.(targetId);
    },
    [haptic, onDrop],
  );

  const finishCancel = useCallback(() => {
    haptic('soft');
    onCancel?.();
  }, [haptic, onCancel]);

  const resetVisualState = useCallback(() => {
    'worklet';
    isDragging.value = false;
    activeTargetId.value = null;
    scale.value = 1;
  }, [activeTargetId, isDragging, scale]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .withTestId(`card-drag-${cardId}`)
        .enabled(!disabled)
        .activateAfterLongPress(CARD_DRAG_HOLD_MS)
        .minDistance(CARD_DRAG_MIN_DISTANCE)
        .shouldCancelWhenOutside(false)
        .onStart(() => {
          'worklet';
          isDragging.value = true;
          scale.value = reduceMotion ? 1 : CARD_DRAG_LIFT_SCALE;
          activeTargetId.value = null;
          runOnJS(haptic)('light');
          if (onLift) runOnJS(onLift)();
        })
        .onUpdate((event) => {
          'worklet';
          translateX.value = event.translationX;
          translateY.value = event.translationY;

          const point = pointAtTranslation(
            slot,
            cardSize,
            event.translationX,
            event.translationY,
          );
          const target = getDropTargetAtPoint(point, dropTargets);
          activeTargetId.value = target?.id ?? null;
        })
        .onEnd((event) => {
          'worklet';
          const point = pointAtTranslation(
            slot,
            cardSize,
            event.translationX,
            event.translationY,
          );
          const target = getDropTargetAtPoint(point, dropTargets);
          activeTargetId.value = target?.id ?? null;

          if (target) {
            const landing = getLandingTranslation(slot, cardSize, target);
            const settleToX = landing.x;
            const settleToY = landing.y;
            const finish = () => {
              'worklet';
              resetVisualState();
              runOnJS(finishDrop)(target.id);
            };

            if (reduceMotion) {
              translateX.value = settleToX;
              translateY.value = settleToY;
              finish();
              return;
            }

            const settleSpring = {
              ...motion.spring.card,
              overshootClamping: true,
            };
            translateX.value = withSequence(
              withSpring(settleToX + CARD_DRAG_SETTLE_PX, settleSpring),
              withSpring(settleToX, settleSpring, (finished) => {
                'worklet';
                if (finished) finish();
              }),
            );
            translateY.value = withSequence(
              withSpring(settleToY + CARD_DRAG_SETTLE_PX, settleSpring),
              withSpring(settleToY, settleSpring),
            );
            return;
          }

          if (reduceMotion) {
            translateX.value = 0;
            translateY.value = 0;
            resetVisualState();
            runOnJS(finishCancel)();
            return;
          }

          translateX.value = withSpring(0, motion.spring.card, (finished) => {
            'worklet';
            if (finished) {
              resetVisualState();
              runOnJS(finishCancel)();
            }
          });
          translateY.value = withSpring(0, motion.spring.card);
        })
        .onFinalize((_event, success) => {
          'worklet';
          if (success) return;
          cancelAnimation(translateX);
          cancelAnimation(translateY);
          translateX.value = withTiming(0, { duration: motion.duration.fast });
          translateY.value = withTiming(0, { duration: motion.duration.fast });
          resetVisualState();
        }),
    [
      cardId,
      cardSize,
      disabled,
      dropTargets,
      finishCancel,
      finishDrop,
      haptic,
      onLift,
      reduceMotion,
      resetVisualState,
      slot,
      activeTargetId,
      isDragging,
      scale,
      translateX,
      translateY,
    ],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
      { rotate: '0deg' },
    ],
    zIndex: isDragging.value ? 1000 : undefined,
    shadowOpacity: reduceMotion ? 0 : isDragging.value ? 0.16 : 0,
    shadowRadius: reduceMotion ? 0 : isDragging.value ? 12 : 0,
    shadowOffset: {
      width: 0,
      height: reduceMotion ? 0 : isDragging.value ? 8 : 0,
    },
    elevation: reduceMotion ? 0 : isDragging.value ? 10 : 0,
  }));

  return {
    gesture,
    animatedStyle,
    activeTargetId,
    isDragging,
  };
}
