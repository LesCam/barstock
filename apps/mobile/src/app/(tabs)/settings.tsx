import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { router } from "expo-router";
import { setAuthToken } from "@/lib/trpc";

export default function SettingsTab() {
  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <TouchableOpacity
          style={styles.row}
          onPress={() => {
            setAuthToken(null);
            router.replace("/(auth)/login");
          }}
        >
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Scale</Text>
        <TouchableOpacity style={styles.row}>
          <Text style={styles.rowText}>Connect Bluetooth Scale</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.row}>
          <Text style={styles.rowText}>BarStock v1.0.0</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb", padding: 16 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 12, fontWeight: "600", color: "#999", marginBottom: 8, textTransform: "uppercase" },
  row: {
    backgroundColor: "#fff", padding: 16, borderRadius: 8,
    borderWidth: 1, borderColor: "#e5e7eb",
  },
  rowText: { fontSize: 15, color: "#333" },
  logoutText: { fontSize: 15, color: "#dc2626", fontWeight: "500" },
});
