import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  default as Animated,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { HomeLayer } from '@components/layers/HomeLayer';
import { HubLayer } from '@components/layers/HubLayer';
import { TableLayer } from '@components/layers/TableLayer';
import { LobbyLayer } from '@components/layers/LobbyLayer';
import { PassLayer } from '@components/layers/PassLayer';
import { NAV_BAR_RESERVE, NAV_BAR_RESERVE_COMPACT, useCompactNav } from '@components/GlobalNavBar';
import {
  SurfaceMorphContext,
  type MorphDirection,
  type SurfaceMorph,
  type SurfaceTransitionKind,
} from '@components/layers/SurfaceMorphContext';
import { useUiStore } from '@store/uiStore';
import { useLobbyStore } from '@store/lobbyStore';
import { useCosmeticsStore } from '@store/cosmeticsStore';
import { findTableThemeById } from '@engine/visuals';
import { useMotion } from '@hooks/useMotion';
import { alpha, colors } from '@theme';
import { PAPER_GRAIN_PATH } from '@lib/paperGrain';
import {
  getSurfaceTransitionKind,
  isSurfaceTableTransition,
} from '@lib/surfaceMorph';

const MATERIAL_EMPHASIZED = Easing.bezier(0.4, 0, 0.2, 1);
const DURATION_ENTER_HUB = 520;
const DURATION_RETURN_HOME = 380;
const DURATION_REDUCE_MOTION = 200;
const DURATION_TABLE_MORPH = 420;

export default function Surface() {
  const insets = useSafeAreaInsets();
  const viewMode = useUiStore((s) => s.viewMode);
  const previousMode = useUiStore((s) => s.previousMode);
  const lobbyStatus = useLobbyStore((s) => s.status);
  const lobbySessionActive = lobbyStatus === 'connecting' || lobbyStatus === 'connected';
  const compact = useCompactNav();
  const navReserve = compact ? NAV_BAR_RESERVE_COMPACT : NAV_BAR_RESERVE;
  const showHomeSurface = viewMode === 'home' || viewMode === 'hub' || previousMode === 'home' || previousMode === 'hub';
  const showTableSurface = viewMode === 'table' || viewMode === 'pass' || previousMode === 'table' || previousMode === 'pass';
  const showLobbySurface = viewMode === 'lobby' || previousMode === 'lobby' || lobbySessionActive;
  const { reduceMotion } = useMotion();
  const progress = useSharedValue<number>(viewMode === 'home' ? 0 : 1);
  const direction = useSharedValue<MorphDirection>(0);
  const reduceMotionSv = useSharedValue<number>(reduceMotion ? 1 : 0);
  const transitionProgress = useSharedValue(1);
  const transitionKind = useSharedValue<SurfaceTransitionKind>('idle');

  const tableTransition = getSurfaceTransitionKind(viewMode, previousMode);

  useEffect(() => {
    reduceMotionSv.value = reduceMotion ? 1 : 0;
  }, [reduceMotion, reduceMotionSv]);

  useEffect(() => {
    if (previousMode === null) {
      direction.value = 0;
      progress.value = viewMode === 'home' ? 0 : 1;
      return;
    }
    if (viewMode === 'home') {
      direction.value = -1;
      const duration = reduceMotion ? DURATION_REDUCE_MOTION : DURATION_RETURN_HOME;
      progress.value = withTiming(0, { duration, easing: MATERIAL_EMPHASIZED }, (finished) => {
        'worklet';
        if (finished) direction.value = 0;
      });
    } else if (viewMode === 'hub') {
      direction.value = 1;
      const duration = reduceMotion ? DURATION_REDUCE_MOTION : DURATION_ENTER_HUB;
      progress.value = withTiming(1, { duration, easing: MATERIAL_EMPHASIZED }, (finished) => {
        'worklet';
        if (finished) direction.value = 0;
      });
    }
  }, [viewMode, previousMode, progress, direction, reduceMotion]);

  useEffect(() => {
    const enteringTable = isSurfaceTableTransition(tableTransition);
    transitionKind.value = tableTransition;
    transitionProgress.value = enteringTable ? 0 : 1;
    if (!enteringTable) return;

    transitionProgress.value = withTiming(
      1,
      {
        duration: reduceMotion ? DURATION_REDUCE_MOTION : DURATION_TABLE_MORPH,
        easing: MATERIAL_EMPHASIZED,
      },
      (finished) => {
        'worklet';
        if (finished) transitionKind.value = 'idle';
      },
    );
  }, [reduceMotion, tableTransition, transitionKind, transitionProgress]);

  const morph = useMemo<SurfaceMorph>(
    () => ({
      progress,
      direction,
      reduceMotion: reduceMotionSv,
      transitionProgress,
      transitionKind,
    }),
    [direction, progress, reduceMotionSv, transitionKind, transitionProgress],
  );

  return (
    <SurfaceMorphContext.Provider value={morph}>
      <View style={styles.root}>
        <FeltBackground />
        <View style={styles.layers}>
          {showHomeSurface ? (
            <>
              <HomeLayer
                active={viewMode === 'home'}
                layerVisible={viewMode === 'home' || viewMode === 'hub'}
                topInset={insets.top}
                bottomInset={insets.bottom + navReserve}
              />
              <HubLayer
                active={viewMode === 'hub'}
                layerVisible={viewMode === 'home' || viewMode === 'hub'}
                topInset={insets.top}
                bottomInset={insets.bottom + navReserve}
              />
            </>
          ) : null}
          {showTableSurface ? (
            <TableLayer
              active={viewMode === 'table' || viewMode === 'pass'}
              topInset={insets.top}
              bottomInset={insets.bottom + navReserve}
            />
          ) : null}
          {showLobbySurface ? (
            <LobbyLayer
              active={viewMode === 'lobby'}
              topInset={insets.top}
              bottomInset={insets.bottom + navReserve}
            />
          ) : null}
          <TableMorphSweep />
          {viewMode === 'pass' ? <PassLayer /> : null}
        </View>
      </View>
    </SurfaceMorphContext.Provider>
  );
}

function TableMorphSweep() {
  const { transitionProgress, reduceMotion, transitionKind } = useSurfaceMorphUnsafe();
  const sweepStyle = useAnimatedStyle(() => {
    const active = transitionKind.value !== 'idle';
    return {
      opacity: active ? interpolate(transitionProgress.value, [0, 0.2, 0.8, 1], [1, 0.58, 0.18, 0]) : 0,
      transform: reduceMotion.value === 1
        ? []
        : [{ translateY: interpolate(transitionProgress.value, [0, 1], [26, 0]) }],
    };
  });

  return <View pointerEvents="none" style={styles.morphSweep}><View style={styles.morphSweepFelt}><AnimatedSweep style={sweepStyle} /></View></View>;
}

function useSurfaceMorphUnsafe(): SurfaceMorph {
  const ctx = React.useContext(SurfaceMorphContext);
  if (!ctx) throw new Error('TableMorphSweep must be rendered inside SurfaceMorphContext.Provider');
  return ctx;
}

function AnimatedSweep({ style }: { style: ReturnType<typeof useAnimatedStyle> }) {
  return <Animated.View style={[styles.sweepWash, style]} />;
}

function FeltBackground() {
  const themeId = useCosmeticsStore((s) => s.equippedTableThemeId);
  const tableTheme = findTableThemeById(themeId);
  const base = tableTheme?.surfaceBase ?? colors.bg;
  const rail = tableTheme?.railColor ?? alpha.inkOverlay12;
  const well = tableTheme?.wellColor ?? alpha.brand10;
  const grainTint = tableTheme?.railColor ?? tableTheme?.glowTint ?? alpha.inkOverlay12;
  return (
    <View style={[styles.felt, { backgroundColor: base }]} pointerEvents="none">
      <View style={[styles.feltGlow, { backgroundColor: well }]} />
      <View style={[styles.tableRail, { borderColor: rail }]} />
      <View style={[styles.tableWell, { backgroundColor: well }]} />
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={styles.tableGrain} pointerEvents="none">
        <Path d={PAPER_GRAIN_PATH} fill="none" stroke={grainTint} strokeWidth={0.55} strokeLinecap="round" opacity={0.22} vectorEffect="non-scaling-stroke" />
      </Svg>
      <View style={styles.feltVignetteTop} />
      <View style={styles.feltVignetteBottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  layers: { flex: 1, minHeight: 0 },
  felt: { ...StyleSheet.absoluteFillObject },
  feltGlow: { position: 'absolute', left: '12%', right: '12%', top: '18%', height: '64%', borderRadius: 999, opacity: 0.5 },
  tableRail: { position: 'absolute', left: 0, right: 0, top: '23%', height: '62%', borderRadius: 260, borderWidth: 18, opacity: 0.28 },
  tableWell: { position: 'absolute', left: 44, right: 44, top: '36%', height: '34%', borderRadius: 190, opacity: 0.34 },
  tableGrain: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  feltVignetteTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 120, backgroundColor: alpha.inkOverlay06, opacity: 0.4 },
  feltVignetteBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 160, backgroundColor: alpha.inkOverlay06, opacity: 0.35 },
  morphSweep: { ...StyleSheet.absoluteFillObject, zIndex: 30 },
  morphSweepFelt: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  sweepWash: { ...StyleSheet.absoluteFillObject, backgroundColor: alpha.brand10, borderTopWidth: 1, borderTopColor: alpha.brand20 },
});
