import type { SensorPacket } from "@/types/ble";

export const TEST_SESSION_STORAGE_KEY = "aerosense:test-sessions";

export interface CapturedSensorSample extends SensorPacket {
  capturedAt: string;
  elapsedMs: number;
  elapsedSeconds: number;
}

export interface StoredTestSession {
  id: string;
  deviceId: string | null;
  deviceName: string | null;
  endedAt: string;
  endedReason: "stopped" | "device_disconnected";
  elapsedMs: number;
  packetCount: number;
  packets: CapturedSensorSample[];
  startedAt: string | null;
}

const escapeCsvValue = (value: string | number | null) => {
  if (value === null) {
    return "";
  }

  const stringValue = String(value);

  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n")
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
};

export const buildTestSessionCsv = (session: StoredTestSession) => {
  const header = [
    "device_id",
    "Time(s)",
    "Time(ms)",
    "AccelX",
    "AccelY",
    "AccelZ",
    "GyroX",
    "GyroY",
    "GyroZ",
  ];

  const rows = session.packets.map((packet) =>
    [
      session.deviceId,
      packet.elapsedSeconds,
      packet.elapsedMs,
      packet.ax,
      packet.ay,
      packet.az,
      packet.gx,
      packet.gy,
      packet.gz,
    ]
      .map(escapeCsvValue)
      .join(","),
  );

  return [header.join(","), ...rows].join("\n");
};
