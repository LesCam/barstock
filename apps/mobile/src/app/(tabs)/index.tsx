import { View, Text, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { router } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";

export default function SessionsTab() {
  const { selectedLocationId } = useAuth();
  const { data: sessions, isLoading } = trpc.sessions.list.useQuery(
    { locationId: selectedLocationId!, openOnly: false },
    { enabled: !!selectedLocationId }
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.newButton}
        onPress={() => {
          /* TODO: create session then navigate */
        }}
      >
        <Text style={styles.newButtonText}>Start New Session</Text>
      </TouchableOpacity>

      {isLoading ? (
        <Text style={styles.loading}>Loading sessions...</Text>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/session/${item.id}`)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{item.sessionType}</Text>
                <Text style={item.endedTs ? styles.badgeClosed : styles.badgeOpen}>
                  {item.endedTs ? "Closed" : "Open"}
                </Text>
              </View>
              <Text style={styles.cardDate}>
                {new Date(item.startedTs).toLocaleDateString()}
              </Text>
              <Text style={styles.cardLines}>{item._count.lines} items counted</Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb", padding: 16 },
  newButton: {
    backgroundColor: "#2563eb", borderRadius: 8,
    padding: 14, alignItems: "center", marginBottom: 16,
  },
  newButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  loading: { textAlign: "center", color: "#999", marginTop: 40 },
  card: {
    backgroundColor: "#fff", borderRadius: 8, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: "#e5e7eb",
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 16, fontWeight: "600", textTransform: "capitalize" },
  cardDate: { fontSize: 12, color: "#666", marginTop: 4 },
  cardLines: { fontSize: 13, color: "#444", marginTop: 4 },
  badgeOpen: {
    backgroundColor: "#dbeafe", color: "#1d4ed8",
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, fontSize: 12,
  },
  badgeClosed: {
    backgroundColor: "#f3f4f6", color: "#6b7280",
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, fontSize: 12,
  },
});
