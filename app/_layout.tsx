import { useEffect } from 'react';
import { configureRevenueCat, isRevenueCatConfigured, Purchases } from '@lib/revenuecat';
import { syncMasterPassFromCustomerInfo } from '@lib/entitlement';
import { installMultiplayerBridge } from '@store/multiplayerBridge';
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

export default function RootLayout() {
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

  useEffect(() => {
    configureRevenueCat();

    // Entitlement listener: map RevenueCat `master` entitlement to hasMasterPass.
    // Purchases.addCustomerInfoUpdateListener fires on purchase/restore/refresh,
    // and we also pull the latest customerInfo on startup so a returning Master
    // keeps hosting rights without a new purchase.
    let listener: ((info: import('react-native-purchases').CustomerInfo) => void) | null = null;
    if (isRevenueCatConfigured()) {
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
        Purchases.removeCustomerInfoUpdateListener(listener);
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
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
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
