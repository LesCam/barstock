import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { router } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import { useAuth } from "@/lib/auth-context";
import { trpc, API_URL } from "@/lib/trpc";

export default function GuideQRScreen() {
  const { user, selectedLocationId } = useAuth();
  const businessId = user?.businessId ?? "";

  const { data: business } = trpc.businesses.getById.useQuery(
    { businessId },
    { enabled: !!businessId }
  );

  const logoUrl = business?.logoUrl ? `${API_URL}${business.logoUrl}` : null;
  const publicUrl = `${API_URL}/menu/${selectedLocationId}`;

  return (
    <View style={styles.container}>
      {/* Business branding */}
      <View style={styles.brandSection}>
        <Text style={styles.businessName}>
          {user?.businessName ?? "Our Menu"}
        </Text>
        <View style={styles.divider} />
        <Text style={styles.subtitle}>Scan to view our menu</Text>
      </View>

      {/* QR card */}
      <View style={styles.qrCard}>
        <View style={styles.qrInner}>
          <QRCode
            value={publicUrl}
            size={220}
            backgroundColor="#FFFFFF"
            color="#0B1623"
            ecl="H"
          />
          {logoUrl && (
            <View style={styles.qrOverlay}>
              <Image
                source={{ uri: logoUrl }}
                style={styles.qrLogoImage}
                resizeMode="contain"
              />
            </View>
          )}
        </View>
        <Text style={styles.scanHint}>Point your camera at the code</Text>
      </View>

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
    backgroundColor: "#0B1623",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  brandSection: {
    alignItems: "center",
    marginBottom: 36,
  },
  businessName: {
    fontSize: 28,
    fontWeight: "800",
    color: "#E9B44C",
    textAlign: "center",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  divider: {
    width: 60,
    height: 2,
    backgroundColor: "#E9B44C",
    marginVertical: 12,
    borderRadius: 1,
  },
  subtitle: {
    fontSize: 16,
    color: "#EAF0FF",
    fontWeight: "500",
  },
  qrCard: {
    backgroundColor: "#16283F",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(233, 180, 76, 0.2)",
  },
  qrInner: {
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  qrOverlay: {
    position: "absolute",
    backgroundColor: "#FFFFFF",
    padding: 4,
    borderRadius: 8,
  },
  qrLogoImage: {
    width: 100,
    height: 100,
    borderRadius: 10,
  },
  scanHint: {
    fontSize: 13,
    color: "#8FA3B8",
    marginTop: 16,
  },
  urlText: {
    fontSize: 10,
    color: "#5A6A7A",
    marginTop: 16,
    textAlign: "center",
  },
  closeButton: {
    marginTop: 36,
    paddingVertical: 14,
    paddingHorizontal: 52,
    backgroundColor: "#E9B44C",
    borderRadius: 12,
  },
  closeText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0B1623",
  },
});
