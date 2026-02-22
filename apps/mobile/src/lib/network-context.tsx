import { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { AppState, type AppStateStatus } from "react-native";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
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
  const [isOnline, setIsOnline] = useState(true);
  const wasOfflineRef = useRef(false);

  const handleStateChange = useCallback((state: NetInfoState) => {
    const online = !!(state.isConnected && state.isInternetReachable !== false);

    if (!online) {
      wasOfflineRef.current = true;
    }

    setIsOnline(online);

    // On transition from offline -> online, replay queued mutations
    if (online && wasOfflineRef.current) {
      wasOfflineRef.current = false;
      processQueue(trpcVanilla);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(handleStateChange);
    return () => unsubscribe();
  }, [handleStateChange]);

  // Process queue when app resumes from background while online
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (nextState: AppStateStatus) => {
      if (nextState === "active" && isOnlineRef.current) {
        const queue = await getQueue();
        if (queue.some((e) => e.status === "pending" || e.status === "failed")) {
          processQueue(trpcVanilla);
        }
      }
    });
    return () => subscription.remove();
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
