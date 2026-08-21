import React, { useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { usePathname, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Layers, ShoppingBag, User } from 'lucide-react-native';
import Animated, {
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useMotion } from '@hooks/useMotion';
import { brand } from '@lib/assets';
import { useGameStore } from '@store/gameStore';
import { useUiStore } from '@store/uiStore';
import { colors, fonts, motion, space } from '@theme';

type NavIcon = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

type NavConfig = {
  id: 'home' | 'store' | 'games' | 'profile';
  href: Href;
  label: string;
  icon: NavIcon;
  angle: number;
};

type ImmediateWebPressProps = {
  onPointerDown: () => void;
  onMouseDown: () => void;
  onTouchStart: () => void;
};

/** Vertical space reserved by the angled card fan and logo button. */
export const NAV_BAR_RESERVE = 142;

/** Backwards-compatible name used by layered surfaces. */
export const GLOBAL_NAV_HEIGHT = NAV_BAR_RESERVE;

const SIDE_W = 66;
const SIDE_H = 92;
const LOGO_W = 70;
const SELECTED_RAISE = 12;
const SIDE_OVERLAP = 0;
const LOGO_OVERLAP = 0;
const CARD_STAGGER_MS = 34;

const navItems: NavConfig[] = [
  { id: 'home', href: '/', label: 'Home', icon: Home, angle: -9 },
  { id: 'store', href: '/store', label: 'Store', icon: ShoppingBag, angle: -4 },
  { id: 'games', href: '/list', label: 'Presets', icon: Layers, angle: 4 },
  { id: 'profile', href: '/profile', label: 'Profile', icon: User, angle: 9 },
];

function isOnRoot(pathname: string): boolean {
  return pathname === '/' || pathname === '/index';
}

function isTabActive(id: NavConfig['id'], pathname: string, viewMode: string): boolean {
  if (id === 'home') return isOnRoot(pathname) && viewMode === 'home';
  if (id === 'store') return pathname === '/store' || pathname.startsWith('/store/');
  if (id === 'games') return pathname === '/list' || pathname.startsWith('/list/');
  if (id === 'profile') {
    return (
      pathname === '/profile' ||
      pathname.startsWith('/profile/') ||
      pathname === '/settings' ||
      pathname.startsWith('/settings/')
    );
  }
  return false;
}

/**
 * Nav v5: a physical fan of four cards with a separate Deckd deal button.
 * Route taps intentionally do not run a page transition. The cards can move
 * on press, but the destination appears immediately.
 */
export const GlobalNavBar: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const insets = useSafeAreaInsets();
  const { reduceMotion, haptic } = useMotion();
  const bottomPad = Math.max(insets.bottom, 10);
  const viewMode = useUiStore((s) => s.viewMode);
  const jumpToViewMode = useUiStore((s) => s.jumpToViewMode);
  const gamePhase = useGameStore((s) => s.state.phase);
  const eventCount = useGameStore((s) => s.events.length);
  const onRoot = isOnRoot(pathname);
  const hasTable = eventCount > 0 && gamePhase !== 'idle' && gamePhase !== 'ended';

  useEffect(() => {
    // Warm the shell routes once. This keeps a logo tap from waiting for the
    // root screen module after coming from Store/Profile on web.
    void router.prefetch('/');
    void router.prefetch('/store');
    void router.prefetch('/list');
    void router.prefetch('/profile');
  }, [router]);

  const goSideTab = (item: NavConfig) => {
    if (pathname === String(item.href) || pathname.startsWith(`${String(item.href)}/`)) return;
    router.replace(item.href);
  };

  const goHome = () => {
    jumpToViewMode('home');
    if (!onRoot) router.replace('/');
  };

  const goTable = () => {
    jumpToViewMode(hasTable ? 'table' : 'hub');
    if (!onRoot) router.replace('/');
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { bottom: bottomPad }]}>
      <View style={styles.rail}>
        <View style={styles.row}>
          <NavCard
            item={navItems[0]}
            index={0}
            active={isTabActive('home', pathname, viewMode)}
            reduceMotion={reduceMotion}
            haptic={haptic}
            overlap={0}
            onPress={() => {
              haptic('light');
              goHome();
            }}
          />
          <NavCard
            item={navItems[1]}
            index={1}
            active={isTabActive('store', pathname, viewMode)}
            reduceMotion={reduceMotion}
            haptic={haptic}
            overlap={SIDE_OVERLAP}
            onPress={() => {
              haptic('light');
              goSideTab(navItems[1]);
            }}
          />
          <LogoButton
            active={onRoot && viewMode !== 'home'}
            reduceMotion={reduceMotion}
            haptic={haptic}
            overlap={LOGO_OVERLAP}
            onPress={() => {
              haptic('medium');
              goTable();
            }}
          />
          <NavCard
            item={navItems[2]}
            index={2}
            active={isTabActive('games', pathname, viewMode)}
            reduceMotion={reduceMotion}
            haptic={haptic}
            overlap={LOGO_OVERLAP}
            onPress={() => {
              haptic('light');
              goSideTab(navItems[2]);
            }}
          />
          <NavCard
            item={navItems[3]}
            index={3}
            active={isTabActive('profile', pathname, viewMode)}
            reduceMotion={reduceMotion}
            haptic={haptic}
            overlap={SIDE_OVERLAP}
            onPress={() => {
              haptic('light');
              goSideTab(navItems[3]);
            }}
          />
        </View>
      </View>
    </View>
  );
};

function NavCard({
  item,
  index,
  active,
  onPress,
  reduceMotion,
  haptic,
  overlap,
}: {
  item: NavConfig;
  index: number;
  active: boolean;
  onPress: () => void;
  reduceMotion: boolean;
  haptic: () => void;
  overlap: number;
}) {
  const Icon = item.icon;
  const entry = useSharedValue(reduceMotion ? 1 : 0);
  const press = useSharedValue(0);
  const raised = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    cancelAnimation(entry);
    if (reduceMotion) {
      entry.value = withTiming(1, { duration: motion.duration.fast });
      return;
    }
    entry.value = withDelay(index * CARD_STAGGER_MS, withSpring(1, motion.spring.layerSoft));
    return () => cancelAnimation(entry);
  }, [entry, index, reduceMotion]);

  useEffect(() => {
    cancelAnimation(raised);
    if (reduceMotion) {
      raised.value = withTiming(active ? 1 : 0, { duration: motion.duration.fast });
      return;
    }
    raised.value = withSpring(active ? 1 : 0, motion.spring.nav);
    return () => cancelAnimation(raised);
  }, [raised, active, reduceMotion]);

  const fanX = index === 0 ? 7 : index === 1 ? -7 : index === 2 ? -7 : -11;

  const cardMotion = useAnimatedStyle(() => ({
    opacity: interpolate(entry.value, [0, 1], [0, 1]),
    transform: [
      { translateX: fanX },
      {
        translateY:
          interpolate(entry.value, [0, 1], [24, 0]) +
          interpolate(raised.value, [0, 1], [0, -SELECTED_RAISE]) +
          interpolate(press.value, [0, 1], [0, 3]),
      },
      { scale: interpolate(press.value, [0, 1], [1, 0.96]) },
      { rotate: `${interpolate(raised.value, [0, 1], [item.angle, item.angle * 0.55])}deg` },
    ],
  }));

  const labelMotion = useAnimatedStyle(() => ({
    opacity: interpolate(entry.value, [0, 1], [0, 1]),
    transform: [
      {
        translateY:
          interpolate(entry.value, [0, 1], [12, 0]) + interpolate(press.value, [0, 1], [0, 1]),
      },
    ],
  }));

  const setPressed = (pressed: boolean) => {
    if (reduceMotion) return;
    // Reanimated shared values are mutable by design for press feedback.
    // eslint-disable-next-line react-hooks/immutability
    press.value = withSpring(pressed ? 1 : 0, motion.spring.press);
  };

  const iconColor = active ? colors.surface : colors.inkMuted;
  const labelColor = active ? colors.brandHot : colors.inkMuted;

  const pressedRef = useRef(false);

  const activate = () => {
    if (pressedRef.current) return;
    pressedRef.current = true;
    onPress();
  };

  const immediateWebPress = Platform.OS === 'web'
    ? ({ onPointerDown: activate, onMouseDown: activate, onTouchStart: activate } as ImmediateWebPressProps)
    : undefined;

  return (
    <View style={[styles.slot, { marginLeft: overlap }, active && styles.slotActive]}>
      <Pressable
        {...immediateWebPress}
        accessibilityRole="button"
        accessibilityLabel={item.label}
        accessibilityState={{ selected: active }}
        testID={`nav-${item.id}`}
        onPress={activate}
        onPressIn={() => {
          haptic();
          activate();
          setPressed(true);
        }}
        onPressOut={() => {
          pressedRef.current = false;
          setPressed(false);
        }}
        style={styles.hit}
      >
        <Animated.View
          style={[
            styles.card,
            active && styles.cardFilled,
            cardMotion,
          ]}
        >
          <Icon size={23} color={iconColor} strokeWidth={active ? 2.3 : 1.8} />
        </Animated.View>
        <Animated.Text style={[styles.label, { color: labelColor }, labelMotion]}>
          {item.label}
        </Animated.Text>
      </Pressable>
    </View>
  );
}

function LogoButton({
  active,
  reduceMotion,
  haptic,
  overlap,
  onPress,
}: {
  active: boolean;
  reduceMotion: boolean;
  haptic: () => void;
  overlap: number;
  onPress: () => void;
}) {
  const entry = useSharedValue(reduceMotion ? 1 : 0);
  const press = useSharedValue(0);
  const raised = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    cancelAnimation(entry);
    if (reduceMotion) {
      entry.value = withTiming(1, { duration: motion.duration.fast });
      return;
    }
    entry.value = withDelay(2 * CARD_STAGGER_MS, withSpring(1, motion.spring.layerSoft));
    return () => cancelAnimation(entry);
  }, [entry, reduceMotion]);

  useEffect(() => {
    cancelAnimation(raised);
    if (reduceMotion) {
      raised.value = withTiming(active ? 1 : 0, { duration: motion.duration.fast });
      return;
    }
    raised.value = withSpring(active ? 1 : 0, motion.spring.nav);
    return () => cancelAnimation(raised);
  }, [raised, active, reduceMotion]);

  const logoMotion = useAnimatedStyle(() => ({
    opacity: interpolate(entry.value, [0, 1], [0, 1]),
    transform: [
      {
        translateY:
          interpolate(entry.value, [0, 1], [30, 0]) +
          interpolate(raised.value, [0, 1], [0, -8]) +
          interpolate(press.value, [0, 1], [0, 3]),
      },
      { scale: interpolate(raised.value, [0, 1], [0.96, 1.06]) * interpolate(press.value, [0, 1], [1, 0.9]) },
    ],
  }));

  const labelMotion = useAnimatedStyle(() => ({
    opacity: interpolate(entry.value, [0, 1], [0, 1]),
    transform: [{ translateY: interpolate(entry.value, [0, 1], [12, 0]) }],
  }));

  const setPressed = (pressed: boolean) => {
    if (reduceMotion) return;
    // Reanimated shared values are mutable by design for press feedback.
    // eslint-disable-next-line react-hooks/immutability
    press.value = withSpring(pressed ? 1 : 0, motion.spring.press);
  };

  const pressedRef = useRef(false);

  const activate = () => {
    if (pressedRef.current) return;
    pressedRef.current = true;
    onPress();
  };

  const immediateWebPress = Platform.OS === 'web'
    ? ({ onPointerDown: activate, onMouseDown: activate, onTouchStart: activate } as ImmediateWebPressProps)
    : undefined;

  return (
    <View style={[styles.logoSlot, { marginLeft: overlap }]}>
      <Pressable
        {...immediateWebPress}
        accessibilityRole="button"
        accessibilityLabel="Table, Deckd logo button"
        accessibilityState={{ selected: active }}
        testID="nav-table"
        onPress={activate}
        onPressIn={() => {
          haptic();
          activate();
          setPressed(true);
        }}
        onPressOut={() => {
          pressedRef.current = false;
          setPressed(false);
        }}
        style={styles.logoHit}
      >
        <Animated.Image
          source={brand.logo}
          resizeMode="contain"
          style={[styles.logoMark, logoMotion]}
          accessibilityIgnoresInvertColors
        />
        <Animated.Text style={[styles.logoLabel, { color: active ? colors.brandHot : colors.inkMuted }, labelMotion]}>
          Table
        </Animated.Text>
      </Pressable>
    </View>
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
    overflow: 'visible',
  },
  rail: {
    width: '100%',
    minHeight: NAV_BAR_RESERVE,
    position: 'relative',
    justifyContent: 'flex-end',
    paddingTop: space.sm,
    overflow: 'visible',
    backgroundColor: 'transparent',
  },
  row: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 420,
    paddingHorizontal: space.md,
    overflow: 'visible',
  },
  slot: {
    width: SIDE_W,
    height: 122,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 2,
  },
  logoSlot: {
    width: LOGO_W,
    height: 122,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 10,
  },
  slotActive: {
    zIndex: 8,
  },
  hit: {
    width: SIDE_W,
    minHeight: 112,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  logoHit: {
    width: LOGO_W,
    minHeight: 118,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  card: {
    width: SIDE_W,
    height: SIDE_H,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navCard,
    borderWidth: 1,
    borderColor: colors.navCardEdge,
    borderRadius: 14,
    borderCurve: 'continuous',
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  cardFilled: {
    backgroundColor: colors.brandHot,
    borderColor: colors.brandHot,
    shadowColor: colors.brandHot,
    shadowOpacity: 0.27,
    shadowRadius: 9,
    elevation: 6,
  },
  label: {
    marginTop: 4,
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  logoMark: {
    width: 60,
    height: 60,
  },
  logoLabel: {
    marginTop: 1,
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.1,
  },
});

export default GlobalNavBar;
