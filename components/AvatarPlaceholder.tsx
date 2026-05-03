import React, { useMemo } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, fonts } from '@theme';

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
  { bg: '#334155', fg: '#FFFFFF' },
  { bg: '#9A3412', fg: '#FFFFFF' },
  { bg: '#92400E', fg: '#FFFFFF' },
  { bg: '#4C1D95', fg: '#FFFFFF' },
  { bg: '#1E3A8A', fg: '#FFFFFF' },
  { bg: '#064E3B', fg: '#FFFFFF' },
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
        ? { borderWidth: 2, borderColor: 'rgba(176,32,32,0.2)' }
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
