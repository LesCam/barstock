import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  Image,
} from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { trpcVanilla, API_URL } from "@/lib/trpc";
import { useLock } from "@/lib/lock-context";
import { useAuth } from "@/lib/auth-context";

const { width } = Dimensions.get("window");
const PAD_SIZE = Math.min(width * 0.2, 80);

const KEYS_CONFIG = [
  [
    { digit: "1", letters: "" },
    { digit: "2", letters: "ABC" },
    { digit: "3", letters: "DEF" },
  ],
  [
    { digit: "4", letters: "GHI" },
    { digit: "5", letters: "JKL" },
    { digit: "6", letters: "MNO" },
  ],
  [
    { digit: "7", letters: "PQRS" },
    { digit: "8", letters: "TUV" },
    { digit: "9", letters: "WXYZ" },
  ],
] as const;

const BUSINESS_CONFIG_KEY = "businessConfig";

export default function LockScreen() {
  const { unlock, lockPolicy, userUnlockMethod } = useLock();
  const { user } = useAuth();

  const [mode, setMode] = useState<"pin" | "biometric">("pin");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Load business config from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem(BUSINESS_CONFIG_KEY).then((raw) => {
      if (raw) {
        try {
          const config = JSON.parse(raw);
          setBusinessName(config.name ?? "");
          setLogoUrl(config.logoUrl ?? null);
        } catch {}
      }
    });
  }, []);

  // Check biometric availability
  useEffect(() => {
    (async () => {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(hasHardware && isEnrolled);
    })();
  }, []);

  // Determine initial mode based on policy and preference
  useEffect(() => {
    if (!lockPolicy) return;

    const canPin = lockPolicy.allowPin;
    const canBio = lockPolicy.allowBiometric && biometricAvailable;

    if (userUnlockMethod === "biometric" && canBio) {
      setMode("biometric");
    } else if (canPin) {
      setMode("pin");
    } else if (canBio) {
      setMode("biometric");
    }
  }, [lockPolicy, userUnlockMethod, biometricAvailable]);

  // Auto-trigger biometric when in biometric mode
  useEffect(() => {
    if (mode === "biometric") {
      attemptBiometric();
    }
  }, [mode]);

  function shake() {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }

  async function attemptBiometric() {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock BarStock",
        fallbackLabel: "Use PIN",
        disableDeviceFallback: true,
      });

      if (result.success) {
        unlock();
      } else {
        // User cancelled or failed — switch to PIN if allowed
        if (lockPolicy?.allowPin) {
          setMode("pin");
        }
      }
    } catch {
      if (lockPolicy?.allowPin) {
        setMode("pin");
      }
    }
  }

  // Auto-submit when 4th digit is entered
  useEffect(() => {
    if (pin.length === 4 && !submitting) {
      setSubmitting(true);
      setError(null);

      trpcVanilla.auth.verifyPin
        .mutate({ pin })
        .then(() => {
          unlock();
        })
        .catch(() => {
          setError("Incorrect PIN");
          shake();
          setTimeout(() => {
            setPin("");
            setSubmitting(false);
          }, 600);
        });
    }
  }, [pin]);

  const pressDigit = useCallback(
    (d: string) => {
      if (submitting) return;
      if (pin.length < 4) {
        setPin((prev) => prev + d);
        setError(null);
      }
    },
    [pin, submitting]
  );

  const pressDelete = useCallback(() => {
    if (submitting) return;
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  }, [submitting]);

  const canSwitchToPin = lockPolicy?.allowPin && mode === "biometric";
  const canSwitchToBio = lockPolicy?.allowBiometric && biometricAvailable && mode === "pin";

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Business logo */}
        {logoUrl ? (
          <Image
            source={{ uri: `${API_URL}${logoUrl}` }}
            style={styles.logoImage}
            resizeMode="cover"
          />
        ) : businessName ? (
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>
              {businessName.charAt(0).toUpperCase()}
            </Text>
          </View>
        ) : null}

        {businessName ? (
          <Text style={styles.businessName}>{businessName}</Text>
        ) : null}

        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.subtitle}>
          {mode === "biometric" ? "Tap to unlock with Face ID" : "Enter your PIN to unlock"}
        </Text>

        {mode === "pin" && (
          <>
            {/* PIN dots */}
            <Animated.View
              style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}
            >
              {[0, 1, 2, 3].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i < pin.length && styles.dotFilled,
                    error && styles.dotError,
                  ]}
                />
              ))}
            </Animated.View>

            {error && <Text style={styles.errorText}>{error}</Text>}
            {submitting && !error && (
              <Text style={styles.loadingText}>Verifying...</Text>
            )}

            {/* Number pad */}
            <View style={styles.padContainer}>
              {KEYS_CONFIG.map((row, ri) => (
                <View key={ri} style={styles.padRow}>
                  {row.map((key) => (
                    <TouchableOpacity
                      key={key.digit}
                      style={styles.padKey}
                      onPress={() => pressDigit(key.digit)}
                      activeOpacity={0.6}
                      disabled={submitting}
                    >
                      <Text style={styles.padDigit}>{key.digit}</Text>
                      {key.letters ? (
                        <Text style={styles.padLetters}>{key.letters}</Text>
                      ) : null}
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
              {/* Bottom row: empty / 0 / delete */}
              <View style={styles.padRow}>
                <View style={styles.padKeyEmpty} />
                <TouchableOpacity
                  style={styles.padKey}
                  onPress={() => pressDigit("0")}
                  activeOpacity={0.6}
                  disabled={submitting}
                >
                  <Text style={styles.padDigit}>0</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.padKeyEmpty}
                  onPress={pressDelete}
                  activeOpacity={0.6}
                  disabled={submitting}
                >
                  <Text style={styles.deleteText}>⌫</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {mode === "biometric" && (
          <TouchableOpacity style={styles.biometricButton} onPress={attemptBiometric}>
            <Text style={styles.biometricButtonText}>Tap to Unlock</Text>
          </TouchableOpacity>
        )}

        {/* Toggle between PIN and biometric */}
        {canSwitchToBio && (
          <TouchableOpacity
            style={styles.switchLink}
            onPress={() => setMode("biometric")}
          >
            <Text style={styles.switchText}>Use Face ID instead</Text>
          </TouchableOpacity>
        )}
        {canSwitchToPin && (
          <TouchableOpacity
            style={styles.switchLink}
            onPress={() => {
              setMode("pin");
              setPin("");
              setError(null);
              setSubmitting(false);
            }}
          >
            <Text style={styles.switchText}>Use PIN instead</Text>
          </TouchableOpacity>
        )}

        {user?.email && (
          <Text style={styles.userEmail}>{user.email}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0B1623",
    zIndex: 9999,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 24,
  },
  logoBox: {
    width: 80,
    height: 80,
    borderRadius: 16,
    backgroundColor: "rgba(233, 180, 76, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(233, 180, 76, 0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  logoImage: {
    width: 80,
    height: 80,
    borderRadius: 16,
    marginBottom: 12,
  },
  logoText: {
    fontSize: 36,
    fontWeight: "700",
    color: "#E9B44C",
  },
  businessName: {
    fontSize: 24,
    fontWeight: "700",
    color: "#EAF0FF",
    marginBottom: 4,
  },
  lockIcon: {
    fontSize: 32,
    marginBottom: 8,
    marginTop: 12,
  },
  subtitle: {
    fontSize: 14,
    color: "rgba(234, 240, 255, 0.6)",
    marginBottom: 20,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 24,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "rgba(234, 240, 255, 0.3)",
    backgroundColor: "transparent",
  },
  dotFilled: {
    backgroundColor: "#E9B44C",
    borderColor: "#E9B44C",
  },
  dotError: {
    borderColor: "#f87171",
    backgroundColor: "#f87171",
  },
  errorText: {
    color: "#f87171",
    fontSize: 13,
    marginBottom: 8,
    textAlign: "center",
  },
  loadingText: {
    color: "rgba(234, 240, 255, 0.5)",
    fontSize: 13,
    marginBottom: 8,
  },
  padContainer: {
    width: "100%",
    maxWidth: 320,
    gap: 10,
  },
  padRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
  },
  padKey: {
    width: PAD_SIZE,
    height: PAD_SIZE * 0.85,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(234, 240, 255, 0.2)",
    backgroundColor: "rgba(22, 40, 63, 0.8)",
    alignItems: "center",
    justifyContent: "center",
  },
  padKeyEmpty: {
    width: PAD_SIZE,
    height: PAD_SIZE * 0.85,
    alignItems: "center",
    justifyContent: "center",
  },
  padDigit: {
    fontSize: 28,
    fontWeight: "600",
    color: "#EAF0FF",
  },
  padLetters: {
    fontSize: 10,
    color: "rgba(234, 240, 255, 0.4)",
    letterSpacing: 2,
    marginTop: 1,
  },
  deleteText: {
    fontSize: 24,
    color: "rgba(234, 240, 255, 0.6)",
  },
  biometricButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 10,
    backgroundColor: "rgba(233, 180, 76, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(233, 180, 76, 0.3)",
    marginTop: 20,
  },
  biometricButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#E9B44C",
  },
  switchLink: {
    marginTop: 20,
    paddingVertical: 8,
  },
  switchText: {
    color: "#E9B44C",
    fontSize: 13,
    fontWeight: "500",
  },
  userEmail: {
    marginTop: 20,
    fontSize: 12,
    color: "rgba(234, 240, 255, 0.3)",
  },
});
