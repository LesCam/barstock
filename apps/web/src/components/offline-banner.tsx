"use client";

import { useEffect, useState, useRef } from "react";
import { useNetwork } from "@/lib/network-context";
import {
  subscribe,
  isSyncing,
  retryFailed,
  clearFailed,
  type QueueEntry,
} from "@/lib/offline-queue";
import { trpcVanilla } from "@/lib/trpc";

type BannerState = "hidden" | "offline" | "syncing" | "synced" | "failed";

export function OfflineBanner() {
  const { isOnline } = useNetwork();
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [bannerState, setBannerState] = useState<BannerState>("hidden");
  const [retrying, setRetrying] = useState(false);
  const syncedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevStateRef = useRef<BannerState>("hidden");

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

    let nextState: BannerState;

    if (!isOnline) {
      nextState = "offline";
    } else if (isSyncing() || syncingCount > 0) {
      nextState = "syncing";
    } else if (failedCount > 0) {
      nextState = "failed";
    } else if (
      prevStateRef.current === "syncing" ||
      prevStateRef.current === "offline"
    ) {
      nextState = "synced";
    } else {
      nextState = "hidden";
    }

    prevStateRef.current = nextState;
    setBannerState(nextState);

    if (nextState === "synced") {
      syncedTimeoutRef.current = setTimeout(() => {
        setBannerState("hidden");
        prevStateRef.current = "hidden";
      }, 2000);
    }

    return () => {
      if (syncedTimeoutRef.current) clearTimeout(syncedTimeoutRef.current);
    };
  }, [isOnline, totalPending, syncingCount, failedCount]);

  function handleRetry() {
    setRetrying(true);
    retryFailed(trpcVanilla).finally(() => setRetrying(false));
  }

  function handleClear() {
    const ok = confirm(
      `Remove ${failedCount} failed item${failedCount !== 1 ? "s" : ""} from the queue? This cannot be undone.`,
    );
    if (ok) clearFailed();
  }

  let text = "";
  let bgClass = "";

  switch (bannerState) {
    case "offline":
      text =
        totalPending > 0
          ? `Offline — ${totalPending} item${totalPending !== 1 ? "s" : ""} pending`
          : "Offline";
      bgClass = "bg-gray-500";
      break;
    case "syncing":
      text = `Syncing ${totalPending} item${totalPending !== 1 ? "s" : ""}...`;
      bgClass = "bg-blue-600";
      break;
    case "synced":
      text = "All synced";
      bgClass = "bg-green-600";
      break;
    case "failed":
      text = `${failedCount} item${failedCount !== 1 ? "s" : ""} failed to sync`;
      bgClass = "bg-red-600";
      break;
    case "hidden":
      break;
  }

  return (
    <div
      className={`fixed left-0 right-0 top-0 z-[1000] transition-transform duration-250 ${
        bannerState === "hidden"
          ? "-translate-y-full"
          : "translate-y-0"
      }`}
    >
      <div
        className={`${bgClass} px-4 py-1.5 text-center text-sm font-semibold text-white`}
      >
        {bannerState === "failed" ? (
          <div className="flex items-center justify-between">
            <span>{text}</span>
            <div className="flex gap-2">
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="rounded bg-blue-600 px-2.5 py-0.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {retrying ? "Retrying..." : "Retry"}
              </button>
              <button
                onClick={handleClear}
                className="rounded border border-white/50 px-2.5 py-0.5 text-xs font-semibold text-white hover:bg-white/10"
              >
                Clear
              </button>
            </div>
          </div>
        ) : (
          <span>{text}</span>
        )}
      </div>
    </div>
  );
}
