import { useEffect } from 'react';
import {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useMotion } from '@hooks/useMotion';
import { EASING_EMPHASIZED } from '@lib/motion';
import { motion } from '@theme';

/**
 * Full-screen layer (table, lobby) entrance: opacity on an emphasized curve,
 * translate + scale on springs — reads “physical” rather than a flat fade.
 * Respects `useMotion().reduceMotion`.
 */
export function useLayerSurfaceEntrance(active: boolean) {
  const { reduceMotion } = useMotion();
  const opacity = useSharedValue(active ? 1 : 0);
  const translateY = useSharedValue(active ? 0 : 28);
  const scale = useSharedValue(active ? 1 : 0.97);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = withTiming(active ? 1 : 0, { duration: motion.duration.base });
      translateY.value = withTiming(active ? 0 : 10, { duration: motion.duration.base });
      scale.value = withTiming(active ? 1 : 1, { duration: motion.duration.base });
    } else {
      opacity.value = withTiming(active ? 1 : 0, {
        duration: motion.duration.slow,
        easing: EASING_EMPHASIZED,
      });
      translateY.value = withSpring(active ? 0 : 36, motion.spring.layer);
      scale.value = withSpring(active ? 1 : 0.96, motion.spring.layerSoft);
    }
    return () => {
      cancelAnimation(opacity);
      cancelAnimation(translateY);
      cancelAnimation(scale);
    };
  }, [active, reduceMotion, opacity, translateY, scale]);

  const surfaceStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return surfaceStyle;
}
