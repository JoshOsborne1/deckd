import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const colors = {
  brand: '#B02020',
  brandDark: '#901A1A',
  brandSoft: '#FDE8E8',
  bg: '#FAFAFA',
  surface: '#FFFFFF',
  surfaceAlt: '#F7F7F8',
  ink: '#1A1A1A',
  inkSoft: '#333333',
  inkMuted: '#666666',
  inkSubtle: '#999999',
  border: '#F0F0F0',
  borderStrong: '#EAEAEA',
  warn: '#F59E0B',
  neutral500: '#475569',
  neutral300: '#94A3B8',
  /** Bottom nav paper strip (lifted from felt) */
  navStrip: '#EBEBED',
  /** Table surface colors */
  tableFelt: '#2D5A3D',
  tableRail: '#1E3D2A',
  tableWell: '#234A33',
  /** Seat state colors */
  seatActive: '#B02020',
  seatWaiting: '#F59E0B',
  seatRemote: '#3B82F6',
  seatOffline: '#94A3B8',
  seatDealer: '#D4AF37',
  /** Card surface colors */
  cardPaper: '#FFFFFF',
  cardEdge: '#EAEAEA',
  /** Action semantic colors */
  actionSafe: '#22C55E',
  actionWarn: '#F59E0B',
  /** Sync state colors */
  syncConnected: '#22C55E',
  syncScanning: '#3B82F6',
  syncLost: '#EF4444',
  syncHost: '#B02020',
} as const;

export const alpha = {
  brand10: 'rgba(176,32,32,0.10)',
  brand20: 'rgba(176,32,32,0.20)',
  brand30: 'rgba(176,32,32,0.30)',
  brand45: 'rgba(176,32,32,0.45)',
  whiteOverlay20: 'rgba(255,255,255,0.20)',
  whiteOverlay45: 'rgba(255,255,255,0.45)',
  whiteOverlay80: 'rgba(255,255,255,0.80)',
  inkOverlay06: 'rgba(0,0,0,0.06)',
  inkOverlay08: 'rgba(0,0,0,0.08)',
  inkOverlay12: 'rgba(0,0,0,0.12)',
  inkOverlay20: 'rgba(0,0,0,0.20)',
  /** Modal / sheet scrims */
  inkOverlay45: 'rgba(0,0,0,0.45)',
  /** Bottom-nav decorative lines (muted cool gray) */
  navLine: 'rgba(100,100,110,0.12)',
  navBraid: 'rgba(100,100,110,0.08)',
} as const;

export const radii = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  card: 12,
  pill: 999,
} as const;

export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  x4l: 40,
  x5l: 48,
} as const;

export const fonts = {
  regular: 'PlusJakartaSans-Regular',
  medium: 'PlusJakartaSans-Medium',
  semibold: 'PlusJakartaSans-SemiBold',
  bold: 'PlusJakartaSans-Bold',
  extra: 'PlusJakartaSans-ExtraBold',
} as const;

export const fontSizes = {
  caption: 11,
  micro: 12,
  small: 13,
  body: 15,
  bodyLg: 16,
  title: 18,
  h3: 20,
  h2: 24,
  h1: 28,
  display: 32,
} as const;

export const letterSpacing = {
  tight: -0.5,
  display: -1,
  cap: 1,
  capLoose: 1.5,
  caps: 2,
} as const;

type ShadowStyle = Pick<
  ViewStyle,
  'shadowColor' | 'shadowOffset' | 'shadowOpacity' | 'shadowRadius' | 'elevation'
>;

function makeShadow(
  ios: Required<Pick<ViewStyle, 'shadowColor' | 'shadowOffset' | 'shadowOpacity' | 'shadowRadius'>>,
  androidElevation: number,
): ShadowStyle {
  return (
    Platform.select<ShadowStyle>({
      ios,
      android: { elevation: androidElevation },
      default: {},
    }) ?? {}
  );
}

export const shadow = {
  none: {} as ShadowStyle,
  card: makeShadow(
    { shadowColor: colors.ink, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 },
    2,
  ),
  cardStrong: makeShadow(
    { shadowColor: colors.ink, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 6 },
    3,
  ),
  elevated: makeShadow(
    { shadowColor: colors.ink, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 10 },
    6,
  ),
  hand: makeShadow(
    { shadowColor: colors.ink, shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 8 },
    8,
  ),
  cta: makeShadow(
    { shadowColor: colors.brand, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 12 },
    6,
  ),
  ctaLift: makeShadow(
    { shadowColor: colors.brand, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.35, shadowRadius: 20 },
    10,
  ),
  passGlow: makeShadow(
    { shadowColor: colors.brand, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.08, shadowRadius: 24 },
    12,
  ),
} as const;

export const motion = {
  spring: {
    press: { damping: 18, stiffness: 240, mass: 0.8 },
    card: { damping: 16, stiffness: 200, mass: 0.9 },
    reveal: { damping: 14, stiffness: 180, mass: 1.0 },
    /** Full-screen layer enter (table / lobby) — confident, slight overshoot */
    layer: { damping: 24, stiffness: 220, mass: 0.85 },
    /** Softer companion for scale on same transition */
    layerSoft: { damping: 28, stiffness: 200, mass: 0.9 },
    /** Modals / sheets */
    sheet: { damping: 22, stiffness: 280, mass: 0.72 },
    /** Pass veil mount */
    veil: { damping: 20, stiffness: 200, mass: 0.95 },
  },
  duration: {
    fast: 120,
    base: 200,
    slow: 320,
    reveal: 420,
    /** Layer cross-fade when leaving morph zone */
    layerCross: 260,
  },
  stagger: {
    deal: 60,
  },
} as const;

export const textStyles = {
  display: {
    fontFamily: fonts.extra,
    fontSize: fontSizes.display,
    letterSpacing: letterSpacing.display,
    color: colors.ink,
  } satisfies TextStyle,
  h1: {
    fontFamily: fonts.extra,
    fontSize: fontSizes.h1,
    letterSpacing: letterSpacing.tight,
    color: colors.ink,
  } satisfies TextStyle,
  h2: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.h2,
    letterSpacing: letterSpacing.tight,
    color: colors.ink,
  } satisfies TextStyle,
  h3: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.h3,
    color: colors.ink,
  } satisfies TextStyle,
  title: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.title,
    color: colors.ink,
  } satisfies TextStyle,
  body: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.body,
    color: colors.inkSoft,
  } satisfies TextStyle,
  bodyMuted: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.body,
    color: colors.inkMuted,
  } satisfies TextStyle,
  label: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.caption,
    letterSpacing: letterSpacing.capLoose,
    color: colors.inkMuted,
  } satisfies TextStyle,
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.micro,
    letterSpacing: letterSpacing.caps,
    color: colors.inkMuted,
    textTransform: 'uppercase' as const,
  } satisfies TextStyle,
} as const;

export type ThemeColors = typeof colors;
export type ThemeRadii = typeof radii;
export type ThemeSpace = typeof space;
export type ThemeFonts = typeof fonts;

export const theme = {
  colors,
  alpha,
  radii,
  space,
  fonts,
  fontSizes,
  letterSpacing,
  shadow,
  motion,
  textStyles,
} as const;

export default theme;
