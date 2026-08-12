import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Layers, ShoppingBag, User } from 'lucide-react-native';
import Animated, {
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { PlayingCard } from '@components/PlayingCard';
import { useMotion } from '@hooks/useMotion';
import { useUiStore } from '@store/uiStore';
import { alpha, colors, fonts, motion, space } from '@theme';

type NavIcon = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

type NavConfig = {
  id: string;
  href: Href;
  label: string;
  icon?: NavIcon;
};

/** Vertical space reserved by the persistent table-edge rail in the game surface. */
export const NAV_BAR_RESERVE = 92;

const navItems: NavConfig[] = [
  { id: 'home', href: '/', label: 'Home', icon: Home },
  { id: 'store', href: '/store', label: 'Store', icon: ShoppingBag },
  { id: 'games', href: '/list', label: 'Presets', icon: Layers },
  { id: 'profile', href: '/profile', label: 'Profile', icon: User },
];

/** Backwards-compatible name used by layered surfaces. */
export const GLOBAL_NAV_HEIGHT = NAV_BAR_RESERVE;

/** Chips deal in from the edge one by one with this stagger between neighbours. */
const CHIP_STAGGER_MS = 40;
/** Active chip raises this far above the felt. */
const CHIP_RAISE = 4;

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/' || pathname === '/index';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Nav v3 (directive 13): chips on the table edge. There is no nav bar — the
 * bottom of the screen is the table's physical edge (a thin felt lip) and the
 * four destinations are flat cylinder chips sitting on it. Deal is not a nav
 * item: it is the deck object (a small stack of card backs) sitting on the
 * table, center-bottom above the edge.
 */
export const GlobalNavBar: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const insets = useSafeAreaInsets();
  const { haptic, reduceMotion } = useMotion();
  const bottomPad = Math.max(insets.bottom, 14);
  const viewMode = useUiStore((s) => s.viewMode);
  const setViewMode = useUiStore((s) => s.setViewMode);
  const onRoot = pathname === '/' || pathname === '/index';

  // --- Felt-sweep screen transition -------------------------------------
  // A tablecloth of felt rises over the current screen, a card back flips
  // in at its centre, then the felt lifts to reveal the destination. The
  // whole sweep is ~430ms; the router push happens at the felt's peak so
  // the swap is hidden behind the cloth.
  const [transition, setTransition] = useState<{ href: Href; label: string } | null>(null);
  const sweep = useSharedValue(0);
  const cardFlip = useSharedValue(0);
  const pendingHref = useRef<Href | null>(null);
  const pendingLabel = useRef('');

  const runTransition = (href: Href, label: string) => {
    if (reduceMotion) {
      router.push(href);
      return;
    }
    pendingHref.current = href;
    pendingLabel.current = label;
    setTransition({ href, label });
    sweep.value = 0;
    cardFlip.value = 0;
    sweep.value = withTiming(1, { duration: 210 }, (finished) => {
      if (!finished) return;
      const target = pendingHref.current;
      if (target) router.push(target);
      cardFlip.value = withSequence(
        withTiming(1, { duration: 90 }),
        withTiming(0, { duration: 90 }),
      );
      sweep.value = withTiming(0, { duration: 220 }, (done) => {
        if (done) setTransition(null);
      });
    });
  };

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: `${interpolate(sweep.value, [0, 1], [100, 0])}%` }],
  }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: interpolate(cardFlip.value, [0, 0.5, 1], [0, 1, 0]),
    transform: [
      { perspective: 800 },
      { rotateY: `${interpolate(cardFlip.value, [0, 1], [-90, 90])}deg` },
      { scale: interpolate(cardFlip.value, [0, 0.5, 1], [0.7, 1, 0.7]) },
    ],
  }));

  const go = (href: Href) => {
    const s = String(href);
    if (s === '/') {
      setViewMode('home');
      if (onRoot) {
        return;
      }
      runTransition('/', 'Home');
      return;
    }
    if (s === pathname) return;
    const item = navItems.find((n) => String(n.href) === s);
    runTransition(href, item?.label ?? '');
  };

  const onDeal = () => {
    haptic('medium');
    if (!onRoot) {
      runTransition('/', 'Deal');
    }
    setViewMode('hub');
  };

  return (
    <View pointerEvents="box-none" style={styles.wrapper}>
      {transition && (
        <Animated.View pointerEvents="none" style={[styles.sweepOverlay, sweepStyle]}>
          <Animated.View style={[styles.sweepCard, cardStyle]}>
            <PlayingCard face="down" back="back-crimson" size="lg" elevated />
          </Animated.View>
          <Text style={styles.sweepLabel}>{transition.label}</Text>
        </Animated.View>
      )}
      <View style={[styles.rail, { paddingBottom: bottomPad }]}>
        <View pointerEvents="none" style={[styles.edgeLip, { bottom: bottomPad + 8 }]} />
        <View style={styles.row}>
          {navItems.slice(0, 2).map((item, index) => (
            <NavChip
              key={item.id}
              item={item}
              index={index}
              reduceMotion={reduceMotion}
              pathname={pathname}
              haptic={haptic}
              activeOverride={item.id === 'home' ? (onRoot && viewMode === 'home') : undefined}
              onPress={() => go(item.href)}
            />
          ))}

          <DealButton reduceMotion={reduceMotion} onPress={onDeal} />

          {navItems.slice(2).map((item, index) => (
            <NavChip
              key={item.id}
              item={item}
              index={index + 2}
              reduceMotion={reduceMotion}
              pathname={pathname}
              haptic={haptic}
              activeOverride={item.id === 'home' ? (onRoot && viewMode === 'home') : undefined}
              onPress={() => go(item.href)}
            />
          ))}
        </View>
      </View>
    </View>
  );
};

function NavChip({
  item,
  index,
  pathname,
  activeOverride,
  onPress,
  reduceMotion,
  haptic,
}: {
  item: NavConfig;
  index: number;
  pathname: string;
  activeOverride?: boolean;
  onPress: () => void;
  reduceMotion: boolean;
  haptic: () => void;
}) {
  const active = activeOverride ?? isActivePath(pathname, String(item.href));
  const color = active ? colors.brand : colors.inkMuted;
  const Icon = item.icon;
  const entry = useSharedValue(reduceMotion ? 1 : 0);
  const press = useSharedValue(0);
  const raised = useSharedValue(active ? 1 : 0);

  // Deal-in from the edge: one chip at a time, 40ms stagger, spring.
  // Reduced motion: plain fade, no physics.
  useEffect(() => {
    cancelAnimation(entry);
    if (reduceMotion) {
      entry.value = withTiming(1, { duration: motion.duration.fast });
      return;
    }
    entry.value = withDelay(index * CHIP_STAGGER_MS, withSpring(1, motion.spring.layerSoft));
    return () => cancelAnimation(entry);
  }, [entry, index, reduceMotion]);

  // Settle spring on selection: the active chip raises off the felt.
  useEffect(() => {
    cancelAnimation(raised);
    if (reduceMotion) {
      raised.value = withTiming(active ? 1 : 0, { duration: motion.duration.fast });
      return;
    }
    raised.value = withSpring(active ? 1 : 0, motion.spring.layerSoft);
    return () => cancelAnimation(raised);
  }, [raised, active, reduceMotion]);

  const chipMotion = useAnimatedStyle(() => ({
    opacity: interpolate(entry.value, [0, 1], [0, 1]),
    transform: [
      {
        translateY:
          interpolate(entry.value, [0, 1], [16, 0]) +
          interpolate(raised.value, [0, 1], [0, -CHIP_RAISE]) +
          interpolate(press.value, [0, 1], [0, 1]),
      },
      { scale: interpolate(press.value, [0, 1], [1, 0.96]) },
    ],
  }));

  const setPressed = (pressed: boolean) => {
    if (reduceMotion) return;
    // Reanimated shared values are mutable by design for press feedback.
    // eslint-disable-next-line react-hooks/immutability
    press.value = withSpring(pressed ? 1 : 0, motion.spring.press);
  };

  return (
    <Animated.View style={[styles.chipSlot, active && styles.chipSlotActive, chipMotion]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={item.label}
        accessibilityState={{ selected: active }}
        onPress={onPress}
        onPressIn={() => {
          haptic();
          setPressed(true);
        }}
        onPressOut={() => setPressed(false)}
        style={({ pressed }) => [
          styles.chipButton,
          pressed && styles.chipButtonPressed,
        ]}
      >
        <View style={[styles.chipFace, active && styles.chipFaceActive]}>
          {Icon ? (
            <Icon size={19} color={color} strokeWidth={active ? 2.2 : 1.8} />
          ) : null}
        </View>
        <Text style={[styles.chipLabel, { color }]}>{item.label}</Text>
      </Pressable>
    </Animated.View>
  );
}

function DealButton({ reduceMotion, onPress }: { reduceMotion: boolean; onPress: () => void }) {
  const dealProgress = useSharedValue(0);
  const dealMotion = useAnimatedStyle(() => ({
    transform: [
      { perspective: 800 },
      { translateY: interpolate(dealProgress.value, [0, 1], [0, -6]) },
      { scale: interpolate(dealProgress.value, [0, 1], [1, 1.06]) },
      { rotateZ: `${interpolate(dealProgress.value, [0, 1], [0, -2])}deg` },
      { rotateY: `${interpolate(dealProgress.value, [0, 1], [0, 14])}deg` },
    ],
  }));

  const handlePress = () => {
    if (reduceMotion) {
      // Reanimated shared values are mutable by design for press feedback.
      // eslint-disable-next-line react-hooks/immutability
      dealProgress.value = withTiming(0, { duration: motion.duration.fast });
    } else {
      dealProgress.value = withSequence(
        withSpring(1, motion.spring.press),
        withTiming(0, { duration: motion.duration.base }),
      );
    }
    onPress();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Deal the deck"
      onPress={handlePress}
      style={styles.centerButton}
    >
      <Animated.View style={[styles.logoMotion, dealMotion]} pointerEvents="none">
        <View style={styles.dealDeckStack}>
          <PlayingCard
            face="down"
            back="back-crimson"
            size="xs"
            overlapped
            style={styles.dealDeckBack}
          />
          <PlayingCard
            face="down"
            back="back-brand"
            size="xs"
            overlapped
            style={styles.dealDeckFront}
          />
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    justifyContent: 'flex-end',
  },
  sweepOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.tableFelt,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  sweepCard: {
    marginBottom: space.md,
  },
  sweepLabel: {
    fontFamily: fonts.bold,
    fontSize: 13,
    letterSpacing: 2,
    color: alpha.whiteOverlay80,
    textTransform: 'uppercase',
  },
  rail: {
    width: '100%',
    minHeight: NAV_BAR_RESERVE,
    position: 'relative',
    justifyContent: 'flex-end',
    paddingTop: space.sm,
  },
  edgeLip: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: colors.navStrip,
    borderTopWidth: 1,
    borderTopColor: alpha.navLine,
    borderBottomWidth: 1,
    borderBottomColor: alpha.brand20,
    zIndex: 0,
  },
  row: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    alignSelf: 'center',
    maxWidth: 420,
    paddingHorizontal: space.sm,
    gap: space.sm,
    width: '100%',
    zIndex: 1,
  },
  chipSlot: {
    width: 54,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  chipSlotActive: {
    zIndex: 2,
  },
  chipButton: {
    minWidth: 54,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 4,
  },
  chipButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  chipFace: {
    width: 46,
    height: 46,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipFaceActive: {
    borderColor: colors.brand,
    backgroundColor: colors.surface,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 5,
    elevation: 4,
  },
  chipLabel: {
    marginTop: 3,
    fontFamily: fonts.semibold,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.25,
  },

  centerButton: {
    width: 62,
    minHeight: 62,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: space.xxs,
    zIndex: 2,
    overflow: 'visible',
  },
  logoMotion: {
    width: 54,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  dealDeckStack: {
    position: 'relative',
    width: 44,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dealDeckBack: {
    position: 'absolute',
    top: 3,
    left: 7,
    transform: [{ rotate: '9deg' }, { scale: 1.8 }],
  },
  dealDeckFront: {
    position: 'absolute',
    top: 0,
    left: 0,
    transform: [{ rotate: '-8deg' }, { scale: 1.8 }],
  },
});

export default GlobalNavBar;
