import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import type { Rank, Suit } from '@lib/types';
import { alpha, colors } from '@theme';

/**
 * Compact RN-SVG court treatment for Deckd faces.
 *
 * The composition follows the French pip/court proportions in the vendored
 * card sources (`vendor/card-fronts/notpeter`, public domain / WTFPL) and
 * keeps the original hayeah MIT source available for comparison. The source
 * repos remain vendored with their licenses; this component intentionally
 * ports the scalable face treatment instead of shipping raw SVG assets.
 */
export function CardCourt({
  rank,
  suit,
  size,
  color,
}: {
  rank: Extract<Rank, 'J' | 'Q' | 'K'>;
  suit: Suit;
  size: number;
  color: string;
}) {
  const height = Math.round(size * 1.26);
  return (
    <View style={styles.root} pointerEvents="none">
      <Svg width={size} height={height} viewBox="0 0 100 126">
        <Rect
          x={4}
          y={4}
          width={92}
          height={118}
          rx={9}
          fill={alpha.whiteOverlay80}
          stroke={alpha.inkOverlay20}
          strokeWidth={1}
        />
        <CourtHalf rank={rank} suit={suit} color={color} />
        <G transform="translate(100 126) rotate(180)">
          <CourtHalf rank={rank} suit={suit} color={color} />
        </G>
        <Rect x={9} y={61.5} width={82} height={3} rx={1.5} fill={alpha.brand45} />
      </Svg>
    </View>
  );
}

function CourtHalf({
  rank,
  suit,
  color,
}: {
  rank: Extract<Rank, 'J' | 'Q' | 'K'>;
  suit: Suit;
  color: string;
}) {
  const hair = rank === 'K' ? colors.ink : colors.inkSoft;
  const robe = rank === 'Q' ? colors.brandDark : color;
  const trim = rank === 'K' ? colors.brand : alpha.brand45;
  return (
    <G>
      <Rect x={10} y={7} width={80} height={52} rx={7} fill={colors.surfaceAlt} />
      <Path
        d="M28 24c1-10 8-16 22-16s21 6 22 16c-3-4-7-6-11-7-3 4-7 6-11 6s-8-2-11-6c-4 1-8 3-11 7Z"
        fill={hair}
      />
      <Circle cx={50} cy={25} r={12} fill={colors.cardPaper} stroke={alpha.inkOverlay12} strokeWidth={1} />
      <Path d="M44 24h3M53 24h3" stroke={colors.ink} strokeWidth={1.7} strokeLinecap="round" />
      <Path d="M46 30c3 2 5 2 8 0" stroke={colors.brandDark} strokeWidth={1.4} strokeLinecap="round" fill="none" />
      <Path d="M30 58c2-13 9-22 20-22s18 9 20 22Z" fill={robe} />
      <Path d="M39 40 50 54 61 40" fill={trim} opacity={0.78} />
      <Path d={SUIT_PATH[suit]} fill={color} transform="translate(44 42) scale(.12)" />
      {rank === 'K' ? (
        <Path d="m41 13 4-6 5 5 5-5 4 6-3 3H44Z" fill={colors.brand} />
      ) : rank === 'Q' ? (
        <Path d="M43 12 50 7l7 5-2 5H45Z" fill={colors.brandSoft} stroke={colors.brand} strokeWidth={0.8} />
      ) : (
        <Path d="M50 7v10M45 12h10" stroke={colors.brand} strokeWidth={1.6} strokeLinecap="round" />
      )}
    </G>
  );
}

const SUIT_PATH: Record<Suit, string> = {
  hearts:
    'M50 88C45 82 13 61 13 35C13 21 23 12 35 12C42 12 48 16 50 23C52 16 58 12 65 12C77 12 87 21 87 35C87 61 55 82 50 88Z',
  diamonds: 'M50 4L94 50L50 96L6 50Z',
  spades:
    'M50 8C46 16 16 32 16 53C16 64 24 71 35 71C42 71 47 67 50 60C53 67 58 71 65 71C76 71 84 64 84 53C84 32 54 16 50 8ZM42 60H58V80H66V89H34V80H42Z',
  clubs:
    'M50 8C39 8 33 18 36 28C24 23 12 31 12 43C12 56 25 63 37 57C36 69 42 75 50 76C58 75 64 69 63 57C75 63 88 56 88 43C88 31 76 23 64 28C67 18 61 8 50 8ZM42 68H58V81H66V90H34V81H42Z',
};

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default CardCourt;
