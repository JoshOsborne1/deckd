import React, { useMemo } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { alpha, colors, fonts } from '@theme';

export interface AvatarPlaceholderProps {
  seed: string;
  size?: number;
  label?: string;
  ring?: 'none' | 'brand' | 'soft';
  style?: ViewStyle;
}

const PALETTE: { bg: string; fg: string }[] = [
  { bg: colors.brand, fg: colors.surface },
  { bg: colors.ink, fg: colors.surface },
  { bg: colors.neutral500, fg: colors.surface },
  { bg: colors.brandDark, fg: colors.surface },
  { bg: colors.warn, fg: colors.surface },
  { bg: colors.seatRemote, fg: colors.surface },
  { bg: colors.tableRail, fg: colors.surface },
  { bg: colors.tableFelt, fg: colors.surface },
];

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export const AvatarPlaceholder: React.FC<AvatarPlaceholderProps> = ({
  seed,
  size = 40,
  label,
  ring = 'none',
  style,
}) => {
  const { bg, fg, initial } = useMemo(() => {
    const safeSeed = seed && seed.length > 0 ? seed : '?';
    const n = hashSeed(safeSeed);
    const swatch = PALETTE[n % PALETTE.length] ?? PALETTE[0]!;
    const text = (label ?? safeSeed).trim();
    const firstChar = text.length > 0 ? text[0]!.toUpperCase() : '?';
    return { bg: swatch.bg, fg: swatch.fg, initial: firstChar };
  }, [seed, label]);

  const ringStyle: ViewStyle =
    ring === 'brand'
      ? { borderWidth: 2, borderColor: colors.brand }
      : ring === 'soft'
        ? { borderWidth: 2, borderColor: alpha.brand20 }
        : {};

  return (
    <View
      accessibilityLabel={label ?? seed}
      style={[
        styles.root,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
        },
        ringStyle,
        style,
      ]}
    >
      <Text
        style={{
          color: fg,
          fontFamily: fonts.bold,
          fontSize: Math.round(size * 0.42),
        }}
      >
        {initial}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});

export default AvatarPlaceholder;
