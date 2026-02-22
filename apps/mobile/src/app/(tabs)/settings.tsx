import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, Switch, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import { useAuth, usePermission } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { useVoicePreference } from "@/lib/voice-preference";
import { useCountingPreferences } from "@/lib/counting-preferences";
import { useLock, type UnlockMethod } from "@/lib/lock-context";

export default function SettingsTab() {
  const router = useRouter();
  const { user, signOut, selectedLocationId, selectLocation } = useAuth();
  const canManageTareWeights = usePermission("canManageTareWeights");
  const canAccessScale = usePermission("canAccessScale");
  const { voiceUserEnabled, setVoiceUserEnabled } = useVoicePreference();
  const { hapticEnabled, setHapticEnabled, quickEmptyEnabled, setQuickEmptyEnabled } = useCountingPreferences();
  const { lockPolicy, userUnlockMethod, setUserUnlockMethod } = useLock();
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    (async () => {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(hasHardware && isEnrolled);
    })();
  }, []);

  const { data: capabilities } = trpc.settings.capabilities.useQuery(
    { businessId: user?.businessId ?? "" },
    { enabled: !!user?.businessId, staleTime: 5 * 60 * 1000 }
  );

  const { data: locations } = trpc.locations.listByBusiness.useQuery(
    { businessId: user?.businessId ?? "" },
    { enabled: !!user?.businessId && (user?.locationIds.length ?? 0) > 1 }
  );

  const currentLocation = locations?.find((l) => l.id === selectedLocationId);
  const isMultiLocation = (user?.locationIds.length ?? 0) > 1;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <Text style={styles.email}>{user?.email ?? "—"}</Text>
        </View>
      </View>

      {isMultiLocation && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>
          <View style={styles.card}>
            <Text style={styles.rowText}>{currentLocation?.name ?? "Loading..."}</Text>
          </View>
          <TouchableOpacity
            style={[styles.card, { marginTop: 8 }]}
            onPress={() => selectLocation(null)}
          >
            <Text style={styles.switchText}>Switch Location</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Inventory</Text>
        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push("/manage-items")}
        >
          <Text style={styles.rowText}>Manage Items</Text>
        </TouchableOpacity>
      </View>

      {canAccessScale && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scale</Text>
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push("/connect-scale")}
          >
            <Text style={styles.rowText}>Connect Bluetooth Scale</Text>
          </TouchableOpacity>
          {canManageTareWeights && (
            <TouchableOpacity
              style={[styles.card, { marginTop: 8 }]}
              onPress={() => router.push("/tare-weights")}
            >
              <Text style={styles.rowText}>Manage Tare Weights</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security</Text>
        {lockPolicy?.enabled ? (
          <>
            {lockPolicy.allowPin && (
              <TouchableOpacity
                style={[
                  styles.card,
                  styles.toggleRow,
                  userUnlockMethod === "pin" && styles.selectedCard,
                ]}
                onPress={() => setUserUnlockMethod("pin")}
              >
                <Text style={styles.rowText}>Unlock with PIN</Text>
                {userUnlockMethod === "pin" && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </TouchableOpacity>
            )}
            {lockPolicy.allowBiometric && (
              <TouchableOpacity
                style={[
                  styles.card,
                  styles.toggleRow,
                  { marginTop: lockPolicy.allowPin ? 8 : 0 },
                  userUnlockMethod === "biometric" && styles.selectedCard,
                  !biometricAvailable && styles.disabledCard,
                ]}
                onPress={() => biometricAvailable && setUserUnlockMethod("biometric")}
                disabled={!biometricAvailable}
              >
                <Text style={[styles.rowText, !biometricAvailable && styles.disabledText]}>
                  Unlock with Face ID
                </Text>
                {userUnlockMethod === "biometric" && biometricAvailable && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
                {!biometricAvailable && (
                  <Text style={styles.disabledText}>Not available</Text>
                )}
              </TouchableOpacity>
            )}
          </>
        ) : (
          <View style={styles.card}>
            <Text style={styles.disabledText}>Auto-lock is not enabled</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Voice Commands</Text>
        {capabilities?.voiceCommandsEnabled ? (
          <View style={[styles.card, styles.toggleRow]}>
            <Text style={styles.rowText}>Voice Commands</Text>
            <Switch
              value={voiceUserEnabled}
              onValueChange={setVoiceUserEnabled}
              trackColor={{ false: "#1E3550", true: "#E9B44C" }}
              thumbColor="#EAF0FF"
            />
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.disabledText}>Not available</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Counting</Text>
        <View style={[styles.card, styles.toggleRow]}>
          <Text style={styles.rowText}>Haptic Feedback</Text>
          <Switch
            value={hapticEnabled}
            onValueChange={setHapticEnabled}
            trackColor={{ false: "#1E3550", true: "#E9B44C" }}
            thumbColor="#EAF0FF"
          />
        </View>
        <View style={[styles.card, styles.toggleRow, { marginTop: 8 }]}>
          <Text style={styles.rowText}>Quick Empty (Long-Press)</Text>
          <Switch
            value={quickEmptyEnabled}
            onValueChange={setQuickEmptyEnabled}
            trackColor={{ false: "#1E3550", true: "#E9B44C" }}
            thumbColor="#EAF0FF"
          />
        </View>
      </View>

      {(user?.highestRole === "business_admin" || user?.highestRole === "platform_admin") && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Administration</Text>
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push("/audit-log")}
          >
            <Text style={styles.rowText}>Audit Log</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.card, { marginTop: 8 }]}
            onPress={() => router.push("/alert-settings")}
          >
            <Text style={styles.rowText}>Alert Settings</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.card}>
          <Text style={styles.rowText}>BarStock v1.0.0</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Support</Text>
        <TouchableOpacity style={styles.card} onPress={() => router.push("/help")}>
          <Text style={styles.rowText}>Help & Guides</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.card} onPress={signOut}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623" },
  content: { padding: 16, paddingBottom: 32 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 12, fontWeight: "600", color: "#5A6A7A", marginBottom: 8, textTransform: "uppercase" },
  card: {
    backgroundColor: "#16283F", padding: 16, borderRadius: 8,
    borderWidth: 1, borderColor: "#1E3550",
  },
  email: { fontSize: 15, color: "#EAF0FF", fontWeight: "500" },
  rowText: { fontSize: 15, color: "#EAF0FF" },
  switchText: { fontSize: 15, color: "#E9B44C", fontWeight: "500" },
  logoutText: { fontSize: 15, color: "#dc2626", fontWeight: "500" },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  disabledText: { fontSize: 15, color: "#5A6A7A" },
  selectedCard: { borderColor: "#E9B44C" },
  disabledCard: { opacity: 0.5 },
  checkmark: { fontSize: 16, color: "#E9B44C", fontWeight: "700" },
});
