import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { findTableThemeById } from '@engine/visuals';
import { PAPER_GRAIN_PATH } from '@lib/paperGrain';
import { useCosmeticsStore } from '@store/cosmeticsStore';
import { alpha, colors, radii, space } from '@theme';

export type TableSurfaceMode = 'setup' | 'play';

interface TableSurfaceProps {
  mode: TableSurfaceMode;
}

/**
 * Shared paper-stock treatment for the live table and its setup ritual.
 *
 * The persistent canvas in `app/index.tsx` supplies the broad table silhouette;
 * this layer adds the quieter, local material pass so setup and play remain
 * tactile even when their content sits above the ambient background.
 */
export function TableSurface({ mode }: TableSurfaceProps) {
  const themeId = useCosmeticsStore((state) => state.equippedTableThemeId);
  const tableTheme = findTableThemeById(themeId);
  const base = tableTheme?.surfaceBase ?? colors.surface;
  const rail = tableTheme?.railColor ?? alpha.inkOverlay12;
  const well = tableTheme?.wellColor ?? alpha.brand10;
  const isSetup = mode === 'setup';

  return (
    <View style={styles.root} pointerEvents="none">
      <View
        style={[
          styles.base,
          {
            backgroundColor: base,
            opacity: isSetup ? 0.84 : 0.78,
          },
        ]}
      />
      <View
        style={[
          styles.paperWash,
          {
            backgroundColor: well,
            opacity: isSetup ? 0.18 : 0.14,
          },
        ]}
      />
      <View style={[styles.frame, { borderColor: rail }]} />
      <View style={[styles.topRule, { backgroundColor: rail }]} />
      <View style={[styles.bottomRule, { backgroundColor: rail }]} />
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={styles.grain}
        pointerEvents="none"
      >
        <Path
          d={PAPER_GRAIN_PATH}
          fill="none"
          stroke={rail}
          strokeWidth={0.7}
          strokeLinecap="round"
          opacity={isSetup ? 0.3 : 0.36}
          vectorEffect="non-scaling-stroke"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  base: {
    ...StyleSheet.absoluteFill,
  },
  paperWash: {
    position: 'absolute',
    left: '7%',
    right: '7%',
    top: '15%',
    height: '70%',
    borderRadius: 999,
  },
  frame: {
    position: 'absolute',
    top: space.sm,
    left: space.sm,
    right: space.sm,
    bottom: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.xl,
    opacity: 0.2,
  },
  topRule: {
    position: 'absolute',
    top: 0,
    left: space.xl,
    right: space.xl,
    height: StyleSheet.hairlineWidth,
    opacity: 0.22,
  },
  bottomRule: {
    position: 'absolute',
    bottom: 0,
    left: space.xl,
    right: space.xl,
    height: StyleSheet.hairlineWidth,
    opacity: 0.16,
  },
  grain: {
    ...StyleSheet.absoluteFill,
  },
});

export default TableSurface;
