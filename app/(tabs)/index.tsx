import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useBLE } from "@/context/BLEContext";

export default function IndexScreen() {
  const { connectedDevice, connectionState } = useBLE();
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.eyebrow}>AeroSense</Text>
        <Text style={styles.title}>Test Control</Text>
        <Text style={styles.subtitle}>
          Start a new assessment session when your athlete and device are ready.
        </Text>

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Session Status</Text>
          <Text style={styles.heroValue}>
            {connectedDevice
              ? "Device ready for testing"
              : "Waiting for device"}
          </Text>
          <Text style={styles.heroHint}>
            {connectedDevice
              ? `${connectedDevice.name} • ${connectionState}`
              : "Connect a nearby sensor from the Bluetooth tab before starting."}
          </Text>

          <Pressable
            style={styles.primaryButton}
            onPress={() =>
              router.push({
                pathname: "/(tabs)/test",
                params: { autoStart: "true" },
              })
            }
          >
            <Text style={styles.primaryButtonText}>Start Test</Text>
          </Pressable>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.sectionTitle}>Before You Begin</Text>
          <Text style={styles.infoText}>
            Verify the sensor is attached and the Bluetooth connection is stable
            before starting the test.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#071225",
  },
  container: {
    flex: 1,
    backgroundColor: "#071225",
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  eyebrow: {
    color: "#8FF5CF",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.4,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  title: {
    color: "#F4F7FB",
    fontSize: 30,
    fontWeight: "800",
    marginBottom: 8,
  },
  subtitle: {
    color: "#A7B6CF",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  heroCard: {
    backgroundColor: "#101D35",
    borderColor: "#1B2C4B",
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
    marginBottom: 18,
  },
  heroLabel: {
    color: "#8FF5CF",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.1,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  heroValue: {
    color: "#F4F7FB",
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 8,
  },
  heroHint: {
    color: "#8A9BB8",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  primaryButton: {
    backgroundColor: "#8FF5CF",
    borderRadius: 14,
    paddingVertical: 16,
  },
  primaryButtonText: {
    color: "#072033",
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
    textTransform: "uppercase",
  },
  infoCard: {
    backgroundColor: "#0E1A30",
    borderColor: "#1B2C4B",
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
  },
  sectionTitle: {
    color: "#E8EEF7",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.4,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  infoText: {
    color: "#9AAACA",
    fontSize: 14,
    lineHeight: 20,
  },
});
