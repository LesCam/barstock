import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth, usePermission } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";

export default function SettingsTab() {
  const router = useRouter();
  const { user, signOut, selectedLocationId, selectLocation } = useAuth();
  const canManageTareWeights = usePermission("canManageTareWeights");
  const canAccessScale = usePermission("canAccessScale");

  const { data: locations } = trpc.locations.listByBusiness.useQuery(
    { businessId: user?.businessId ?? "" },
    { enabled: !!user?.businessId && (user?.locationIds.length ?? 0) > 1 }
  );

  const currentLocation = locations?.find((l) => l.id === selectedLocationId);
  const isMultiLocation = (user?.locationIds.length ?? 0) > 1;

  return (
    <View style={styles.container}>
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
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.card}>
          <Text style={styles.rowText}>BarStock v1.0.0</Text>
        </View>
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.card} onPress={signOut}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623", padding: 16 },
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
});
