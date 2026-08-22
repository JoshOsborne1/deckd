/**
 * RevenueCat wrapper — lazy, fail-closed.
 *
 * `react-native-purchases` ships a native module that does NOT exist inside
 * Expo Go. Importing it at module scope makes Metro evaluate the native
 * binding during bundle load, which is the leading suspect for the P0-1
 * silent boot crash ("failed to register main") on the physical iPhone while
 * the minimal probe app renders fine. The import is therefore deferred into
 * `configureRevenueCat()` via a guarded require, so a missing native module
 * can never take down module evaluation.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';

type PurchasesModule = typeof import('react-native-purchases');

let Purchases: PurchasesModule['default'] | null = null;
let LogLevel: PurchasesModule['LOG_LEVEL'] | null = null;
let configured = false;
let importAttempted = false;

/**
 * RevenueCat public SDK keys — set via `app.json` → `expo.extra` or EAS env at build time.
 * Never commit real keys; use EAS Secrets for production.
 */
export function getRevenueCatApiKey(): { ios?: string; android?: string } {
  const extra = Constants.expoConfig?.extra as
    | { revenueCatIosApiKey?: string; revenueCatAndroidApiKey?: string }
    | undefined;
  return {
    ios: extra?.revenueCatIosApiKey || process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    android: extra?.revenueCatAndroidApiKey || process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  };
}

function tryImportPurchases(): boolean {
  if (importAttempted) return Purchases !== null;
  importAttempted = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-purchases') as PurchasesModule;
    Purchases = mod.default;
    LogLevel = mod.LOG_LEVEL;
    return true;
  } catch {
    // Expo Go / unlinked build: the native module is absent. Stay fail-closed.
    Purchases = null;
    LogLevel = null;
    return false;
  }
}

export function configureRevenueCat(): void {
  if (configured) return;
  const { ios, android } = getRevenueCatApiKey();
  if (!tryImportPurchases() || !Purchases || !LogLevel) {
    configured = false;
    return;
  }
  try {
    if (__DEV__) {
      Purchases.setLogLevel(LogLevel.DEBUG);
    }
    if (Platform.OS === 'ios' && ios) {
      Purchases.configure({ apiKey: ios });
      configured = true;
    } else if (Platform.OS === 'android' && android) {
      Purchases.configure({ apiKey: android });
      configured = true;
    }
  } catch {
    // Native module present but misconfigured/unavailable at runtime.
    configured = false;
  }
}

export function isRevenueCatConfigured(): boolean {
  return configured;
}

/**
 * Non-null accessor for already-configured flows (iap.ts). Throws if called
 * before configureRevenueCat() succeeded — callers gate on
 * isRevenueCatConfigured() first, so this only fires on programmer error.
 */
export function requirePurchases(): NonNullable<PurchasesModule['default']> {
  if (!tryImportPurchases() || !Purchases) {
    throw new Error('RevenueCat native module unavailable in this environment.');
  }
  return Purchases;
}
