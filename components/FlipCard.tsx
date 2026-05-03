import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { PlayingCard, type PlayingCardProps } from '@components/PlayingCard';
import { motion } from '@theme';

export interface FlipCardProps extends Omit<PlayingCardProps, 'face'> {
  /** Drives the flip. `up` renders rank+suit; `down` renders brand back. */
  face: PlayingCardProps['face'];
  /** Optional custom spring override. */
  spring?: { damping: number; stiffness: number; mass: number };
}

/**
 * Visual 3D flip around the Y axis. Separate front and back nodes avoid
 * text mirroring issues. Spring-driven to keep feel tactile.
 */
export function FlipCard({ face = 'up', spring, ...cardProps }: FlipCardProps) {
  const progress = useSharedValue(face === 'up' ? 0 : 1);
  const hasFlipped = useRef(false);

  useEffect(() => {
    progress.value = withSpring(face === 'up' ? 0 : 1, spring ?? motion.spring.card);
    hasFlipped.current = true;
  }, [face, progress, spring]);

  const frontOpacity = useDerivedValue(() =>
    interpolate(progress.value, [0, 0.5, 0.51, 1], [1, 1, 0, 0]),
  );
  const backOpacity = useDerivedValue(() =>
    interpolate(progress.value, [0, 0.5, 0.51, 1], [0, 0, 1, 1]),
  );

  const frontStyle = useAnimatedStyle(() => ({
    opacity: frontOpacity.value,
    transform: [{ perspective: 900 }, { rotateY: `${progress.value * 180}deg` }],
  }));

  const backStyle = useAnimatedStyle(() => ({
    opacity: backOpacity.value,
    transform: [{ perspective: 900 }, { rotateY: `${progress.value * 180 - 180}deg` }],
  }));

  const showFront = hasFlipped.current || face === 'up';
  const showBack = hasFlipped.current || face === 'down';

  return (
    <View style={styles.root}>
      {showFront && (
        <Animated.View style={[StyleSheet.absoluteFill, frontStyle]} pointerEvents="none">
          <PlayingCard {...cardProps} face="up" />
        </Animated.View>
      )}
      {showBack && (
        <Animated.View style={[StyleSheet.absoluteFill, backStyle]} pointerEvents="none">
          <PlayingCard {...cardProps} face="down" />
        </Animated.View>
      )}
      {/* Invisible copy reserves layout space. */}
      <View style={{ opacity: 0 }}>
        <PlayingCard {...cardProps} face="up" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
  },
});

export default FlipCard;
