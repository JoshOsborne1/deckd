import { Platform } from 'react-native';
import Constants from 'expo-constants';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';

let configured = false;

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

export function configureRevenueCat(): void {
  if (configured) return;
  const { ios, android } = getRevenueCatApiKey();
  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }
  if (Platform.OS === 'ios' && ios) {
    Purchases.configure({ apiKey: ios });
    configured = true;
  } else if (Platform.OS === 'android' && android) {
    Purchases.configure({ apiKey: android });
    configured = true;
  }
}

export function isRevenueCatConfigured(): boolean {
  return configured;
}

export { Purchases };
