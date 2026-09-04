import React, { type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type DimensionValue,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { alpha, colors, fonts, letterSpacing, radii, shadow } from '@theme';

export interface ZoneWellProps {
  /** Fixed or fluid well size (matches the card or board that will land in it) */
  width?: DimensionValue;
  height?: DimensionValue;
  /** Fill the positioned parent instead of using fixed dimensions */
  fill?: boolean;
  /** Corner radius — defaults to the card radius token */
  radius?: number;
  /** Quiet all-caps label rendered in the centre, e.g. DISCARD */
  label?: string;
  /** Smaller secondary line under the label, e.g. DROP HERE */
  hint?: string;
  /** Tinted state when the well is the active drop target */
  active?: boolean;
  /** Override the label styles */
  labelStyle?: StyleProp<TextStyle>;
  /** Merge into the well container style */
  style?: StyleProp<ViewStyle>;
  /** Optional content rendered inside a fluid board well */
  children?: ReactNode;
}

/**
 * The one empty-zone treatment for the whole app.
 *
 * A sunken paper well: no dashed stroke, no wireframe. The recess reads as a
 * place a card belongs - the depth is a fill tint plus a hairline edge, and
 * the label sits quietly inside it. Replaces every dashed placeholder stub
 * (TableLayer discard, War battle slots, Poker community, Blackjack house
 * hand, Solitaire piles, CardLab empty zones, Sevens drop zone).
 */
export function ZoneWell({
  width,
  height,
  fill = false,
  radius,
  label,
  hint,
  active = false,
  labelStyle,
  style,
  children,
}: ZoneWellProps) {
  return (
    <View
      style={[
        styles.well,
        fill && styles.fill,
        width !== undefined && { width },
        height !== undefined && { height },
        {
          borderRadius: radius ?? radii.card,
          backgroundColor: active ? alpha.brand10 : alpha.wellWash06,
        },
        active && styles.active,
        style,
      ]}
      pointerEvents="none"
    >
      <View style={styles.topHighlight} />
      <View style={styles.bottomShade} />
      {children}
      {label ? (
        <Text style={[styles.label, labelStyle]} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
      {hint ? (
        <Text style={[styles.hint, active && styles.hintActive]} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  well: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderTopColor: alpha.whiteOverlay80,
    borderLeftColor: alpha.whiteOverlay45,
    borderRightColor: alpha.inkOverlay20,
    borderBottomColor: alpha.inkOverlay20,
    gap: 2,
    ...shadow.well,
  },
  active: {
    borderColor: alpha.brand45,
  },
  topHighlight: {
    position: 'absolute',
    top: 1,
    left: 2,
    right: 2,
    height: 1,
    backgroundColor: alpha.whiteOverlay80,
  },
  bottomShade: {
    position: 'absolute',
    left: 2,
    right: 2,
    bottom: 1,
    height: 2,
    backgroundColor: alpha.inkOverlay12,
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
  label: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.caps,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  hint: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.cap,
    textAlign: 'center',
  },
  hintActive: {
    color: colors.brand,
  },
});

export default ZoneWell;