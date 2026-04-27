import { scaleLinear } from "d3-scale";
import { curveMonotoneX, line } from "d3-shape";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { supabase } from "@/utils/supabase";
import {
  TEST_SESSION_STORAGE_KEY,
  type CapturedSensorSample,
  type StoredTestSession,
} from "@/utils/testSessions";

type TestStatus = "idle" | "running";
type TestEndReason = "stopped" | "device_disconnected";

interface PredictionResult {
  label: string;
  confidence: number;
}

type PredictionValue =
  | PredictionResult
  | string
  | number
  | boolean
  | Record<string, unknown>
  | null;

interface PredictionResponse {
  device_id: string;
  accepted_samples: number;
  dropped_samples: number;
  buffer_sample_count: number;
  window_size: number;
  step_size: number;
  ready: boolean;
  prediction: PredictionValue;
  last_sequence_number: number | null;
  sequence_warning?: string | null;
  prediction_ready: boolean;
  samples_needed: number;
}

interface TestSessionDevice {
  id: string;
  name: string;
  streamId: string;
}
const AIR_CHART_HEIGHT = 180;
const AIR_CHART_PADDING = 18;
const AIR_CHART_WIDTH = 320;
const AIR_CHART_POINTS = 40;
const SUPABASE_SENSOR_TABLE =
  process.env.EXPO_PUBLIC_SUPABASE_SENSOR_TABLE ?? "test_sessions";
const SUPABASE_INSERT_CHUNK_SIZE = 500;
const PREDICTION_STREAM_URL =
  process.env.EXPO_PUBLIC_PREDICTION_STREAM_URL ??
  "https://aerosense-microcontroller-production.up.railway.app/stream";

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

const formatPrediction = (prediction: PredictionValue) => {
  if (prediction === null || typeof prediction === "undefined") {
    return "Waiting for prediction";
  }

  if (
    typeof prediction === "object" &&
    "label" in prediction &&
    typeof prediction.label === "string"
  ) {
    return prediction.label;
  }

  if (typeof prediction === "string") {
    return prediction;
  }

  if (typeof prediction === "number" || typeof prediction === "boolean") {
    return String(prediction);
  }

  return JSON.stringify(prediction);
};

const formatPredictionConfidence = (prediction: PredictionValue) => {
  if (
    prediction &&
    typeof prediction === "object" &&
    "confidence" in prediction &&
    typeof prediction.confidence === "number"
  ) {
    return `${Math.round(prediction.confidence * 100)}% confidence`;
  }

  return null;
};

const hasPredictionValue = (
  prediction: PredictionValue,
): prediction is Exclude<PredictionValue, null> => {
  return prediction !== null && typeof prediction !== "undefined";
};

const hasValidSensorPacket = (packet: SensorPacket | null | undefined) => {
  if (!packet) {
    return false;
  }

  return [
    packet.seq,
    packet.air,
    packet.ax,
    packet.ay,
    packet.az,
    packet.gx,
    packet.gy,
    packet.gz,
  ].every((value) => Number.isFinite(value));
};

export default function TestScreen() {
  const { autoStart } = useLocalSearchParams<{ autoStart?: string }>();
  const router = useRouter();
  const { connectedDevice, connectionState, receivedData } = useBLE();
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [savedSessionCount, setSavedSessionCount] = useState(0);
  const [predictionState, setPredictionState] =
    useState<PredictionResponse | null>(null);
  const [latestPrediction, setLatestPrediction] =
    useState<PredictionValue>(null);
  const [predictionError, setPredictionError] = useState<string | null>(null);
  const [uploadStatusMessage, setUploadStatusMessage] = useState<string | null>(
    null,
  );
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(
    null,
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const accumulatedMsRef = useRef(0);
  const sessionDeviceRef = useRef<TestSessionDevice | null>(null);
  const sessionPacketsRef = useRef<CapturedSensorSample[]>([]);
  const sessionStartedAtRef = useRef<string | null>(null);
  const lastCapturedSeqRef = useRef<number | null>(null);
  const queuedPredictionSamplesRef = useRef<SensorPacket[]>([]);
  const isStreamingPredictionRef = useRef(false);
  const hasAutoStartedRef = useRef(false);
  const latestPacket = receivedData[0] ?? null;
  const hasConnectedDevice =
    Boolean(connectedDevice) && connectionState === "connected";
  const hasValidSensorData = hasValidSensorPacket(latestPacket);
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

    const path = line()
      .x((_: number, index: number) => xScale(index))
      .y((value: number) => yScale(value))
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
      setUploadErrorMessage("No sensor samples were captured for this test.");
      return;
    }

    setUploadStatusMessage("Saving test session locally...");
    setUploadErrorMessage(null);

    const sessionRecord: StoredTestSession = {
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
      // console.log("Saved test sessions:", nextSessions);
      // console.log(
      //   "Latest saved session:",
      //   JSON.stringify(nextSessions[0], null, 2),
      // );
      setUploadStatusMessage("Local session saved. Uploading to Supabase...");
    } catch (error) {
      console.log("Unable to persist test session:", error);
      setUploadErrorMessage(
        error instanceof Error
          ? `Local save failed: ${error.message}`
          : "Local save failed.",
      );
    }

    try {
      const deviceId = sessionDeviceRef.current?.streamId;

      if (!deviceId) {
        setUploadErrorMessage("Missing test session ID for Supabase upload.");
        return;
      }

      const rows = sessionPacketsRef.current.map((packet) => ({
        accel_x: packet.ax,
        accel_y: packet.ay,
        accel_z: packet.az,
        captured_at: packet.capturedAt,
        device_id: deviceId,
        gyro_x: packet.gx,
        gyro_y: packet.gy,
        gyro_z: packet.gz,
        time_ms: packet.elapsedMs,
        time_s: packet.elapsedSeconds,
      }));

      for (
        let index = 0;
        index < rows.length;
        index += SUPABASE_INSERT_CHUNK_SIZE
      ) {
        const chunk = rows.slice(index, index + SUPABASE_INSERT_CHUNK_SIZE);
        const { error } = await supabase
          .from(SUPABASE_SENSOR_TABLE)
          .insert(chunk);

        if (error) {
          throw error;
        }
      }

      setUploadStatusMessage(
        `Uploaded ${rows.length} samples to Supabase table "${SUPABASE_SENSOR_TABLE}".`,
      );
    } catch (error) {
      console.log("Unable to upload sensor samples to Supabase:", error);
      setUploadErrorMessage(
        error instanceof Error
          ? `Supabase upload failed: ${error.message}`
          : "Supabase upload failed.",
      );
    }
  };

  const resetSessionState = () => {
    accumulatedMsRef.current = 0;
    startedAtRef.current = null;
    sessionPacketsRef.current = [];
    sessionDeviceRef.current = null;
    sessionStartedAtRef.current = null;
    lastCapturedSeqRef.current = null;
    queuedPredictionSamplesRef.current = [];
    isStreamingPredictionRef.current = false;
    setPredictionState(null);
    setLatestPrediction(null);
    setPredictionError(null);
    setUploadStatusMessage(null);
    setUploadErrorMessage(null);
    setTestStatus("idle");
    setElapsedMs(0);
  };

  const flushPredictionQueue = useCallback(async () => {
    if (isStreamingPredictionRef.current) {
      return;
    }

    isStreamingPredictionRef.current = true;

    try {
      while (queuedPredictionSamplesRef.current.length > 0) {
        const samples = queuedPredictionSamplesRef.current.splice(0);
        const deviceId =
          sessionDeviceRef.current?.streamId ??
          connectedDevice?.id ??
          "test-device";

        const response = await fetch(PREDICTION_STREAM_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            device_id: deviceId,
            samples: samples.map((sample) => ({
              sequence_number: sample.seq,
              ax: sample.ax,
              ay: sample.ay,
              az: sample.az,
              gx: sample.gx,
              gy: sample.gy,
              gz: sample.gz,
            })),
          }),
        });

        if (!response.ok) {
          throw new Error(`Prediction request failed with ${response.status}.`);
        }

        const payload = (await response.json()) as PredictionResponse;
        setPredictionState(payload);
        if (hasPredictionValue(payload.prediction)) {
          setLatestPrediction(payload.prediction);
        }
        setPredictionError(null);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to stream samples for prediction.";
      setPredictionError(message);
    } finally {
      isStreamingPredictionRef.current = false;

      if (queuedPredictionSamplesRef.current.length > 0) {
        void flushPredictionQueue();
      }
    }
  }, [connectedDevice?.id]);

  const finalizeElapsedMs = () => {
    if (startedAtRef.current) {
      accumulatedMsRef.current += Date.now() - startedAtRef.current;
      startedAtRef.current = null;
    }

    return accumulatedMsRef.current;
  };

  const getCurrentElapsedMs = () => {
    if (!startedAtRef.current) {
      return accumulatedMsRef.current;
    }

    return accumulatedMsRef.current + (Date.now() - startedAtRef.current);
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

    const elapsedAtCapture = getCurrentElapsedMs();
    const capturedSample: CapturedSensorSample = {
      ...latestPacket,
      capturedAt: new Date().toISOString(),
      elapsedMs: elapsedAtCapture,
      elapsedSeconds: Number((elapsedAtCapture / 1000).toFixed(3)),
    };

    sessionPacketsRef.current = [...sessionPacketsRef.current, capturedSample];
    lastCapturedSeqRef.current = latestPacket.seq;

    if (testStatus === "running") {
      queuedPredictionSamplesRef.current = [
        ...queuedPredictionSamplesRef.current,
        latestPacket,
      ];
      void flushPredictionQueue();
    }
  }, [flushPredictionQueue, latestPacket, testStatus]);

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

    return hasConnectedDevice ? "Ready to begin" : "Bluetooth device needed";
  }, [hasConnectedDevice, testStatus]);

  const timerLabel = formatElapsedTime(elapsedMs);
  const predictionReady = Boolean(
    predictionState?.prediction_ready && predictionState?.ready,
  );
  const hasReadyPrediction = hasPredictionValue(latestPrediction);
  const displayedPrediction = hasReadyPrediction ? latestPrediction : null;
  const displayedPredictionConfidence =
    formatPredictionConfidence(displayedPrediction);

  const handleStart = useCallback(() => {
    if (!hasConnectedDevice || !connectedDevice) {
      Alert.alert(
        "Bluetooth Device Required",
        "Connect a sensor from the Bluetooth tab before starting a test.",
      );
      return;
    }

    if (!hasValidSensorData) {
      Alert.alert(
        "Sensor Data Not Ready",
        "Wait until the connected device is streaming valid sensor data before starting the test.",
      );
      return;
    }

    if (testStatus === "idle") {
      const sessionStreamId = `${connectedDevice.id}-${Date.now()}`;
      sessionPacketsRef.current = [];
      sessionDeviceRef.current = {
        id: connectedDevice.id,
        name: connectedDevice.name,
        streamId: sessionStreamId,
      };
      sessionStartedAtRef.current = new Date().toISOString();
      lastCapturedSeqRef.current = null;
      queuedPredictionSamplesRef.current = [];
      isStreamingPredictionRef.current = false;
      setPredictionState(null);
      setLatestPrediction(null);
      setPredictionError(null);
      setUploadStatusMessage(null);
      setUploadErrorMessage(null);
      accumulatedMsRef.current = 0;
      setElapsedMs(0);
      startedAtRef.current = Date.now();
      setTestStatus("running");
    }
  }, [connectedDevice, hasConnectedDevice, hasValidSensorData, testStatus]);

  const handleStop = async () => {
    const finalElapsedMs = finalizeElapsedMs();
    setElapsedMs(finalElapsedMs);
    await persistSession("stopped", finalElapsedMs);
    resetSessionState();
    router.replace("/(tabs)/history");
  };

  useEffect(() => {
    if (hasAutoStartedRef.current) {
      return;
    }

    if (!hasConnectedDevice || testStatus !== "idle") {
      return;
    }

    if (autoStart !== "true" && autoStart !== undefined) {
      return;
    }

    hasAutoStartedRef.current = true;
    handleStart();
  }, [autoStart, handleStart, hasConnectedDevice, testStatus]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <Text style={styles.eyebrow}> AeroSense</Text>
          <Text style={styles.title}>Active Test</Text>
          {/* <Text style={styles.subtitle}>
            This live workspace keeps the timer and prediction stream moving
            until you stop the session.
          </Text> */}

          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>Current Setup</Text>
            <Text style={styles.heroValue}>{statusLabel}</Text>
            <Text style={styles.heroHint}>
              {connectedDevice
                ? `${connectedDevice.name} • ${connectionState}`
                : "Return to Bluetooth to connect your sensor before starting the live test."}
            </Text>
            {/* <Text style={styles.sessionHint}>
              {savedSessionCount > 0
                ? `${savedSessionCount} saved test sessions on this device`
                : "Test sessions are saved locally when you stop the timer or the device disconnects."}
            </Text> */}
            {uploadStatusMessage ? (
              <Text style={styles.uploadStatusText}>{uploadStatusMessage}</Text>
            ) : null}
            {uploadErrorMessage ? (
              <Text style={styles.uploadErrorText}>{uploadErrorMessage}</Text>
            ) : null}
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

            <View style={styles.predictionCard}>
              <View style={styles.chartHeader}>
                <Text style={styles.packetLabel}>Prediction Stream</Text>
                <Text style={styles.predictionStatusBadge}>
                  {predictionReady
                    ? "Ready"
                    : hasReadyPrediction
                      ? "Updating"
                      : "Buffering"}
                </Text>
              </View>
              <Text style={styles.predictionValue}>
                {formatPrediction(displayedPrediction)}
              </Text>
              {displayedPredictionConfidence ? (
                <Text style={styles.predictionConfidence}>
                  {displayedPredictionConfidence}
                </Text>
              ) : null}
              {/* <Text style={styles.predictionHint}>
                {predictionState
                  ? `${predictionState.accepted_samples} accepted • ${predictionState.buffer_sample_count}/${predictionState.window_size} buffered • ${predictionState.samples_needed} samples needed`
                  : "Start the timer to stream motion samples and receive predictions."}
              </Text>
              {predictionState &&
              predictionState.last_sequence_number !== null ? (
                <Text style={styles.predictionDebugHint}>
                  API last sequence: {predictionState.last_sequence_number} •
                  dropped: {predictionState.dropped_samples}
                </Text>
              ) : null}
              {predictionState?.sequence_warning ? (
                <Text style={styles.predictionWarning}>
                  {predictionState.sequence_warning}
                </Text>
              ) : null}
              {predictionError ? (
                <Text style={styles.predictionError}>{predictionError}</Text>
              ) : null} */}
            </View>
          </View>
        </View>
      </ScrollView>
      <View style={styles.bottomDock}>
        {testStatus === "idle" ? (
          <Pressable
            style={[
              styles.dockButton,
              !hasConnectedDevice && styles.actionButtonDisabled,
            ]}
            onPress={handleStart}
            disabled={!hasConnectedDevice}
          >
            <Text style={styles.dockButtonText}>Start Test</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => void handleStop()}
            style={styles.dockStopButton}
          >
            <Text style={styles.dockStopButtonText}>Stop Test</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#071225",
  },
  scrollContent: {
    paddingBottom: 140,
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
  uploadStatusText: {
    color: "#A9F6D5",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  uploadErrorText: {
    color: "#FF9BAA",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
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
  predictionCard: {
    backgroundColor: "#0B1630",
    borderColor: "#1F3357",
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  predictionStatusBadge: {
    color: "#8FF5CF",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  predictionValue: {
    color: "#F4F7FB",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 8,
  },
  predictionConfidence: {
    color: "#8FF5CF",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  predictionHint: {
    color: "#A7B6CF",
    fontSize: 13,
    lineHeight: 18,
  },
  predictionDebugHint: {
    color: "#7FA2D6",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },
  predictionWarning: {
    color: "#FFD479",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10,
  },
  predictionError: {
    color: "#FF9BAA",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10,
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
  bottomDock: {
    backgroundColor: "#071225",
    borderTopColor: "#1B2C4B",
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  dockButton: {
    backgroundColor: "#8FF5CF",
    borderRadius: 16,
    paddingVertical: 18,
  },
  dockButtonText: {
    color: "#072033",
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
    textTransform: "uppercase",
  },
  dockStopButton: {
    alignItems: "center",
    backgroundColor: "#3A1620",
    borderColor: "#6E2D3D",
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 18,
  },
  dockStopButtonText: {
    color: "#FFD8DD",
    fontSize: 16,
    fontWeight: "800",
    textTransform: "uppercase",
  },
});
