import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, ShoppingBag, User } from 'lucide-react-native';
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
  { id: 'games', href: '/list', label: 'Presets' },
  { id: 'profile', href: '/profile', label: 'Profile', icon: User },
];

/** Backwards-compatible name used by layered surfaces. */
export const GLOBAL_NAV_HEIGHT = NAV_BAR_RESERVE;

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/' || pathname === '/index';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function FannedCardsIcon({ active }: { active: boolean }) {
  const c = active ? colors.brand : colors.neutral500;
  const w = 10;
  const h = 16;
  return (
    <View style={styles.fanRoot}>
      <View
        style={[
          styles.fanCard,
          { width: w, height: h, borderColor: c, left: 0, bottom: 0, transform: [{ rotate: '-12deg' }] },
        ]}
      />
      <View
        style={[
          styles.fanCard,
          { width: w, height: h, borderColor: c, left: 7, bottom: 1, zIndex: 2 },
        ]}
      />
      <View
        style={[
          styles.fanCard,
          { width: w, height: h, borderColor: c, left: 14, bottom: 0, transform: [{ rotate: '12deg' }] },
        ]}
      />
    </View>
  );
}

export const GlobalNavBar: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const insets = useSafeAreaInsets();
  const { haptic, reduceMotion } = useMotion();
  const bottomPad = Math.max(insets.bottom, 6);
  const viewMode = useUiStore((s) => s.viewMode);
  const setViewMode = useUiStore((s) => s.setViewMode);
  const onRoot = pathname === '/' || pathname === '/index';

  const go = (href: Href) => {
    const s = String(href);
    if (s === '/') {
      setViewMode('home');
      if (onRoot) {
        return;
      }
      router.push('/');
      return;
    }
    if (s === pathname) return;
    router.push(href);
  };

  const onDeal = () => {
    haptic('medium');
    if (!onRoot) {
      router.push('/');
    }
    setViewMode('hub');
  };

  return (
    <View pointerEvents="box-none" style={styles.wrapper}>
      <View style={[styles.rail, { paddingBottom: bottomPad }]}>
        <View style={styles.row}>
          {navItems.slice(0, 2).map((item, index) => (
            <NavItem
              key={item.id}
              item={item}
              index={index}
              reduceMotion={reduceMotion}
              pathname={pathname}
              activeOverride={item.id === 'home' ? (onRoot && viewMode === 'home') : undefined}
              onPress={() => go(item.href)}
            />
          ))}

          <DealButton reduceMotion={reduceMotion} onPress={onDeal} />

          {navItems.slice(2).map((item, index) => (
            <NavItem
              key={item.id}
              item={item}
              index={index + 2}
              reduceMotion={reduceMotion}
              pathname={pathname}
              activeOverride={item.id === 'home' ? (onRoot && viewMode === 'home') : undefined}
              onPress={() => go(item.href)}
            />
          ))}
        </View>
      </View>
    </View>
  );
};

function NavItem({
  item,
  index,
  pathname,
  activeOverride,
  onPress,
  reduceMotion,
}: {
  item: NavConfig;
  index: number;
  pathname: string;
  activeOverride?: boolean;
  onPress: () => void;
  reduceMotion: boolean;
}) {
  const active = activeOverride ?? isActivePath(pathname, String(item.href));
  const color = active ? colors.brand : colors.inkMuted;
  const Icon = item.icon;
  const entry = useSharedValue(reduceMotion ? 1 : 0);
  const press = useSharedValue(0);
  const activeProgress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    cancelAnimation(entry);
    if (reduceMotion) {
      entry.value = 1;
      return;
    }
    entry.value = withDelay(index * 42, withSpring(1, motion.spring.layerSoft));
    return () => cancelAnimation(entry);
  }, [entry, index, reduceMotion]);

  useEffect(() => {
    activeProgress.value = withTiming(active ? 1 : 0, {
      duration: reduceMotion ? motion.duration.fast : motion.duration.base,
    });
  }, [active, activeProgress, reduceMotion]);

  const itemMotion = useAnimatedStyle(() => ({
    opacity: interpolate(entry.value, [0, 1], [0, 1]),
    transform: [
      { translateY: interpolate(entry.value, [0, 1], [8, 0]) + interpolate(press.value, [0, 1], [0, 1]) },
      { scale: interpolate(press.value, [0, 1], [1, 0.96]) },
    ],
  }));

  const ruleMotion = useAnimatedStyle(() => ({
    opacity: activeProgress.value,
    width: interpolate(activeProgress.value, [0, 1], [0, 24]),
  }));

  const setPressed = (pressed: boolean) => {
    if (reduceMotion) return;
    // Reanimated shared values are mutable by design for press feedback.
    // eslint-disable-next-line react-hooks/immutability
    press.value = withSpring(pressed ? 1 : 0, motion.spring.press);
  };

  return (
    <Animated.View style={[styles.itemSlot, itemMotion]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={item.label}
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={({ pressed }) => [
          styles.itemButton,
          active && styles.itemButtonActive,
          pressed && styles.itemButtonPressed,
        ]}
      >
        <View style={styles.itemIcon}>
          {item.id === 'games' ? (
            <FannedCardsIcon active={active} />
          ) : Icon ? (
            <Icon size={19} color={color} strokeWidth={active ? 2.2 : 1.8} />
          ) : null}
        </View>
        <Text style={[styles.itemLabel, { color }]}>{item.label}</Text>
        <Animated.View style={[styles.activeRule, ruleMotion]} />
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
            face="up"
            rank="A"
            suit="hearts"
            size="xs"
            overlapped
            style={styles.dealDeckFront}
          />
        </View>
        <Text style={styles.dealLabel}>Deal</Text>
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
  rail: {
    width: '100%',
    minHeight: NAV_BAR_RESERVE,
    backgroundColor: colors.navStrip,
    borderTopWidth: 1,
    borderTopColor: alpha.navLine,
    justifyContent: 'flex-end',
    paddingTop: space.sm,
  },
  row: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    alignSelf: 'center',
    maxWidth: 420,
    paddingHorizontal: space.sm,
    gap: space.xs,
    width: '100%',
  },
  itemSlot: {
    flex: 1,
    minWidth: 0,
    maxWidth: 70,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemButton: {
    width: '100%',
    maxWidth: 70,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  itemButtonPressed: {
    backgroundColor: alpha.inkOverlay06,
    transform: [{ scale: 0.96 }],
  },
  itemButtonActive: {
    backgroundColor: colors.surface,
    borderColor: alpha.brand20,
  },
  itemIcon: {
    height: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemLabel: {
    marginTop: 3,
    fontFamily: fonts.semibold,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.25,
  },
  activeRule: {
    height: 2,
    marginTop: 3,
    backgroundColor: colors.brand,
    borderRadius: 1,
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
  dealLabel: {
    marginTop: 1,
    fontFamily: fonts.bold,
    fontSize: 9,
    lineHeight: 11,
    color: colors.brand,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  fanRoot: {
    width: 28,
    height: 20,
    position: 'relative',
  },
  fanCard: {
    position: 'absolute',
    borderRadius: 3,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
});

export default GlobalNavBar;
