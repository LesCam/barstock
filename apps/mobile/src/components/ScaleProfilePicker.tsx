import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { trpc } from "@/lib/trpc";

interface ScaleProfilePickerProps {
  locationId: string;
  onSelect: (profileId: string, profileName: string) => void;
  onCancel: () => void;
}

export function ScaleProfilePicker({ locationId, onSelect, onCancel }: ScaleProfilePickerProps) {
  const { data: profiles, isLoading } = trpc.scaleProfiles.list.useQuery({ locationId });

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.title}>Which scale is this?</Text>
        <Text style={styles.subtitle}>
          Select a profile to identify this scale on the dashboard.
        </Text>

        {isLoading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#E9B44C" size="small" />
            <Text style={styles.loadingText}>Loading profiles...</Text>
          </View>
        )}

        {!isLoading && (!profiles || profiles.length === 0) && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              No profiles configured. Ask your admin to create scale profiles in Settings.
            </Text>
          </View>
        )}

        {profiles?.map((profile) => (
          <TouchableOpacity
            key={profile.id}
            style={styles.profileRow}
            onPress={() => onSelect(profile.id, profile.name)}
          >
            <Text style={styles.profileName}>{profile.name}</Text>
            {profile.isConnected && (
              <Text style={styles.inUseLabel}>In Use</Text>
            )}
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.skipBtn} onPress={onCancel}>
          <Text style={styles.skipText}>Skip for Now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(11, 22, 35, 0.9)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    zIndex: 100,
  },
  card: {
    backgroundColor: "#16283F",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#EAF0FF",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#8899AA",
    marginBottom: 20,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 16,
  },
  loadingText: {
    color: "#8899AA",
    fontSize: 14,
  },
  emptyState: {
    paddingVertical: 20,
  },
  emptyText: {
    color: "#5A6A7A",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0B1623",
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  profileName: {
    color: "#EAF0FF",
    fontSize: 16,
    fontWeight: "600",
  },
  inUseLabel: {
    color: "#8899AA",
    fontSize: 12,
  },
  skipBtn: {
    marginTop: 12,
    alignItems: "center",
    paddingVertical: 10,
  },
  skipText: {
    color: "#8899AA",
    fontSize: 14,
    textDecorationLine: "underline",
  },
});
