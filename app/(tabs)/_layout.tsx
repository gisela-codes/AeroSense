import { Tabs } from "expo-router";
import React from "react";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      initialRouteName="scanner"
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#09152A",
          borderTopColor: "#1A2740",
          height: 72,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarInactiveTintColor: "#73829E",
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "700",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Test",
        }}
      />
      <Tabs.Screen
        name="scanner"
        options={{
          title: "Bluetooth",
        }}
      />
      <Tabs.Screen
        name="test"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
