import React, { useCallback, useMemo, useState } from 'react';
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
import type { SharedValue } from 'react-native-reanimated';
import Animated, { useAnimatedReaction, useAnimatedStyle } from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';
import { GestureDetector } from 'react-native-gesture-handler';
import { useCardDrag } from '@hooks/useCardDrag';
import {
  type CardDropTarget,
  type CardSlot,
} from '@lib/cardDrag';
import { useMotion } from '@hooks/useMotion';
import { alpha, colors, fonts, radii, shadow, space } from '@theme';

export interface CardDragAction {
  id: string;
  label: string;
  onPress: () => void;
}

export interface CardDragProps {
  cardId: string;
  slot: Pick<CardSlot, 'x' | 'y'>;
  cardSize: Pick<CardSlot, 'width' | 'height'>;
  dropTargets?: readonly CardDropTarget[];
  actions?: readonly CardDragAction[];
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /** Resting transform for a fanned card; the drag surface keeps its measured slot. */
  cardStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  onDrop?: (targetId: string) => void;
  onCancel?: () => void;
  onLift?: () => void;
}

function TargetHighlight({
  target,
  slot,
  activeTargetId,
}: {
  target: CardDropTarget;
  slot: Pick<CardSlot, 'x' | 'y'>;
  activeTargetId: ReturnType<typeof useCardDrag>['activeTargetId'];
}) {
  const targetStyle = useAnimatedStyle(() => ({
    opacity: activeTargetId.value === target.id ? 1 : 0,
    transform: [
      { scale: activeTargetId.value === target.id ? 1 : 0.96 },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      style={[
        styles.targetRing,
        {
          left: target.x - slot.x,
          top: target.y - slot.y,
          width: target.width,
          height: target.height,
          borderRadius: Math.max(radii.sm, Math.min(target.width, target.height) * 0.12),
        },
        targetStyle,
      ]}
    >
      <View style={styles.targetRingInner} />
    </Animated.View>
  );
}

/** True while this card is physically lifted (hold satisfied, drag active). */
function useIsDragging(isDragging: SharedValue<boolean>): boolean {
  const [dragging, setDragging] = useState(false);
  useAnimatedReaction(
    () => isDragging.value,
    (next, previous) => {
      if (next !== previous) runOnJS(setDragging)(next);
    },
    [isDragging],
  );
  return dragging;
}

/**
 * Shared physical card interaction. The card is inert until a 120ms hold and
 * 6px movement, then follows the pointer 1:1. Long-press and accessibility
 * actions expose the same plays without requiring drag-and-drop.
 */
export function CardDrag({
  cardId,
  slot,
  cardSize,
  dropTargets = [],
  actions = [],
  disabled = false,
  accessibilityLabel,
  style,
  cardStyle,
  children,
  onDrop,
  onCancel,
  onLift,
}: CardDragProps) {
  const { haptic } = useMotion();
  const [menuVisible, setMenuVisible] = useState(false);

  const fallbackActions = useMemo<CardDragAction[]>(
    () =>
      actions.length > 0
        ? [...actions]
        : dropTargets
            .filter((target) => !target.disabled)
            .map((target) => ({
              id: `drop-${target.id}`,
              label: target.label ?? `Play to ${target.id}`,
              onPress: () => onDrop?.(target.id),
            })),
    [actions, dropTargets, onDrop],
  );

  const openActionMenu = useCallback(
    (_event?: GestureResponderEvent) => {
      if (disabled || fallbackActions.length === 0) return;
      haptic('light');
      setMenuVisible(true);
    },
    [disabled, fallbackActions.length, haptic],
  );

  const closeActionMenu = useCallback(() => setMenuVisible(false), []);

  const fireAction = useCallback((action: CardDragAction) => {
    setMenuVisible(false);
    action.onPress();
  }, []);

  const { gesture, animatedStyle, activeTargetId, isDragging } = useCardDrag({
    cardId,
    cardSize,
    slot,
    dropTargets,
    disabled,
    onDrop,
    onCancel,
    onLift,
  });
  // Highlights mount only while THIS card is lifted (P1-16): a 10-card hand
  // with 4 targets drops from 40 animated highlight nodes to at most 4, and
  // only during an active drag.
  const isDraggingCard = useIsDragging(isDragging);

  return (
    <>
      <Animated.View
        testID={`card-drag-${cardId}`}
        style={[
          styles.root,
          {
            left: slot.x,
            top: slot.y,
            width: cardSize.width,
            height: cardSize.height,
          },
          style,
          animatedStyle,
        ]}
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? `Card ${cardId}`}
        accessibilityHint={
          fallbackActions.length > 0
            ? 'Drag after holding, or use the actions menu to play this card.'
            : 'Hold and drag this card to play it.'
        }
        accessibilityActions={fallbackActions.map((action) => ({
          name: action.id,
          label: action.label,
        }))}
        onAccessibilityAction={({ nativeEvent }) => {
          const action = fallbackActions.find((candidate) => candidate.id === nativeEvent.actionName);
          if (action) fireAction(action);
        }}
      >
        {isDraggingCard
          ? dropTargets.map((target) => (
              <TargetHighlight
                key={target.id}
                target={target}
                slot={slot}
                activeTargetId={activeTargetId}
              />
            ))
          : null}
        <GestureDetector gesture={gesture}>
          <Pressable
            disabled={disabled}
            delayLongPress={520}
            onLongPress={openActionMenu}
            accessibilityRole="none"
            style={styles.cardPressTarget}
          >
            <View style={cardStyle}>{children}</View>
          </Pressable>
        </GestureDetector>
      </Animated.View>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={closeActionMenu}
      >
        <Pressable style={styles.menuBackdrop} onPress={closeActionMenu}>
          <View style={styles.actionMenu}>
            <Text style={styles.menuEyebrow}>CARD ACTIONS</Text>
            <Text style={styles.menuTitle}>{accessibilityLabel ?? cardId}</Text>
            {fallbackActions.map((action) => (
              <Pressable
                key={action.id}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                onPress={() => fireAction(action)}
                style={styles.actionButton}
              >
                <Text style={styles.actionText}>{action.label}</Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={closeActionMenu}
              style={[styles.actionButton, styles.cancelButton]}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    overflow: 'visible',
  },
  cardPressTarget: {
    flex: 1,
  },
  targetRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: colors.brand,
    backgroundColor: alpha.brand10,
    padding: 4,
    zIndex: 0,
  },
  targetRingInner: {
    flex: 1,
    borderWidth: 1,
    borderColor: alpha.brand45,
    borderRadius: radii.sm,
  },
  menuBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: space.lg,
    backgroundColor: alpha.inkOverlay45,
  },
  actionMenu: {
    width: '100%',
    maxWidth: 420,
    padding: space.lg,
    gap: space.sm,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    ...shadow.elevated,
  },
  menuEyebrow: {
    color: colors.brand,
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  menuTitle: {
    color: colors.ink,
    fontFamily: fonts.semibold,
    fontSize: 17,
    marginBottom: space.xs,
  },
  actionButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radii.md,
    backgroundColor: colors.brand,
  },
  actionText: {
    color: colors.surface,
    fontFamily: fonts.bold,
    fontSize: 15,
  },
  cancelButton: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelText: {
    color: colors.inkMuted,
    fontFamily: fonts.semibold,
    fontSize: 15,
  },
});

export default CardDrag;
