/**
 * BLE Context - Global state for BLE operations
 */

import { notificationService } from "@/Notification-Handler/notificationService";
import {
  BLEConnectionState,
  BLEDevice,
  BLEScanState,
  BluetoothPermissionState,
  SensorPacket,
} from "@/types/ble";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Linking,
  PermissionsAndroid,
  Platform,
  type EventSubscription,
} from "react-native";
import BleManager, { BleState } from "react-native-ble-manager";

interface BLEContextType {
  scanState: BLEScanState;
  devices: BLEDevice[];
  startScan: () => Promise<void>;
  stopScan: () => Promise<void>;

  connectionState: BLEConnectionState;
  connectedDevice: BLEDevice | null;
  connect: (deviceId: string) => Promise<void>;
  disconnect: () => Promise<void>;

  receivedData: SensorPacket[];
  clearData: () => void;

  error: string | null;
  clearError: () => void;

  permissionState: BluetoothPermissionState;
  bluetoothState: string;
  requestPermissions: () => Promise<boolean>;
  refreshBluetoothState: () => Promise<string>;
  prepareBluetooth: () => Promise<boolean>;
}

const BLEContext = createContext<BLEContextType | undefined>(undefined);

const ANDROID_12_PERMISSIONS = [
  PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
  PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
] as const;

const LEGACY_ANDROID_PERMISSIONS = [
  PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
] as const;

export const BLEProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const bleAvailable = useMemo(() => {
    return (
      typeof BleManager.start === "function" &&
      typeof BleManager.scan === "function" &&
      typeof BleManager.stopScan === "function"
    );
  }, []);
  const subscriptionsRef = useRef<EventSubscription[]>([]);
  const bleStartedRef = useRef(false);
  const connectedDeviceIdRef = useRef<string | null>(null);
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [scanState, setScanState] = useState<BLEScanState>("idle");
  const [connectionState, setConnectionState] =
    useState<BLEConnectionState>("disconnected");
  const [devices, setDevices] = useState<BLEDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<BLEDevice | null>(
    null,
  );
  const [receivedData, setReceivedData] = useState<SensorPacket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [permissionState, setPermissionState] =
    useState<BluetoothPermissionState>("unknown");
  const [bluetoothState, setBluetoothState] = useState<string>("unknown");

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearData = useCallback(() => {
    setReceivedData([]);
  }, []);

  const parseSensorPacket = (bytes: number[]): SensorPacket | undefined => {
    const expectedLength = 16;
    if (bytes.length < expectedLength) {
      return undefined;
    }

    const dataView = new DataView(Uint8Array.from(bytes).buffer);
    return {
      seq: dataView.getUint16(0, true),
      air: dataView.getInt16(2, true),
      ax: dataView.getInt16(4, true) / 2048,
      ay: dataView.getInt16(6, true) / 2048,
      az: dataView.getInt16(8, true) / 2048,
      gx: dataView.getInt16(10, true) / 131,
      gy: dataView.getInt16(12, true) / 131,
      gz: dataView.getInt16(14, true) / 131,
    };
  };

  const ensureBleAvailable = useCallback(() => {
    if (bleAvailable) {
      return true;
    }

    setError(
      "Bluetooth is not available in this build. Use a development build that includes the native BLE module.",
    );
    setScanState("error");
    return false;
  }, [bleAvailable]);

  const refreshBluetoothState = useCallback(async () => {
    if (!ensureBleAvailable()) {
      return "unsupported";
    }

    try {
      const state = await BleManager.checkState();
      setBluetoothState(state);
      return state;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to read Bluetooth state.";
      setError(message);
      return "unknown";
    }
  }, [ensureBleAvailable]);

  const requestPermissions = useCallback(async () => {
    if (Platform.OS !== "android") {
      setPermissionState("granted");
      return true;
    }

    try {
      const permissions =
        typeof Platform.Version === "number" && Platform.Version >= 31
          ? ANDROID_12_PERMISSIONS
          : LEGACY_ANDROID_PERMISSIONS;

      const results = await PermissionsAndroid.requestMultiple([
        ...permissions,
      ]);
      const allGranted = permissions.every(
        (permission) =>
          results[permission] === PermissionsAndroid.RESULTS.GRANTED,
      );

      setPermissionState(allGranted ? "granted" : "denied");

      if (!allGranted) {
        setError("Bluetooth permission is required to discover and connect.");
      } else {
        setError(null);
      }

      return allGranted;
    } catch (err) {
      setPermissionState("denied");
      setError(
        err instanceof Error
          ? err.message
          : "Unable to request Bluetooth permissions.",
      );
      return false;
    }
  }, []);

  const prepareBluetooth = useCallback(async () => {
    if (!ensureBleAvailable()) {
      return false;
    }

    const permissionsGranted = await requestPermissions();
    if (!permissionsGranted) {
      return false;
    }

    try {
      if (!bleStartedRef.current) {
        await BleManager.start({ showAlert: Platform.OS === "ios" });
        bleStartedRef.current = true;
      }

      let currentState = await BleManager.checkState();
      setBluetoothState(currentState);

      if (currentState !== BleState.On && Platform.OS === "android") {
        await BleManager.enableBluetooth();
        currentState = await BleManager.checkState();
        setBluetoothState(currentState);
      }

      if (currentState !== BleState.On) {
        if (Platform.OS === "ios") {
          Alert.alert(
            "Bluetooth Is Off",
            "Turn on Bluetooth in Settings or Control Center to find and pair with your device.",
            [
              {
                text: "Cancel",
                style: "cancel",
              },
              {
                text: "Open Settings",
                onPress: () => {
                  Linking.openSettings().catch(() => {
                    return;
                  });
                },
              },
            ],
          );
        }
        setError("Turn on Bluetooth to scan for nearby devices.");
        return false;
      }

      setError(null);
      return true;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Bluetooth setup failed. Please try again.";
      setError(message);
      return false;
    }
  }, [ensureBleAvailable, requestPermissions]);

  useEffect(() => {
    if (!bleAvailable) {
      return;
    }

    let mounted = true;

    const setup = async () => {
      try {
        await BleManager.start({ showAlert: Platform.OS === "ios" });
        bleStartedRef.current = true;

        if (!mounted) {
          return;
        }

        const state = await BleManager.checkState();
        if (mounted) {
          setBluetoothState(state);
        }
      } catch (err) {
        if (mounted) {
          setError(
            err instanceof Error ? err.message : "Bluetooth setup failed.",
          );
        }
      }
    };

    setup();

    subscriptionsRef.current = [
      BleManager.onDiscoverPeripheral((peripheral) => {
        const peripheralName =
          peripheral.name?.trim() || peripheral.advertising?.localName?.trim();

        if (!peripheralName) {
          return;
        }

        setDevices((prev) => {
          const nextDevice: BLEDevice = {
            id: peripheral.id,
            name: peripheralName,
            peripheralID: peripheral.id,
            rssi: peripheral.rssi ?? 0,
            lastSeen: Date.now(),
            isConnected: connectedDeviceIdRef.current === peripheral.id,
          };
          const existingIndex = prev.findIndex(
            (item) => item.id === peripheral.id,
          );

          if (existingIndex === -1) {
            return [...prev, nextDevice];
          }

          return prev.map((item, index) =>
            index === existingIndex
              ? {
                  ...item,
                  ...nextDevice,
                  isBonded: item.isBonded,
                }
              : item,
          );
        });
      }),
      BleManager.onStopScan(() => {
        setScanState("stopped");
      }),
      BleManager.onDidUpdateState(({ state }) => {
        setBluetoothState(state);
      }),
      BleManager.onDisconnectPeripheral(({ peripheral }) => {
        setDevices((prev) =>
          prev.map((item) =>
            item.id === peripheral ? { ...item, isConnected: false } : item,
          ),
        );
        connectedDeviceIdRef.current = null;
        setConnectionState("disconnected");
        setConnectedDevice(null);
        notificationService.notify("Bluetooth", "Device disconnected.", "info");
      }),
      BleManager.onDidUpdateValueForCharacteristic((event) => {
        if (event.peripheral === connectedDeviceIdRef.current) {
          const bytes = event.value || [];
          const packet = parseSensorPacket(bytes);
          if (!packet) {
            return;
          }

          setReceivedData((prev) => [packet, ...prev].slice(0, 50));
        }
      }),
      BleManager.onPeripheralDidBond((peripheral) => {
        setDevices((prev) =>
          prev.map((item) =>
            item.id === peripheral.id ? { ...item, isBonded: true } : item,
          ),
        );
      }),
    ];

    return () => {
      mounted = false;
      subscriptionsRef.current.forEach((subscription) => subscription.remove());
      subscriptionsRef.current = [];

      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }
    };
  }, [bleAvailable]);

  const startScan = useCallback(async () => {
    const ready = await prepareBluetooth();
    if (!ready) {
      setScanState("error");
      return;
    }

    try {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }

      setScanState("scanning");
      setDevices((prev) =>
        prev.filter((device) => device.isConnected || device.isBonded),
      );

      await BleManager.scan({
        serviceUUIDs: [],
        seconds: 8,
        allowDuplicates: false,
      });

      scanTimeoutRef.current = setTimeout(() => {
        BleManager.stopScan().catch(() => {
          return;
        });
      }, 8500) as unknown as NodeJS.Timeout;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed.");
      setScanState("error");
    }
  }, [prepareBluetooth]);

  const stopScan = useCallback(async () => {
    if (!bleAvailable) {
      return;
    }

    try {
      await BleManager.stopScan();
      setScanState("stopped");

      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop scan.");
    }
  }, [bleAvailable]);

  const connect = useCallback(
    async (deviceId: string) => {
      const ready = await prepareBluetooth();
      if (!ready) {
        setConnectionState("error");
        return;
      }

      try {
        setConnectionState("connecting");
        setError(null);
        setReceivedData([]);

        await stopScan();

        if (Platform.OS === "android") {
          try {
            await BleManager.createBond(deviceId);
          } catch {
            // Many BLE devices connect without a separate bond step.
          }
        }

        await BleManager.connect(deviceId);
        const peripheralData = await BleManager.retrieveServices(deviceId);

        const device: BLEDevice = {
          id: deviceId,
          name: peripheralData.name || `Device ${deviceId.slice(0, 8)}`,
          peripheralID: deviceId,
          rssi:
            devices.find((item) => item.id === deviceId)?.rssi ??
            connectedDevice?.rssi ??
            0,
          lastSeen: Date.now(),
          isConnected: true,
          isBonded: Platform.OS === "android" ? true : undefined,
          services:
            peripheralData.services?.map((service: { uuid: string }) => ({
              uuid: service.uuid,
              isPrimary: true,
            })) || [],
          characteristics:
            peripheralData.characteristics?.map(
              (characteristic: {
                characteristic: string;
                service: string;
                properties?: Record<string, string>;
              }) => ({
                uuid: characteristic.characteristic,
                serviceUUID: characteristic.service,
                properties: {
                  Read: Boolean(characteristic.properties?.Read),
                  Write: Boolean(characteristic.properties?.Write),
                  WriteWithoutResponse: Boolean(
                    characteristic.properties?.WriteWithoutResponse,
                  ),
                  Notify: Boolean(characteristic.properties?.Notify),
                  Indicate: Boolean(characteristic.properties?.Indicate),
                  Broadcast: Boolean(characteristic.properties?.Broadcast),
                },
              }),
            ) || [],
        };

        connectedDeviceIdRef.current = deviceId;

        setDevices((prev) =>
          prev.map((item) =>
            item.id === deviceId
              ? { ...item, isConnected: true, isBonded: device.isBonded }
              : { ...item, isConnected: false },
          ),
        );
        // Enable notifications for every notifiable characteristic so that
        // onDidUpdateValueForCharacteristic fires when the firmware calls notify().
        const notifiableChars =
          device.characteristics?.filter(
            (c) => c.properties.Notify || c.properties.Indicate,
          ) ?? [];
        await Promise.allSettled(
          notifiableChars.map((c) =>
            BleManager.startNotification(deviceId, c.serviceUUID, c.uuid),
          ),
        );

        setConnectedDevice(device);
        setConnectionState("connected");
        notificationService.notify(
          "Bluetooth",
          `Connected to ${device.name}.`,
          "success",
        );
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unable to connect to the selected device.";
        setError(message);
        setConnectionState("error");
        notificationService.notify("Bluetooth", message, "error");
      }
    },
    [connectedDevice?.rssi, devices, prepareBluetooth, stopScan],
  );

  const disconnect = useCallback(async () => {
    if (!connectedDevice?.id) {
      return;
    }

    try {
      await BleManager.disconnect(connectedDevice.id);
      connectedDeviceIdRef.current = null;
      setDevices((prev) =>
        prev.map((item) =>
          item.id === connectedDevice.id
            ? { ...item, isConnected: false }
            : item,
        ),
      );
      setConnectionState("disconnected");
      setConnectedDevice(null);
      setReceivedData([]);
      notificationService.notify("Bluetooth", "Disconnected.", "info");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to disconnect device.",
      );
    }
  }, [connectedDevice?.id]);

  const value: BLEContextType = {
    scanState,
    devices,
    startScan,
    stopScan,
    connectionState,
    connectedDevice,
    connect,
    disconnect,
    receivedData,
    clearData,
    error,
    clearError,
    permissionState,
    bluetoothState,
    requestPermissions,
    refreshBluetoothState,
    prepareBluetooth,
  };

  return <BLEContext.Provider value={value}>{children}</BLEContext.Provider>;
};

export const useBLE = () => {
  const context = useContext(BLEContext);
  if (context === undefined) {
    throw new Error("useBLE must be used within BLEProvider");
  }
  return context;
};
