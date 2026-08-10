import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import type { Rank, Suit } from '@lib/types';
import type { CardFaceSpec } from '@components/CardFaceArtwork';
import { alpha, colors } from '@theme';

/**
 * Deckd court panel: full-face characters drawn in the house style.
 *
 * The court fills the card between the corner indices, framed by hairline
 * rules, with a suit watermark behind the figure and a mirrored second
 * figure below the centre rule (classic court-card composition).
 *
 * The three ranks are the house staff:
 *   JACK  — the Dealer, holding a fanned hand of cards
 *   QUEEN — the Host, wearing the suit pip as a pendant
 *   KING  — the Master, crowned and holding the scepter
 */
const SUIT_PATH: Record<Suit, string> = {
  hearts:
    'M50 88C45 82 13 61 13 35C13 21 23 12 35 12C42 12 48 16 50 23C52 16 58 12 65 12C77 12 87 21 87 35C87 61 55 82 50 88Z',
  diamonds: 'M50 4L94 50L50 96L6 50Z',
  spades:
    'M50 8C46 16 16 32 16 53C16 64 24 71 35 71C42 71 47 67 50 60C53 67 58 71 65 71C76 71 84 64 84 53C84 32 54 16 50 8ZM42 60H58V80H66V89H34V80H42Z',
  clubs:
    'M50 8C39 8 33 18 36 28C24 23 12 31 12 43C12 56 25 63 37 57C36 69 42 75 50 76C58 75 64 69 63 57C75 63 88 56 88 43C88 31 76 23 64 28C67 18 61 8 50 8ZM42 68H58V81H66V90H34V81H42Z',
};

export function CardCourt({
  rank,
  suit,
  spec,
  color,
}: {
  rank: Extract<Rank, 'J' | 'Q' | 'K'>;
  suit: Suit;
  spec: CardFaceSpec;
  color: string;
}) {
  const panelW = spec.width - spec.padding * 2;
  const panelH = spec.height - spec.padding * 2;
  return (
    <View style={styles.root} pointerEvents="none">
      <Svg width={panelW} height={panelH} viewBox="0 0 100 140">
        {/* Suit watermark behind the figure */}
        <G opacity={0.1}>
          <Path
            d={SUIT_PATH[suit]}
            fill={color}
            transform="translate(50 70) scale(0.9) translate(-50 -50)"
          />
        </G>

        {/* Hairline frame */}
        <Rect
          x={2}
          y={2}
          width={96}
          height={136}
          rx={6}
          fill="none"
          stroke={alpha.inkOverlay20}
          strokeWidth={1}
        />
        <Rect
          x={5}
          y={5}
          width={90}
          height={130}
          rx={4}
          fill="none"
          stroke={alpha.inkOverlay08}
          strokeWidth={1}
        />

        {/* Top figure */}
        <CourtHalf rank={rank} suit={suit} color={color} />

        {/* Bottom figure, mirrored */}
        <G transform="translate(100 140) rotate(180)">
          <CourtHalf rank={rank} suit={suit} color={color} />
        </G>

        {/* Centre rule with table-marker diamond */}
        <Rect x={8} y={68.5} width={84} height={3} rx={1.5} fill={alpha.brand45} />
        <Path d="M50 63 L54 70 L50 77 L46 70 Z" fill={color} />
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
  return (
    <G>
      {/* Robe */}
      <Path d="M20 70 C20 50 30 42 50 42 C70 42 80 50 80 70 Z" fill={robe} />
      {/* Collar */}
      <Path
        d="M42 44 L50 52 L58 44 L54 42 L50 46 L46 42 Z"
        fill={colors.cardPaper}
        opacity={0.9}
      />
      {/* Head */}
      <Circle
        cx={50}
        cy={25}
        r={11}
        fill={colors.cardPaper}
        stroke={alpha.inkOverlay12}
        strokeWidth={1}
      />
      {/* Hair */}
      {rank === 'K' ? (
        <G>
          <Path
            d="M39 26 C39 14 45 9 50 9 C55 9 61 14 61 26 C57 20 54 18 50 18 C46 18 43 20 39 26 Z"
            fill={hair}
          />
          <Path
            d="M42 32 C44 38 46 40 50 40 C54 40 56 38 58 32 C56 36 53 37 50 37 C47 37 44 36 42 32 Z"
            fill={hair}
          />
        </G>
      ) : rank === 'Q' ? (
        <G>
          <Path
            d="M39 26 C39 14 45 9 50 9 C55 9 61 14 61 26 C57 20 54 18 50 18 C46 18 43 20 39 26 Z"
            fill={hair}
          />
          <Path d="M39 26 L37 44 C37 48 41 48 42 44 L43 30 Z" fill={hair} />
          <Path d="M61 26 L63 44 C63 48 59 48 58 44 L57 30 Z" fill={hair} />
        </G>
      ) : (
        <Path
          d="M39 27 C39 15 45 10 50 10 C55 10 61 15 61 27 C57 21 54 19 50 19 C46 19 43 21 39 27 Z"
          fill={hair}
        />
      )}
      {/* Eyes */}
      <Path d="M45 24 h3 M52 24 h3" stroke={colors.ink} strokeWidth={1.4} strokeLinecap="round" />
      {/* Smile */}
      <Path
        d="M46 30 c2.5 2 5.5 2 8 0"
        stroke={colors.brandDark}
        strokeWidth={1.2}
        strokeLinecap="round"
        fill="none"
      />
      {/* Crown / cap */}
      {rank === 'K' ? (
        <G>
          <Path d="M42 10 L45 1 L50 6 L55 1 L58 10 Z" fill={colors.brand} />
          <Rect x={42} y={9} width={16} height={2.5} rx={1} fill={colors.brandDark} />
        </G>
      ) : rank === 'Q' ? (
        <G>
          <Path d="M43 10 L46 3 L50 7 L54 3 L57 10 Z" fill={colors.brand} />
          <Rect x={43} y={9} width={14} height={2.5} rx={1} fill={colors.brandDark} />
        </G>
      ) : (
        <Path d="M43 11 L50 7 L57 11 L55 13 L50 10 L45 13 Z" fill={colors.brand} />
      )}
      {/* Rank props */}
      {rank === 'J' ? (
        <G>
          {/* Fanned hand of cards */}
          <Rect
            x={36}
            y={50}
            width={10}
            height={14}
            rx={1.5}
            fill={colors.cardPaper}
            stroke={alpha.inkOverlay20}
            strokeWidth={0.8}
            transform="rotate(-14 41 57)"
          />
          <Rect
            x={45}
            y={48}
            width={10}
            height={14}
            rx={1.5}
            fill={colors.cardPaper}
            stroke={alpha.inkOverlay20}
            strokeWidth={0.8}
          />
          <Rect
            x={54}
            y={50}
            width={10}
            height={14}
            rx={1.5}
            fill={colors.cardPaper}
            stroke={alpha.inkOverlay20}
            strokeWidth={0.8}
            transform="rotate(14 59 57)"
          />
          <Path
            d={SUIT_PATH[suit]}
            fill={color}
            transform="translate(50 55) scale(0.1) translate(-50 -50)"
          />
        </G>
      ) : rank === 'Q' ? (
        <G>
          {/* Suit-pip pendant */}
          <Circle cx={50} cy={44} r={1.6} fill={colors.brand} />
          <Path d="M50 46 L53 52 L50 58 L47 52 Z" fill={color} />
        </G>
      ) : (
        <G>
          {/* Scepter with pip topper */}
          <Path d="M62 40 L66 62" stroke={colors.brand} strokeWidth={2} strokeLinecap="round" />
          <Path
            d={SUIT_PATH[suit]}
            fill={color}
            transform="translate(64 36) scale(0.09) translate(-50 -50)"
          />
        </G>
      )}
    </G>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default CardCourt;
