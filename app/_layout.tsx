import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import "react-native-reanimated";

import { AuthProvider, useAuth } from "@/context/AuthContext";
import { BLEProvider } from "@/context/BLEContext";
import { useColorScheme } from "@/hooks/use-color-scheme";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <BLEProvider>
        <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
          <RootNavigator />
          <StatusBar style="auto" />
        </ThemeProvider>
      </BLEProvider>
    </AuthProvider>
  );
}

function RootNavigator() {
  const { isGuest, loading, session } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) {
      return;
    }

    const inAuthGroup = segments[0] === "(auth)";

    const hasAccess = Boolean(session) || isGuest;

    if (!hasAccess && !inAuthGroup) {
      router.replace("/(auth)/signin");
      return;
    }

    if (hasAccess && inAuthGroup) {
      router.replace("/(tabs)/scanner");
    }
  }, [isGuest, loading, router, segments, session]);

  if (loading) {
    return null;
  }

  return (
    <Stack>
      <Stack.Screen
        name="(auth)/signin"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="(tabs)"
        options={{
          headerShown: false,
          headerBackButtonDisplayMode: "minimal",
        }}
      />
    </Stack>
  );
}
