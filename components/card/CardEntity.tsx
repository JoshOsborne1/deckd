/**
 * CardEntity — the shared interactive physical card.
 *
 * Implements the blueprint §5.1 lifecycle:
 *
 *   resting -> pressed (same-frame 0.98)
 *           -> lifted (hold threshold; grab point preserved so NO JUMP;
 *              card clears finger + siblings via lift offset + scale)
 *           -> dragging (1:1 follow on the UI runtime, shared values only)
 *           -> targeting (nearest legal zone gains magnetic emphasis)
 *           -> committed (event-owned; the motion coordinator flies it home)
 *           -> cancelled (spring back to rest in <= PHYS_CANCEL_DURATION_MS)
 *
 * Gestures contain ZERO game legality. Legal targets come from a
 * LegalTargetsProvider; the engine stays the only legality authority.
 * Accessibility actions dispatch the SAME typed intents as drag/drop.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  PHYS_CANCEL_DURATION_MS,
  PHYS_LIFT_HOLD_MS,
  PHYS_LIFT_MIN_DISTANCE,
  PHYS_LIFT_OFFSET_Y,
  PHYS_LIFT_SCALE,
  PHYS_PRESS_SCALE,
  physHitTest,
  physLandingTranslation,
  physTargetEmphasis,
  type PhysDropZone,
} from '@lib/physicalCards';
import {
  nextPhysicalIntentId,
  type LegalTargetsProvider,
  type PhysicalIntent,
} from '@lib/physicalIntents';
import { useZoneRegistry } from '@components/table/ZoneRegistry';
import { useMotion } from '@hooks/useMotion';
import { alpha, colors, fonts, motion, radii, shadow, space } from '@theme';

export type CardPhase =
  | 'resting'
  | 'pressed'
  | 'lifted'
  | 'dragging'
  | 'targeting'
  | 'committed'
  | 'cancelled';

export interface ExtraAccessibilityAction {
  name: string;
  label: string;
  run: () => void;
}

export interface CardEntityProps {
  cardId: string;
  /** Actor (player) id used in typed intents. */
  actorId: string;
  /** Zone this card currently rests in. */
  zoneId: string;
  /** Resting rect in the overlay coordinate space (the card's natural slot). */
  restingRect: { x: number; y: number; width: number; height: number };
  /** Legal-target lookup. Never the gesture's job. */
  legalTargets: LegalTargetsProvider;
  /** Dispatches typed intents on commit. */
  dispatchIntent: (intent: PhysicalIntent) => void;
  /** Render the card face/down art. */
  children: ReactNode;
  /** Live centre-x while dragging (used by the fan for the insertion gap). */
  onDragCenterX?: (cardId: string, centerX: number | null) => void;
  /** Extra screen-reader actions merged into the accessibilityActions list. */
  extraAccessibilityActions?: readonly ExtraAccessibilityAction[];
  accessibilityLabel?: string;
  accessibilityHint?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

interface ActionSheetAction {
  id: string;
  label: string;
  run: () => void;
}

export function CardEntity({
  cardId,
  actorId,
  zoneId,
  restingRect,
  legalTargets,
  dispatchIntent,
  children,
  onDragCenterX,
  extraAccessibilityActions,
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
  style,
  testID,
}: CardEntityProps) {
  const { haptic, reduceMotion, announce } = useMotion();
  const registry = useZoneRegistry();
  // UI-runtime shared values — no React state per frame, no JS refs touched
  // from worklets (Reanimated 4/worklets 0.5.1 freezes captured objects; a JS
  // ref's .current write on the UI thread is a silent-iOS-crash class).
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const liftedSv = useSharedValue(false);
  const emphasisSv = useSharedValue(0);
  const restingRectSv = useSharedValue(restingRect);
  const zonesSv = useSharedValue<readonly PhysDropZone[]>([]);
  const phaseSv = useSharedValue<CardPhase>('resting');

  const [phase, setPhase] = useState<CardPhase>('resting');
  const [sheetVisible, setSheetVisible] = useState(false);

  const legalZones = useMemo(() => {
    const result = legalTargets({ cardId, fromZoneId: zoneId });
    return new Set(result.zoneIds);
  }, [cardId, legalTargets, zoneId]);

  useEffect(() => {
    restingRectSv.value = restingRect;
  }, [restingRect, restingRectSv]);

  const setPhaseSafely = useCallback(
    (next: CardPhase) => {
      if (phaseSv.value === next) return;
      phaseSv.value = next;
      setPhase(next);
    },
    [phaseSv],
  );

  // Keep the legal-zone snapshot fresh while resting so drag start is cheap.
  // Shared-value write: safe to read from worklets.
  useEffect(() => {
    zonesSv.value = registry.getAllZones().map((zone) => ({
      id: zone.id,
      x: zone.x,
      y: zone.y,
      width: zone.width,
      height: zone.height,
      label: zone.id,
      legal: legalZones.has(zone.id),
    }));
  }, [legalZones, registry, phase, zonesSv]);

  const commitToZone = useCallback(
    (targetZoneId: string) => {
      setPhaseSafely('committed');
      haptic('success');
      announce(`Moved ${accessibilityLabel ?? cardId} to ${targetZoneId}`);
      dispatchIntent({
        id: nextPhysicalIntentId(),
        type: 'card.move',
        actorId,
        cardIds: [cardId],
        from: zoneId,
        to: targetZoneId,
      });
      // R1/Lab: state applies immediately and the surface re-renders the card
      // in its new zone; reset our local lifecycle for the next interaction.
      setPhaseSafely('resting');
    },
    [
      accessibilityLabel,
      actorId,
      announce,
      cardId,
      dispatchIntent,
      haptic,
      setPhaseSafely,
      zoneId,
    ],
  );

  const cancelDrag = useCallback(() => {
    setPhaseSafely('cancelled');
    haptic('soft');
    announce(`${accessibilityLabel ?? cardId} returned`);
    setPhaseSafely('resting');
  }, [accessibilityLabel, announce, cardId, haptic, setPhaseSafely]);

  const accessibleActions = useMemo<ActionSheetAction[]>(
    () =>
      Array.from(legalZones).map((zone) => ({
        id: `move:${zone}`,
        label: `Move to ${zone}`,
        run: () => commitToZone(zone),
      })),
    [commitToZone, legalZones],
  );

  const extraActions = useMemo<ActionSheetAction[]>(
    () =>
      (extraAccessibilityActions ?? []).map((action) => ({
        id: action.name,
        label: action.label,
        run: action.run,
      })),
    [extraAccessibilityActions],
  );

  const allActions = useMemo(
    () => [...accessibleActions, ...extraActions],
    [accessibleActions, extraActions],
  );

  const openSheet = useCallback(
    (_event?: GestureResponderEvent) => {
      if (disabled) return;
      haptic('light');
      setSheetVisible(true);
    },
    [disabled, haptic],
  );

  const closeSheet = useCallback(() => setSheetVisible(false), []);

  const fireSheetAction = useCallback((action: ActionSheetAction) => {
    setSheetVisible(false);
    action.run();
  }, []);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .withTestId(testID ?? `card-entity-${cardId}`)
        .enabled(!disabled)
        .activateAfterLongPress(PHYS_LIFT_HOLD_MS)
        .minDistance(PHYS_LIFT_MIN_DISTANCE)
        .shouldCancelWhenOutside(false)
        .onTouchesDown(() => {
          'worklet';
          // pressed: same-frame 0.98 feedback, independent of the hold timer.
          scale.value = PHYS_PRESS_SCALE;
          runOnJS(setPhaseSafely)('pressed');
        })
        .onStart(() => {
          'worklet';
          // lifted: hold threshold met. Translation stays at zero — the grab
          // point is preserved (no jump), the card visually clears the finger.
          liftedSv.value = true;
          scale.value = reduceMotion ? 1 : PHYS_LIFT_SCALE;
          runOnJS(setPhaseSafely)('lifted');
          runOnJS(haptic)('light');
        })
        .onUpdate((event) => {
          'worklet';
          const resting = restingRectSv.value;
          if (!resting) return;
          if (phaseSv.value === 'resting' || phaseSv.value === 'lifted') {
            runOnJS(setPhaseSafely)('dragging');
          }
          // 1:1 follow on the UI runtime. The lift offset raises the visual
          // card only; the translation math stays anchored to the finger.
          translateX.value = event.translationX;
          translateY.value = event.translationY;

          const centerX = resting.x + resting.width / 2 + event.translationX;
          const centerY =
            resting.y + resting.height / 2 + event.translationY - PHYS_LIFT_OFFSET_Y;

          if (onDragCenterX) runOnJS(onDragCenterX)(cardId, centerX);

          // Targeting: nearest legal zone takes magnetic emphasis.
          let bestId: string | null = null;
          let bestEmphasis = 0;
          const zones = zonesSv.value;
          for (const zone of zones) {
            if (!zone.legal) continue;
            const strength = physTargetEmphasis({ x: centerX, y: centerY }, zone, 320);
            if (strength > bestEmphasis) {
              bestEmphasis = strength;
              bestId = zone.id;
            }
          }
          emphasisSv.value = bestEmphasis;
          if (bestId && phaseSv.value !== 'targeting') {
            runOnJS(setPhaseSafely)('targeting');
          }
        })
        .onEnd((event) => {
          'worklet';
          const resting = restingRectSv.value;
          if (!resting) {
            liftedSv.value = false;
            scale.value = 1;
            runOnJS(cancelDrag)();
            return;
          }

          if (onDragCenterX) runOnJS(onDragCenterX)(cardId, null);

          const centerX = resting.x + resting.width / 2 + event.translationX;
          const centerY =
            resting.y + resting.height / 2 + event.translationY - PHYS_LIFT_OFFSET_Y;
          const target = physHitTest(
            { x: centerX, y: centerY },
            { vx: event.velocityX, vy: event.velocityY },
            zonesSv.value,
          );

          if (target) {
            // Committed: settle the remaining distance to the zone centre,
            // then dispatch. The engine event (R2+) owns the landing journey.
            const landing = physLandingTranslation(resting, target, true);
            const settle = { ...motion.spring.card, overshootClamping: true };
            liftedSv.value = false;
            scale.value = 1;
            emphasisSv.value = 0;
            if (reduceMotion) {
              translateX.value = withTiming(landing.x, { duration: motion.duration.fast });
              translateY.value = withTiming(landing.y, { duration: motion.duration.fast }, (finished) => {
                'worklet';
                if (!finished) return;
                translateX.value = 0;
                translateY.value = 0;
                runOnJS(commitToZone)(target.id);
              });
              return;
            }
            translateX.value = withSpring(landing.x, settle);
            translateY.value = withSpring(landing.y, settle, (finished) => {
              'worklet';
              if (!finished) return;
              translateX.value = 0;
              translateY.value = 0;
              runOnJS(commitToZone)(target.id);
            });
            return;
          }

          // Cancelled: spring home inside the budget, then haptic + reset.
          liftedSv.value = false;
          scale.value = 1;
          emphasisSv.value = 0;
          const finishHome = (finished: boolean | undefined) => {
            'worklet';
            if (!finished) return;
            runOnJS(cancelDrag)();
          };
          if (reduceMotion) {
            translateX.value = withTiming(0, { duration: 140 });
            translateY.value = withTiming(0, { duration: 140 }, (finished) => {
              'worklet';
              finishHome(finished);
            });
            return;
          }
          translateX.value = withTiming(0, { duration: PHYS_CANCEL_DURATION_MS / 2 });
          translateY.value = withTiming(0, { duration: PHYS_CANCEL_DURATION_MS / 2 }, (finished) => {
            'worklet';
            finishHome(finished);
          });
        })
        .onFinalize((_event, success) => {
          'worklet';
          if (success) return;
          cancelAnimation(translateX);
          cancelAnimation(translateY);
          translateX.value = withTiming(0, { duration: motion.duration.fast });
          translateY.value = withTiming(0, { duration: motion.duration.fast });
          liftedSv.value = false;
          emphasisSv.value = 0;
          scale.value = 1;
        }),
    [
      cancelDrag,
      cardId,
      commitToZone,
      disabled,
      emphasisSv,
      haptic,
      liftedSv,
      onDragCenterX,
      phaseSv,
      reduceMotion,
      restingRectSv,
      scale,
      setPhaseSafely,
      testID,
      translateX,
      translateY,
      zonesSv,
    ],
  );

  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const lifted = liftedSv.value;
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value - (lifted ? PHYS_LIFT_OFFSET_Y : 0) },
        { scale: scale.value },
      ],
      zIndex: lifted ? 1000 : 0,
      shadowOpacity: reduceMotion ? 0 : lifted ? 0.18 : 0,
      shadowRadius: reduceMotion ? 0 : lifted ? 12 : 0,
      shadowOffset: { width: 0, height: reduceMotion ? 0 : lifted ? 8 : 0 },
      elevation: reduceMotion ? 0 : lifted ? 10 : 0,
    };
  });

  return (
    <>
      <Animated.View
        testID={testID ?? `card-entity-${cardId}`}
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? `Card ${cardId}`}
        accessibilityHint={
          accessibilityHint ??
          (allActions.length > 0
            ? 'Hold and drag to a highlighted zone, or open the actions menu for the same moves.'
            : 'Hold and drag this card.')
        }
        accessibilityActions={allActions.map((action) => ({
          name: action.id,
          label: action.label,
        }))}
        onAccessibilityAction={({ nativeEvent }) => {
          const action = allActions.find(
            (candidate) => candidate.id === nativeEvent.actionName,
          );
          if (action) fireSheetAction(action);
        }}
        style={[
          styles.card,
          {
            left: restingRect.x,
            top: restingRect.y,
            width: restingRect.width,
            height: restingRect.height,
          },
          style,
          animatedStyle,
        ]}
      >
        <GestureDetector gesture={gesture}>
          <Pressable
            disabled={disabled}
            delayLongPress={520}
            onLongPress={openSheet}
            accessibilityRole="none"
            style={styles.pressTarget}
          >
            <View pointerEvents="none" style={styles.cardContent}>
              {children}
            </View>
          </Pressable>
        </GestureDetector>
      </Animated.View>

      <Modal
        visible={sheetVisible}
        transparent
        animationType="fade"
        onRequestClose={closeSheet}
      >
        <Pressable style={styles.sheetBackdrop} onPress={closeSheet}>
          <View style={styles.sheet}>
            <Text style={styles.sheetEyebrow}>CARD ACTIONS</Text>
            <Text style={styles.sheetTitle}>{accessibilityLabel ?? cardId}</Text>
            {allActions.map((action) => (
              <Pressable
                key={action.id}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                onPress={() => fireSheetAction(action)}
                style={styles.sheetAction}
              >
                <Text style={styles.sheetActionText}>{action.label}</Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={closeSheet}
              style={[styles.sheetAction, styles.sheetCancel]}
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    overflow: 'visible',
  },
  pressTarget: {
    flex: 1,
  },
  cardContent: {
    flex: 1,
  },
  sheetBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: space.lg,
    backgroundColor: alpha.inkOverlay45,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    padding: space.lg,
    gap: space.sm,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    ...shadow.elevated,
  },
  sheetEyebrow: {
    color: colors.brand,
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  sheetTitle: {
    color: colors.ink,
    fontFamily: fonts.semibold,
    fontSize: 17,
    marginBottom: space.xs,
  },
  sheetAction: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radii.md,
    backgroundColor: colors.brand,
  },
  sheetActionText: {
    color: colors.surface,
    fontFamily: fonts.bold,
    fontSize: 15,
  },
  sheetCancel: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetCancelText: {
    color: colors.inkMuted,
    fontFamily: fonts.semibold,
    fontSize: 15,
  },
});

export default CardEntity;
