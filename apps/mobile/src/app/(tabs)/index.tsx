import { View, Text, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { router } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";

const SESSION_TYPE_LABELS: Record<string, string> = {
  shift: "Inventory Count",
  daily: "Daily Count",
  weekly: "Weekly Count",
  monthly: "Monthly Count",
  receiving: "Stock Receiving",
};

function sessionLabel(type: string) {
  return SESSION_TYPE_LABELS[type] ?? type;
}

function itemsLabel(type: string, count: number) {
  if (type === "receiving") return `${count} item${count !== 1 ? "s" : ""} received`;
  return `${count} item${count !== 1 ? "s" : ""} counted`;
}

export default function SessionsTab() {
  const { selectedLocationId } = useAuth();
  const { data: sessions, isLoading } = trpc.sessions.list.useQuery(
    { locationId: selectedLocationId!, openOnly: false },
    { enabled: !!selectedLocationId, refetchOnMount: "always" }
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.newButton}
        onPress={() => router.push("/count/new")}
      >
        <Text style={styles.newButtonText}>Start Inventory Count</Text>
      </TouchableOpacity>

      <View style={styles.secondaryRow}>
        <TouchableOpacity
          style={styles.receiveButton}
          onPress={() => router.push("/receive")}
        >
          <Text style={styles.receiveButtonText}>Receive Stock</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.transferButton}
          onPress={() => router.push("/transfer")}
        >
          <Text style={styles.transferButtonText}>Transfer Inventory</Text>
        </TouchableOpacity>
      </View>

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
                <Text style={styles.cardTitle}>{sessionLabel(item.sessionType)}</Text>
                <Text style={item.endedTs ? styles.badgeClosed : styles.badgeOpen}>
                  {item.endedTs ? "Closed" : "Open"}
                </Text>
              </View>
              <Text style={styles.cardDate}>
                {new Date(item.startedTs).toLocaleString()}
              </Text>
              <Text style={styles.cardLines}>
                {itemsLabel(item.sessionType, item._count.lines)}
              </Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623", padding: 16 },
  newButton: {
    backgroundColor: "#E9B44C", borderRadius: 8,
    padding: 14, alignItems: "center", marginBottom: 12,
  },
  newButtonText: { color: "#0B1623", fontSize: 16, fontWeight: "700" },
  secondaryRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  receiveButton: {
    flex: 1,
    backgroundColor: "#16283F", borderRadius: 8,
    padding: 14, alignItems: "center",
    borderWidth: 1, borderColor: "#4CAF50",
  },
  receiveButtonText: { color: "#4CAF50", fontSize: 14, fontWeight: "700" },
  transferButton: {
    flex: 1,
    backgroundColor: "#16283F", borderRadius: 8,
    padding: 14, alignItems: "center",
    borderWidth: 1, borderColor: "#42A5F5",
  },
  transferButtonText: { color: "#42A5F5", fontSize: 14, fontWeight: "700" },
  loading: { textAlign: "center", color: "#5A6A7A", marginTop: 40 },
  card: {
    backgroundColor: "#16283F", borderRadius: 8, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: "#1E3550",
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#EAF0FF" },
  cardDate: { fontSize: 12, color: "#8899AA", marginTop: 4 },
  cardLines: { fontSize: 13, color: "#5A6A7A", marginTop: 4 },
  badgeOpen: {
    backgroundColor: "#1E3550", color: "#E9B44C",
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, fontSize: 12, overflow: "hidden",
  },
  badgeClosed: {
    backgroundColor: "#1E3550", color: "#5A6A7A",
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, fontSize: 12, overflow: "hidden",
  },
});
