import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";

export default function LocationPicker() {
  const { user, selectLocation } = useAuth();

  const { data: locations, isLoading } = trpc.locations.listByBusiness.useQuery(
    { businessId: user?.businessId ?? "" },
    { enabled: !!user?.businessId }
  );

  // Filter to only locations this user has access to
  const userLocations = locations?.filter((l) => user?.locationIds.includes(l.id)) ?? [];

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select Location</Text>
      <Text style={styles.subtitle}>Choose which location to work with</Text>
      {userLocations.map((location) => (
        <TouchableOpacity
          key={location.id}
          style={styles.locationCard}
          onPress={() => selectLocation(location.id)}
        >
          <Text style={styles.locationName}>{location.name}</Text>
          <Text style={styles.locationTimezone}>{location.timezone}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb", padding: 24, justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "bold", textAlign: "center", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#666", textAlign: "center", marginBottom: 24 },
  locationCard: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  locationName: { fontSize: 16, fontWeight: "600" },
  locationTimezone: { fontSize: 12, color: "#666", marginTop: 4 },
});
