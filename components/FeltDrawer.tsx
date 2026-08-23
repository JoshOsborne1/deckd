import React, { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { TableSurface } from '@components/TableSurface';
import { useMotion } from '@hooks/useMotion';
import { EASING_EMPHASIZED } from '@lib/motion';
import { getDrawerMotion } from '@lib/surfaceMorph';
import { alpha, colors, radii, shadow, space } from '@theme';

export interface FeltDrawerProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

/**
 * Route content that still belongs to the shared Deckd table. The felt and
 * table edge remain behind a dimmed scrim while the paper drawer slides in.
 * Reduced motion keeps the same hierarchy and uses a cross-fade only.
 */
export function FeltDrawer({ children, style }: FeltDrawerProps) {
  const { reduceMotion } = useMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: reduceMotion ? 200 : 360,
      easing: EASING_EMPHASIZED,
    });
    return () => cancelAnimation(progress);
  }, [progress, reduceMotion]);

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));
  const drawerStyle = useAnimatedStyle(() => {
    return {
      opacity: progress.value,
      transform: reduceMotion
        ? []
        : [{ translateX: (1 - progress.value) * 32 }],
    };
  });

  return (
    <View style={styles.root}>
      <TableSurface mode="setup" />
      <Animated.View pointerEvents="none" style={[styles.scrim, scrimStyle]} />
      <Animated.View style={[styles.drawer, drawerStyle, style]}>
        <View pointerEvents="none" style={styles.drawerEdge} />
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: alpha.inkOverlay45,
  },
  drawer: {
    flex: 1,
    marginTop: 44,
    marginHorizontal: space.xs,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: colors.bg,
    ...shadow.elevated,
  },
  drawerEdge: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    top: 0,
    height: 2,
    backgroundColor: alpha.brand20,
    zIndex: 2,
  },
});

export default FeltDrawer;
