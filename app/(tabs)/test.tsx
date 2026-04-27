import { scaleLinear } from "d3-scale";
import { curveMonotoneX, line } from "d3-shape";
import { router, useLocalSearchParams } from "expo-router";
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Line, Path } from "react-native-svg";

import { useBLE } from "@/context/BLEContext";
import type { SensorPacket } from "@/types/ble";
import { appStorage } from "@/utils/appStorage";

type TestStatus = "idle" | "running" | "paused";
type TestEndReason = "stopped" | "device_disconnected";

const TEST_SESSION_STORAGE_KEY = "aerosense:test-sessions";
const AIR_CHART_HEIGHT = 180;
const AIR_CHART_PADDING = 18;
const AIR_CHART_WIDTH = 320;
const AIR_CHART_POINTS = 40;

const formatElapsedTime = (milliseconds: number) => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":");
};

const formatMetric = (value: number) => {
  return Number.isFinite(value) ? value.toFixed(3) : "--";
};

export default function TestScreen() {
  const { autoStart } = useLocalSearchParams<{ autoStart?: string }>();
  const { connectedDevice, connectionState, receivedData } = useBLE();
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [savedSessionCount, setSavedSessionCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const accumulatedMsRef = useRef(0);
  const sessionDeviceRef = useRef<{ id: string; name: string } | null>(null);
  const sessionPacketsRef = useRef<SensorPacket[]>([]);
  const sessionStartedAtRef = useRef<string | null>(null);
  const lastCapturedSeqRef = useRef<number | null>(null);
  const hasAutoStartedRef = useRef(false);
  const latestPacket = receivedData[0] ?? null;
  const hasConnectedDevice =
    Boolean(connectedDevice) && connectionState === "connected";
  const airDataPoints = useMemo(() => {
    return receivedData
      .slice(0, AIR_CHART_POINTS)
      .map((packet) => packet.air)
      .reverse();
  }, [receivedData]);
  const airChart = useMemo(() => {
    if (airDataPoints.length === 0) {
      return {
        maxAir: null,
        minAir: null,
        path: "",
      };
    }

    const minAir = Math.min(...airDataPoints);
    const maxAir = Math.max(...airDataPoints);
    const domainMin = minAir === maxAir ? minAir - 1 : minAir;
    const domainMax = minAir === maxAir ? maxAir + 1 : maxAir;

    const xScale = scaleLinear()
      .domain([0, Math.max(airDataPoints.length - 1, 1)])
      .range([AIR_CHART_PADDING, AIR_CHART_WIDTH - AIR_CHART_PADDING]);

    const yScale = scaleLinear()
      .domain([domainMin, domainMax])
      .range([AIR_CHART_HEIGHT - AIR_CHART_PADDING, AIR_CHART_PADDING]);

    const path = line<number>()
      .x((_, index) => xScale(index))
      .y((value) => yScale(value))
      .curve(curveMonotoneX)(airDataPoints);

    return {
      maxAir,
      minAir,
      path: path ?? "",
    };
  }, [airDataPoints]);

  const persistSession = async (
    reason: TestEndReason,
    finalElapsedMs: number,
  ) => {
    if (sessionPacketsRef.current.length === 0) {
      return;
    }

    const sessionRecord = {
      id: `${Date.now()}`,
      deviceId: sessionDeviceRef.current?.id ?? null,
      deviceName: sessionDeviceRef.current?.name ?? null,
      endedAt: new Date().toISOString(),
      endedReason: reason,
      elapsedMs: finalElapsedMs,
      packetCount: sessionPacketsRef.current.length,
      packets: sessionPacketsRef.current,
      startedAt: sessionStartedAtRef.current,
    };

    try {
      const existingValue = await appStorage.getItem(TEST_SESSION_STORAGE_KEY);
      const existingSessions = existingValue ? JSON.parse(existingValue) : [];
      const nextSessions = [sessionRecord, ...existingSessions].slice(0, 25);

      await appStorage.setItem(
        TEST_SESSION_STORAGE_KEY,
        JSON.stringify(nextSessions),
      );
      setSavedSessionCount(nextSessions.length);
      console.log("Saved test sessions:", nextSessions);
      console.log(
        "Latest saved session:",
        JSON.stringify(nextSessions[0], null, 2),
      );
    } catch (error) {
      console.log("Unable to persist test session:", error);
    }
  };

  const resetSessionState = () => {
    accumulatedMsRef.current = 0;
    startedAtRef.current = null;
    sessionPacketsRef.current = [];
    sessionDeviceRef.current = null;
    sessionStartedAtRef.current = null;
    lastCapturedSeqRef.current = null;
    setTestStatus("idle");
    setElapsedMs(0);
  };

  const finalizeElapsedMs = () => {
    if (startedAtRef.current) {
      accumulatedMsRef.current += Date.now() - startedAtRef.current;
      startedAtRef.current = null;
    }

    return accumulatedMsRef.current;
  };

  useEffect(() => {
    if (!latestPacket) {
      return;
    }

    // console.log("Latest sensor packet:", latestPacket);
  }, [latestPacket]);

  useEffect(() => {
    if (!latestPacket || testStatus === "idle") {
      return;
    }

    if (lastCapturedSeqRef.current === latestPacket.seq) {
      return;
    }

    sessionPacketsRef.current = [...sessionPacketsRef.current, latestPacket];
    lastCapturedSeqRef.current = latestPacket.seq;
  }, [latestPacket, testStatus]);

  useEffect(() => {
    if (testStatus !== "running") {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    startedAtRef.current = Date.now();

    intervalRef.current = setInterval(() => {
      const startedAt = startedAtRef.current ?? Date.now();
      setElapsedMs(accumulatedMsRef.current + (Date.now() - startedAt));
    }, 250);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [testStatus]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (hasConnectedDevice || testStatus === "idle") {
      return;
    }

    const finalizeDisconnectedSession = async () => {
      const finalElapsedMs = finalizeElapsedMs();
      setElapsedMs(finalElapsedMs);
      await persistSession("device_disconnected", finalElapsedMs);
      resetSessionState();
    };

    void finalizeDisconnectedSession();
  }, [hasConnectedDevice, testStatus]);

  const statusLabel = useMemo(() => {
    if (testStatus === "running") {
      return "Test in progress";
    }

    if (testStatus === "paused") {
      return "Test paused";
    }

    return hasConnectedDevice ? "Ready to begin" : "Bluetooth device needed";
  }, [hasConnectedDevice, testStatus]);

  const timerLabel = formatElapsedTime(elapsedMs);

  const handleStartOrResume = useCallback(() => {
    if (!hasConnectedDevice || !connectedDevice) {
      Alert.alert(
        "Bluetooth Device Required",
        "Connect a sensor from the Bluetooth tab before starting or resuming a test.",
      );
      return;
    }

    if (testStatus === "paused") {
      startedAtRef.current = Date.now();
    }

    if (testStatus === "idle") {
      sessionPacketsRef.current = [];
      sessionDeviceRef.current = {
        id: connectedDevice.id,
        name: connectedDevice.name,
      };
      sessionStartedAtRef.current = new Date().toISOString();
      lastCapturedSeqRef.current = null;
    }

    if (testStatus === "idle" || testStatus === "paused") {
      setTestStatus("running");
    }
  }, [connectedDevice, hasConnectedDevice, testStatus]);

  const handlePause = () => {
    if (startedAtRef.current) {
      accumulatedMsRef.current += Date.now() - startedAtRef.current;
      setElapsedMs(accumulatedMsRef.current);
      startedAtRef.current = null;
    }

    setTestStatus("paused");
  };

  const handleStop = async () => {
    const finalElapsedMs = finalizeElapsedMs();
    setElapsedMs(finalElapsedMs);
    await persistSession("stopped", finalElapsedMs);
    resetSessionState();
  };

  const handlePrimaryAction = () => {
    if (testStatus === "running") {
      handlePause();
      return;
    }

    handleStartOrResume();
  };

  useEffect(() => {
    if (autoStart !== "true" || hasAutoStartedRef.current) {
      return;
    }

    if (!hasConnectedDevice || testStatus !== "idle") {
      return;
    }

    hasAutoStartedRef.current = true;
    handleStartOrResume();
  }, [autoStart, handleStartOrResume, hasConnectedDevice, testStatus]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <Text style={styles.eyebrow}> AeroSense</Text>
          <Text style={styles.title}>Active Test</Text>
          <Text style={styles.subtitle}>
            This is the live test workspace where we can add the running timer,
            session state, and real-time metrics next.
          </Text>

          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>Current Setup</Text>
            <Text style={styles.heroValue}>{statusLabel}</Text>
            <Text style={styles.heroHint}>
              {connectedDevice
                ? `${connectedDevice.name} • ${connectionState} • ${receivedData.length} packets`
                : "Return to Bluetooth to connect your sensor before starting the live test."}
            </Text>
            <Text style={styles.sessionHint}>
              {savedSessionCount > 0
                ? `${savedSessionCount} saved test sessions on this device`
                : "Test sessions are saved locally when you stop the timer or the device disconnects."}
            </Text>
            {/* 
            <View style={styles.metricsCard}>
              <Text style={styles.packetLabel}>Decoded Sensor Packet</Text>
              {latestPacket ? (
                <>
                  <Text style={styles.metricLine}>
                    {`seq: ${latestPacket.seq} | air: ${latestPacket.air}`}
                  </Text>
                  <Text style={styles.metricLine}>
                    {`ACC: ${formatMetric(latestPacket.ax)}, ${formatMetric(latestPacket.ay)}, ${formatMetric(latestPacket.az)}`}
                  </Text>
                  <Text style={styles.metricLine}>
                    {`GYRO: ${formatMetric(latestPacket.gx)}, ${formatMetric(latestPacket.gy)}, ${formatMetric(latestPacket.gz)}`}
                  </Text>
                </>
              ) : (
                <Text style={styles.packetPreview}>
                  Waiting for the next decoded sensor packet from the connected
                  device.
                </Text>
              )}
            </View> */}

            <View style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <Text style={styles.packetLabel}>Air Pressure</Text>
                {/* <Text style={styles.chartSummary}>
                  {airDataPoints.length > 0
                    ? `${airDataPoints.length} live samples`
                    : "Waiting for live samples"}
                </Text> */}
              </View>
              {airDataPoints.length > 0 ? (
                <>
                  <Svg
                    height={AIR_CHART_HEIGHT}
                    width="100%"
                    viewBox={`0 0 ${AIR_CHART_WIDTH} ${AIR_CHART_HEIGHT}`}
                  >
                    <Line
                      x1={AIR_CHART_PADDING}
                      x2={AIR_CHART_WIDTH - AIR_CHART_PADDING}
                      y1={AIR_CHART_PADDING}
                      y2={AIR_CHART_PADDING}
                      stroke="#244261"
                      strokeDasharray="4 6"
                      strokeWidth={1}
                    />
                    <Line
                      x1={AIR_CHART_PADDING}
                      x2={AIR_CHART_WIDTH - AIR_CHART_PADDING}
                      y1={AIR_CHART_HEIGHT - AIR_CHART_PADDING}
                      y2={AIR_CHART_HEIGHT - AIR_CHART_PADDING}
                      stroke="#244261"
                      strokeDasharray="4 6"
                      strokeWidth={1}
                    />
                    <Path
                      d={airChart.path}
                      fill="none"
                      stroke="#8FF5CF"
                      strokeWidth={3}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </Svg>
                  <View style={styles.chartAxisRow}>
                    <Text style={styles.chartAxisLabel}>
                      Max: {airChart.maxAir ?? "--"}
                    </Text>
                    <Text style={styles.chartAxisLabel}>
                      Min: {airChart.minAir ?? "--"}
                    </Text>
                  </View>
                </>
              ) : (
                <Text style={styles.packetPreview}>
                  Start the sensor stream to see air data draw in real time.
                </Text>
              )}
            </View>

            <View style={styles.timerCard}>
              <Text style={styles.timerLabel}>Elapsed Time</Text>
              <Text style={styles.timerValue}>{timerLabel}</Text>
            </View>

            <Pressable
              style={[
                styles.primaryButton,
                !hasConnectedDevice && styles.actionButtonDisabled,
              ]}
              onPress={handlePrimaryAction}
              disabled={!hasConnectedDevice}
            >
              <Text style={styles.primaryButtonText}>
                {testStatus === "idle"
                  ? "Start Timer"
                  : testStatus === "paused"
                    ? "Resume Timer"
                    : "Pause Timer"}
              </Text>
            </Pressable>

            <View style={styles.actionRow}>
              <Pressable
                disabled={testStatus === "idle" && elapsedMs === 0}
                onPress={() => void handleStop()}
                style={[
                  styles.stopButton,
                  testStatus === "idle" &&
                    elapsedMs === 0 &&
                    styles.actionButtonDisabled,
                ]}
              >
                <Text style={styles.stopButtonText}>Stop</Text>
              </Pressable>
            </View>
          </View>

          <Pressable
            style={styles.secondaryButton}
            onPress={() => router.back()}
          >
            <Text style={styles.secondaryButtonText}>Back to Test Control</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#071225",
  },
  scrollContent: {
    paddingBottom: 32,
  },
  container: {
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
    marginBottom: 8,
  },
  sessionHint: {
    color: "#59D8FF",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 20,
  },
  packetLabel: {
    color: "#8FF5CF",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  packetPreview: {
    color: "#8A9BB8",
    fontSize: 13,
    lineHeight: 18,
  },
  metricsCard: {
    backgroundColor: "#0B1630",
    borderColor: "#1F3357",
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  metricLine: {
    color: "#E8EEF7",
    fontSize: 14,
    lineHeight: 22,
  },
  chartCard: {
    backgroundColor: "#0B1630",
    borderColor: "#1F3357",
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 18,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
  },
  chartHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  chartSummary: {
    color: "#8A9BB8",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  chartAxisRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  chartAxisLabel: {
    color: "#A7B6CF",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  timerCard: {
    backgroundColor: "#0B1630",
    borderColor: "#1F3357",
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  timerLabel: {
    color: "#8A9BB8",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  timerValue: {
    color: "#F4F7FB",
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: 2,
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
  actionRow: {
    flexDirection: "row",
    marginTop: 12,
  },
  stopButton: {
    alignItems: "center",
    backgroundColor: "#3A1620",
    borderColor: "#6E2D3D",
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 14,
  },
  stopButtonText: {
    color: "#FFD8DD",
    fontSize: 14,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  infoCard: {
    backgroundColor: "#0E1A30",
    borderColor: "#1B2C4B",
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    marginBottom: 18,
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
  secondaryButton: {
    alignItems: "center",
    borderColor: "#294066",
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
  },
  secondaryButtonText: {
    color: "#D9E4F7",
    fontSize: 14,
    fontWeight: "700",
  },
});
