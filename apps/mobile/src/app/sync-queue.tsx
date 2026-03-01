import { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { router } from "expo-router";
import {
  subscribe,
  removeEntry,
  retryFailed,
  clearFailed,
  type QueueEntry,
} from "@/lib/offline-queue";
import { trpcVanilla } from "@/lib/trpc";

const MUTATION_LABELS: Record<string, string> = {
  "sessions.addLine": "Add Count",
  "sessions.updateLine": "Update Count",
  "sessions.deleteLine": "Delete Count",
  "receiving.receive": "Receive Stock",
  "transfers.create": "Transfer",
};

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function StatusBadge({ status }: { status: QueueEntry["status"] }) {
  const color =
    status === "pending"
      ? "#3B82F6"
      : status === "syncing"
        ? "#F59E0B"
        : "#EF4444";
  const label =
    status === "pending"
      ? "Pending"
      : status === "syncing"
        ? "Syncing"
        : "Failed";
  return (
    <View style={[styles.badge, { backgroundColor: color + "22", borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

export default function SyncQueueScreen() {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    return subscribe(setQueue);
  }, []);

  const failedCount = queue.filter((e) => e.status === "failed").length;

  function handleRemove(entry: QueueEntry) {
    Alert.alert(
      "Remove Item",
      `Remove this ${MUTATION_LABELS[entry.mutation] ?? entry.mutation} from the queue?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => removeEntry(entry.id),
        },
      ],
    );
  }

  function handleRetryAll() {
    setRetrying(true);
    retryFailed(trpcVanilla).finally(() => setRetrying(false));
  }

  function handleClearFailed() {
    Alert.alert(
      "Clear Failed Items",
      `Remove ${failedCount} failed item${failedCount !== 1 ? "s" : ""} from the queue? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: () => clearFailed() },
      ],
    );
  }

  const itemName = (entry: QueueEntry) => {
    const input = entry.input as any;
    return input.itemName ?? input.name ?? null;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Sync Queue</Text>
        <View style={styles.backBtn} />
      </View>

      {queue.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>✓</Text>
          <Text style={styles.emptyText}>All synced</Text>
        </View>
      ) : (
        <>
          <FlatList
            data={queue}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 100 }}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardRow}>
                  <View style={styles.cardInfo}>
                    <Text style={styles.mutationLabel}>
                      {MUTATION_LABELS[item.mutation] ?? item.mutation}
                    </Text>
                    {itemName(item) && (
                      <Text style={styles.itemName} numberOfLines={1}>
                        {itemName(item)}
                      </Text>
                    )}
                    <Text style={styles.timestamp}>{timeAgo(item.createdAt)}</Text>
                    {item.error && (
                      <Text style={styles.errorText} numberOfLines={2}>
                        {item.error}
                      </Text>
                    )}
                  </View>
                  <View style={styles.cardActions}>
                    <StatusBadge status={item.status} />
                    {item.status === "failed" && (
                      <TouchableOpacity
                        onPress={() => handleRemove(item)}
                        style={styles.removeBtn}
                      >
                        <Text style={styles.removeBtnText}>Remove</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            )}
          />

          {failedCount > 0 && (
            <View style={styles.bottomBar}>
              <TouchableOpacity
                style={styles.retryAllBtn}
                onPress={handleRetryAll}
                disabled={retrying}
              >
                <Text style={styles.retryAllText}>
                  {retrying ? "Retrying..." : "Retry All"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.clearFailedBtn}
                onPress={handleClearFailed}
              >
                <Text style={styles.clearFailedText}>Clear Failed</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3550",
  },
  backBtn: { width: 60 },
  backText: { color: "#42A5F5", fontSize: 16 },
  title: { color: "#EAF0FF", fontSize: 18, fontWeight: "700" },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIcon: { fontSize: 48, color: "#16a34a", marginBottom: 12 },
  emptyText: { fontSize: 18, color: "#8899AA", fontWeight: "600" },
  card: {
    backgroundColor: "#16283F",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardInfo: { flex: 1, marginRight: 12 },
  mutationLabel: { color: "#EAF0FF", fontSize: 15, fontWeight: "600" },
  itemName: { color: "#8899AA", fontSize: 13, marginTop: 2 },
  timestamp: { color: "#5A6A7A", fontSize: 12, marginTop: 4 },
  errorText: { color: "#EF4444", fontSize: 12, marginTop: 4 },
  cardActions: { alignItems: "flex-end", gap: 8 },
  badge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 12, fontWeight: "600" },
  removeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  removeBtnText: { color: "#EF4444", fontSize: 12, fontWeight: "600" },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: 12,
    padding: 16,
    paddingBottom: 36,
    backgroundColor: "#0B1623",
    borderTopWidth: 1,
    borderTopColor: "#1E3550",
  },
  retryAllBtn: {
    flex: 1,
    backgroundColor: "#2563eb",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
  },
  retryAllText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  clearFailedBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#5A6A7A",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
  },
  clearFailedText: { color: "#8899AA", fontSize: 15, fontWeight: "600" },
});
