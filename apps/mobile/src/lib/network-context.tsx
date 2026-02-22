import { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { processQueue } from "./offline-queue";
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

  return (
    <NetworkContext.Provider value={{ isOnline }}>
      {children}
    </NetworkContext.Provider>
  );
}
