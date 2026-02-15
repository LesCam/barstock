import { View, Text, TouchableOpacity, FlatList, StyleSheet, Alert } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { trpc } from "@/lib/trpc";

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const utils = trpc.useUtils();

  const { data: session, isLoading } = trpc.sessions.getById.useQuery({ id: id! });

  const closeMutation = trpc.sessions.close.useMutation({
    onSuccess() {
      Alert.alert("Session Closed", "Adjustments have been created.");
      utils.sessions.getById.invalidate({ id: id! });
    },
    onError(error) {
      Alert.alert("Error", error.message);
    },
  });

  if (isLoading || !session) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Loading session...</Text>
      </View>
    );
  }

  const isOpen = !session.endedTs;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{session.sessionType} Session</Text>
        <Text style={isOpen ? styles.badgeOpen : styles.badgeClosed}>
          {isOpen ? "Open" : "Closed"}
        </Text>
      </View>

      <Text style={styles.meta}>
        Started: {new Date(session.startedTs).toLocaleString()}
      </Text>

      {isOpen && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push(`/session/${id}/packaged` as any)}
          >
            <Text style={styles.actionText}>Packaged Count</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push(`/session/${id}/draft` as any)}
          >
            <Text style={styles.actionText}>Draft Verify</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push(`/session/${id}/liquor` as any)}
          >
            <Text style={styles.actionText}>Liquor Weigh</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.sectionTitle}>
        Counted Items ({session.lines.length})
      </Text>

      <FlatList
        data={session.lines}
        keyExtractor={(line) => line.id}
        renderItem={({ item: line }) => (
          <View style={styles.lineRow}>
            <Text style={styles.lineName}>{line.inventoryItem.name}</Text>
            <Text style={styles.lineCount}>
              {line.countUnits != null
                ? `${Number(line.countUnits)} ${line.inventoryItem.baseUom}`
                : line.grossWeightGrams != null
                  ? `${Number(line.grossWeightGrams)}g`
                  : "—"}
            </Text>
          </View>
        )}
      />

      {isOpen && (
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => closeMutation.mutate({ sessionId: id! })}
          disabled={closeMutation.isPending}
        >
          <Text style={styles.closeBtnText}>
            {closeMutation.isPending ? "Closing..." : "Close Session"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb", padding: 16 },
  loading: { textAlign: "center", color: "#999", marginTop: 40 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  title: { fontSize: 20, fontWeight: "bold", textTransform: "capitalize" },
  meta: { fontSize: 12, color: "#666", marginBottom: 16 },
  badgeOpen: { backgroundColor: "#dbeafe", color: "#1d4ed8", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, fontSize: 12 },
  badgeClosed: { backgroundColor: "#f3f4f6", color: "#6b7280", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, fontSize: 12 },
  actions: { flexDirection: "row", gap: 8, marginBottom: 20 },
  actionBtn: { flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, alignItems: "center" },
  actionText: { fontSize: 13, fontWeight: "500", color: "#333" },
  sectionTitle: { fontSize: 14, fontWeight: "600", color: "#666", marginBottom: 8 },
  lineRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#fff", padding: 14, borderBottomWidth: 1, borderBottomColor: "#f0f0f0",
  },
  lineName: { fontSize: 14, fontWeight: "500" },
  lineCount: { fontSize: 14, color: "#333" },
  closeBtn: { backgroundColor: "#dc2626", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 16 },
  closeBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
