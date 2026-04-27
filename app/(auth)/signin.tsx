import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Fonts } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";

export default function SignInScreen() {
  const { continueWithoutAccount, signIn, signUp } = useAuth();
  const [showPin, setShowPin] = useState(false);
  const [persistSession, setPersistSession] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const clearMessages = () => {
    if (errorMessage) {
      setErrorMessage(null);
    }

    if (infoMessage) {
      setInfoMessage(null);
    }
  };

  const handleSignIn = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setErrorMessage("Enter your email and password to continue.");
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage(null);
      setInfoMessage(null);
      await signIn(normalizedEmail, password);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to sign in right now.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUp = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setErrorMessage("Enter your email and password to create an account.");
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage(null);
      setInfoMessage(null);
      await signUp(normalizedEmail, password);
      setInfoMessage(
        "Account created. If your project requires email confirmation, check your inbox before signing in.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to create an account right now.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.background}>
        <View style={styles.gridVerticalA} />
        <View style={styles.gridVerticalB} />
        <View style={styles.gridHorizontalA} />
        <View style={styles.gridHorizontalB} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          {/* <View style={styles.logoTile}>
            <MaterialCommunityIcons
              color="#A9F6D5"
              name="medical-bag"
              size={44}
            />
          </View> */}

          <Text style={styles.heroTitle}>SIGN IN</Text>
          <Text style={styles.heroSubtitle}>AeroSense</Text>
        </View>

        <View style={styles.panel}>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Email</Text>
            <View style={styles.inputShell}>
              <MaterialCommunityIcons
                color="#7B89A6"
                name="at"
                size={24}
                style={styles.leadingIcon}
              />
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                onChangeText={(value) => {
                  setEmail(value);
                  clearMessages();
                }}
                placeholder="name@utahtech.edu"
                placeholderTextColor="#576580"
                style={styles.input}
                value={email}
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Password</Text>
            <View style={styles.inputShell}>
              <MaterialCommunityIcons
                color="#7B89A6"
                name="lock-outline"
                size={24}
                style={styles.leadingIcon}
              />
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(value) => {
                  setPassword(value);
                  clearMessages();
                }}
                placeholder="••••••••"
                placeholderTextColor="#576580"
                secureTextEntry={!showPin}
                style={styles.input}
                value={password}
              />
              <Pressable
                disabled={submitting}
                hitSlop={8}
                onPress={() => setShowPin((value) => !value)}
                style={styles.trailingAction}
              >
                <MaterialCommunityIcons
                  color="#7B89A6"
                  name={!showPin ? "eye-off-outline" : "eye-outline"}
                  size={24}
                />
              </Pressable>
            </View>
          </View>

          {errorMessage ? (
            <View style={styles.errorBanner}>
              <MaterialCommunityIcons
                color="#FFB4B4"
                name="alert-circle-outline"
                size={18}
              />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {infoMessage ? (
            <View style={styles.infoBanner}>
              <MaterialCommunityIcons
                color="#A9F6D5"
                name="information-outline"
                size={18}
              />
              <Text style={styles.infoText}>{infoMessage}</Text>
            </View>
          ) : null}

          <Pressable
            disabled={submitting}
            onPress={() => {
              void handleSignIn();
            }}
            style={[
              styles.primaryAction,
              submitting && styles.primaryActionDisabled,
            ]}
          >
            {submitting ? (
              <>
                <ActivityIndicator color="#103F40" />
                <Text style={styles.primaryActionText}>AUTHENTICATING</Text>
              </>
            ) : (
              <>
                <Text style={styles.primaryActionText}>AUTHENTICATE</Text>
                <MaterialCommunityIcons
                  color="#103F40"
                  name="arrow-right"
                  size={28}
                />
              </>
            )}
          </Pressable>

          <Pressable
            disabled={submitting}
            onPress={() => {
              void handleSignUp();
            }}
            style={[
              styles.secondaryAction,
              submitting && styles.primaryActionDisabled,
            ]}
          >
            <Text style={styles.secondaryActionText}>CREATE ACCOUNT</Text>
          </Pressable>

          {/* <View style={styles.utilityRow}>
            <Pressable
              onPress={() => setPersistSession((value) => !value)}
              style={styles.persistToggle}
            >
              <View
                style={[
                  styles.checkbox,
                  persistSession && styles.checkboxChecked,
                ]}
              >
                {persistSession && (
                  <MaterialCommunityIcons
                    color="#0A162A"
                    name="check"
                    size={14}
                  />
                )}
              </View>
              <Text style={styles.persistLabel}>MAINTAIN PERSISTENCE</Text>
            </Pressable>
          </View> */}

          <View style={styles.divider} />

          <Pressable
            disabled={submitting}
            onPress={continueWithoutAccount}
            style={styles.guestAction}
          >
            <Text style={styles.guestActionText}>
              CONTINUE WITHOUT AN ACCOUNT
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#09152A",
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#09152A",
  },
  gridVerticalA: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "15%",
    width: 1,
    backgroundColor: "rgba(111, 141, 176, 0.09)",
  },
  gridVerticalB: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: "22%",
    width: 1,
    backgroundColor: "rgba(111, 141, 176, 0.08)",
  },
  gridHorizontalA: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "18%",
    height: 1,
    backgroundColor: "rgba(111, 141, 176, 0.08)",
  },
  gridHorizontalB: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: "20%",
    height: 1,
    backgroundColor: "rgba(111, 141, 176, 0.08)",
  },
  scrollContent: {
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 28,
  },
  hero: {
    alignItems: "center",
    marginBottom: 34,
  },
  logoTile: {
    alignItems: "center",
    backgroundColor: "#0D1830",
    borderRadius: 4,
    height: 124,
    justifyContent: "center",
    marginBottom: 28,
    width: 124,
  },
  heroTitle: {
    color: "#A9F6D5",
    fontFamily: Fonts.mono,
    fontSize: 54,
    fontWeight: "800",
    letterSpacing: 4,
    marginBottom: 14,
  },
  heroSubtitle: {
    color: "#98A5C2",
    fontFamily: Fonts.mono,
    fontSize: 16,
    letterSpacing: 4.2,
  },
  panel: {
    backgroundColor: "rgba(10, 20, 39, 0.92)",
    borderColor: "rgba(34, 55, 87, 0.8)",
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 26,
    paddingVertical: 28,
  },

  fieldGroup: {
    marginBottom: 28,
  },
  fieldLabel: {
    color: "#A4B0CB",
    fontFamily: Fonts.mono,
    fontSize: 14,
    letterSpacing: 1.4,
    marginBottom: 12,
    textTransform: "uppercase",
  },
  inputShell: {
    alignItems: "center",
    backgroundColor: "#1B2845",
    borderColor: "#23365A",
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 92,
    paddingHorizontal: 18,
  },
  leadingIcon: {
    marginRight: 14,
  },
  input: {
    color: "#E8EEF8",
    flex: 1,
    fontSize: 18,
    paddingVertical: 0,
  },
  trailingAction: {
    marginLeft: 14,
  },
  primaryAction: {
    alignItems: "center",
    backgroundColor: "#A9F6D5",
    borderRadius: 4,
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 8,
    minHeight: 108,
  },
  primaryActionDisabled: {
    opacity: 0.7,
  },
  primaryActionText: {
    color: "#103F40",
    fontFamily: Fonts.mono,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 2.6,
    marginLeft: 12,
  },
  errorBanner: {
    alignItems: "center",
    backgroundColor: "rgba(122, 30, 45, 0.32)",
    borderColor: "rgba(255, 122, 122, 0.45)",
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 4,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorText: {
    color: "#FFD3D3",
    flex: 1,
    fontSize: 14,
    marginLeft: 10,
  },
  infoBanner: {
    alignItems: "center",
    backgroundColor: "rgba(90, 170, 135, 0.12)",
    borderColor: "rgba(169, 246, 213, 0.3)",
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 4,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  infoText: {
    color: "#D9FFF0",
    flex: 1,
    fontSize: 14,
    marginLeft: 10,
  },
  secondaryAction: {
    alignItems: "center",
    borderColor: "#2C466E",
    borderRadius: 4,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 14,
    minHeight: 64,
  },
  secondaryActionText: {
    color: "#BCD2F5",
    fontFamily: Fonts.mono,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 1.8,
  },
  utilityRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 22,
  },
  persistToggle: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
  },
  checkbox: {
    alignItems: "center",
    backgroundColor: "#1B2845",
    borderColor: "#506284",
    borderRadius: 4,
    borderWidth: 1,
    height: 28,
    justifyContent: "center",
    marginRight: 12,
    width: 28,
  },
  checkboxChecked: {
    backgroundColor: "#A9F6D5",
    borderColor: "#A9F6D5",
  },
  persistLabel: {
    color: "#A4B0CB",
    fontSize: 13,
  },
  recoveryText: {
    color: "#00C6FF",
    fontSize: 13,
    fontWeight: "700",
  },
  divider: {
    backgroundColor: "rgba(72, 86, 113, 0.35)",
    height: 1,
    marginTop: 28,
    marginBottom: 28,
  },
  guestAction: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  guestActionText: {
    color: "#8EB7F0",
    fontFamily: Fonts.mono,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1.6,
  },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
  },
  statusBlock: {
    flex: 1,
  },
  statusLabel: {
    color: "#51627F",
    fontFamily: Fonts.mono,
    fontSize: 13,
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  statusValueRow: {
    alignItems: "center",
    flexDirection: "row",
  },
  statusDot: {
    backgroundColor: "#87E7C6",
    borderRadius: 999,
    height: 10,
    marginRight: 10,
    width: 10,
  },
  statusValue: {
    color: "#8FF5CF",
    fontSize: 15,
    fontWeight: "800",
  },
  statusValueMuted: {
    color: "#D1D8E6",
    fontSize: 15,
    fontWeight: "600",
  },
  statusDivider: {
    alignSelf: "stretch",
    backgroundColor: "rgba(72, 86, 113, 0.45)",
    marginHorizontal: 18,
    width: 1,
  },
});
