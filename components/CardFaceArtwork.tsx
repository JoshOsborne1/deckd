import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import type { Rank, Suit } from '@lib/types';
import type { JokerColor } from '@engine/types';
import { getRevkCardXml } from '@lib/revkCards';
import { getCardJokerXml } from '@lib/cardJokers';
import { colors } from '@theme';

/**
 * Vector face geometry shared by the card shell and the selected RevK deck.
 * RevK's poker SVGs use the same 5:7 ratio as Deckd's 90x126 / 110x154 sizes.
 */
export interface CardFaceSpec {
  width: number;
  height: number;
  corner: number;
  center: number;
  padding: number;
  radius: number;
}

/**
 * Render the selected RevK CC0 front as native SVG primitives through SvgXml.
 * This is deliberately not an Image or browser-only external SVG asset: the
 * card remains vector on web and native and scales with the animated shell.
 */
export function CardFaceArtwork({ rank, suit, jokerColor, spec }: {
  rank?: Rank;
  suit?: Suit;
  jokerColor?: JokerColor;
  spec: CardFaceSpec;
}) {
  if (jokerColor) {
    return (
      <View style={[styles.face, { borderRadius: spec.radius }]} pointerEvents="none">
        <SvgXml
          xml={getCardJokerXml(jokerColor)}
          width="100%"
          height="100%"
          accessibilityLabel={`${jokerColor} joker`}
        />
      </View>
    );
  }
  if (!rank || !suit) return null;

  return (
    <View style={[styles.face, { borderRadius: spec.radius }]} pointerEvents="none">
      <SvgXml
        xml={getRevkCardXml(rank, suit)}
        width="100%"
        height="100%"
        accessibilityLabel={`${rank} of ${suit}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  face: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.cardPaper,
  },
});

export default CardFaceArtwork;
