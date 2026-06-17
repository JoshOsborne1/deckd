import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { ChevronLeft, Radio, Users } from 'lucide-react-native';
import { CardButton } from '@components/CardButton';
import { CardSection } from '@components/CardSection';
import { PlayingCard } from '@components/PlayingCard';
import { useSurfaceMorph } from '@components/layers/SurfaceMorphContext';
import { useMotion } from '@hooks/useMotion';
import { useUiStore } from '@store/uiStore';
import { useGameStore } from '@store/gameStore';
import { useProfileStore } from '@store/profileStore';
import { builtinPresets, type Preset } from '@engine/index';
import type { FanStyle } from '@engine/types';
import { resolvePresetForSession } from '@lib/presetResolve';
import { useSessionHistoryStore } from '@store/sessionHistoryStore';
import { useUserPresetsStore } from '@store/presetsStore';
import { EASING_EMPHASIZED } from '@lib/motion';
import { alpha, colors, fonts, letterSpacing, motion, radii, shadow, space } from '@theme';

interface HubLayerProps {
  /** True when viewMode === 'hub' — drives tap gating. */
  active: boolean;
  /** True when we're in the morph zone (home | hub). When false the whole
   *  layer fades out so Hub doesn't stay visible under table/lobby/pass. */
  layerVisible: boolean;
  topInset: number;
  bottomInset: number;
}

type PlayerCount = 2 | 3 | 4 | 5 | 6;
const PLAYER_OPTIONS: PlayerCount[] = [2, 3, 4, 5, 6];

/** Progress threshold above which Hub accepts taps. */
const HUB_INTERACTIVE_THRESHOLD = 0.85;

/** Per-chip stagger slice: chip `i` starts at `base + i * CHIP_STAGGER`. */
const CHIP_STAGGER = 0.04;

/**
 * Hub layer = session setup. This is the side that FLOWS IN during a
 * home -> hub morph: each block has its own window against the shared
 * `progress` value (0 = fully home, 1 = fully hub) published by
 * `SurfaceMorphContext`.
 *
 * Element windows:
 *   header (back + eyebrow) [0.35, 0.70]  ty -20 -> 0, opacity 0 -> 1
 *   resume card             [0.45, 0.75]  ty +24 -> 0, opacity 0 -> 1
 *   preset title            [0.50, 0.80]  ty +30 -> 0, opacity 0 -> 1
 *   preset chip i           [0.50 + i*0.04, 0.80 + i*0.04]  ty +30 -> 0
 *   preset description      [0.55, 0.82]
 *   player title            [0.60, 0.85]  ty +30 -> 0
 *   player chip i           [0.60 + i*0.04, 0.85 + i*0.04]
 *   options card            [0.65, 0.90]
 *   CTA row (BLE + Deal)    [0.70, 1.00]  ty +20 -> 0; deal-now also scales
 *                                          0.92 -> 1 to "catch" the morphing
 *                                          hero CTA coming in from above.
 *
 * `reduceMotion` on the UI thread SV collapses every window to a plain
 * opacity cross-fade in [0, 1].
 */
export function HubLayer({
  active,
  layerVisible,
  topInset,
  bottomInset,
}: HubLayerProps) {
  const setViewMode = useUiStore((s) => s.setViewMode);
  const { width } = useWindowDimensions();
  const nickname = useProfileStore((s) => s.nickname);
  const avatarSeed = useProfileStore((s) => s.avatarSeed);
  const createSession = useGameStore((s) => s.createSession);
  const events = useGameStore((s) => s.events);
  const sessionActive = events.length > 0;

  const libraryDefaultId = useUserPresetsStore((s) => s.defaultPresetId);
  const userPresets = useUserPresetsStore((s) => s.presets);
  const resolvedBuiltinId = useMemo(
    () => resolvePresetForSession(libraryDefaultId, userPresets),
    [libraryDefaultId, userPresets],
  );

  const [presetId, setPresetId] = React.useState<Preset['id']>(resolvedBuiltinId);

  useEffect(() => {
    setPresetId(resolvedBuiltinId);
  }, [resolvedBuiltinId]);
  const [playerCount, setPlayerCount] = React.useState<PlayerCount>(2);
  const [includeJokers, setIncludeJokers] = React.useState(false);
  const [fanStyle, setFanStyle] = React.useState<FanStyle>('wide');

  const { progress, reduceMotion } = useSurfaceMorph();
  const { reduceMotion: reduceMotionSystem } = useMotion();

  const layerOpacity = useSharedValue(layerVisible ? 1 : 0);
  useEffect(() => {
    const dur = reduceMotionSystem ? motion.duration.fast : motion.duration.layerCross;
    layerOpacity.value = withTiming(layerVisible ? 1 : 0, {
      duration: dur,
      easing: reduceMotionSystem ? undefined : EASING_EMPHASIZED,
    });
  }, [layerVisible, layerOpacity, reduceMotionSystem]);
  const rootStyle = useAnimatedStyle(() => ({ opacity: layerOpacity.value }));

  const [gateOpen, setGateOpen] = useState(
    progress.value >= HUB_INTERACTIVE_THRESHOLD,
  );
  useAnimatedReaction(
    () => progress.value >= HUB_INTERACTIVE_THRESHOLD,
    (open, prev) => {
      if (open !== prev) runOnJS(setGateOpen)(open);
    },
    [],
  );
  const interactive = active && gateOpen;
  const narrowWidth = width < 380;

  const activePreset = useMemo(
    () => builtinPresets.find((p) => p.id === presetId) ?? builtinPresets[0],
    [presetId],
  );

  const handleStart = () => {
    if (sessionActive) {
      const { state, events: ev } = useGameStore.getState();
      if (state.meta.id && ev.length > 0 && state.phase !== 'ended') {
        useSessionHistoryStore.getState().appendEndedSession({
          sessionId: state.meta.id,
          presetId: state.config.presetId ?? 'freeplay',
          eventCount: ev.length,
          playerCount: state.players.length,
        });
      }
    }
    const players = Array.from({ length: playerCount }, (_, idx) => ({
      id: idx === 0 ? 'you' : `p${idx + 1}`,
      name: idx === 0 ? nickname : `Player ${idx + 1}`,
      avatarSeed: idx === 0 ? avatarSeed : `seat-${idx + 1}`,
    }));
    createSession({
      mode: 'pass',
      presetId: activePreset.id,
      players,
      config: { includeJokers, fanStyle },
      hostId: 'you',
    });
    useProfileStore.getState().bumpGamesPlayed();
    setViewMode('table');
  };

  const handleResume = () => setViewMode('table');

  const headerStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (reduceMotion.value === 1) {
      return { opacity: interpolate(p, [0, 1], [0, 1], Extrapolation.CLAMP) };
    }
    return {
      opacity: interpolate(p, [0.35, 0.7], [0, 1], Extrapolation.CLAMP),
      transform: [
        {
          translateY: interpolate(
            p,
            [0.35, 0.7],
            [-20, 0],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  const resumeStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (reduceMotion.value === 1) {
      return { opacity: interpolate(p, [0, 1], [0, 1], Extrapolation.CLAMP) };
    }
    return {
      opacity: interpolate(p, [0.45, 0.75], [0, 1], Extrapolation.CLAMP),
      transform: [
        {
          translateY: interpolate(
            p,
            [0.45, 0.75],
            [24, 0],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  const presetTitleStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (reduceMotion.value === 1) {
      return { opacity: interpolate(p, [0, 1], [0, 1], Extrapolation.CLAMP) };
    }
    return {
      opacity: interpolate(p, [0.5, 0.8], [0, 1], Extrapolation.CLAMP),
      transform: [
        {
          translateY: interpolate(p, [0.5, 0.8], [30, 0], Extrapolation.CLAMP),
        },
      ],
    };
  });

  const presetDescStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (reduceMotion.value === 1) {
      return { opacity: interpolate(p, [0, 1], [0, 1], Extrapolation.CLAMP) };
    }
    return {
      opacity: interpolate(p, [0.55, 0.82], [0, 1], Extrapolation.CLAMP),
    };
  });

  const playerTitleStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (reduceMotion.value === 1) {
      return { opacity: interpolate(p, [0, 1], [0, 1], Extrapolation.CLAMP) };
    }
    return {
      opacity: interpolate(p, [0.6, 0.85], [0, 1], Extrapolation.CLAMP),
      transform: [
        {
          translateY: interpolate(
            p,
            [0.6, 0.85],
            [30, 0],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  const optionsTitleStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (reduceMotion.value === 1) {
      return { opacity: interpolate(p, [0, 1], [0, 1], Extrapolation.CLAMP) };
    }
    return {
      opacity: interpolate(p, [0.65, 0.9], [0, 1], Extrapolation.CLAMP),
      transform: [
        {
          translateY: interpolate(p, [0.65, 0.9], [30, 0], Extrapolation.CLAMP),
        },
      ],
    };
  });

  const optionsCardStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (reduceMotion.value === 1) {
      return { opacity: interpolate(p, [0, 1], [0, 1], Extrapolation.CLAMP) };
    }
    return {
      opacity: interpolate(p, [0.65, 0.9], [0, 1], Extrapolation.CLAMP),
      transform: [
        {
          translateY: interpolate(p, [0.65, 0.9], [30, 0], Extrapolation.CLAMP),
        },
      ],
    };
  });

  const ctaRowStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (reduceMotion.value === 1) {
      return { opacity: interpolate(p, [0, 1], [0, 1], Extrapolation.CLAMP) };
    }
    return {
      opacity: interpolate(p, [0.7, 1.0], [0, 1], Extrapolation.CLAMP),
      transform: [
        {
          translateY: interpolate(p, [0.7, 1.0], [20, 0], Extrapolation.CLAMP),
        },
      ],
    };
  });

  // The primary "Deal now" button catches the hero CTA as it morphs in:
  // an extra scale-up from 0.92 -> 1 over the final slice of the timeline.
  const startCtaStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (reduceMotion.value === 1) return {};
    return {
      transform: [
        { scale: interpolate(p, [0.7, 1.0], [0.92, 1], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents={interactive ? 'auto' : 'none'}
      style={[styles.root, rootStyle]}
    >
      <Animated.View
        style={[
          styles.header,
          { paddingTop: topInset + space.lg },
          headerStyle,
        ]}
      >
        <CardButton
          variant="ghost"
          size="sm"
          elevated={false}
          haptic="light"
          onPress={() => setViewMode('home')}
          style={styles.backChip}
        >
          <ChevronLeft size={18} color={colors.inkMuted} />
          <Text style={styles.backText}>Home</Text>
        </CardButton>
        <Text style={styles.headerEyebrow}>DEAL · PREP</Text>
      </Animated.View>

      <ScrollView
        scrollEnabled={interactive}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: bottomInset + space.x5l },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {sessionActive ? (
          <Animated.View style={resumeStyle}>
            <CardSection variant="ink" tab style={styles.resumeCard}>
              <View style={styles.resumeContent}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resumeEyebrow}>GAME IN PROGRESS</Text>
                  <Text style={styles.resumeTitle}>
                    Pick up where you stopped
                  </Text>
                  <Text style={styles.resumeCopy}>
                    {events.length} events in the log
                  </Text>
                </View>
                <PlayingCard
                  face="down"
                  size="sm"
                  style={{ transform: [{ rotate: '6deg' }] }}
                />
              </View>
              <View style={styles.resumeActions}>
                <CardButton
                  variant="primary"
                  size="md"
                  onPress={handleResume}
                  style={{ flex: 1 }}
                >
                  <Text style={styles.primaryBtnText}>Resume</Text>
                </CardButton>
              </View>
            </CardSection>
          </Animated.View>
        ) : null}

        <Animated.Text style={[styles.sectionTitle, presetTitleStyle]}>
          Pick a preset
        </Animated.Text>
        <View style={styles.presetGrid}>
          {builtinPresets.map((preset, idx) => {
            const selected = preset.id === presetId;
            return (
              <StaggeredChip
                key={preset.id}
                index={idx}
                baseStart={0.5}
                baseEnd={0.8}
                progress={progress}
                reduceMotion={reduceMotion}
              >
                <CardButton
                  variant={selected ? 'primary' : 'secondary'}
                  size="md"
                  elevated={selected}
                  haptic="select"
                  onPress={() => setPresetId(preset.id)}
                  style={styles.presetChip}
                >
                  <Text
                    style={[
                      styles.presetLabel,
                      selected && styles.presetLabelActive,
                    ]}
                  >
                    {preset.name}
                  </Text>
                </CardButton>
              </StaggeredChip>
            );
          })}
        </View>
        <Animated.Text style={[styles.presetDesc, presetDescStyle]}>
          {activePreset.summary}
        </Animated.Text>

        <Animated.Text style={[styles.sectionTitle, playerTitleStyle]}>
          Players at this device
        </Animated.Text>
        <View style={styles.playerRow}>
          {PLAYER_OPTIONS.map((n, idx) => {
            const selected = n === playerCount;
            return (
              <StaggeredChip
                key={n}
                index={idx}
                baseStart={0.6}
                baseEnd={0.85}
                progress={progress}
                reduceMotion={reduceMotion}
              >
                <CardButton
                  variant={selected ? 'primary' : 'secondary'}
                  size="sm"
                  elevated={selected}
                  haptic="select"
                  onPress={() => setPlayerCount(n)}
                  style={styles.playerChip}
                >
                  <Text
                    style={[
                      styles.playerLabel,
                      selected && styles.playerLabelActive,
                    ]}
                  >
                    {n}
                  </Text>
                </CardButton>
              </StaggeredChip>
            );
          })}
        </View>

        <Animated.Text style={[styles.sectionTitle, optionsTitleStyle]}>
          Options
        </Animated.Text>
        <Animated.View style={optionsCardStyle}>
          <CardSection variant="surface" style={styles.optionCard}>
            <View style={styles.optionRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionLabel}>Include jokers</Text>
                <Text style={styles.optionHint}>54-card deck</Text>
              </View>
              <CardButton
                variant={includeJokers ? 'primary' : 'ghost'}
                size="sm"
                elevated={false}
                haptic="select"
                onPress={() => setIncludeJokers((v) => !v)}
                style={styles.toggleChip}
              >
                <Text
                  style={[
                    styles.toggleText,
                    includeJokers && styles.toggleTextActive,
                  ]}
                >
                  {includeJokers ? 'ON' : 'OFF'}
                </Text>
              </CardButton>
            </View>

            <View style={[styles.optionRow, styles.optionRowDivider]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionLabel}>Hand layout</Text>
                <Text style={styles.optionHint}>Fan arc, tight fan, or stacked deck</Text>
              </View>
              <View style={styles.fanChipRow}>
                {(['wide', 'tight', 'stacked'] as const).map((f) => {
                  const selected = fanStyle === f;
                  return (
                    <CardButton
                      key={f}
                      variant={selected ? 'primary' : 'ghost'}
                      size="sm"
                      elevated={false}
                      haptic="select"
                      onPress={() => setFanStyle(f)}
                      style={styles.fanChip}
                    >
                      <Text
                        style={[
                          styles.fanChipText,
                          selected && styles.toggleTextActive,
                        ]}
                      >
                        {f === 'wide' ? 'Wide' : f === 'tight' ? 'Tight' : 'Stack'}
                      </Text>
                    </CardButton>
                  );
                })}
              </View>
            </View>
          </CardSection>
        </Animated.View>

        <Animated.View style={[styles.ctaRow, narrowWidth && styles.ctaRowNarrow, ctaRowStyle]}>
          <CardButton
            variant="ghost"
            size="md"
            elevated={false}
            haptic="light"
            onPress={() => setViewMode('lobby')}
            style={narrowWidth ? { ...styles.bleChip, ...styles.bleChipNarrow } : styles.bleChip}
          >
            <Radio size={16} color={colors.inkMuted} />
            <Text style={styles.bleChipText}>Invite nearby</Text>
          </CardButton>

          <Animated.View style={[styles.startCtaWrap, narrowWidth && styles.startCtaWrapNarrow, startCtaStyle]}>
            <CardButton
              variant="primary"
              size="lg"
              elevated
              haptic="medium"
              onPress={handleStart}
              style={styles.startCta}
            >
              <Users size={18} color={colors.surface} />
              <Text style={styles.startCtaText}>
                {sessionActive ? 'Start new' : 'Deal now'}
              </Text>
            </CardButton>
          </Animated.View>
        </Animated.View>
      </ScrollView>
    </Animated.View>
  );
}

/**
 * Wraps each chip in a dedicated `Animated.View` so it can compose a
 * stagger-offset window with the shared timeline without nesting hooks inside
 * a `.map`. Chip `i` starts `i * CHIP_STAGGER` later than its row base so the
 * row flows in left-to-right rather than snapping in as a block.
 */
function StaggeredChip({
  index,
  baseStart,
  baseEnd,
  progress,
  reduceMotion,
  children,
}: {
  index: number;
  baseStart: number;
  baseEnd: number;
  progress: SharedValue<number>;
  reduceMotion: SharedValue<number>;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    if (reduceMotion.value === 1) {
      return { opacity: interpolate(p, [0, 1], [0, 1], Extrapolation.CLAMP) };
    }
    // Stagger window clamped to <= 1 so late chips still finish inside the
    // overall timeline.
    const start = Math.min(baseStart + index * CHIP_STAGGER, 0.95);
    const end = Math.min(baseEnd + index * CHIP_STAGGER, 0.99);
    return {
      opacity: interpolate(p, [start, end], [0, 1], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(p, [start, end], [30, 0], Extrapolation.CLAMP) },
      ],
    };
  });

  return <Animated.View style={style}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.xl,
    gap: space.md,
    marginBottom: space.lg,
  },
  backChip: {
    paddingHorizontal: space.md,
  },
  backText: {
    marginLeft: 4,
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: colors.inkMuted,
  },
  headerEyebrow: {
    marginLeft: 'auto',
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.caps,
  },
  scroll: {
    paddingHorizontal: space.xl,
  },
  resumeCard: {
    marginBottom: space.xxl,
  },
  resumeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    marginBottom: space.lg,
  },
  resumeEyebrow: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: alpha.whiteOverlay80,
    letterSpacing: letterSpacing.caps,
    marginBottom: space.xs,
  },
  resumeTitle: {
    fontSize: 20,
    fontFamily: fonts.extra,
    color: colors.surface,
    letterSpacing: letterSpacing.tight,
  },
  resumeCopy: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: alpha.whiteOverlay80,
    marginTop: 2,
  },
  resumeActions: {
    flexDirection: 'row',
  },
  primaryBtnText: {
    color: colors.surface,
    fontSize: 15,
    fontFamily: fonts.bold,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: colors.ink,
    marginBottom: space.md,
    marginTop: space.lg,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  presetChip: {
    paddingHorizontal: space.lg,
  },
  presetLabel: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: colors.ink,
  },
  presetLabelActive: {
    color: colors.surface,
  },
  presetDesc: {
    marginTop: space.md,
    fontSize: 13,
    lineHeight: 20,
    color: colors.inkMuted,
    fontFamily: fonts.regular,
  },
  playerRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  playerChip: {
    width: 48,
  },
  playerLabel: {
    fontSize: 16,
    fontFamily: fonts.extra,
    color: colors.ink,
  },
  playerLabelActive: {
    color: colors.surface,
  },
  optionCard: {
    padding: space.lg,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  optionLabel: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: colors.ink,
  },
  optionHint: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.inkMuted,
  },
  toggleChip: {
    minWidth: 56,
  },
  toggleText: {
    fontSize: 11,
    fontFamily: fonts.extra,
    color: colors.inkMuted,
    letterSpacing: letterSpacing.cap,
  },
  toggleTextActive: {
    color: colors.surface,
  },
  optionRowDivider: {
    marginTop: space.lg,
    paddingTop: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    alignItems: 'flex-start',
  },
  fanChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    justifyContent: 'flex-end',
  },
  fanChip: {
    minWidth: 52,
    paddingHorizontal: space.xs,
  },
  fanChipText: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.inkMuted,
    letterSpacing: letterSpacing.cap,
  },
  ctaRow: {
    marginTop: space.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  ctaRowNarrow: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  bleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderRadius: radii.lg,
  },
  bleChipText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.inkMuted,
  },
  bleChipNarrow: {
    width: '100%',
  },
  startCtaWrap: {
    flex: 1,
  },
  startCtaWrapNarrow: {
    flex: 0,
    width: '100%',
  },
  startCta: {
    flex: 1,
    flexDirection: 'row',
    gap: space.sm,
    ...shadow.cta,
  },
  startCtaText: {
    color: colors.surface,
    fontSize: 16,
    fontFamily: fonts.extra,
    letterSpacing: letterSpacing.cap,
  },
});

export default HubLayer;
