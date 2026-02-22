import { useEffect, useState, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated, Alert } from "react-native";
import { useNetwork } from "@/lib/network-context";
import { subscribe, isSyncing, type QueueEntry } from "@/lib/offline-queue";

type BannerState = "hidden" | "offline" | "syncing" | "synced" | "failed";

export function OfflineBanner() {
  const { isOnline } = useNetwork();
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [bannerState, setBannerState] = useState<BannerState>("hidden");
  const slideAnim = useRef(new Animated.Value(-50)).current;
  const syncedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe to queue changes
  useEffect(() => {
    return subscribe(setQueue);
  }, []);

  const pendingCount = queue.filter((e) => e.status === "pending").length;
  const syncingCount = queue.filter((e) => e.status === "syncing").length;
  const failedCount = queue.filter((e) => e.status === "failed").length;
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
  }, [isOnline, totalPending, syncingCount, failedCount]);

  // Animate slide in/out
  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: bannerState === "hidden" ? -50 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [bannerState, slideAnim]);

  if (bannerState === "hidden") return null;

  function showFailedDetails() {
    const failed = queue.filter((e) => e.status === "failed");
    const details = failed
      .map((e) => `${e.mutation}: ${e.error ?? "Unknown error"}`)
      .join("\n\n");
    Alert.alert(
      `${failed.length} Item${failed.length !== 1 ? "s" : ""} Failed to Sync`,
      details || "No details available.",
    );
  }

  let text = "";
  let bgColor = styles.bgOffline;

  switch (bannerState) {
    case "offline":
      text = totalPending > 0
        ? `Offline \u2014 ${totalPending} item${totalPending !== 1 ? "s" : ""} pending`
        : "Offline";
      bgColor = styles.bgOffline;
      break;
    case "syncing":
      text = `Syncing ${totalPending} item${totalPending !== 1 ? "s" : ""}...`;
      bgColor = styles.bgSyncing;
      break;
    case "synced":
      text = "All synced";
      bgColor = styles.bgSynced;
      break;
    case "failed":
      text = `${failedCount} item${failedCount !== 1 ? "s" : ""} failed to sync`;
      bgColor = styles.bgFailed;
      break;
  }

  const Component = bannerState === "failed" ? TouchableOpacity : View;

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY: slideAnim }] }]}
    >
      <Component
        style={[styles.banner, bgColor]}
        {...(bannerState === "failed" ? { onPress: showFailedDetails, activeOpacity: 0.7 } : {})}
      >
        <Text style={styles.text}>{text}</Text>
      </Component>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  banner: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: "center",
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
  bgFailed: {
    backgroundColor: "#dc2626",
  },
});
