import { useEffect } from 'react';
import { configureRevenueCat, isRevenueCatConfigured, requirePurchases } from '@lib/revenuecat';
import { syncMasterPassFromCustomerInfo } from '@lib/entitlement';
import { installMultiplayerBridge } from '@store/multiplayerBridge';
import { useTableSoundBridge } from '@hooks/useTableSoundBridge';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { useAssets } from 'expo-asset';
import * as SplashScreen from 'expo-splash-screen';
import { GlobalNavBar } from '@components/GlobalNavBar';
import { brand } from '@lib/assets';
import { colors } from '@theme';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Swallow: some environments (web, dev reloads) resolve this outside the expected lifecycle.
});

// TEMP BOOT DIAGNOSTIC 2026-08-22 (audit P0-1) — remove after phone crash fixed.
type BootFatal = { message?: string; stack?: string };
type BootErrorUtils = {
  getGlobalHandler?: () => ((e: BootFatal, fatal: boolean) => void) | undefined;
  setGlobalHandler?: (h: (e: BootFatal, fatal: boolean) => void) => void;
};
const bootErrorUtils = (globalThis as { ErrorUtils?: BootErrorUtils }).ErrorUtils;
if (bootErrorUtils?.setGlobalHandler) {
  const previousHandler = bootErrorUtils.getGlobalHandler?.();
  bootErrorUtils.setGlobalHandler((error, fatal) => {
    console.log(
      `BOOT ${fatal ? 'FATAL' : 'ERROR'}:`,
      error?.message,
      '|',
      (error?.stack ?? '').split('\n').slice(0, 8).join(' ~ '),
    );
    previousHandler?.(error, fatal);
  });
}
console.log('BOOT 0: _layout module evaluated');

export default function RootLayout() {
  console.log('BOOT 1: RootLayout render start');
  // Game-event -> table-sound bridge. Subscribes to gameStore at the app
  // root so every deal/flip/discard/pass/win (local, rule-driven, or
  // remote) plays without layer components calling the hook themselves.
  useTableSoundBridge();
  console.log('BOOT 2: sound bridge mounted');
  const [fontsLoaded, fontError] = useFonts({
    'PlusJakartaSans-Regular': require('@assets/fonts/PlusJakartaSans-Regular.ttf'),
    'PlusJakartaSans-Medium': require('@assets/fonts/PlusJakartaSans-Medium.ttf'),
    'PlusJakartaSans-SemiBold': require('@assets/fonts/PlusJakartaSans-SemiBold.ttf'),
    'PlusJakartaSans-Bold': require('@assets/fonts/PlusJakartaSans-Bold.ttf'),
    'PlusJakartaSans-ExtraBold': require('@assets/fonts/PlusJakartaSans-ExtraBold.ttf'),
  });
  const [cardAssets, cardAssetError] = useAssets([
    brand.logo,
    brand.cardBack,
    brand.cardBackNoir,
    brand.cardBackCrimson,
  ]);
  console.log('BOOT 3: font and asset hooks returned');

  useEffect(() => {
    console.log('BOOT 4: startup effect begin');
    configureRevenueCat();

    // Entitlement listener: map RevenueCat `master` entitlement to hasMasterPass.
    // Purchases.addCustomerInfoUpdateListener fires on purchase/restore/refresh,
    // and we also pull the latest customerInfo on startup so a returning Master
    // keeps hosting rights without a new purchase.
    let listener: ((info: import('react-native-purchases').CustomerInfo) => void) | null = null;
    if (isRevenueCatConfigured()) {
      const Purchases = requirePurchases();
      listener = (info) => syncMasterPassFromCustomerInfo(info);
      Purchases.addCustomerInfoUpdateListener(listener);
      void Purchases.getCustomerInfo()
        .then((info) => syncMasterPassFromCustomerInfo(info))
        .catch(() => {
          // Offline / first launch: the listener will fire when info arrives.
        });
    }

    // Wire gameStore <-> lobbyStore relay session for multiplayer sync.
    // Inert when there is no relay session (pass & play stays unaffected).
    installMultiplayerBridge();

    return () => {
      if (listener) {
        if (isRevenueCatConfigured()) {
          requirePurchases().removeCustomerInfoUpdateListener(listener);
        }
        listener = null;
      }
    };
  }, []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && (cardAssets || cardAssetError)) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [cardAssetError, cardAssets, fontError, fontsLoaded]);

  if ((!fontsLoaded && !fontError) || (!cardAssets && !cardAssetError)) {
    console.log('BOOT 5: waiting for fonts/assets');
    return null;
  }

  console.log('BOOT 6: assets ready, rendering navigator');
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'none',
              contentStyle: { backgroundColor: colors.bg },
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="store" />
            <Stack.Screen name="list" />
            <Stack.Screen name="profile" />
            <Stack.Screen name="settings" />
          </Stack>
          <GlobalNavBar />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
