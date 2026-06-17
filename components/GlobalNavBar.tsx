import React from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, ShoppingBag, User } from 'lucide-react-native';
import { brand } from '@lib/assets';
import { useMotion } from '@hooks/useMotion';
import { useUiStore } from '@store/uiStore';
import { alpha, colors, fonts, radii, shadow } from '@theme';

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

const FLOAT_SUITS = ['\u2660', '\u2665', '\u2666', '\u2663'] as const;

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

  // Hide the bar only while the root surface is in a focused game mode.
  // Secondary routes keep their global chrome even if a game viewMode is persisted.
  const hidden = onRoot && viewMode !== 'home';

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

  const stripHeight = 124 + bottomPad;

  if (hidden) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.wrapper}>
      <View pointerEvents="none" style={[styles.paperStrip, { height: stripHeight }]}>
        <View style={styles.decorFade} />
        <View style={styles.decorArrows}>
          <View style={[styles.arrowWing, styles.arrowLeft]} />
          <View style={[styles.arrowWing, styles.arrowRight]} />
        </View>
        <View style={styles.braidHint} />
      </View>

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
          <View pointerEvents="none" style={styles.floatSuitsLayer}>
            {FLOAT_SUITS.map((s, i) => (
              <Text key={`${s}-${i}`} style={[styles.floatSuit, FLOAT_SUIT_SLOTS[i]]}>
                {s}
              </Text>
            ))}
          </View>
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
        { transform: [{ translateY: 10 }, { rotate: item.rotateDeg }] },
        active && styles.cardShellActive,
        pressed && { transform: [{ translateY: 6 }, { rotate: item.rotateDeg }, { scale: 0.98 }] },
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

const FLOAT_SUIT_SLOTS = [
  { top: 4, left: -6, fontSize: 15, opacity: 0.38, transform: [{ rotate: '-12deg' }] },
  { top: 0, right: -8, fontSize: 13, opacity: 0.32, transform: [{ rotate: '8deg' }] },
  { bottom: 16, left: -4, fontSize: 14, opacity: 0.28, transform: [{ rotate: '6deg' }] },
  { bottom: 8, right: -2, fontSize: 12, opacity: 0.34, transform: [{ rotate: '-10deg' }] },
];

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
  decorFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 36,
    backgroundColor: alpha.whiteOverlay45,
  },
  decorArrows: {
    position: 'absolute',
    bottom: 44,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 72,
  },
  arrowWing: {
    width: 36,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: alpha.navLine,
    borderRadius: 1,
  },
  arrowLeft: { transform: [{ rotate: '-18deg' }] },
  arrowRight: { transform: [{ rotate: '18deg' }] },
  braidHint: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
    width: 48,
    height: 3,
    borderRadius: 2,
    backgroundColor: alpha.navBraid,
  },
  row: {
    position: 'relative',
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    width: '100%',
  },
  cardShell: {
    flex: 1,
    maxWidth: 74,
    minHeight: 76,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: 1,
    borderColor: alpha.inkOverlay06,
    borderBottomWidth: 0,
    paddingTop: 22,
    paddingBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 3,
    ...Platform.select({
      ios: {
        shadowColor: colors.ink,
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
    width: 92,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 18,
    marginHorizontal: 2,
    zIndex: 30,
  },
  centerWrapActive: {
    transform: [{ scale: 1.03 }],
  },
  floatSuitsLayer: {
    position: 'absolute',
    width: 120,
    height: 110,
    alignSelf: 'center',
    bottom: 28,
    zIndex: 0,
  },
  floatSuit: {
    position: 'absolute',
    color: colors.brand,
    fontFamily: fonts.regular,
  },
  logo: {
    width: 88,
    height: 88,
    zIndex: 2,
    ...shadow.cta,
  },
});

export default GlobalNavBar;
