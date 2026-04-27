/**
 * BLE Device types and interfaces
 */

export interface BLEDevice {
  id: string;
  name: string;
  peripheralID: string;
  rssi: number;
  lastSeen: number;
  isConnected: boolean;
  isBonded?: boolean;
  services?: BLEService[];
  characteristics?: BLECharacteristic[];
}

export interface BLEService {
  uuid: string;
  isPrimary: boolean;
}

export interface BLECharacteristic {
  uuid: string;
  serviceUUID: string;
  properties: BLECharacteristicProperties;
  value?: string;
}

export interface BLECharacteristicProperties {
  Read: boolean;
  Write: boolean;
  WriteWithoutResponse: boolean;
  Notify: boolean;
  Indicate: boolean;
  Broadcast: boolean;
}

export interface SensorPacket {
  seq: number;
  air: number;
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
}

export type BLEScanState = "idle" | "scanning" | "stopped" | "error";
export type BLEConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";
export type BluetoothPermissionState = "unknown" | "granted" | "denied";
