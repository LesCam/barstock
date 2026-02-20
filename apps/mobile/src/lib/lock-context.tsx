import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { trpcVanilla } from "./trpc";
import { useAuth } from "./auth-context";

const STORAGE_KEY = "@barstock/unlockMethod";

export type UnlockMethod = "pin" | "biometric";

interface AutoLockPolicy {
  enabled: boolean;
  timeoutSeconds: number;
  allowPin: boolean;
  allowBiometric: boolean;
}

interface LockContextValue {
  isLocked: boolean;
  lockPolicy: AutoLockPolicy | null;
  userUnlockMethod: UnlockMethod;
  setUserUnlockMethod: (method: UnlockMethod) => void;
  unlock: () => void;
}

const DEFAULT_POLICY: AutoLockPolicy = {
  enabled: false,
  timeoutSeconds: 60,
  allowPin: true,
  allowBiometric: true,
};

const LockContext = createContext<LockContextValue>({
  isLocked: false,
  lockPolicy: null,
  userUnlockMethod: "pin",
  setUserUnlockMethod: () => {},
  unlock: () => {},
});

export function useLock() {
  return useContext(LockContext);
}

export function LockProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const [isLocked, setIsLocked] = useState(false);
  const [lockPolicy, setLockPolicy] = useState<AutoLockPolicy | null>(null);
  const [userUnlockMethod, setMethod] = useState<UnlockMethod>("pin");
  const backgroundedAt = useRef<number | null>(null);

  // Load user preference from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === "pin" || v === "biometric") setMethod(v);
    });
  }, []);

  // Fetch lock policy from server when authenticated
  useEffect(() => {
    if (!token || !user?.businessId) {
      setLockPolicy(null);
      return;
    }

    trpcVanilla.settings.autoLockPolicy
      .query({ businessId: user.businessId })
      .then((policy) => setLockPolicy(policy))
      .catch(() => setLockPolicy(DEFAULT_POLICY));
  }, [token, user?.businessId]);

  // AppState listener for background/foreground transitions
  useEffect(() => {
    if (!lockPolicy?.enabled || !token) return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "background" || nextState === "inactive") {
        backgroundedAt.current = Date.now();
      } else if (nextState === "active" && backgroundedAt.current !== null) {
        const elapsed = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        if (elapsed >= lockPolicy.timeoutSeconds * 1000) {
          setIsLocked(true);
        }
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription.remove();
  }, [lockPolicy?.enabled, lockPolicy?.timeoutSeconds, token]);

  // Clear lock state on sign-out
  useEffect(() => {
    if (!token) {
      setIsLocked(false);
      backgroundedAt.current = null;
    }
  }, [token]);

  const unlock = useCallback(() => {
    setIsLocked(false);
    backgroundedAt.current = null;
  }, []);

  const setUserUnlockMethod = useCallback((method: UnlockMethod) => {
    setMethod(method);
    AsyncStorage.setItem(STORAGE_KEY, method);
  }, []);

  return (
    <LockContext.Provider
      value={{ isLocked, lockPolicy, userUnlockMethod, setUserUnlockMethod, unlock }}
    >
      {children}
    </LockContext.Provider>
  );
}
