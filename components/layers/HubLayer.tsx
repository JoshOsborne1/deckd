import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
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
import { ChevronLeft, Users } from 'lucide-react-native';
import { CardButton } from '@components/CardButton';
import { CardSection } from '@components/CardSection';
import { TableSurface } from '@components/TableSurface';
import { PlayingCard } from '@components/PlayingCard';
import { GLOBAL_NAV_HEIGHT } from '@components/GlobalNavBar';

import { useSurfaceMorph } from '@components/layers/SurfaceMorphContext';
import { useMotion } from '@hooks/useMotion';
import { useUiStore } from '@store/uiStore';
import { useGameStore } from '@store/gameStore';
import { useLobbyStore } from '@store/lobbyStore';
import { useProfileStore } from '@store/profileStore';
import { builtinPresets, type Preset } from '@engine/index';
import type { FanStyle } from '@engine/types';
import { PRESET_BACKS } from '@lib/presetAssets';
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

type PlayerCount = 1 | 2 | 3 | 4 | 5 | 6;
const PLAYER_OPTIONS: PlayerCount[] = [1, 2, 3, 4, 5, 6];

const PRESET_OUTCOMES: Record<Preset['id'], string> = {
  freeplay: 'Deal, draw, and flip freely',
  'deal-two-each': 'Two face-down cards each',
  war: 'Flip high, collect the battle',
  'go-fish': 'Ask for ranks, collect books of four',
  'old-maid': 'Pair up, then draw for the maid',
  'crazy-eights': 'Match suit or rank · eights are wild',
  sevens: 'Open with sevens, build the runs',
  blackjack: 'Dealer hand + scoring helper',
  poker: 'Hole cards, then community play',
};

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
 *   CTA row (Host + Deal)   [0.70, 1.00]  ty +20 -> 0; deal-now also scales
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
  const nickname = useProfileStore((s) => s.nickname);
  const avatarSeed = useProfileStore((s) => s.avatarSeed);
  const createSession = useGameStore((s) => s.createSession);
  const events = useGameStore((s) => s.events);
  const sessionActive = events.length > 0;

  const lobbyStatus = useLobbyStore((s) => s.status);
  const lobbyPlayers = useLobbyStore((s) => s.players);
  const localClientId = useLobbyStore((s) => s.localClientId);
  const lobbySession = useLobbyStore((s) => s.session);
  /** Online host: a connected relay session with at least one guest. */
  const isOnlineHost =
    lobbySession?.role === 'host' && lobbyStatus === 'connected';

  const libraryDefaultId = useUserPresetsStore((s) => s.defaultPresetId);
  const userPresets = useUserPresetsStore((s) => s.presets);
  const resolvedBuiltinId = useMemo(
    () => resolvePresetForSession(libraryDefaultId, userPresets),
    [libraryDefaultId, userPresets],
  );

  const [presetId, setPresetId] = React.useState<Preset['id']>(resolvedBuiltinId);
  const [prevResolvedBuiltinId, setPrevResolvedBuiltinId] = React.useState(resolvedBuiltinId);
  if (prevResolvedBuiltinId !== resolvedBuiltinId) {
    setPrevResolvedBuiltinId(resolvedBuiltinId);
    setPresetId(resolvedBuiltinId);
  }
  const [playerCount, setPlayerCount] = React.useState<PlayerCount>(2);
  const [includeJokers, setIncludeJokers] = React.useState(false);
  const [fanStyle, setFanStyle] = React.useState<FanStyle>('wide');
  const [autoReshuffle, setAutoReshuffle] = React.useState(true);

  const { progress, reduceMotion } = useSurfaceMorph();
  const { reduceMotion: reduceMotionSystem } = useMotion();

  // The local setup stock belongs to the hub, not to Home. Fade it in with
  // the same morph so the home chrome keeps its intended contrast while the
  // setup surface still lands as one continuous table at the end of the turn.
  const setupSurfaceStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [0.15, 0.85],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

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

  const activePreset = useMemo(
    () => builtinPresets.find((p) => p.id === presetId) ?? builtinPresets[0],
    [presetId],
  );

  const handlePresetSelect = (nextPreset: Preset) => {
    setPresetId(nextPreset.id);
    setPlayerCount((current) => {
      const min = Math.max(1, nextPreset.minPlayers);
      const max = Math.min(6, nextPreset.maxPlayers);
      return Math.max(min, Math.min(max, current)) as PlayerCount;
    });
  };

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

    // Online host: create the session from the relay roster so each guest's
    // clientId is their game playerId. The bridge broadcasts the session
    // start + deal events to all guests.
    if (isOnlineHost && lobbyPlayers.length >= 2) {
      const players = lobbyPlayers.map((p) => ({
        id: p.clientId,
        name: p.nickname,
        avatarSeed: p.clientId,
      }));
      createSession({
        mode: 'online-host',
        presetId: activePreset.id,
        players,
        config: { includeJokers, fanStyle, autoReshuffleDiscard: autoReshuffle },
        hostId: localClientId,
      });
      useProfileStore.getState().bumpGamesPlayed();
      setViewMode('table');
      return;
    }

    // Pass-and-play: local players on one device. Solo (1 player) is
    // blackjack against the virtual house.
    const players = Array.from({ length: playerCount }, (_, idx) => ({
      id: idx === 0 ? 'you' : `p${idx + 1}`,
      name: idx === 0 ? nickname : `Player ${idx + 1}`,
      avatarSeed: idx === 0 ? avatarSeed : `seat-${idx + 1}`,
    }));
    createSession({
      mode: playerCount === 1 ? 'solo' : 'pass',
      presetId: activePreset.id,
      players,
      config: { includeJokers, fanStyle, autoReshuffleDiscard: autoReshuffle },
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
      style={[styles.root, { bottom: bottomInset }, rootStyle]}
    >
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, setupSurfaceStyle]}
      >
        <TableSurface mode="setup" />
      </Animated.View>
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
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: space.x5l },
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

        <Animated.View style={[styles.tableMarker, presetTitleStyle]}>
          <View style={styles.markerRule} />
          <View style={styles.markerCopy}>
            <Text style={styles.markerEyebrow}>DEAL PREP</Text>
            <Text style={styles.markerValue}>
              {playerCount} PLAYERS · {activePreset.id === 'old-maid' ? '53' : includeJokers ? '54' : '52'} CARD DECK
            </Text>
          </View>
          <View style={styles.markerRule} />
        </Animated.View>

        <Animated.View style={[styles.recipeHeading, presetTitleStyle]}>
          <View style={styles.recipeHeadingCopy}>
            <Text style={styles.sectionTitle}>Choose a recipe</Text>
            <Text style={styles.sectionKicker}>Flip a deck to preview the deal</Text>
          </View>
          <Text style={styles.recipeIndex}>0{builtinPresets.length}</Text>
        </Animated.View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.recipeRail}
          style={styles.presetRailScroll}
        >
          {builtinPresets.map((preset, idx) => {
            const selected = preset.id === presetId;
            return (
              <RecipeCard
                key={preset.id}
                preset={preset}
                index={idx}
                selected={selected}
                back={PRESET_BACKS[preset.id] ?? 'back-brand'}
                oneLiner={PRESET_OUTCOMES[preset.id] ?? preset.recipe.oneLiner}
                playerRange={`${preset.minPlayers}–${Math.min(preset.maxPlayers, 6)} players`}
                progress={progress}
                reduceMotion={reduceMotion}
                reduceMotionSystem={reduceMotionSystem}
                onPress={() => handlePresetSelect(preset)}
              />
            );
          })}
        </ScrollView>
        <Animated.View style={[styles.selectedRecipeNote, presetDescStyle]}>
          <View style={styles.selectedRecipeMark} />
          <Text style={styles.presetDesc}>{activePreset.summary}</Text>
        </Animated.View>

        <Animated.View style={[styles.playerHeading, playerTitleStyle]}>
          <View>
            <Text style={styles.sectionTitle}>Who’s at the table?</Text>
            <Text style={styles.sectionKicker}>
              {playerCount === 1
                ? 'Solo blackjack against the house'
                : activePreset.id === 'go-fish'
                  ? 'Ask a rank, then keep fishing when you hit'
                  : activePreset.id === 'old-maid'
                    ? 'Lay down pairs before you draw'
                : `Pass the deck between ${playerCount} people`}
            </Text>
          </View>
        </Animated.View>
        <View style={styles.playerRow}>
          {PLAYER_OPTIONS.map((n, idx) => {
            const selected = n === playerCount;
            // Solo is a blackjack-only mode: the house is the dealer.
            const soloDisabled = n === 1 && activePreset.id !== 'blackjack';
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
                  variant={selected ? 'primary' : 'ghost'}
                  size="sm"
                  elevated={false}
                  haptic="select"
                  disabled={soloDisabled}
                  onPress={() => {
                    if (n === 1) setPresetId('blackjack');
                    setPlayerCount(n);
                  }}
                  style={{
                    ...styles.playerChip,
                    ...(selected ? styles.playerChipActive : {}),
                    ...(soloDisabled ? styles.playerChipDisabled : {}),
                  }}
                >
                  <Text style={[styles.playerLabel, selected && styles.playerLabelActive]}>
                    {n}
                  </Text>
                </CardButton>
              </StaggeredChip>
            );
          })}
        </View>

        <Animated.View style={[styles.optionsHeading, optionsTitleStyle]}>
          <View>
            <Text style={styles.sectionTitle}>Table tokens</Text>
            <Text style={styles.sectionKicker}>Turn a token to change the deal</Text>
          </View>
        </Animated.View>
        <Animated.View style={optionsCardStyle}>
          <View style={styles.tokenGrid}>
            <OptionToken
              label="Jokers"
              detail={includeJokers ? '54 cards' : '52 cards'}
              selected={includeJokers}
              onPress={() => setIncludeJokers((v) => !v)}
            />
            <OptionToken
              label="Wide fan"
              detail="hand layout"
              selected={fanStyle === 'wide'}
              onPress={() => setFanStyle('wide')}
            />
            <OptionToken
              label="Tight fan"
              detail="hand layout"
              selected={fanStyle === 'tight'}
              onPress={() => setFanStyle('tight')}
            />
            <OptionToken
              label="Stack"
              detail="hand layout"
              selected={fanStyle === 'stacked'}
              onPress={() => setFanStyle('stacked')}
            />
            <OptionToken
              label="Reshuffle"
              detail={autoReshuffle ? 'when empty' : 'manual'}
              selected={autoReshuffle}
              onPress={() => setAutoReshuffle((v) => !v)}
            />
          </View>
        </Animated.View>

        {/* RN Web does not always materialize ScrollView padding as scrollable
            content; keep a real spacer so the CTA can clear the card rail. */}
        <View style={styles.scrollReserve} />
      </ScrollView>

      {/* Keep the next physical move visible while the setup notes scroll. This
          is a table-edge action strip, not a second page or floating card. */}
      <Animated.View style={[styles.ctaDock, ctaRowStyle]}>
        <View style={styles.ctaRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Host a lobby"
            onPress={() => setViewMode('lobby')}
            style={({ pressed }) => [styles.hostChip, pressed && styles.hostChipPressed]}
          >
            <View style={styles.hostChipIcon}>
              <Users size={15} color={colors.inkMuted} />
            </View>
            <View>
              <Text style={styles.hostChipEyebrow}>FRIENDS</Text>
              <Text style={styles.hostChipText}>Host a lobby</Text>
            </View>
          </Pressable>

          <Animated.View style={[styles.startCtaWrap, startCtaStyle]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={sessionActive ? 'Start a new table' : 'Deal now'}
              onPress={handleStart}
              style={({ pressed }) => [styles.dealDeckButton, pressed && styles.dealDeckButtonPressed]}
            >
              <View style={styles.dealDeckObject} pointerEvents="none">
                <PlayingCard face="down" size="xs" style={styles.dealDeckBack} overlapped />
                <PlayingCard
                  face="up"
                  rank="A"
                  suit="hearts"
                  size="xs"
                  style={styles.dealDeckFront}
                  overlapped
                />
              </View>
              <View style={styles.dealDeckCopy}>
                <Text style={styles.dealDeckEyebrow}>DEAL NOW</Text>
                <Text style={styles.dealDeckText}>{sessionActive ? 'New table' : 'Drop into play'}</Text>
              </View>
            </Pressable>
          </Animated.View>
        </View>
      </Animated.View>
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
  wrapperStyle,
  children,
}: {
  index: number;
  baseStart: number;
  baseEnd: number;
  progress: SharedValue<number>;
  reduceMotion: SharedValue<number>;
  wrapperStyle?: ViewStyle;
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

  return <Animated.View style={[wrapperStyle, style]}>{children}</Animated.View>;
}

function RecipeCard({
  preset,
  index,
  selected,
  back,
  oneLiner,
  playerRange,
  progress,
  reduceMotion,
  reduceMotionSystem,
  onPress,
}: {
  preset: Preset;
  index: number;
  selected: boolean;
  back: string;
  oneLiner: string;
  playerRange: string;
  progress: SharedValue<number>;
  reduceMotion: SharedValue<number>;
  reduceMotionSystem: boolean;
  onPress: () => void;
}) {
  const flip = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    flip.value = withTiming(selected ? 1 : 0, {
      duration: reduceMotionSystem ? 0 : motion.duration.slow,
    });
  }, [flip, reduceMotionSystem, selected]);

  const staggerStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (reduceMotion.value === 1) {
      return { opacity: interpolate(p, [0.5, 1], [0, 1], Extrapolation.CLAMP) };
    }
    const start = Math.min(0.5 + index * CHIP_STAGGER, 0.9);
    const end = Math.min(0.78 + index * CHIP_STAGGER, 0.99);
    return {
      opacity: interpolate(p, [start, end], [0, 1], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(p, [start, end], [28, 0], Extrapolation.CLAMP) },
      ],
    };
  });

  const frontStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 800 },
      { rotateY: `${interpolate(flip.value, [0, 1], [180, 0])}deg` },
    ],
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 800 },
      { rotateY: `${interpolate(flip.value, [0, 1], [0, -180])}deg` },
    ],
  }));

  const rotation = selected ? '0deg' : `${[-6, -2, 2, 6][index] ?? 0}deg`;

  return (
    <Animated.View style={[styles.recipeStagger, { zIndex: selected ? 20 : index }, staggerStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${preset.name}. ${oneLiner}. ${playerRange}`}
        accessibilityState={{ selected }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.recipeCardSlot,
          { transform: [{ rotate: rotation }, ...(pressed ? [{ scale: 0.98 }] : [])] },
        ]}
      >
        <Animated.View style={[styles.recipeCardFace, styles.recipeCardBack, backStyle]}>
          <PlayingCard face="down" back={back} size="lg" overlapped />
        </Animated.View>
        <Animated.View style={[styles.recipeCardFace, styles.recipeCardFront, frontStyle]}>
          <View style={styles.recipeFrontInner}>
            <Text style={styles.recipeEyebrow}>RECIPE</Text>
            <Text numberOfLines={2} style={styles.recipeTitle}>{preset.name}</Text>
            <Text numberOfLines={3} style={styles.recipeSummary}>{oneLiner}</Text>
            <View style={styles.recipeFooter}>
              <Text style={styles.recipeRange}>{playerRange}</Text>
              <Text style={styles.recipeFlipMark}>READY</Text>
            </View>
          </View>
        </Animated.View>
      </Pressable>
      <Text numberOfLines={1} style={[styles.recipeName, selected && styles.recipeNameActive]}>
        {preset.name}
      </Text>
    </Animated.View>
  );
}

function OptionToken({
  label,
  detail,
  selected,
  onPress,
}: {
  label: string;
  detail: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${detail}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionToken,
        selected && styles.optionTokenActive,
        pressed && styles.optionTokenPressed,
      ]}
    >
      <View style={[styles.optionTokenDot, selected && styles.optionTokenDotActive]} />
      <Text numberOfLines={1} style={[styles.optionTokenLabel, selected && styles.optionTokenLabelActive]}>
        {label}
      </Text>
      <Text numberOfLines={1} style={[styles.optionTokenDetail, selected && styles.optionTokenDetailActive]}>
        {detail}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
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
  scrollView: {
    flex: 1,
  },
  scrollReserve: {
    height: GLOBAL_NAV_HEIGHT + space.xl,
  },
  tableMarker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.sm,
    marginBottom: space.sm,
  },
  markerRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: alpha.brand20,
  },
  markerCopy: {
    alignItems: 'center',
  },
  markerEyebrow: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: letterSpacing.caps,
  },
  markerValue: {
    marginTop: 2,
    fontSize: 10,
    fontFamily: fonts.semibold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.cap,
  },
  stageCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 124,
    marginTop: space.sm,
    marginBottom: space.lg,
    padding: space.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: alpha.brand20,
    borderRadius: radii.card,
    ...shadow.card,
  },
  stageCopy: {
    flex: 1,
    justifyContent: 'center',
    paddingRight: space.sm,
  },
  stageEyebrow: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: letterSpacing.caps,
  },
  stageTitle: {
    marginTop: space.xs,
    fontSize: 21,
    lineHeight: 25,
    fontFamily: fonts.extra,
    color: colors.ink,
    letterSpacing: letterSpacing.tight,
  },
  stageMeta: {
    marginTop: 3,
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: colors.inkMuted,
  },
  stageOutcome: {
    marginTop: space.sm,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: fonts.regular,
    color: colors.inkSubtle,
  },
  stagePile: {
    width: 78,
    minHeight: 94,
    position: 'relative',
  },
  stageBackCard: {
    position: 'absolute',
    top: 8,
    right: 0,
    transform: [{ rotate: '8deg' }],
  },
  stageFrontCard: {
    position: 'absolute',
    top: 0,
    left: 0,
    transform: [{ rotate: '-7deg' }],
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  recipeHeading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  recipeHeadingCopy: {
    flex: 1,
  },
  recipeIndex: {
    marginBottom: space.md,
    fontSize: 11,
    fontFamily: fonts.extra,
    color: colors.brand,
    letterSpacing: letterSpacing.cap,
  },
  sectionKicker: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.cap,
    textTransform: 'uppercase',
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    width: '100%',
    alignSelf: 'stretch',
  },
  presetStagger: {
    width: 154,
    minWidth: 0,
  },
  presetChip: {
    width: '100%',
    minHeight: 78,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  presetRailScroll: {
    marginHorizontal: -space.xl,
  },
  recipeRail: {
    paddingHorizontal: space.xl,
    paddingTop: space.xs,
    paddingBottom: space.xs,
    gap: 0,
  },
  recipeStagger: {
    width: 124,
    marginRight: -14,
    alignItems: 'center',
  },
  recipeCardSlot: {
    width: 124,
    height: 174,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipeCardFace: {
    position: 'absolute',
    width: 124,
    height: 174,
    alignItems: 'center',
    justifyContent: 'center',
    backfaceVisibility: 'hidden',
  },
  recipeCardBack: {
    zIndex: 1,
  },
  recipeCardFront: {
    zIndex: 2,
    overflow: 'hidden',
    borderRadius: radii.card,
    backgroundColor: colors.cardPaper,
    borderWidth: 1,
    borderColor: colors.cardEdge,
    ...shadow.cardStrong,
  },
  recipeFrontInner: {
    flex: 1,
    width: '100%',
    padding: space.md,
    justifyContent: 'space-between',
  },
  recipeEyebrow: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: letterSpacing.caps,
  },
  recipeTitle: {
    marginTop: space.xs,
    fontSize: 17,
    lineHeight: 19,
    fontFamily: fonts.extra,
    color: colors.ink,
    letterSpacing: letterSpacing.tight,
  },
  recipeSummary: {
    marginTop: space.sm,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: fonts.regular,
    color: colors.inkMuted,
  },
  recipeFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.xs,
  },
  recipeRange: {
    flex: 1,
    fontSize: 10,
    fontFamily: fonts.semibold,
    color: colors.inkSubtle,
  },
  recipeFlipMark: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: letterSpacing.cap,
  },
  recipeName: {
    maxWidth: 116,
    marginTop: space.xs,
    fontSize: 10,
    fontFamily: fonts.semibold,
    color: colors.inkSubtle,
    textAlign: 'center',
  },
  recipeNameActive: {
    color: colors.ink,
    fontFamily: fonts.bold,
  },
  presetChipInner: {
    flex: 1,
    alignItems: 'stretch',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  presetChipContent: {
    width: '100%',
    gap: space.sm,
  },
  presetChipHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  presetMark: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: alpha.brand45,
  },
  presetMarkActive: {
    backgroundColor: colors.surface,
  },
  presetLabel: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: colors.ink,
  },
  presetLabelActive: {
    color: colors.surface,
  },
  presetOutcome: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: fonts.regular,
    color: colors.inkMuted,
  },
  presetOutcomeActive: {
    color: alpha.whiteOverlay80,
  },
  presetDesc: {
    flex: 1,
    marginLeft: space.sm,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkMuted,
    fontFamily: fonts.regular,
  },
  selectedRecipeNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: space.md,
    paddingBottom: space.xs,
  },
  selectedRecipeMark: {
    width: 4,
    height: 22,
    marginTop: 2,
    borderRadius: 2,
    backgroundColor: colors.brand,
  },
  playerHeading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  playerRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  playerChip: {
    width: 48,
  },
  playerChipActive: {
    ...shadow.card,
  },
  playerChipDisabled: {
    opacity: 0.35,
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
    backgroundColor: alpha.inkOverlay02,
    borderColor: alpha.brand20,
  },
  optionsHeading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  tokenGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    padding: space.sm,
    backgroundColor: alpha.inkOverlay02,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.brand20,
  },
  optionToken: {
    flexGrow: 1,
    flexBasis: '29%',
    minWidth: 90,
    minHeight: 58,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionTokenActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  optionTokenPressed: {
    transform: [{ scale: 0.97 }],
  },
  optionTokenDot: {
    width: 7,
    height: 7,
    marginBottom: 5,
    borderRadius: 4,
    backgroundColor: alpha.brand45,
  },
  optionTokenDotActive: {
    backgroundColor: colors.surface,
  },
  optionTokenLabel: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: colors.ink,
  },
  optionTokenLabelActive: {
    color: colors.surface,
  },
  optionTokenDetail: {
    marginTop: 2,
    fontSize: 9,
    fontFamily: fonts.regular,
    color: colors.inkSubtle,
  },
  optionTokenDetailActive: {
    color: alpha.whiteOverlay80,
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
  handLayoutRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: space.sm,
  },
  fanChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    justifyContent: 'flex-end',
  },
  handLayoutChipRow: {
    justifyContent: 'flex-start',
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    width: '100%',
  },
  ctaDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 4,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    backgroundColor: colors.surfaceAlt,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: alpha.brand20,
  },
  hostChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 64,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  hostChipPressed: {
    backgroundColor: alpha.inkOverlay06,
    transform: [{ scale: 0.98 }],
  },
  hostChipIcon: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: alpha.inkOverlay06,
  },
  hostChipEyebrow: {
    fontSize: 8,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.caps,
  },
  hostChipText: {
    marginTop: 2,
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: colors.inkMuted,
  },
  startCtaWrap: {
    flex: 1,
  },
  startCta: {
    flex: 1,
    flexDirection: 'row',
    gap: space.sm,
    ...shadow.cta,
  },
  dealDeckButton: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radii.card,
    backgroundColor: colors.brand,
    ...shadow.cta,
  },
  dealDeckButtonPressed: {
    transform: [{ translateY: 1 }, { scale: 0.98 }],
  },
  dealDeckObject: {
    width: 42,
    height: 58,
    position: 'relative',
  },
  dealDeckBack: {
    position: 'absolute',
    top: 3,
    left: 4,
    transform: [{ rotate: '9deg' }],
  },
  dealDeckFront: {
    position: 'absolute',
    top: 0,
    left: 0,
    transform: [{ rotate: '-8deg' }],
  },
  dealDeckCopy: {
    flex: 1,
  },
  dealDeckEyebrow: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: alpha.whiteOverlay80,
    letterSpacing: letterSpacing.caps,
  },
  dealDeckText: {
    marginTop: 3,
    fontSize: 16,
    fontFamily: fonts.extra,
    color: colors.surface,
    letterSpacing: letterSpacing.tight,
  },
  startCtaText: {
    color: colors.surface,
    fontSize: 16,
    fontFamily: fonts.extra,
    letterSpacing: letterSpacing.cap,
  },
});

export default HubLayer;
