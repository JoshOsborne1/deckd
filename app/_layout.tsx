import { useEffect } from 'react';
import { configureRevenueCat } from '@lib/revenuecat';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { GlobalNavBar } from '@components/GlobalNavBar';
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

  useEffect(() => {
    configureRevenueCat();
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
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
