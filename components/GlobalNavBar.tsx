import React from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, ShoppingBag, User } from 'lucide-react-native';
import { brand } from '@lib/assets';
import { useMotion } from '@hooks/useMotion';
import { useUiStore } from '@store/uiStore';
import { alpha, colors, fonts, radii, shadow, space } from '@theme';

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
  suit: string | null;
  rotateDeg: string;
};

const navCards: CardNavItem[] = [
  { id: 'home', href: '/', label: 'Home', icon: Home, suit: null, rotateDeg: '-5deg' },
  { id: 'store', href: '/store', label: 'Store', icon: ShoppingBag, suit: '\u2666', rotateDeg: '-2deg' },
  { id: 'games', href: '/list', label: 'Presets', suit: '\u2660', rotateDeg: '2deg' },
  { id: 'profile', href: '/profile', label: 'Profile', icon: User, suit: '\u2665', rotateDeg: '5deg' },
];

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
  const gameActive = onRoot && viewMode !== 'home';

  // Hide the bar whenever we're inside the game surface (hub/table/lobby/pass).
  const hidden = viewMode !== 'home';

  const go = (href: Href) => {
    const s = String(href);
    if (s === '/') {
      if (onRoot) {
        setViewMode('home');
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

  const stripHeight = 112 + bottomPad;

  if (hidden) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.wrapper}>
      <View pointerEvents="none" style={[styles.paperStrip, { height: stripHeight }]} />

      <View style={[styles.row, { paddingBottom: Math.max(bottomPad, 8) }]}>
        {navCards.slice(0, 2).map((item) => (
          <NavCard
            key={item.id}
            item={item}
            pathname={pathname}
            onPress={() => go(item.href)}
          />
        ))}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Deal the deck"
          onPress={onDeal}
          style={({ pressed }) => [
            styles.centerWrap,
            gameActive && styles.centerWrapActive,
            pressed && { transform: [{ scale: 0.97 }] },
          ]}
        >
          <Image source={brand.logo} style={styles.logo} resizeMode="contain" />
        </Pressable>

        {navCards.slice(2).map((item) => (
          <NavCard key={item.id} item={item} pathname={pathname} onPress={() => go(item.href)} />
        ))}
      </View>
    </View>
  );
};

function NavCard({
  item,
  pathname,
  onPress,
}: {
  item: CardNavItem;
  pathname: string;
  onPress: () => void;
}) {
  const active = isActivePath(pathname, String(item.href));
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
      {item.suit ? (
        <Text style={[styles.cornerSuit, active && styles.cornerSuitActive]}>{item.suit}</Text>
      ) : null}
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
  paperStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.navStrip,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: alpha.inkOverlay08,
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
  cardShell: {
    flex: 1,
    maxWidth: 74,
    minHeight: 68,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: 1,
    borderColor: alpha.inkOverlay06,
    borderBottomWidth: 0,
    paddingTop: 16,
    paddingBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',

    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: { elevation: 5 },
    }),
  },
  cardShellActive: {
    backgroundColor: colors.bg,
    borderColor: alpha.brand20,
    ...Platform.select({
      ios: {
        shadowColor: colors.brand,
        shadowOpacity: 0.18,
      },
      android: { elevation: 6 },
    }),
  },
  cornerSuit: {
    position: 'absolute',
    top: 8,
    left: 10,
    fontSize: 12,
    color: colors.neutral300,
    fontFamily: fonts.medium,
  },
  cornerSuitActive: {
    color: colors.brand,
    opacity: 0.75,
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
    width: 72,
    height: 82,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 6,
    zIndex: 30,
  },
  centerWrapActive: {
    transform: [{ scale: 1.03 }],
  },
  logo: {
    width: 68,
    height: 68,
    zIndex: 2,
    ...shadow.cta,
  },
});

export default GlobalNavBar;
