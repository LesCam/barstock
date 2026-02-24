"use client";

import { createContext, useContext, useEffect, useRef, useCallback } from "react";
import { useNetworkStatus } from "./use-network-status";
import { processQueue, retryFailed, getQueue } from "./offline-queue";
import { trpcVanilla } from "./trpc";

interface NetworkContextValue {
  isOnline: boolean;
}

const NetworkContext = createContext<NetworkContextValue>({ isOnline: true });

export function useNetwork() {
  return useContext(NetworkContext);
}

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const { isOnline } = useNetworkStatus();
  const wasOfflineRef = useRef(false);

  // Track offline -> online transitions
  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      return;
    }

    // Came back online
    if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      processQueue(trpcVanilla);
    }
  }, [isOnline]);

  // On visibilitychange to "visible" while online, check queue for pending items
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible" && navigator.onLine) {
        getQueue().then((queue) => {
          if (queue.some((e) => e.status === "pending" || e.status === "failed")) {
            processQueue(trpcVanilla);
          }
        });
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Periodic retry of failed items when online (every 60s)
  useEffect(() => {
    if (!isOnline) return;
    const interval = setInterval(async () => {
      const queue = await getQueue();
      const hasFailed = queue.some((e) => e.status === "failed");
      if (hasFailed) {
        retryFailed(trpcVanilla);
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [isOnline]);

  return (
    <NetworkContext.Provider value={{ isOnline }}>
      {children}
    </NetworkContext.Provider>
  );
}
