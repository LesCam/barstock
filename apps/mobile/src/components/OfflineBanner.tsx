import { useEffect, useState, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useNetwork } from "@/lib/network-context";
import { subscribe, getQueue, isSyncing, retryFailed, clearFailed, type QueueEntry } from "@/lib/offline-queue";
import { trpcVanilla } from "@/lib/trpc";

type BannerState = "hidden" | "offline" | "syncing" | "synced" | "failed" | "conflict";

export function OfflineBanner() {
  const { isOnline } = useNetwork();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [bannerState, setBannerState] = useState<BannerState>("hidden");
  const slideAnim = useRef(new Animated.Value(-60)).current;
  const syncedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe to queue changes + eagerly load current state
  useEffect(() => {
    getQueue().then(setQueue);
    return subscribe(setQueue);
  }, []);

  const pendingCount = queue.filter((e) => e.status === "pending").length;
  const syncingCount = queue.filter((e) => e.status === "syncing").length;
  const failedCount = queue.filter((e) => e.status === "failed").length;
  const conflictCount = queue.filter((e) => e.status === "conflict").length;
  const totalPending = pendingCount + syncingCount;

  // Determine banner state
  useEffect(() => {
    if (syncedTimeoutRef.current) {
      clearTimeout(syncedTimeoutRef.current);
      syncedTimeoutRef.current = null;
    }

    if (!isOnline && (totalPending > 0 || failedCount > 0)) {
      setBannerState("offline");
    } else if (!isOnline) {
      setBannerState("offline");
    } else if (isSyncing() || syncingCount > 0) {
      setBannerState("syncing");
    } else if (conflictCount > 0) {
      setBannerState("conflict");
    } else if (failedCount > 0) {
      setBannerState("failed");
    } else if (bannerState === "syncing" || bannerState === "offline") {
      // Just finished syncing or came back online
      setBannerState("synced");
      syncedTimeoutRef.current = setTimeout(() => {
        setBannerState("hidden");
      }, 2000);
    } else {
      setBannerState("hidden");
    }

    return () => {
      if (syncedTimeoutRef.current) clearTimeout(syncedTimeoutRef.current);
    };
  }, [isOnline, totalPending, syncingCount, failedCount, conflictCount]);

  // Animate slide down from above nav header
  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: bannerState === "hidden" ? -60 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [bannerState, slideAnim]);

  const [retrying, setRetrying] = useState(false);

  if (bannerState === "hidden") return null;

  function handleRetry() {
    setRetrying(true);
    retryFailed(trpcVanilla).finally(() => setRetrying(false));
  }

  function handleClear() {
    Alert.alert(
      "Clear Failed Items",
      `Remove ${failedCount} failed item${failedCount !== 1 ? "s" : ""} from the queue? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: () => clearFailed() },
      ],
    );
  }

  let text = "";
  let bgColor = styles.bgOffline;

  switch (bannerState) {
    case "offline": {
      const queuedCount = totalPending > 0 ? totalPending : queue.length;
      text = queuedCount > 0
        ? `Offline \u2014 ${queuedCount} item${queuedCount !== 1 ? "s" : ""} pending`
        : "Offline";
      bgColor = styles.bgOffline;
      break;
    }
    case "syncing":
      text = `Syncing ${totalPending} item${totalPending !== 1 ? "s" : ""}...`;
      bgColor = styles.bgSyncing;
      break;
    case "synced":
      text = "All synced";
      bgColor = styles.bgSynced;
      break;
    case "conflict":
      text = `${conflictCount} conflict${conflictCount !== 1 ? "s" : ""} need review`;
      bgColor = styles.bgConflict;
      break;
    case "failed":
      text = `${failedCount} item${failedCount !== 1 ? "s" : ""} failed to sync`;
      bgColor = styles.bgFailed;
      break;
  }

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.container, { top: insets.top + 4, transform: [{ translateY: slideAnim }] }]}
    >
      <View style={[styles.banner, bgColor]}>
        {bannerState === "conflict" ? (
          <TouchableOpacity onPress={() => router.push("/sync-queue")} activeOpacity={0.7}>
            <Text style={styles.text}>{text}</Text>
          </TouchableOpacity>
        ) : bannerState === "failed" ? (
          <View style={styles.failedRow}>
            <TouchableOpacity onPress={() => router.push("/sync-queue")} activeOpacity={0.7}>
              <Text style={styles.text}>{text}</Text>
            </TouchableOpacity>
            <View style={styles.failedButtons}>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={handleRetry}
                disabled={retrying}
                activeOpacity={0.7}
              >
                <Text style={styles.retryBtnText}>
                  {retrying ? "Retrying..." : "Retry"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={handleClear}
                activeOpacity={0.7}
              >
                <Text style={styles.clearBtnText}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity onPress={() => router.push("/sync-queue")} activeOpacity={0.7}>
            <Text style={styles.text}>{text}</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 1000,
    alignItems: "center",
  },
  banner: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: "center",
    borderRadius: 20,
    maxWidth: "75%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  text: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  bgOffline: {
    backgroundColor: "#6B7280",
  },
  bgSyncing: {
    backgroundColor: "#2563eb",
  },
  bgSynced: {
    backgroundColor: "#16a34a",
  },
  bgConflict: {
    backgroundColor: "#B8860B",
  },
  bgFailed: {
    backgroundColor: "#dc2626",
  },
  failedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  failedButtons: {
    flexDirection: "row",
    gap: 8,
  },
  retryBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 32,
    justifyContent: "center" as const,
  },
  retryBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  clearBtn: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 32,
    justifyContent: "center" as const,
  },
  clearBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
});
