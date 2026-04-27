import React, { useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useBLE } from "@/context/BLEContext";
import { formatRSSI } from "@/utils/formatting";

export default function ScannerScreen() {
  const {
    bluetoothState,
    connect,
    connectedDevice,
    connectionState,
    disconnect,
    devices,
    error,
    permissionState,
    prepareBluetooth,
    receivedData,
    scanState,
    startScan,
    stopScan,
  } = useBLE();

  const isBluetoothOn = bluetoothState === "on";
  const primaryActionLabel =
    scanState === "scanning" ? "Stop Scan" : "Scan for Devices";
  const isConnecting = connectionState === "connecting";
  const visibleDevices = useMemo(
    () =>
      devices.filter((device) => {
        const hasName = Boolean(device.name?.trim());
        return hasName && device.rssi >= -60;
      }),
    [devices],
  );

  const handlePrimaryAction = async () => {
    if (scanState === "scanning") {
      await stopScan();
      return;
    }

    await startScan();
  };

  const handleDevicePress = async (deviceId: string) => {
    if (deviceId === connectedDevice?.id) {
      await disconnect();
      return;
    }

    if (isConnecting) {
      return;
    }

    await connect(deviceId);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.eyebrow}>AeroSense</Text>
        <Text style={styles.title}>Bluetooth Pairing</Text>
        <Text style={styles.subtitle}>
          Allow Bluetooth access, turn Bluetooth on, then tap a nearby device to
          pair and connect.
        </Text>

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Bluetooth Status</Text>
          <Text style={styles.heroValue}>
            {isBluetoothOn ? "Ready to scan" : "Bluetooth is off"}
          </Text>
          <Text style={styles.heroHint}>
            Permission: {permissionState} {"\u2022"} Radio: {bluetoothState}
          </Text>

          <View style={styles.heroActions}>
            <Pressable
              style={styles.primaryButton}
              onPress={handlePrimaryAction}
            >
              <Text style={styles.primaryButtonText}>{primaryActionLabel}</Text>
            </Pressable>
          </View>

          {!isBluetoothOn && permissionState === "granted" && (
            <Pressable style={styles.linkButton} onPress={prepareBluetooth}>
              <Text style={styles.linkButtonText}>Turn On Bluetooth</Text>
            </Pressable>
          )}

          {scanState === "scanning" && (
            <View style={styles.scanningRow}>
              <ActivityIndicator color="#8FF5CF" />
              <Text style={styles.scanningText}>
                Searching for nearby devices...
              </Text>
            </View>
          )}

          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>

        {connectedDevice && (
          <View style={styles.connectedCard}>
            <View style={styles.connectedHeader}>
              <Text style={styles.sectionTitle}>Connected Device</Text>
            </View>
            <Text style={styles.connectedName}>{connectedDevice.name}</Text>
            <Text style={styles.connectedMeta}>
              {connectedDevice.id} {"\u2022"} {formatRSSI(connectedDevice.rssi)}
            </Text>
            {/* <Text style={styles.connectedHint}>
              Latest packets: {receivedData.length}
            </Text> */}
            <Pressable onPress={disconnect} style={styles.disconnectButton}>
              <Text style={styles.disconnectButtonText}>Disconnect Device</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.listHeader}>
          <Text style={styles.sectionTitle}>Found Devices</Text>
          <Text style={styles.sectionCount}>
            {visibleDevices.length} results
          </Text>
        </View>

        <FlatList
          data={visibleDevices}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No devices yet</Text>
              <Text style={styles.emptyText}>
                Start a scan after granting permissions and turning Bluetooth
                on. Only nearby named devices with RSSI of at least -60 dBm are
                shown.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isActiveDevice = item.id === connectedDevice?.id;
            const showConnectingState =
              isConnecting && item.id === connectedDevice?.id;

            return (
              <Pressable
                style={[
                  styles.deviceCard,
                  isActiveDevice && styles.connectedDeviceCard,
                  isConnecting && !isActiveDevice && styles.disabledDeviceCard,
                ]}
                onPress={() => handleDevicePress(item.id)}
              >
                <View style={styles.deviceCopy}>
                  <Text
                    style={[
                      styles.deviceName,
                      isActiveDevice && styles.connectedDeviceName,
                    ]}
                  >
                    {item.name || "Unknown Device"}
                  </Text>
                  <Text style={styles.deviceId}>{item.id}</Text>
                  <Text
                    style={[
                      styles.deviceState,
                      isActiveDevice && styles.connectedDeviceState,
                    ]}
                  >
                    {showConnectingState
                      ? "Connecting..."
                      : isActiveDevice
                        ? "Connected • tap to disconnect"
                        : item.isBonded
                          ? "Paired • tap to connect"
                          : "Tap to pair"}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
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
    marginBottom: 18,
  },
  heroActions: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: "#8FF5CF",
    borderRadius: 14,
    flex: 1,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: "#072033",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  secondaryButton: {
    backgroundColor: "#1A2A48",
    borderColor: "#294066",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  secondaryButtonText: {
    color: "#D9E4F7",
    fontSize: 14,
    fontWeight: "700",
  },
  linkButton: {
    alignSelf: "flex-start",
  },
  linkButtonText: {
    color: "#59D8FF",
    fontSize: 14,
    fontWeight: "700",
  },
  scanningRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  scanningText: {
    color: "#D9E4F7",
    fontSize: 14,
  },
  errorText: {
    color: "#FF948A",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 14,
  },
  connectedCard: {
    backgroundColor: "#0E1A30",
    borderColor: "#20436B",
    borderLeftWidth: 3,
    borderRadius: 18,
    padding: 18,
    marginBottom: 18,
  },
  connectedHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  connectedBadge: {
    backgroundColor: "#133D3A",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  connectedBadgeText: {
    color: "#8FF5CF",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  connectedName: {
    color: "#F4F7FB",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 6,
  },
  connectedMeta: {
    color: "#8194B4",
    fontSize: 13,
    marginBottom: 8,
  },
  connectedHint: {
    color: "#59D8FF",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 14,
  },
  disconnectButton: {
    alignSelf: "flex-start",
    backgroundColor: "#18314E",
    borderColor: "#2E537E",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  disconnectButtonText: {
    color: "#D9E4F7",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  listHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: {
    color: "#E8EEF7",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  sectionCount: {
    color: "#9AAACA",
    fontSize: 13,
    fontWeight: "700",
  },
  listContent: {
    paddingBottom: 24,
  },
  emptyCard: {
    backgroundColor: "#0E1A30",
    borderColor: "#1B2C4B",
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
  },
  emptyTitle: {
    color: "#F4F7FB",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 6,
  },
  emptyText: {
    color: "#9AAACA",
    fontSize: 14,
    lineHeight: 20,
  },
  deviceCard: {
    alignItems: "center",
    backgroundColor: "#0E1A30",
    borderColor: "#1B2C4B",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    padding: 16,
  },
  connectedDeviceCard: {
    backgroundColor: "#162334",
    borderColor: "#47617E",
    opacity: 0.72,
  },
  disabledDeviceCard: {
    opacity: 0.5,
  },
  deviceCopy: {
    flex: 1,
    marginRight: 16,
  },
  deviceName: {
    color: "#F4F7FB",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 4,
  },
  connectedDeviceName: {
    color: "#C8D3E6",
  },
  deviceId: {
    color: "#8194B4",
    fontSize: 12,
    marginBottom: 6,
  },
  deviceState: {
    color: "#8FF5CF",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  connectedDeviceState: {
    color: "#B7C6DA",
  },
  signalWrap: {
    alignItems: "flex-end",
    minWidth: 88,
  },
  signalTrack: {
    backgroundColor: "#21314E",
    borderRadius: 999,
    height: 8,
    overflow: "hidden",
    width: 88,
  },
  signalFill: {
    backgroundColor: "#59D8FF",
    borderRadius: 999,
    height: 8,
  },
  signalText: {
    color: "#8FF5CF",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 8,
  },
});
