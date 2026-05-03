import React, { type ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { alpha, colors, radii, shadow, space, textStyles } from '@theme';

export type CardSectionVariant = 'surface' | 'ink' | 'brand' | 'ghost';

export interface CardSectionProps {
  eyebrow?: string;
  title?: string;
  accessory?: ReactNode;
  children: ReactNode;
  variant?: CardSectionVariant;
  padded?: boolean;
  /** Small decorative card-edge tab on the top-left. */
  tab?: boolean;
  style?: ViewStyle;
  headerStyle?: ViewStyle;
}

/**
 * Deck-metaphor grouping container. Renders a raised card surface with an
 * optional eyebrow + title header and a subtle notched edge that hints the
 * panel is an elevated "card" in the stack.
 */
export function CardSection({
  eyebrow,
  title,
  accessory,
  children,
  variant = 'surface',
  padded = true,
  tab = false,
  style,
  headerStyle,
}: CardSectionProps) {
  const variantStyle = VARIANT[variant];
  const hasHeader = Boolean(eyebrow || title || accessory);

  const headerTextColor =
    variant === 'ink' || variant === 'brand' ? colors.surface : colors.ink;
  const eyebrowColor =
    variant === 'ink' || variant === 'brand' ? alpha.whiteOverlay80 : colors.inkMuted;

  return (
    <View style={[styles.base, variantStyle, padded && styles.padded, style]}>
      {tab ? <View style={[styles.tab, variant === 'brand' ? styles.tabInvert : null]} /> : null}
      {hasHeader ? (
        <View style={[styles.header, headerStyle]}>
          <View style={styles.headerText}>
            {eyebrow ? (
              <Text style={[textStyles.eyebrow, { color: eyebrowColor }]}>{eyebrow}</Text>
            ) : null}
            {title ? (
              <Text style={[textStyles.h3, { color: headerTextColor, marginTop: 2 }]}>{title}</Text>
            ) : null}
          </View>
          {accessory ? <View style={styles.accessory}>{accessory}</View> : null}
        </View>
      ) : null}
      <View>{children}</View>
    </View>
  );
}

const VARIANT: Record<CardSectionVariant, ViewStyle> = {
  surface: {
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  ink: {
    backgroundColor: colors.ink,
    ...shadow.cardStrong,
  },
  brand: {
    backgroundColor: colors.brand,
    ...shadow.cta,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    position: 'relative',
  },
  padded: {
    padding: space.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.md,
    gap: space.md,
  },
  headerText: {
    flex: 1,
  },
  accessory: {
    marginLeft: 'auto',
  },
  tab: {
    position: 'absolute',
    top: 0,
    left: space.lg,
    width: 34,
    height: 4,
    borderBottomLeftRadius: radii.xs,
    borderBottomRightRadius: radii.xs,
    backgroundColor: colors.brand,
  },
  tabInvert: {
    backgroundColor: colors.surface,
  },
});
