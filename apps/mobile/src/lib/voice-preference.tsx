import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@barstock/voiceEnabled";

interface VoicePreferenceCtx {
  voiceUserEnabled: boolean;
  setVoiceUserEnabled: (v: boolean) => void;
}

const VoicePreferenceContext = createContext<VoicePreferenceCtx>({
  voiceUserEnabled: true,
  setVoiceUserEnabled: () => {},
});

export function VoicePreferenceProvider({ children }: { children: ReactNode }) {
  const [voiceUserEnabled, setEnabled] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v !== null) setEnabled(v === "true");
    });
  }, []);

  const setVoiceUserEnabled = (v: boolean) => {
    setEnabled(v);
    AsyncStorage.setItem(STORAGE_KEY, String(v));
  };

  return (
    <VoicePreferenceContext.Provider value={{ voiceUserEnabled, setVoiceUserEnabled }}>
      {children}
    </VoicePreferenceContext.Provider>
  );
}

export function useVoicePreference() {
  return useContext(VoicePreferenceContext);
}
