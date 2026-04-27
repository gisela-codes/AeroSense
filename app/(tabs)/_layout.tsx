import { BottomTabBar } from "@react-navigation/bottom-tabs";
import { Tabs } from "expo-router";
import React from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { width } = useWindowDimensions();
  const tabBarWidth = Math.min(width - 32, 360);

  return (
    <Tabs
      initialRouteName="scanner"
      tabBar={(props) => (
        <View pointerEvents="box-none" style={styles.tabBarOuter}>
          <View
            style={[
              styles.tabBarShell,
              {
                width: tabBarWidth,
              },
            ]}
          >
            <BottomTabBar {...props} />
          </View>
        </View>
      )}
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        headerShown: false,
        tabBarIcon: () => (
          <View style={{ width: 0, height: 0, overflow: "hidden" }} />
        ),
        tabBarIconStyle: {
          display: "none",
          width: 0,
          height: 0,
          margin: 0,
          padding: 0,
        },
        sceneStyle: {
          backgroundColor: "#071225",
        },
        tabBarBackground: () => <View style={styles.tabBarGlass} />,
        tabBarStyle: {
          backgroundColor: "transparent",
          borderTopWidth: 0,
          borderRadius: 24,
          elevation: 0,
          height: 64,
          overflow: "hidden",
          paddingBottom: 0,
          paddingTop: 0,
          shadowOpacity: 0,
        },
        tabBarInactiveTintColor: "#73829E",
        tabBarItemStyle: {
          flex: 1,
          flexDirection: "row", // ← changes from column to row, kills icon-above-label stacking
          alignItems: "center",
          justifyContent: "center",
          height: 64,
          paddingVertical: 0,
          paddingHorizontal: 0,
          margin: 0,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "700",
          lineHeight: 16,
          margin: 0,
          padding: 0,
          includeFontPadding: false, // ← Android-specific, removes extra font spacing
          textAlignVertical: "center",
          textAlign: "center",
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
        name="history"
        options={{
          title: "History",
        }}
      />
      <Tabs.Screen
        name="test"
        options={{
          href: null,
          tabBarStyle: {
            display: "none",
          },
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarOuter: {
    bottom: 10,
    left: 0,
    pointerEvents: "box-none",
    position: "absolute",
    right: 0,
  },
  tabBarShell: {
    alignSelf: "center",
  },
  tabBarGlass: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(12, 24, 47, 0.78)",
    borderColor: "rgba(173, 214, 255, 0.16)",
    borderRadius: 24,
    borderWidth: 1,
    shadowColor: "#020814",
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    padding: 0,
    margin: 0,
  },
});
