import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { Rank, Suit } from '@lib/types';
import type { JokerColor } from '@engine/types';
import { CardCourt } from '@components/CardCourt';
import { PAPER_GRAIN_PATH } from '@lib/paperGrain';
import { alpha, colors, fonts, space } from '@theme';

/**
 * Scalable Deckd front artwork.
 *
 * Ported as RN-SVG primitives from the vendored French-card references in
 * `vendor/card-fronts/notpeter` (public domain / WTFPL) and
 * `vendor/card-fronts/hayeah` (MIT). The source artwork establishes the
 * canonical corner-index, pip, and mirrored court proportions; Deckd owns the
 * paper, crimson, ink, and restrained premium-foil treatment here.
 */
export interface CardFaceSpec {
  width: number;
  height: number;
  corner: number;
  center: number;
  padding: number;
  radius: number;
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

/** Classic French pip layouts used by the notpeter/hayeah source decks. */
const PIP_LAYOUTS: Record<number, readonly [number, number][]> = {
  2: [[0.5, 0.25], [0.5, 0.75]],
  3: [[0.5, 0.2], [0.5, 0.5], [0.5, 0.8]],
  4: [[0.32, 0.25], [0.68, 0.25], [0.32, 0.75], [0.68, 0.75]],
  5: [[0.32, 0.25], [0.68, 0.25], [0.5, 0.5], [0.32, 0.75], [0.68, 0.75]],
  6: [
    [0.32, 0.2], [0.32, 0.5], [0.32, 0.8],
    [0.68, 0.2], [0.68, 0.5], [0.68, 0.8],
  ],
  7: [
    [0.5, 0.13], [0.32, 0.27], [0.68, 0.27],
    [0.32, 0.5], [0.68, 0.5], [0.32, 0.73], [0.68, 0.73],
  ],
  8: [
    [0.32, 0.15], [0.32, 0.38], [0.32, 0.62], [0.32, 0.85],
    [0.68, 0.15], [0.68, 0.38], [0.68, 0.62], [0.68, 0.85],
  ],
  9: [
    [0.32, 0.15], [0.32, 0.38], [0.32, 0.62], [0.32, 0.85], [0.5, 0.5],
    [0.68, 0.15], [0.68, 0.38], [0.68, 0.62], [0.68, 0.85],
  ],
  10: [
    [0.32, 0.12], [0.32, 0.31], [0.32, 0.5], [0.32, 0.69], [0.32, 0.88],
    [0.68, 0.12], [0.68, 0.31], [0.68, 0.5], [0.68, 0.69], [0.68, 0.88],
  ],
};

function suitColor(suit: Suit): string {
  return suit === 'hearts' || suit === 'diamonds' ? colors.brand : colors.ink;
}

function numericRank(rank: Rank): number | null {
  const value = Number(rank);
  return value >= 2 && value <= 10 ? value : null;
}

function SuitGlyph({ suit, size, color }: { suit: Suit; size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" pointerEvents="none">
      <Path d={SUIT_PATH[suit]} fill={color} />
    </Svg>
  );
}

function PaperGrain() {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={styles.paperGrain}
      pointerEvents="none"
    >
      <Path
        d={PAPER_GRAIN_PATH}
        fill="none"
        stroke={alpha.inkOverlay08}
        strokeWidth={0.55}
        strokeLinecap="round"
        opacity={0.72}
        vectorEffect="non-scaling-stroke"
      />
    </Svg>
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

function CornerIndices({ rank, suit, color, size }: {
  rank: Rank;
  suit: Suit;
  color: string;
  size: number;
}) {
  return (
    <>
      <View style={[styles.cornerTop, { top: space.xs, left: space.xs }]}>
        <CornerIndex rank={rank} suit={suit} color={color} size={size} />
      </View>
      <View style={[styles.cornerBottom, { right: space.xs, bottom: space.xs }]}>
        <CornerIndex rank={rank} suit={suit} color={color} size={size} />
      </View>
    </>
  );
}

function PipField({ count, suit, spec, color }: {
  count: number;
  suit: Suit;
  spec: CardFaceSpec;
  color: string;
}) {
  const pipSize = Math.max(9, Math.round(spec.center * (count >= 8 ? 0.34 : count >= 6 ? 0.38 : 0.46)));
  return (
    <View style={styles.pipField} pointerEvents="none">
      {PIP_LAYOUTS[count].map(([x, y], index) => (
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

function CourtFrame({ spec }: { spec: CardFaceSpec }) {
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

function JokerArtwork({ color, spec }: { color: JokerColor; spec: CardFaceSpec }) {
  const accent = color === 'red' ? colors.brand : colors.ink;
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
              borderColor: alpha.inkOverlay20,
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
      <View style={[styles.cornerBottom, { right: space.xs, bottom: space.xs }]}>
        <Text style={[styles.jokerLabel, { color: accent, fontSize: micro }]}>JOKER</Text>
      </View>
    </View>
  );
}

export function CardFaceArtwork({ rank, suit, jokerColor, spec }: {
  rank?: Rank;
  suit?: Suit;
  jokerColor?: JokerColor;
  spec: CardFaceSpec;
}) {
  if (jokerColor) return <JokerArtwork color={jokerColor} spec={spec} />;
  if (!rank || !suit) return null;

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
      <CornerIndices rank={rank} suit={suit} color={color} size={cornerSize} />
      {pipCount ? (
        <PipField count={pipCount} suit={suit} spec={spec} color={color} />
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
            <CardCourt
              rank={rank as 'J' | 'Q' | 'K'}
              suit={suit}
              size={courtMedallionSize}
              color={color}
            />
          </View>
        </>
      )}
    </View>
  );
}

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

export default CardFaceArtwork;
