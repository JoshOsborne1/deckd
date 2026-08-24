/**
 * CardZone — a measured drop/target region on the physical table.
 *
 * Wraps the visual zone content in a container that reports its on-screen
 * rect to the nearest ZoneRegistry on every layout. Zones carry no game
 * legality themselves; the legalTargets provider decides which zones a given
 * card may land in, and CardEntity reads this registry for geometry.
 *
 * While a card is dragging, the nearest legal zone gains emphasis through
 * `emphasis` (0..1) fed from CardMotionCoordinator's targeting shared value —
 * the zone itself stays the same visual size (magnetism lives in the hit test,
 * never in the rendered geometry).
 */

import React, { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useZoneRegistry } from '@components/table/ZoneRegistry';
import { alpha, colors, motion, radii } from '@theme';

export interface CardZoneProps {
  /** Stable id this zone registers under, e.g. `discard`, `hand:p1`, `pile:war-a`. */
  zoneId: string;
  /** Optional emphasis signal (0..1). If omitted, the ring only shows when `active`. */
  emphasis?: SharedValue<number>;
  /** Legal-target affordance only; the ring never renders for illegal zones. */
  active?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Extra style for the emphasis ring. */
  ringStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

export function CardZone({
  zoneId,
  emphasis,
  active = false,
  children,
  style,
  ringStyle,
  testID,
}: CardZoneProps) {
  const registry = useZoneRegistry();
  const containerRef = useRef<View | null>(null);

  const measure = useCallback(() => {
    const node = containerRef.current;
    if (!node) return;
    // measureInWindow gives the on-screen absolute rect the motion overlay
    // needs (the overlay is absolutely positioned over the whole surface).
    node.measureInWindow((x, y, width, height) => {
      registry.registerZone(zoneId, { x, y, width, height });
    });
  }, [registry, zoneId]);

  const onLayout = useCallback(
    (_event: LayoutChangeEvent) => {
      measure();
    },
    [measure],
  );

  useEffect(() => {
    measure();
    return () => registry.unregisterZone(zoneId);
  }, [measure, registry, zoneId]);

  const fallbackEmphasis = useRef<number>(0);
  const emphasisValue = emphasis;

  const ringAnimatedStyle = useAnimatedStyle(() => {
    'worklet';
    const value = emphasisValue ? emphasisValue.value : fallbackEmphasis.current;
    return {
      opacity: withTiming(value > 0.02 ? Math.min(1, value) : 0, {
        duration: motion.duration.fast,
      }),
    };
  });

  const staticRing = useMemo(
    () =>
      active
        ? {
            borderColor: alpha.brand30,
            borderWidth: 1,
          }
        : null,
    [active],
  );

  return (
    <View
      ref={containerRef}
      onLayout={onLayout}
      style={[styles.zone, style]}
      testID={testID ?? `card-zone-${zoneId}`}
    >
      {children}
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        style={[styles.ring, staticRing, ringStyle, ringAnimatedStyle]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  zone: {
    position: 'relative',
  },
  ring: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.brand,
    backgroundColor: alpha.brand10,
  },
});

export default CardZone;
