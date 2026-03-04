import { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  SectionList,
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
  resolveConflict,
  type QueueEntry,
} from "@/lib/offline-queue";
import { trpc } from "@/lib/trpc";
import { trpcVanilla } from "@/lib/trpc";

const MUTATION_LABELS: Record<string, string> = {
  "sessions.create": "Create Session",
  "sessions.addLine": "Add Count",
  "sessions.updateLine": "Update Count",
  "sessions.deleteLine": "Delete Count",
  "sessions.join": "Join Session",
  "sessions.close": "Close Session",
  "inventory.create": "Create Item",
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
        : status === "conflict"
          ? "#E9B44C"
          : "#EF4444";
  const label =
    status === "pending"
      ? "Pending"
      : status === "syncing"
        ? "Syncing"
        : status === "conflict"
          ? "Conflict"
          : "Failed";
  return (
    <View style={[styles.badge, { backgroundColor: color + "22", borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function formatValue(values: { countUnits?: number; grossWeightGrams?: number; percentRemaining?: number }): string {
  if (values.countUnits != null) return `${values.countUnits} units`;
  if (values.grossWeightGrams != null) return `${values.grossWeightGrams}g`;
  if (values.percentRemaining != null) return `${values.percentRemaining}%`;
  return "—";
}

function ConflictCard({ item, onResolve }: { item: QueueEntry; onResolve: (id: string, res: "mine" | "theirs") => void }) {
  const conflict = item.conflictData;
  if (!conflict) return null;

  return (
    <View style={[styles.card, styles.conflictCard]}>
      <View style={styles.cardRow}>
        <View style={styles.cardInfo}>
          <Text style={styles.mutationLabel}>
            {MUTATION_LABELS[item.mutation] ?? item.mutation}
          </Text>
          <Text style={styles.timestamp}>{timeAgo(item.createdAt)}</Text>
        </View>
        <StatusBadge status="conflict" />
      </View>

      <View style={styles.conflictComparison}>
        <View style={styles.conflictSide}>
          <Text style={styles.conflictLabel}>Your Count</Text>
          <Text style={styles.conflictValue}>{formatValue(conflict.myValues)}</Text>
        </View>
        <Text style={styles.conflictVs}>vs</Text>
        <View style={styles.conflictSide}>
          <Text style={styles.conflictLabel}>
            {conflict.theirName ? `${conflict.theirName}'s Count` : "Server Count"}
          </Text>
          <Text style={styles.conflictValue}>{formatValue(conflict.theirValues)}</Text>
        </View>
      </View>

      <View style={styles.conflictActions}>
        <TouchableOpacity
          style={styles.keepMineBtn}
          onPress={() => onResolve(item.id, "mine")}
        >
          <Text style={styles.keepMineBtnText}>Keep Mine</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.keepTheirsBtn}
          onPress={() => onResolve(item.id, "theirs")}
        >
          <Text style={styles.keepTheirsBtnText}>Keep Theirs</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

interface Section {
  title: string;
  data: QueueEntry[];
  pendingCount: number;
  failedCount: number;
  conflictCount: number;
}

export default function SyncQueueScreen() {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [retrying, setRetrying] = useState(false);
  const utils = trpc.useUtils();

  useEffect(() => {
    return subscribe(setQueue);
  }, []);

  const failedCount = queue.filter((e) => e.status === "failed").length;
  const conflictCount = queue.filter((e) => e.status === "conflict").length;

  // Group entries by sessionId into sections
  const sections = useMemo<Section[]>(() => {
    const groups = new Map<string, QueueEntry[]>();
    const otherEntries: QueueEntry[] = [];

    for (const entry of queue) {
      const sessionId = (entry.input as any).sessionId;
      if (sessionId && (entry.mutation.startsWith("sessions.") || entry.mutation === "sessions.close")) {
        const list = groups.get(sessionId) ?? [];
        list.push(entry);
        groups.set(sessionId, list);
      } else {
        otherEntries.push(entry);
      }
    }

    const result: Section[] = [];

    for (const [sessionId, entries] of groups) {
      // Try to get session name from React Query cache
      const cached = utils.sessions.getById.getData({ id: sessionId });
      const name = cached
        ? `Session — ${new Date(cached.startedTs).toLocaleDateString()}`
        : `Session ${sessionId.slice(0, 8)}`;

      result.push({
        title: name,
        data: entries,
        pendingCount: entries.filter((e) => e.status === "pending" || e.status === "syncing").length,
        failedCount: entries.filter((e) => e.status === "failed").length,
        conflictCount: entries.filter((e) => e.status === "conflict").length,
      });
    }

    if (otherEntries.length > 0) {
      result.push({
        title: "Receiving & Transfers",
        data: otherEntries,
        pendingCount: otherEntries.filter((e) => e.status === "pending" || e.status === "syncing").length,
        failedCount: otherEntries.filter((e) => e.status === "failed").length,
        conflictCount: otherEntries.filter((e) => e.status === "conflict").length,
      });
    }

    return result;
  }, [queue, utils]);

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

  function handleResolveConflict(entryId: string, resolution: "mine" | "theirs") {
    resolveConflict(entryId, resolution);
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
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 100 }}
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <View style={styles.sectionBadges}>
                  {section.pendingCount > 0 && (
                    <View style={[styles.sectionBadge, { backgroundColor: "#3B82F622", borderColor: "#3B82F6" }]}>
                      <Text style={[styles.sectionBadgeText, { color: "#3B82F6" }]}>
                        {section.pendingCount} pending
                      </Text>
                    </View>
                  )}
                  {section.failedCount > 0 && (
                    <View style={[styles.sectionBadge, { backgroundColor: "#EF444422", borderColor: "#EF4444" }]}>
                      <Text style={[styles.sectionBadgeText, { color: "#EF4444" }]}>
                        {section.failedCount} failed
                      </Text>
                    </View>
                  )}
                  {section.conflictCount > 0 && (
                    <View style={[styles.sectionBadge, { backgroundColor: "#E9B44C22", borderColor: "#E9B44C" }]}>
                      <Text style={[styles.sectionBadgeText, { color: "#E9B44C" }]}>
                        {section.conflictCount} conflict{section.conflictCount !== 1 ? "s" : ""}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}
            renderItem={({ item }) =>
              item.status === "conflict" ? (
                <ConflictCard item={item} onResolve={handleResolveConflict} />
              ) : (
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
              )
            }
          />

          {(failedCount > 0 || conflictCount > 0) && (
            <View style={styles.bottomBar}>
              {failedCount > 0 && (
                <>
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
                </>
              )}
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
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: "#EAF0FF",
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  sectionBadges: {
    flexDirection: "row",
    gap: 6,
  },
  sectionBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  sectionBadgeText: { fontSize: 11, fontWeight: "600" },
  card: {
    backgroundColor: "#16283F",
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  conflictCard: {
    borderColor: "#E9B44C",
    borderWidth: 1.5,
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
  // Conflict comparison
  conflictComparison: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    backgroundColor: "#0B1623",
    borderRadius: 8,
    padding: 12,
  },
  conflictSide: {
    flex: 1,
    alignItems: "center",
  },
  conflictLabel: {
    color: "#8899AA",
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 4,
  },
  conflictValue: {
    color: "#EAF0FF",
    fontSize: 18,
    fontWeight: "700",
  },
  conflictVs: {
    color: "#5A6A7A",
    fontSize: 12,
    fontWeight: "600",
    marginHorizontal: 8,
  },
  conflictActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  keepMineBtn: {
    flex: 1,
    backgroundColor: "#2563eb",
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
  },
  keepMineBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  keepTheirsBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#5A6A7A",
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
  },
  keepTheirsBtnText: { color: "#8899AA", fontSize: 14, fontWeight: "600" },
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
