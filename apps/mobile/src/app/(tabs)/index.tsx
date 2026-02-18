import { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Redirect, router } from "expo-router";
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

const INITIAL_LIMIT = 10;

export default function SessionsTab() {
  const { user, selectedLocationId } = useAuth();

  if (user?.highestRole === "curator") {
    return <Redirect href="/(tabs)/art" />;
  }
  const [creating, setCreating] = useState(false);
  const [limit, setLimit] = useState(INITIAL_LIMIT);

  const utils = trpc.useUtils();

  const { data: sessions, isLoading } = trpc.sessions.list.useQuery(
    { locationId: selectedLocationId!, openOnly: false, limit },
    { enabled: !!selectedLocationId, refetchOnMount: "always" }
  );

  const createSession = trpc.sessions.create.useMutation();
  const closeMutation = trpc.sessions.close.useMutation({
    onSuccess() {
      Alert.alert("Session Closed", "Adjustments have been created.");
      utils.sessions.list.invalidate();
    },
    onError(error: { message: string }) {
      Alert.alert("Error", error.message);
    },
  });

  const openSessions = sessions?.filter((s: any) => !s.endedTs) ?? [];
  const closedSessions = sessions?.filter((s: any) => s.endedTs) ?? [];

  async function handleStartCount() {
    if (creating || !selectedLocationId) return;
    setCreating(true);
    try {
      const session = await createSession.mutateAsync({
        locationId: selectedLocationId,
        sessionType: "shift",
        startedTs: new Date(),
      });
      router.push(`/session/${session.id}`);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Failed to create session");
    } finally {
      setCreating(false);
    }
  }

  function handleClose(sessionId: string, lineCount: number) {
    Alert.alert(
      "Close Session",
      `Close this session with ${lineCount} items counted?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Close",
          style: "destructive",
          onPress: () => closeMutation.mutate({ sessionId }),
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.newButton, creating && styles.newButtonDisabled]}
        onPress={handleStartCount}
        disabled={creating}
      >
        {creating ? (
          <ActivityIndicator color="#0B1623" />
        ) : (
          <Text style={styles.newButtonText}>Start Inventory Count</Text>
        )}
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

      {/* Open Sessions */}
      {openSessions.length > 0 && (
        <View style={styles.openSection}>
          <Text style={styles.sectionTitle}>Open Sessions</Text>
          <Text style={styles.openWarning}>
            Starting a new count will close any open session.
          </Text>
          {openSessions.map((s: any) => (
            <View key={s.id} style={styles.openCard}>
              <TouchableOpacity
                style={styles.openCardInfo}
                onPress={() => router.push(`/session/${s.id}`)}
              >
                <Text style={styles.openCardTitle}>{sessionLabel(s.sessionType)}</Text>
                <Text style={styles.openCardDate}>
                  {new Date(s.startedTs).toLocaleString()}
                  {s.createdByUser?.email ? ` — ${s.createdByUser.email}` : ""}
                </Text>
                <Text style={styles.openCardCount}>
                  {itemsLabel(s.sessionType, s._count.lines)}
                </Text>
              </TouchableOpacity>
              <View style={styles.openCardActions}>
                <TouchableOpacity onPress={() => router.push(`/session/${s.id}`)}>
                  <Text style={styles.resumeText}>Resume</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={closeMutation.isPending}
                  onPress={() => handleClose(s.id, s._count.lines)}
                >
                  <Text style={styles.closeText}>
                    {closeMutation.isPending ? "Closing..." : "Close"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* History */}
      {isLoading ? (
        <Text style={styles.loading}>Loading sessions...</Text>
      ) : closedSessions.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>History</Text>
          <FlatList
            data={closedSessions}
            keyExtractor={(s) => s.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.card}
                onPress={() => router.push(`/session/${item.id}`)}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{sessionLabel(item.sessionType)}</Text>
                  <Text style={styles.badgeClosed}>Closed</Text>
                </View>
                <Text style={styles.cardDate}>
                  {new Date(item.startedTs).toLocaleString()}
                  {item.createdByUser?.email ? ` — ${item.createdByUser.email}` : ""}
                </Text>
                <Text style={styles.cardLines}>
                  {itemsLabel(item.sessionType, item._count.lines)}
                </Text>
              </TouchableOpacity>
            )}
            ListFooterComponent={
              closedSessions.length >= limit ? (
                <TouchableOpacity
                  style={styles.showMore}
                  onPress={() => setLimit((prev) => prev + 20)}
                >
                  <Text style={styles.showMoreText}>Show More</Text>
                </TouchableOpacity>
              ) : null
            }
            contentContainerStyle={{ paddingBottom: 20 }}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623", padding: 16 },
  newButton: {
    backgroundColor: "#E9B44C", borderRadius: 8,
    padding: 14, alignItems: "center", marginBottom: 12,
  },
  newButtonDisabled: { opacity: 0.6 },
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

  // Open sessions
  openSection: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#8899AA",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  openWarning: {
    fontSize: 13,
    color: "#E9B44C",
    marginBottom: 10,
  },
  openCard: {
    backgroundColor: "#152238",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E9B44C",
  },
  openCardInfo: { flex: 1 },
  openCardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#EAF0FF",
  },
  openCardDate: {
    fontSize: 12,
    color: "#8899AA",
    marginTop: 2,
  },
  openCardCount: {
    fontSize: 13,
    color: "#6B7FA0",
    marginTop: 2,
  },
  openCardActions: {
    alignItems: "flex-end",
    gap: 12,
    marginLeft: 12,
  },
  resumeText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#42A5F5",
  },
  closeText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#dc2626",
  },

  // History
  loading: { textAlign: "center", color: "#5A6A7A", marginTop: 40 },
  card: {
    backgroundColor: "#16283F", borderRadius: 8, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: "#1E3550",
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#EAF0FF" },
  cardDate: { fontSize: 12, color: "#8899AA", marginTop: 4 },
  cardLines: { fontSize: 13, color: "#5A6A7A", marginTop: 4 },
  badgeClosed: {
    backgroundColor: "#1E3550", color: "#5A6A7A",
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, fontSize: 12, overflow: "hidden",
  },
  showMore: {
    alignItems: "center",
    paddingVertical: 14,
  },
  showMoreText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#42A5F5",
  },
});
