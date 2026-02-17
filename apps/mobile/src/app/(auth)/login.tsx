import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ImageBackground,
  Image,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { trpc, trpcVanilla, API_URL } from "@/lib/trpc";
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

// ── PIN Login Screen ───────────────────────────────────────────

function PinLogin({
  businessName,
  businessId,
  logoUrl,
  onSwitchToEmail,
}: {
  businessName: string;
  businessId: string;
  logoUrl: string | null;
  onSwitchToEmail: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const { signIn } = useAuth();

  function shake() {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }

  const pinLogin = trpc.auth.loginWithPin.useMutation({
    async onSuccess(data) {
      try {
        await signIn(data.accessToken, data.refreshToken);
      } catch (e: any) {
        setError(e.message ?? "Could not fetch user profile");
        shake();
        setTimeout(() => { setPin(""); setLocked(false); }, 600);
      }
    },
    onError(err) {
      setError(err.message === "Invalid PIN" ? "Incorrect PIN" : err.message);
      shake();
      setTimeout(() => { setPin(""); setLocked(false); }, 600);
    },
  });

  // Auto-submit when 4th digit is entered
  useEffect(() => {
    if (pin.length === 4 && !locked) {
      setLocked(true);
      setError(null);
      pinLogin.mutate({ pin, businessId });
    }
  }, [pin]);

  const pressDigit = useCallback(
    (d: string) => {
      if (locked) return;
      if (pin.length < 4) {
        setPin((prev) => prev + d);
        setError(null);
      }
    },
    [pin, locked]
  );

  const pressDelete = useCallback(() => {
    if (locked) return;
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  }, [locked]);

  return (
    <ImageBackground
      source={require("../../../assets/images/bar-shelves.jpg")}
      style={styles.bg}
      resizeMode="cover"
    >
      <View style={styles.overlay}>
        <View style={styles.pinContainer}>
          {/* Business logo or letter placeholder */}
          {logoUrl ? (
            <Image
              source={{ uri: `${API_URL}${logoUrl}` }}
              style={styles.logoImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.logoBox}>
              <Text style={styles.logoText}>
                {businessName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

          <Text style={styles.businessName}>{businessName}</Text>
          <Text style={styles.subtitle}>Enter your 4-digit PIN</Text>

          {/* PIN circles with shake animation */}
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
          {locked && !error && (
            <Text style={styles.loadingText}>Signing in...</Text>
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
                    disabled={locked}
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
                disabled={locked}
              >
                <Text style={styles.padDigit}>0</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.padKeyEmpty}
                onPress={pressDelete}
                activeOpacity={0.6}
                disabled={locked}
              >
                <Text style={styles.deleteText}>⌫</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Footer */}
          <TouchableOpacity onPress={onSwitchToEmail} style={styles.adminLink}>
            <Text style={styles.adminLinkText}>Admin Login</Text>
          </TouchableOpacity>
          <Text style={styles.poweredBy}>
            Powered by <Text style={styles.poweredBrand}>Barstock</Text>
          </Text>
        </View>
      </View>
    </ImageBackground>
  );
}

// ── Email Login Screen (Admin / First-time Setup) ──────────────

function EmailLogin({
  onSwitchToPin,
  hasBusiness,
}: {
  onSwitchToPin: () => void;
  hasBusiness: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { signIn } = useAuth();

  const emailLoginMutation = trpc.auth.login.useMutation({
    async onSuccess(data) {
      try {
        // signIn sets the auth token and fetches user profile
        await signIn(data.accessToken, data.refreshToken);
        // Store business config for future PIN logins BEFORE navigation
        const userStr = await AsyncStorage.getItem("authUser");
        if (userStr) {
          const user = JSON.parse(userStr);
          // Fetch business details (logo, slug) for PIN screen
          let logoUrl: string | null = null;
          let slug: string | null = null;
          try {
            const biz = await trpcVanilla.businesses.getById.query({ businessId: user.businessId });
            logoUrl = biz.logoUrl ?? null;
            slug = biz.slug ?? null;
          } catch {}
          // Fire and forget — don't block navigation
          AsyncStorage.setItem(
            BUSINESS_CONFIG_KEY,
            JSON.stringify({
              id: user.businessId,
              name: user.businessName || "Your Business",
              slug,
              logoUrl,
            })
          );
        }
      } catch (e: any) {
        setError(e.message ?? "Could not fetch user profile");
      }
    },
    onError(err) {
      setError(err.message);
    },
  });

  return (
    <ImageBackground
      source={require("../../../assets/images/bar-shelves.jpg")}
      style={styles.bg}
      resizeMode="cover"
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.emailContainer}
        >
          <ScrollView
            contentContainerStyle={styles.emailScroll}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.emailTitle}>Barstock</Text>
            <Text style={styles.subtitle}>Sign in with your email</Text>

            <TextInput
              style={styles.emailInput}
              placeholder="Email"
              placeholderTextColor="rgba(234,240,255,0.4)"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <TextInput
              style={styles.emailInput}
              placeholder="Password"
              placeholderTextColor="rgba(234,240,255,0.4)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            {error && <Text style={styles.errorText}>{error}</Text>}

            <TouchableOpacity
              style={[
                styles.signInBtn,
                (!email || !password || emailLoginMutation.isPending) &&
                  styles.signInBtnDisabled,
              ]}
              onPress={() => emailLoginMutation.mutate({ email, password })}
              disabled={!email || !password || emailLoginMutation.isPending}
            >
              <Text style={styles.signInText}>
                {emailLoginMutation.isPending ? "Signing in..." : "Sign In"}
              </Text>
            </TouchableOpacity>

            {hasBusiness && (
              <TouchableOpacity onPress={onSwitchToPin} style={styles.switchLink}>
                <Text style={styles.switchText}>
                  Staff? <Text style={styles.switchHighlight}>Use PIN</Text>
                </Text>
              </TouchableOpacity>
            )}

            <Text style={[styles.poweredBy, { marginTop: 32 }]}>
              Powered by <Text style={styles.poweredBrand}>Barstock</Text>
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </ImageBackground>
  );
}

// ── Main Login Screen ──────────────────────────────────────────

export default function LoginScreen() {
  const [mode, setMode] = useState<"loading" | "pin" | "email">("loading");
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(BUSINESS_CONFIG_KEY).then(async (config) => {
      if (config) {
        const { id, name, slug, logoUrl: savedLogoUrl } = JSON.parse(config);
        setBusinessId(id);
        setBusinessName(name);
        setLogoUrl(savedLogoUrl ?? null);
        setMode("pin");

        // Refresh logo from server in background (public endpoint, no auth needed)
        try {
          const biz = await trpcVanilla.businesses.getPublicInfo.query({ businessId: id });
          const freshLogoUrl = biz.logoUrl ?? null;
          if (freshLogoUrl !== (savedLogoUrl ?? null)) {
            setLogoUrl(freshLogoUrl);
            await AsyncStorage.setItem(
              BUSINESS_CONFIG_KEY,
              JSON.stringify({ id, name, slug: biz.slug, logoUrl: freshLogoUrl })
            );
          }
        } catch {}
      } else {
        setMode("email");
      }
    });
  }, []);

  if (mode === "loading") {
    return <View style={[styles.bg, { backgroundColor: "#0B1623" }]} />;
  }

  if (mode === "pin" && businessId) {
    return (
      <PinLogin
        businessName={businessName}
        businessId={businessId}
        logoUrl={logoUrl}
        onSwitchToEmail={() => setMode("email")}
      />
    );
  }

  return (
    <EmailLogin
      onSwitchToPin={() => setMode("pin")}
      hasBusiness={!!businessId}
    />
  );
}

// ── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(11, 22, 35, 0.85)",
  },
  // PIN screen
  pinContainer: {
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
  adminLink: {
    marginTop: 20,
    paddingVertical: 8,
  },
  adminLinkText: {
    color: "rgba(234, 240, 255, 0.3)",
    fontSize: 12,
  },
  // Number pad
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
  // Footer
  poweredBy: {
    marginTop: 20,
    fontSize: 12,
    color: "rgba(234, 240, 255, 0.4)",
  },
  poweredBrand: {
    color: "#E9B44C",
    fontWeight: "700",
  },
  // Email screen
  emailContainer: {
    flex: 1,
  },
  emailScroll: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 60,
  },
  emailTitle: {
    fontSize: 32,
    fontWeight: "700",
    color: "#E9B44C",
    marginBottom: 4,
  },
  emailInput: {
    width: "100%",
    maxWidth: 320,
    borderWidth: 1,
    borderColor: "rgba(234, 240, 255, 0.15)",
    borderRadius: 10,
    backgroundColor: "rgba(22, 40, 63, 0.8)",
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#EAF0FF",
    marginBottom: 12,
  },
  signInBtn: {
    width: "100%",
    maxWidth: 320,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#E9B44C",
    alignItems: "center",
    marginTop: 4,
  },
  signInBtnDisabled: {
    opacity: 0.5,
  },
  signInText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0B1623",
  },
  switchLink: {
    marginTop: 16,
  },
  switchText: {
    color: "rgba(234, 240, 255, 0.5)",
    fontSize: 13,
  },
  switchHighlight: {
    color: "#E9B44C",
    fontWeight: "600",
  },
});
