import React, { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { Rank, Suit } from '@lib/types';
import type { JokerColor } from '@engine/types';
import { brand } from '@lib/assets';
import { findBackById } from '@engine/visuals';
import { alpha, colors, fonts, radii, shadow, space } from '@theme';

export type PlayingCardSize = 'xs' | 'sm' | 'md' | 'lg';
export type PlayingCardFace = 'up' | 'down';
export type PlayingCardBack = 'brand' | 'ink' | string;

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

const SUIT_PATH: Record<Suit, string> = {
  hearts:
    'M50 88C45 82 13 61 13 35C13 21 23 12 35 12C42 12 48 16 50 23C52 16 58 12 65 12C77 12 87 21 87 35C87 61 55 82 50 88Z',
  diamonds: 'M50 4L94 50L50 96L6 50Z',
  spades:
    'M50 8C46 16 16 32 16 53C16 64 24 71 35 71C42 71 47 67 50 60C53 67 58 71 65 71C76 71 84 64 84 53C84 32 54 16 50 8ZM42 60H58V80H66V89H34V80H42Z',
  clubs:
    'M50 8C39 8 33 18 36 28C24 23 12 31 12 43C12 56 25 63 37 57C36 69 42 75 50 76C58 75 64 69 63 57C75 63 88 56 88 43C88 31 76 23 64 28C67 18 61 8 50 8ZM42 68H58V81H66V90H34V81H42Z',
};

function SuitGlyph({ suit, size, color }: { suit: Suit; size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" pointerEvents="none">
      <Path d={SUIT_PATH[suit]} fill={color} />
    </Svg>
  );
}

const PIP_LAYOUTS: Record<number, readonly [number, number][]> = {
  2: [[0.5, 0.27], [0.5, 0.73]],
  3: [[0.3, 0.25], [0.5, 0.5], [0.7, 0.75]],
  4: [[0.3, 0.27], [0.7, 0.27], [0.3, 0.73], [0.7, 0.73]],
  5: [[0.3, 0.27], [0.7, 0.27], [0.5, 0.5], [0.3, 0.73], [0.7, 0.73]],
  6: [
    [0.3, 0.22],
    [0.3, 0.5],
    [0.3, 0.78],
    [0.7, 0.22],
    [0.7, 0.5],
    [0.7, 0.78],
  ],
  7: [
    [0.5, 0.13],
    [0.3, 0.25],
    [0.7, 0.25],
    [0.3, 0.5],
    [0.7, 0.5],
    [0.3, 0.75],
    [0.7, 0.75],
  ],
  8: [
    [0.3, 0.17],
    [0.3, 0.39],
    [0.3, 0.61],
    [0.3, 0.83],
    [0.7, 0.17],
    [0.7, 0.39],
    [0.7, 0.61],
    [0.7, 0.83],
  ],
  9: [
    [0.3, 0.17],
    [0.3, 0.39],
    [0.3, 0.61],
    [0.3, 0.83],
    [0.5, 0.5],
    [0.7, 0.17],
    [0.7, 0.39],
    [0.7, 0.61],
    [0.7, 0.83],
  ],
  10: [
    [0.3, 0.14],
    [0.3, 0.32],
    [0.3, 0.5],
    [0.3, 0.68],
    [0.3, 0.86],
    [0.7, 0.14],
    [0.7, 0.32],
    [0.7, 0.5],
    [0.7, 0.68],
    [0.7, 0.86],
  ],
};

function numericRank(rank: Rank): number | null {
  const value = Number(rank);
  return value >= 2 && value <= 10 ? value : null;
}

function pipSizeFor(spec: SizeSpec, count: number): number {
  const scale = count >= 8 ? 0.34 : count >= 6 ? 0.38 : 0.46;
  return Math.max(9, Math.round(spec.center * scale));
}

function PaperGrain() {
  return (
    <View style={styles.paperGrain} pointerEvents="none">
      {Array.from({ length: 8 }).map((_, index) => (
        <View
          key={index}
          style={[styles.grainLine, { top: `${index * 15 - 7}%` }]}
        />
      ))}
    </View>
  );
}

function CornerIndex({
  rank,
  suit,
  color,
  size,
}: {
  rank: Rank;
  suit: Suit;
  color: string;
  size: number;
}) {
  return (
    <View style={styles.cornerIndex} pointerEvents="none">
      <Text style={[styles.cornerRank, { color, fontSize: size, lineHeight: size + 1 }]}>
        {rank}
      </Text>
      <SuitGlyph suit={suit} size={size} color={color} />
    </View>
  );
}

function CourtFrame({ spec }: { spec: SizeSpec }) {
  const outerInset = Math.max(8, spec.padding);
  const innerInset = outerInset + Math.max(4, Math.round(spec.padding / 2));
  return (
    <>
      <View
        pointerEvents="none"
        style={[
          styles.frameOuter,
          {
            top: outerInset,
            right: outerInset,
            bottom: outerInset,
            left: outerInset,
            borderRadius: Math.max(3, spec.radius - 4),
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.frameInner,
          {
            top: innerInset,
            right: innerInset,
            bottom: innerInset,
            left: innerInset,
            borderRadius: Math.max(2, spec.radius - 6),
          },
        ]}
      />
    </>
  );
}

function PipLayout({ count, suit, spec, color }: { count: number; suit: Suit; spec: SizeSpec; color: string }) {
  const pipSize = pipSizeFor(spec, count);
  return (
    <View style={styles.pipField} pointerEvents="none">
      {(PIP_LAYOUTS[count] ?? []).map(([x, y], index) => (
        <View
          key={`${count}-${index}`}
          style={[
            styles.pip,
            {
              width: pipSize,
              height: pipSize,
              left: `${x * 100}%`,
              top: `${y * 100}%`,
              transform: [{ translateX: -pipSize / 2 }, { translateY: -pipSize / 2 }],
            },
          ]}
        >
          <SuitGlyph suit={suit} size={pipSize} color={color} />
        </View>
      ))}
    </View>
  );
}

function suitColor(suit: Suit): string {
  return suit === 'hearts' || suit === 'diamonds' ? colors.brand : colors.ink;
}

function resolveBackStyle(back: PlayingCardBack): { base: string; accent: string; logoOpacity: number; rings: string[] } {
  const normalized = back === 'brand' ? 'back-brand' : back === 'ink' ? 'back-ink' : back;
  const def = findBackById(normalized);
  const palette = def?.palette ?? (back === 'ink' ? [colors.ink, colors.inkMuted, colors.surface] : [colors.brand, colors.brandDark, colors.surface]);
  return {
    base: palette[0] ?? colors.brand,
    accent: palette[1] ?? colors.brandDark,
    logoOpacity: def?.family === 'premium' ? 0.26 : back === 'brand' || normalized === 'back-brand' ? 0.18 : 0.3,
    rings: palette,
  };
}

function CardBackFace({ back, spec }: { back: PlayingCardBack; spec: SizeSpec }) {
  const style = resolveBackStyle(back);
  return (
    <View style={[styles.backFill, { backgroundColor: style.base, borderRadius: spec.radius }]}>
      <View style={[styles.backInset, { borderColor: style.rings[2] ?? alpha.whiteOverlay20, borderRadius: Math.max(2, spec.radius - 3) }]} />
      <View
        style={[
          styles.backGoldInset,
          {
            left: Math.max(6, spec.padding),
            right: Math.max(6, spec.padding),
            top: Math.max(6, spec.padding),
            bottom: Math.max(6, spec.padding),
            borderRadius: Math.max(2, spec.radius - 5),
          },
        ]}
      />
      <View style={[styles.backDiagonal, { backgroundColor: style.accent }]} />
      {/* Diamond lattice pattern */}
      <View style={styles.backLattice}>
        {Array.from({ length: 4 }).map((_, r) => (
          <View key={r} style={styles.backLatticeRow}>
            {Array.from({ length: 4 }).map((_, c) => (
              <View
                key={c}
                style={[
                  styles.backLatticeCell,
                  { borderColor: style.rings[2] ?? alpha.whiteOverlay20 },
                ]}
              />
            ))}
          </View>
        ))}
      </View>
      <Image
        source={brand.logo}
        resizeMode="contain"
        style={{ width: spec.center, height: spec.center, opacity: style.logoOpacity }}
      />
    </View>
  );
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
      return <CardBackFace back={back} spec={spec} />;
    }

    if (jokerColor) {
      const accent = colors.seatDealer;
      const micro = Math.max(9, Math.floor(spec.corner * 0.82));
      const title = Math.max(16, Math.floor(spec.center * 0.72));
      const medallionSize = Math.max(
        16,
        Math.min(spec.width - spec.padding * 2 - 4, spec.center + 18),
      );
      return (
        <View style={[styles.face, { padding: spec.padding, borderRadius: spec.radius }]}>
          <PaperGrain />
          <CourtFrame spec={spec} />
          <View style={[styles.cornerTop, { top: space.xs, left: space.xs }]}>
            <Text style={[styles.jokerLabel, { color: accent, fontSize: micro }]}>JOKER</Text>
          </View>
          <View style={styles.centerSuit} pointerEvents="none">
            <View
              style={[
                styles.courtMedallion,
                {
                  width: medallionSize,
                  height: medallionSize,
                  borderRadius: medallionSize / 2,
                  borderColor: alpha.gold40,
                },
              ]}
            >
              <Text
                style={{
                  color: accent,
                  fontFamily: fonts.extra,
                  fontSize: Math.min(title, medallionSize - 4),
                  lineHeight: Math.min(title, medallionSize - 4) + 2,
                  letterSpacing: 2,
                }}
              >
                J
              </Text>
            </View>
          </View>
          <View
            style={[
              styles.cornerBottom,
              { right: space.xs, bottom: space.xs },
            ]}
          >
            <Text style={[styles.jokerLabel, { color: accent, fontSize: micro }]}>JOKER</Text>
          </View>
        </View>
      );
    }

    if (!rank || !suit) {
      return <CardBackFace back={back} spec={spec} />;
    }

    const color = suitColor(suit);
    const cornerSize = Math.max(8, spec.corner);
    const pipCount = numericRank(rank);
    const aceSize = Math.max(
      12,
      Math.min(Math.round(spec.center * 1.6), spec.width - spec.padding * 2 - 4),
    );
    const courtGlyphSize = Math.max(
      12,
      Math.min(Math.round(spec.center * 0.8), spec.width - spec.padding * 2 - 20),
    );
    const courtMedallionSize = courtGlyphSize + 18;

    return (
      <View style={[styles.face, { padding: spec.padding, borderRadius: spec.radius }]}>
        <PaperGrain />
        <View style={[styles.cornerTop, { top: space.xs, left: space.xs }]}>
          <CornerIndex rank={rank} suit={suit} color={color} size={cornerSize} />
        </View>
        <View
          style={[
            styles.cornerBottom,
            { right: space.xs, bottom: space.xs },
          ]}
        >
          <CornerIndex rank={rank} suit={suit} color={color} size={cornerSize} />
        </View>

        {pipCount ? (
          <PipLayout count={pipCount} suit={suit} spec={spec} color={color} />
        ) : rank === 'A' ? (
          <>
            <CourtFrame spec={spec} />
            <View style={styles.centerSuit} pointerEvents="none">
              <SuitGlyph suit={suit} size={aceSize} color={color} />
            </View>
          </>
        ) : (
          <>
            <CourtFrame spec={spec} />
            <View style={styles.centerSuit} pointerEvents="none">
              <View
                style={[
                  styles.courtMedallion,
                  {
                    width: courtMedallionSize,
                    height: courtMedallionSize,
                    borderRadius: courtMedallionSize / 2,
                    borderColor: alpha.gold40,
                  },
                ]}
              >
                <SuitGlyph suit={suit} size={courtGlyphSize} color={color} />
              </View>
            </View>
          </>
        )}
      </View>
    );
  }, [face, rank, suit, jokerColor, back, spec]);

  const shellStyle: ViewStyle = {
    width: spec.width,
    height: spec.height,
    borderRadius: spec.radius,
    backgroundColor: face === 'up' ? colors.cardPaper : 'transparent',
    borderWidth: elevated ? 2 : face === 'up' ? 1 : 0,
    borderColor: elevated
      ? alpha.brand30
      : face === 'up'
        ? colors.cardEdge
        : 'transparent',
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
    backgroundColor: colors.cardPaper,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  paperGrain: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  grainLine: {
    position: 'absolute',
    left: -20,
    right: -20,
    height: StyleSheet.hairlineWidth,
    backgroundColor: alpha.inkOverlay02,
    transform: [{ rotate: '-18deg' }],
  },
  frameOuter: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: alpha.inkOverlay20,
  },
  frameInner: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: alpha.inkOverlay08,
  },
  pipField: {
    ...StyleSheet.absoluteFill,
  },
  pip: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cornerIndex: {
    alignItems: 'flex-start',
  },
  cornerRank: {
    fontFamily: fonts.extra,
  },
  jokerLabel: {
    fontFamily: fonts.extra,
    letterSpacing: 0.5,
  },
  courtMedallion: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  backFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  backInset: {
    position: 'absolute',
    left: 5,
    right: 5,
    top: 5,
    bottom: 5,
    borderWidth: 1,
    opacity: 0.34,
  },
  backGoldInset: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: alpha.gold40,
  },
  backDiagonal: {
    position: 'absolute',
    width: '140%',
    height: '26%',
    opacity: 0.28,
    transform: [{ rotate: '-18deg' }],
  },
  backLattice: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    padding: 10,
    justifyContent: 'space-between',
    opacity: 0.22,
  },
  backLatticeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  backLatticeCell: {
    width: 8,
    height: 8,
    borderWidth: 1,
    transform: [{ rotate: '45deg' }],
  },
  cornerTop: {
    position: 'absolute',
    alignItems: 'flex-start',
  },
  cornerBottom: {
    position: 'absolute',
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
