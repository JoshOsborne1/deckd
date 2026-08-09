import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Easing, useSharedValue, withTiming } from 'react-native-reanimated';
import { HomeLayer } from '@components/layers/HomeLayer';
import { HubLayer } from '@components/layers/HubLayer';
import { TableLayer } from '@components/layers/TableLayer';
import { LobbyLayer } from '@components/layers/LobbyLayer';
import { PassLayer } from '@components/layers/PassLayer';
import {
  SurfaceMorphContext,
  type MorphDirection,
  type SurfaceMorph,
} from '@components/layers/SurfaceMorphContext';
import { useUiStore } from '@store/uiStore';
import { useCosmeticsStore } from '@store/cosmeticsStore';
import { findTableThemeById } from '@engine/visuals';
import { useMotion } from '@hooks/useMotion';
import { alpha, colors } from '@theme';

/**
 * The Deckd surface. `/` is the single canvas: a persistent felt background
 * with cosmetic/home/hub/table/lobby/pass layers stacked on top, driven by
 * `uiStore.viewMode`. Transitions feel like UI chrome sliding off the core
 * game rather than hopping between menus.
 *
 * The home -> hub transition is choreographed via a single `progress` shared
 * value (0 = fully home, 1 = fully hub) published through
 * `SurfaceMorphContext`. Each Home/Hub element reads it with its own
 * `interpolate` window, producing staggered exits and entries without any
 * per-element `useEffect` chains.
 *
 * Material-emphasized easing (`cubic-bezier(0.4, 0, 0.2, 1)`) is used both
 * directions; hub -> home is a touch snappier (~380ms vs ~520ms).
 */

const MATERIAL_EMPHASIZED = Easing.bezier(0.4, 0, 0.2, 1);
const DURATION_ENTER_HUB = 520;
const DURATION_RETURN_HOME = 380;
const DURATION_REDUCE_MOTION = 200;

export default function Surface() {
  const insets = useSafeAreaInsets();
  const viewMode = useUiStore((s) => s.viewMode);
  const { reduceMotion } = useMotion();

  const progress = useSharedValue<number>(viewMode === 'home' ? 0 : 1);
  const direction = useSharedValue<MorphDirection>(0);
  const reduceMotionSv = useSharedValue<number>(reduceMotion ? 1 : 0);

  useEffect(() => {
    reduceMotionSv.value = reduceMotion ? 1 : 0;
  }, [reduceMotion, reduceMotionSv]);

  useEffect(() => {
    if (viewMode === 'home') {
      direction.value = -1;
      const duration = reduceMotion
        ? DURATION_REDUCE_MOTION
        : DURATION_RETURN_HOME;
      progress.value = withTiming(
        0,
        { duration, easing: MATERIAL_EMPHASIZED },
        (finished) => {
          'worklet';
          if (finished) direction.value = 0;
        },
      );
    } else if (viewMode === 'hub') {
      direction.value = 1;
      const duration = reduceMotion
        ? DURATION_REDUCE_MOTION
        : DURATION_ENTER_HUB;
      progress.value = withTiming(
        1,
        { duration, easing: MATERIAL_EMPHASIZED },
        (finished) => {
          'worklet';
          if (finished) direction.value = 0;
        },
      );
    }
    // Any other viewMode (table / lobby / pass): keep progress where it is.
    // The table/lobby/pass layers own their own whole-layer fade on top of
    // whatever state Home+Hub settled into.
  }, [viewMode, progress, direction, reduceMotion]);

  const morph = useMemo<SurfaceMorph>(
    () => ({ progress, direction, reduceMotion: reduceMotionSv }),
    [progress, direction, reduceMotionSv],
  );

  return (
    <SurfaceMorphContext.Provider value={morph}>
      <View style={styles.root}>
        <FeltBackground />

        <HomeLayer
          active={viewMode === 'home'}
          layerVisible={viewMode === 'home' || viewMode === 'hub'}
          topInset={insets.top}
          bottomInset={insets.bottom}
        />
        <HubLayer
          active={viewMode === 'hub'}
          layerVisible={viewMode === 'home' || viewMode === 'hub'}
          topInset={insets.top}
          bottomInset={insets.bottom}
        />
        <TableLayer
          active={viewMode === 'table' || viewMode === 'pass'}
          topInset={insets.top}
          bottomInset={insets.bottom}
        />
        <LobbyLayer
          active={viewMode === 'lobby'}
          topInset={insets.top}
          bottomInset={insets.bottom}
        />
        <PassLayer />
      </View>
    </SurfaceMorphContext.Provider>
  );
}

/** Ambient felt layer that anchors the whole surface in the game world. */
function FeltBackground() {
  const themeId = useCosmeticsStore((s) => s.equippedTableThemeId);
  const tableTheme = findTableThemeById(themeId);
  const base = tableTheme?.surfaceBase ?? colors.bg;
  const rail = tableTheme?.railColor ?? alpha.inkOverlay12;
  const well = tableTheme?.wellColor ?? alpha.brand10;
  return (
    <View style={[styles.felt, { backgroundColor: base }]} pointerEvents="none">
      {/* Radial light from the centre of the table */}
      <View style={[styles.feltGlow, { backgroundColor: well }]} />
      {/* Rail ring */}
      <View style={[styles.tableRail, { borderColor: rail }]} />
      {/* Inner well */}
      <View style={[styles.tableWell, { backgroundColor: well }]} />
      {/* Weave texture: fine horizontal + vertical hairlines */}
      <View style={styles.weaveH} />
      <View style={styles.weaveV} />
      <View style={styles.feltVignetteTop} />
      <View style={styles.feltVignetteBottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  felt: {
    ...StyleSheet.absoluteFill,
  },
  feltGlow: {
    position: 'absolute',
    left: '12%',
    right: '12%',
    top: '18%',
    height: '64%',
    borderRadius: 999,
    opacity: 0.5,
  },
  tableRail: {
    position: 'absolute',
    left: -70,
    right: -70,
    top: '23%',
    height: '62%',
    borderRadius: 260,
    borderWidth: 18,
    opacity: 0.28,
  },
  tableWell: {
    position: 'absolute',
    left: 44,
    right: 44,
    top: '36%',
    height: '34%',
    borderRadius: 190,
    opacity: 0.34,
  },
  weaveH: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    opacity: 0.05,
    backgroundColor: 'transparent',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface,
  },
  weaveV: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    opacity: 0.04,
    backgroundColor: 'transparent',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ink,
  },
  feltVignetteTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: alpha.inkOverlay06,
    opacity: 0.4,
  },
  feltVignetteBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 160,
    backgroundColor: alpha.inkOverlay06,
    opacity: 0.35,
  },
});
