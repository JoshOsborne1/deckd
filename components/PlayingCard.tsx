import React, { useMemo } from 'react';
import { Image, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import type { Rank, Suit } from '@lib/types';
import type { JokerColor } from '@engine/types';
import { brand } from '@lib/assets';
import { CardFaceArtwork } from '@components/CardFaceArtwork';
import { alpha, colors, radii, shadow } from '@theme';

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
  /** True when this card is physically overlapping another card. */
  overlapped?: boolean;
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
  // Deckd's branded source is 750×1050 (2.5:3.5). Keep every shell on that
  // ratio so fronts and backs never crop or visibly jump between sizes.
  xs: { width: 16, height: 22, corner: 8, center: 12, padding: 2, radius: 3 },
  sm: { width: 60, height: 84, corner: 12, center: 32, padding: 6, radius: 8 },
  md: { width: 90, height: 126, corner: 20, center: 48, padding: 8, radius: radii.card },
  lg: { width: 110, height: 154, corner: 24, center: 64, padding: 10, radius: radii.card },
};

function normalizeBackId(back: PlayingCardBack): string {
  if (back === 'brand') return 'back-brand';
  if (back === 'ink' || back === 'back-ink') return 'back-noir';
  if (back === 'back-premium-gold') return 'back-crimson';
  return back;
}

function backAsset(back: PlayingCardBack) {
  const normalized = normalizeBackId(back);
  if (normalized === 'back-brand') return brand.cardBack;
  if (normalized === 'back-noir') return brand.cardBackNoir;
  if (normalized === 'back-crimson') return brand.cardBackCrimson;
  return brand.cardBack;
}

function CardBackFace({ back, spec }: { back: PlayingCardBack; spec: SizeSpec }) {
  return (
    <View style={[styles.backFill, styles.brandedBack, { borderRadius: spec.radius }]}>
      <Image
        source={backAsset(back)}
        resizeMode="stretch"
        style={styles.brandedBackImage}
        accessibilityIgnoresInvertColors
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
  overlapped = false,
  onPress,
  style,
  testID,
}: PlayingCardProps) {
  const spec = SIZE_MAP[size];

  const content = useMemo(() => {
    if (face === 'down' || (!jokerColor && (!rank || !suit))) {
      return <CardBackFace back={back} spec={spec} />;
    }

    return <CardFaceArtwork rank={rank} suit={suit} jokerColor={jokerColor} spec={spec} />;
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

  // A lone card is printed stock, not a floating tile. Shadows only appear
  // when the caller describes real overlap or an explicit highlighted lift.
  const wrapperShadow = elevated || overlapped ? shadow.cardStrong : shadow.none;
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
  backFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  brandedBack: {
    backgroundColor: colors.cardPaper,
  },
  brandedBackImage: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    // RN Web renders the visual image as a background layer and puts its
    // accessibility <img> at z-index -1. Keep the real card stock above the
    // paper fallback so previews cannot collapse into blank white shells.
    zIndex: 1,
  },
});

export default PlayingCard;