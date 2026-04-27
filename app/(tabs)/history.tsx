import { useFocusEffect } from "@react-navigation/native";
import { File, Paths } from "expo-file-system";
import React, { useCallback, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { appStorage } from "@/utils/appStorage";
import {
  buildTestSessionCsv,
  TEST_SESSION_STORAGE_KEY,
  type StoredTestSession,
} from "@/utils/testSessions";

const formatElapsedTime = (milliseconds: number) => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":");
};

const formatDateTime = (value: string) => {
  return new Date(value).toLocaleString();
};

export default function HistoryScreen() {
  const [sessions, setSessions] = useState<StoredTestSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const savedValue = await appStorage.getItem(TEST_SESSION_STORAGE_KEY);
      const parsedSessions: StoredTestSession[] = savedValue
        ? JSON.parse(savedValue)
        : [];
      setSessions(parsedSessions);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadSessions();
    }, [loadSessions]),
  );

  const exportSession = useCallback(async (session: StoredTestSession) => {
    setExportingId(session.id);

    try {
      const csv = buildTestSessionCsv(session);
      const fileName = `aerosense-${session.deviceId ?? "session"}-${session.id}.csv`;

      if (Platform.OS === "web" && typeof document !== "undefined") {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        return;
      }

      const file = new File(Paths.cache, fileName);
      file.create({ overwrite: true });
      file.write(csv);

      await Share.share({
        title: fileName,
        url: file.uri,
      });
    } catch (error) {
      Alert.alert(
        "CSV Export Failed",
        error instanceof Error
          ? error.message
          : "Unable to export this test session right now.",
      );
    } finally {
      setExportingId(null);
    }
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <Text style={styles.eyebrow}>AeroSense</Text>
          <Text style={styles.title}>Session History</Text>
          <Text style={styles.subtitle}>
            Review saved tests and export any session as CSV.
          </Text>

          {loading ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Loading sessions...</Text>
            </View>
          ) : sessions.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No saved sessions yet</Text>
              <Text style={styles.emptyText}>
                Finish a test from the live screen and it will appear here.
              </Text>
            </View>
          ) : (
            sessions.map((session) => (
              <View key={session.id} style={styles.sessionCard}>
                <Text style={styles.sessionDevice}>
                  {session.deviceName ?? "Unknown device"}
                </Text>
                <Text style={styles.sessionMeta}>
                  {session.deviceId ?? "No device ID"} • {session.packetCount} samples
                </Text>
                <Text style={styles.sessionMeta}>
                  Started: {session.startedAt ? formatDateTime(session.startedAt) : "--"}
                </Text>
                <Text style={styles.sessionMeta}>
                  Ended: {formatDateTime(session.endedAt)}
                </Text>
                <Text style={styles.sessionMeta}>
                  Duration: {formatElapsedTime(session.elapsedMs)} • Reason:{" "}
                  {session.endedReason.replace("_", " ")}
                </Text>

                <Pressable
                  disabled={exportingId === session.id}
                  onPress={() => void exportSession(session)}
                  style={[
                    styles.exportButton,
                    exportingId === session.id && styles.exportButtonDisabled,
                  ]}
                >
                  <Text style={styles.exportButtonText}>
                    {exportingId === session.id ? "Preparing CSV..." : "Download CSV"}
                  </Text>
                </Pressable>
              </View>
            ))
          )}
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
  emptyCard: {
    backgroundColor: "#101D35",
    borderColor: "#1B2C4B",
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
  },
  emptyTitle: {
    color: "#F4F7FB",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 8,
  },
  emptyText: {
    color: "#A7B6CF",
    fontSize: 14,
    lineHeight: 20,
  },
  sessionCard: {
    backgroundColor: "#101D35",
    borderColor: "#1B2C4B",
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 16,
    padding: 20,
  },
  sessionDevice: {
    color: "#F4F7FB",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 8,
  },
  sessionMeta: {
    color: "#A7B6CF",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 6,
  },
  exportButton: {
    backgroundColor: "#8FF5CF",
    borderRadius: 14,
    marginTop: 14,
    paddingVertical: 14,
  },
  exportButtonDisabled: {
    opacity: 0.5,
  },
  exportButtonText: {
    color: "#072033",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
    textTransform: "uppercase",
  },
});
