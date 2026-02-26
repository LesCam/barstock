import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { router } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import { useAuth } from "@/lib/auth-context";
import { API_URL } from "@/lib/trpc";

export default function GuideQRScreen() {
  const { selectedLocationId } = useAuth();

  const publicUrl = `${API_URL}/menu/${selectedLocationId}`;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Product Guide</Text>
      <Text style={styles.subtitle}>Scan to view our menu</Text>

      <View style={styles.qrWrapper}>
        <QRCode
          value={publicUrl}
          size={220}
          backgroundColor="#FFFFFF"
          color="#000000"
          ecl="H"
        />
      </View>

      <Text style={styles.scanHint}>Scan with your phone camera</Text>
      <Text style={styles.urlText} selectable>{publicUrl}</Text>

      <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
        <Text style={styles.closeText}>Close</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    paddingTop: 80,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: "#666",
    marginBottom: 32,
  },
  qrWrapper: {
    padding: 16,
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  scanHint: {
    fontSize: 13,
    color: "#999",
    marginTop: 16,
  },
  urlText: {
    fontSize: 10,
    color: "#BBB",
    marginTop: 4,
    textAlign: "center",
  },
  closeButton: {
    marginTop: 32,
    paddingVertical: 14,
    paddingHorizontal: 48,
    backgroundColor: "#111",
    borderRadius: 12,
  },
  closeText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFF",
  },
});
