import React, { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Club, Diamond, Heart, Spade } from 'lucide-react-native';
import type { Rank, Suit } from '@lib/types';
import type { JokerColor } from '@engine/types';
import { brand } from '@lib/assets';
import { alpha, colors, fonts, radii, shadow } from '@theme';

export type PlayingCardSize = 'xs' | 'sm' | 'md' | 'lg';
export type PlayingCardFace = 'up' | 'down';
export type PlayingCardBack = 'brand' | 'ink';

export interface PlayingCardProps {
  rank?: Rank;
  suit?: Suit;
  /** When set with `face="up"`, renders a joker face instead of rank/suit pips. */
  jokerColor?: JokerColor;
  face?: PlayingCardFace;
  back?: PlayingCardBack;
  size?: PlayingCardSize;
  elevated?: boolean;
  highlighted?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  testID?: string;
}

interface SizeSpec {
  width: number;
  height: number;
  corner: number;
  center: number;
  padding: number;
  radius: number;
}

/** @internal Re-exported by HandFan / HandStack for layout math. */
export const SIZE_MAP: Record<PlayingCardSize, SizeSpec> = {
  xs: { width: 16, height: 24, corner: 8, center: 12, padding: 2, radius: 3 },
  sm: { width: 60, height: 88, corner: 12, center: 32, padding: 6, radius: 8 },
  md: { width: 90, height: 130, corner: 20, center: 48, padding: 8, radius: radii.card },
  lg: { width: 110, height: 160, corner: 24, center: 64, padding: 10, radius: radii.card },
};

const SUIT_GLYPH: Record<Suit, string> = {
  hearts: '\u2665',
  diamonds: '\u2666',
  spades: '\u2660',
  clubs: '\u2663',
};

function suitIcon(suit: Suit, size: number, color: string, fill?: string) {
  const iconProps = { size, color, fill: fill ?? color } as const;
  switch (suit) {
    case 'hearts':
      return <Heart {...iconProps} />;
    case 'diamonds':
      return <Diamond {...iconProps} />;
    case 'spades':
      return <Spade {...iconProps} />;
    case 'clubs':
      return <Club {...iconProps} />;
  }
}

function suitColor(suit: Suit): string {
  return suit === 'hearts' || suit === 'diamonds' ? colors.brand : colors.ink;
}

function suitTint(suit: Suit): string {
  return suit === 'hearts' || suit === 'diamonds' ? colors.brandSoft : colors.surfaceAlt;
}

/** xs size is for decorative use only (stub cards, counters). */
export const PlayingCard = React.memo(function PlayingCard({
  rank,
  suit,
  jokerColor,
  face = 'up',
  back = 'brand',
  size = 'md',
  elevated = false,
  highlighted = false,
  disabled = false,
  onPress,
  style,
  testID,
}: PlayingCardProps) {
  const spec = SIZE_MAP[size];

  const content = useMemo(() => {
    if (face === 'down') {
      return (
        <View
          style={[
            styles.backFill,
            {
              backgroundColor: back === 'brand' ? colors.brand : colors.ink,
              borderRadius: spec.radius,
            },
          ]}
        >
          <Image
            source={brand.logo}
            resizeMode="contain"
            style={{
              width: spec.center,
              height: spec.center,
              opacity: back === 'brand' ? 0.18 : 0.3,
            }}
          />
        </View>
      );
    }

    if (jokerColor) {
      const accent = jokerColor === 'red' ? colors.brand : colors.ink;
      const micro = Math.max(8, spec.corner - 2);
      const title = Math.max(11, Math.floor(spec.corner * 1.1));
      return (
        <View style={[styles.face, { padding: spec.padding, borderRadius: spec.radius }]}>
          <View style={styles.cornerTop}>
            <Text
              style={{
                color: accent,
                fontFamily: fonts.extra,
                fontSize: micro,
                letterSpacing: 0.5,
              }}
            >
              JOKER
            </Text>
          </View>
          <View style={styles.centerSuit} pointerEvents="none">
            <Text
              style={{
                color: accent,
                fontFamily: fonts.extra,
                fontSize: title,
                letterSpacing: 2,
              }}
            >
              J
            </Text>
          </View>
          <View style={styles.cornerBottom}>
            <Text
              style={{
                color: accent,
                fontFamily: fonts.extra,
                fontSize: micro,
                letterSpacing: 0.5,
              }}
            >
              JOKER
            </Text>
          </View>
        </View>
      );
    }

    if (!rank || !suit) {
      return (
        <View
          style={[
            styles.backFill,
            {
              backgroundColor: back === 'brand' ? colors.brand : colors.ink,
              borderRadius: spec.radius,
            },
          ]}
        >
          <Image
            source={brand.logo}
            resizeMode="contain"
            style={{
              width: spec.center,
              height: spec.center,
              opacity: back === 'brand' ? 0.18 : 0.3,
            }}
          />
        </View>
      );
    }

    const color = suitColor(suit);
    const tint = suitTint(suit);
    const cornerFont = Math.max(10, spec.corner);

    return (
      <View style={[styles.face, { padding: spec.padding, borderRadius: spec.radius }]}>
        <View style={styles.cornerTop}>
          <Text
            style={{
              color,
              fontFamily: fonts.extra,
              fontSize: cornerFont,
              lineHeight: cornerFont + 2,
            }}
          >
            {rank}
          </Text>
          <Text style={{ color, fontFamily: fonts.bold, fontSize: cornerFont - 2 }}>
            {SUIT_GLYPH[suit]}
          </Text>
        </View>

        <View style={styles.centerSuit} pointerEvents="none">
          {suitIcon(suit, spec.center, tint)}
        </View>

        <View style={styles.cornerBottom}>
          <Text
            style={{
              color,
              fontFamily: fonts.extra,
              fontSize: cornerFont,
              lineHeight: cornerFont + 2,
            }}
          >
            {rank}
          </Text>
          <Text style={{ color, fontFamily: fonts.bold, fontSize: cornerFont - 2 }}>
            {SUIT_GLYPH[suit]}
          </Text>
        </View>
      </View>
    );
  }, [face, rank, suit, jokerColor, back, spec]);

  const shellStyle: ViewStyle = {
    width: spec.width,
    height: spec.height,
    borderRadius: spec.radius,
    backgroundColor: face === 'up' ? colors.surface : 'transparent',
    borderWidth: elevated ? 2 : face === 'up' ? 1 : 0,
    borderColor: elevated ? alpha.brand30 : colors.border,
    opacity: disabled ? 0.5 : 1,
  };

  const wrapperShadow = elevated ? shadow.ctaLift : shadow.card;
  const highlightRing: ViewStyle = highlighted
    ? { borderColor: alpha.brand45, borderWidth: 2 }
    : {};

  const body = (
    <View testID={testID} style={[shellStyle, wrapperShadow, highlightRing, style]}>
      {content}
    </View>
  );

  if (!onPress) {
    return body;
  }

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        { opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}
    >
      {body}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  face: {
    flex: 1,
    backgroundColor: colors.surface,
    justifyContent: 'space-between',
  },
  backFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cornerTop: {
    alignItems: 'flex-start',
  },
  cornerBottom: {
    alignItems: 'flex-end',
    transform: [{ rotate: '180deg' }],
  },
  centerSuit: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default PlayingCard;
