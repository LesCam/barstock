import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const HAPTIC_KEY = "@barstock/hapticFeedback";
const QUICK_EMPTY_KEY = "@barstock/quickEmpty";

interface CountingPreferencesCtx {
  hapticEnabled: boolean;
  setHapticEnabled: (v: boolean) => void;
  quickEmptyEnabled: boolean;
  setQuickEmptyEnabled: (v: boolean) => void;
}

const CountingPreferencesContext = createContext<CountingPreferencesCtx>({
  hapticEnabled: true,
  setHapticEnabled: () => {},
  quickEmptyEnabled: false,
  setQuickEmptyEnabled: () => {},
});

export function CountingPreferencesProvider({ children }: { children: ReactNode }) {
  const [hapticEnabled, setHaptic] = useState(true);
  const [quickEmptyEnabled, setQuickEmpty] = useState(false);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(HAPTIC_KEY),
      AsyncStorage.getItem(QUICK_EMPTY_KEY),
    ]).then(([h, q]) => {
      if (h !== null) setHaptic(h === "true");
      if (q !== null) setQuickEmpty(q === "true");
    });
  }, []);

  const setHapticEnabled = (v: boolean) => {
    setHaptic(v);
    AsyncStorage.setItem(HAPTIC_KEY, String(v));
  };

  const setQuickEmptyEnabled = (v: boolean) => {
    setQuickEmpty(v);
    AsyncStorage.setItem(QUICK_EMPTY_KEY, String(v));
  };

  return (
    <CountingPreferencesContext.Provider
      value={{ hapticEnabled, setHapticEnabled, quickEmptyEnabled, setQuickEmptyEnabled }}
    >
      {children}
    </CountingPreferencesContext.Provider>
  );
}

export function useCountingPreferences() {
  return useContext(CountingPreferencesContext);
}
