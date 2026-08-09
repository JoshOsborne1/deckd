import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { usePathname, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, ShoppingBag, User } from 'lucide-react-native';
import { brand } from '@lib/assets';
import { useMotion } from '@hooks/useMotion';
import { useUiStore } from '@store/uiStore';
import { alpha, colors, radii, shadow, space } from '@theme';

type NavIcon = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

type CardNavItem = {
  id: string;
  href: Href;
  label: string;
  icon?: NavIcon;
  rotateDeg: string;
};

/** Vertical space reserved by the persistent card rail in the game surface. */
export const NAV_BAR_RESERVE = 92;

const navCards: CardNavItem[] = [
  { id: 'home', href: '/', label: 'Home', icon: Home, rotateDeg: '-5deg' },
  { id: 'store', href: '/store', label: 'Store', icon: ShoppingBag, rotateDeg: '-2deg' },
  { id: 'games', href: '/list', label: 'Presets', rotateDeg: '2deg' },
  { id: 'profile', href: '/profile', label: 'Profile', icon: User, rotateDeg: '5deg' },
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
  const w = 12;
  const h = 18;
  return (
    <View style={styles.fanRoot}>
      <View
        style={[
          styles.fanCard,
          { width: w, height: h, borderColor: c, left: 0, bottom: 0, transform: [{ rotate: '-14deg' }] },
        ]}
      />
      <View
        style={[
          styles.fanCard,
          { width: w, height: h, borderColor: c, left: 8, bottom: 2, zIndex: 2, transform: [{ rotate: '0deg' }] },
        ]}
      />
      <View
        style={[
          styles.fanCard,
          { width: w, height: h, borderColor: c, left: 16, bottom: 0, transform: [{ rotate: '14deg' }] },
        ]}
      />
    </View>
  );
}

export const GlobalNavBar: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const insets = useSafeAreaInsets();
  const { haptic } = useMotion();
  const bottomPad = Math.max(insets.bottom, 6);
  const viewMode = useUiStore((s) => s.viewMode);
  const setViewMode = useUiStore((s) => s.setViewMode);
  const onRoot = pathname === '/' || pathname === '/index';
  const gameSurface = onRoot && viewMode !== 'home';
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
    <View pointerEvents="box-none" style={[styles.wrapper, gameSurface && styles.wrapperGame]}>
      <View style={[styles.row, gameSurface && styles.rowGame, { paddingBottom: Math.max(bottomPad, 10) }]}>
        {navCards.slice(0, 2).map((item) => (
          <NavCard
            key={item.id}
            item={item}
            pathname={pathname}
            activeOverride={item.id === 'home' ? (onRoot && viewMode === 'home') : undefined}
            onPress={() => go(item.href)}
          />
        ))}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Deal the deck"
          onPress={onDeal}
          style={({ pressed }) => [
            styles.centerWrap,
            gameSurface && styles.centerWrapActive,
            pressed && { transform: [{ scale: 0.97 }] },
          ]}
        >
          <Image source={brand.logo} style={styles.logo} resizeMode="contain" />
        </Pressable>

        {navCards.slice(2).map((item) => (
          <NavCard
            key={item.id}
            item={item}
            pathname={pathname}
            activeOverride={item.id === 'home' ? (onRoot && viewMode === 'home') : undefined}
            onPress={() => go(item.href)}
          />
        ))}
      </View>
    </View>
  );
};

function NavCard({
  item,
  pathname,
  activeOverride,
  onPress,
}: {
  item: CardNavItem;
  pathname: string;
  activeOverride?: boolean;
  onPress: () => void;
}) {
  const active = activeOverride ?? isActivePath(pathname, String(item.href));
  const color = active ? colors.brand : colors.neutral500;
  const Icon = item.icon;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.cardShell,
        { transform: [{ translateY: 2 }, { rotate: item.rotateDeg }] },
        active && styles.cardShellActive,
        pressed && { transform: [{ translateY: -1 }, { rotate: item.rotateDeg }, { scale: 0.98 }] },
      ]}
    >
      <View style={styles.cardIconArea}>
        {item.id === 'games' ? (
          <FannedCardsIcon active={active} />
        ) : Icon ? (
          <Icon size={26} color={color} strokeWidth={active ? 2.25 : 1.65} />
        ) : null}
      </View>
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
  wrapperGame: {
    // The table remains the material; only the individual peeking cards cast
    // a separation shadow. There is no second panel behind this rail.
    zIndex: 60,
  },

  row: {
    position: 'relative',
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    alignSelf: 'center',
    maxWidth: 420,
    paddingHorizontal: space.sm,
    gap: space.xs,
    width: '100%',
  },
  rowGame: {
    paddingTop: space.xs,
  },
  cardShell: {
    flex: 1,
    minWidth: 0,
    maxWidth: 74,
    minHeight: 64,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: 1,
    borderColor: alpha.inkOverlay06,
    borderBottomWidth: 0,
    paddingTop: 12,
    paddingBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.nav,
  },
  cardShellActive: {
    backgroundColor: colors.bg,
    borderColor: alpha.brand20,
    ...shadow.navActive,
  },
  cardIconArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 32,
  },
  fanRoot: {
    width: 36,
    height: 26,
    position: 'relative',
  },
  fanCard: {
    position: 'absolute',
    borderRadius: 3,
    borderWidth: 1.75,
    backgroundColor: colors.surface,
  },
  centerWrap: {
    width: 64,
    height: 72,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 2,
    zIndex: 30,
  },
  centerWrapActive: {
    transform: [{ scale: 1.03 }],
  },
  logo: {
    width: 60,
    height: 60,
    zIndex: 2,
    ...shadow.cta,
  },
});

export default GlobalNavBar;
