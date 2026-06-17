import React, { forwardRef } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type PressableProps,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useMotion, type HapticIntensity } from '@hooks/useMotion';
import { colors, motion, radii, shadow, space } from '@theme';

export type CardButtonVariant = 'primary' | 'secondary' | 'ghost' | 'ink';
export type CardButtonSize = 'sm' | 'md' | 'lg' | 'xl';

export interface CardButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  variant?: CardButtonVariant;
  size?: CardButtonSize;
  haptic?: HapticIntensity | false;
  elevated?: boolean;
  style?: ViewStyle;
  innerStyle?: ViewStyle;
  children: React.ReactNode;
}

const PADDING: Record<CardButtonSize, ViewStyle> = {
  sm: { paddingVertical: space.sm, paddingHorizontal: space.lg },
  md: { paddingVertical: space.md + 2, paddingHorizontal: space.xl },
  lg: { paddingVertical: space.lg, paddingHorizontal: space.xxl },
  xl: { paddingVertical: space.xxl, paddingHorizontal: space.xxl },
};

const RADIUS: Record<CardButtonSize, number> = {
  sm: radii.lg,
  md: radii.xl,
  lg: radii.xxl,
  xl: radii.xxl,
};

const VARIANT: Record<CardButtonVariant, ViewStyle> = {
  primary: { backgroundColor: colors.brand },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  ink: { backgroundColor: colors.ink },
};

/**
 * Unified tactile button. Micro-interaction contract:
 *  - Press-in: scale to 0.97, lift 2px (spring)
 *  - Press-out: release spring, cancel haptic
 *  - Release (onPress): fire haptic (intensity-configurable)
 * Caller is responsible for text color matching variant.
 */
export const CardButton = forwardRef<View, CardButtonProps>(function CardButton(
  {
    variant = 'primary',
    size = 'md',
    haptic = 'light',
    elevated = true,
    style,
    innerStyle,
    children,
    onPressIn,
    onPressOut,
    onPress,
    disabled,
    ...rest
  },
  ref,
) {
  const { haptic: fire, reduceMotion } = useMotion();
  const scale = useSharedValue(1);
  const lift = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: -lift.value }],
  }));

  const shadowStyle: ViewStyle = elevated
    ? variant === 'primary'
      ? shadow.cta
      : shadow.cardStrong
    : variant === 'primary'
      ? shadow.card
      : shadow.none;

  const handlePressIn = (e: GestureResponderEvent) => {
    if (reduceMotion) {
      scale.value = 1;
      lift.value = 0;
    } else {
      scale.value = withSpring(0.97, motion.spring.press);
      lift.value = withTiming(2, { duration: motion.duration.fast });
    }
    onPressIn?.(e);
  };

  const handlePressOut = (e: GestureResponderEvent) => {
    if (reduceMotion) {
      scale.value = 1;
      lift.value = 0;
    } else {
      scale.value = withSpring(1, motion.spring.press);
      lift.value = withTiming(0, { duration: motion.duration.base });
    }
    onPressOut?.(e);
  };

  const handlePress = (e: GestureResponderEvent) => {
    if (haptic) fire(haptic);
    onPress?.(e);
  };

  return (
    <Animated.View style={[animatedStyle, shadowStyle, style]} ref={ref}>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        style={[
          styles.base,
          PADDING[size],
          { borderRadius: RADIUS[size] },
          VARIANT[variant],
          disabled && styles.disabled,
          innerStyle,
        ]}
        {...rest}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  disabled: {
    opacity: 0.5,
  },
});
