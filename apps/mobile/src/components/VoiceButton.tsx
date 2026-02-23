import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Alert,
  Animated,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";
import {
  parseVoiceCommand,
  type VoiceContext,
  type VoiceCommandResult,
} from "@/lib/voice/voice-commands";

type ListeningMode = "idle" | "single" | "continuous";

interface VoiceButtonProps {
  /** When set, "add item" routes into the active count session */
  sessionId?: string;
  /** Current sub-area in the session */
  subAreaId?: string;
  /** Display label for the current area (e.g. "Bar — Well") */
  areaName?: string;
}

export function VoiceButton({ sessionId, subAreaId, areaName }: VoiceButtonProps) {
  const router = useRouter();
  const { selectedLocationId } = useAuth();
  const [mode, setMode] = useState<ListeningMode>("idle");
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);
  const contextRef = useRef<VoiceContext>({
    scaleProfiles: [],
    inventoryItems: [],
    subAreas: [],
  });

  // Refs for continuous mode
  const modeRef = useRef<ListeningMode>("idle");
  const restartCountRef = useRef(0);
  const lastResultTimeRef = useRef(0);
  const continuousTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopRequestedRef = useRef(false);
  const subsRef = useRef<(() => void)[]>([]);

  // Keep modeRef in sync
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Session props refs for use in listeners
  const sessionIdRef = useRef(sessionId);
  const subAreaIdRef = useRef(subAreaId);
  const areaNameRef = useRef(areaName);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { subAreaIdRef.current = subAreaId; }, [subAreaId]);
  useEffect(() => { areaNameRef.current = areaName; }, [areaName]);

  // ── Data queries ─────────────────────────────────────────────────

  const { data: profiles } = trpc.scaleProfiles.list.useQuery(
    { locationId: selectedLocationId! },
    { enabled: !!selectedLocationId, staleTime: 60_000 },
  );

  const { data: inventoryItems } = trpc.inventory.list.useQuery(
    { locationId: selectedLocationId! },
    { enabled: !!selectedLocationId, staleTime: 60_000 },
  );

  const { data: areas } = trpc.areas.listBarAreas.useQuery(
    { locationId: selectedLocationId! },
    { enabled: !!selectedLocationId, staleTime: 60_000 },
  );

  // Flatten sub-areas into "Area — SubArea" format
  const flatSubAreas = useMemo(() => {
    if (!areas) return [];
    return (areas as Array<{ id: string; name: string; subAreas: Array<{ id: string; name: string }> }>).flatMap(
      (area) =>
        area.subAreas.map((sa) => ({
          id: sa.id,
          label: `${area.name} — ${sa.name}`,
        })),
    );
  }, [areas]);

  // Keep context in a ref so the native listener reads the latest value
  useEffect(() => {
    contextRef.current = {
      scaleProfiles: profiles ?? [],
      inventoryItems: (inventoryItems ?? []).map((i: any) => ({
        id: i.id,
        name: i.name,
      })),
      subAreas: flatSubAreas,
    };
  }, [profiles, inventoryItems, flatSubAreas]);

  // ── Pulse animation ──────────────────────────────────────────────

  const stopPulse = useCallback(() => {
    pulseRef.current?.stop();
    pulseRef.current = null;
    pulseAnim.setValue(1);
  }, [pulseAnim]);

  const startPulse = useCallback(() => {
    stopPulse();
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    pulseRef.current = anim;
    anim.start();
  }, [pulseAnim, stopPulse]);

  // ── Confirmation helper ─────────────────────────────────────────

  const confirmAndExecute = useCallback(
    (description: string, onConfirm: () => void) => {
      Alert.alert("Voice Command", description, [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", onPress: onConfirm },
      ]);
    },
    [],
  );

  // ── Build description for confirmation ──────────────────────────

  const buildDescription = useCallback(
    (result: VoiceCommandResult): string | null => {
      switch (result.action) {
        case "transfer": {
          const parts: string[] = [];
          if (result.quantity != null) parts.push(String(result.quantity));
          if (result.itemName) parts.push(result.itemName);
          const fromLabel = contextRef.current.subAreas.find(
            (s) => s.id === result.fromSubAreaId,
          )?.label;
          const toLabel = contextRef.current.subAreas.find(
            (s) => s.id === result.toSubAreaId,
          )?.label;
          if (fromLabel) parts.push(`from ${fromLabel}`);
          if (toLabel) parts.push(`to ${toLabel}`);
          return `Transfer ${parts.join(" ")}?`;
        }
        case "receive": {
          const qty = result.quantity != null ? `${result.quantity} ` : "";
          return `Receive ${qty}${result.itemName ?? "item"}?`;
        }
        case "add-item": {
          return `Add ${result.itemName ?? "item"} to this count?`;
        }
        default:
          return null;
      }
    },
    [],
  );

  // ── Dispatch a parsed voice command ─────────────────────────────

  const dispatchCommand = useCallback(
    (result: VoiceCommandResult) => {
      switch (result.action) {
        case "connect-scale": {
          const params: Record<string, string> = {};
          if (result.profileId) params.profileId = result.profileId;
          router.push({ pathname: "/connect-scale", params });
          break;
        }

        case "transfer": {
          const execute = () => {
            const params: Record<string, string> = {};
            if (result.itemId) params.itemId = result.itemId;
            if (result.quantity != null) params.quantity = String(result.quantity);
            if (result.fromSubAreaId) params.fromSubAreaId = result.fromSubAreaId;
            if (result.toSubAreaId) params.toSubAreaId = result.toSubAreaId;
            router.push({ pathname: "/transfer", params });
          };
          const desc = buildDescription(result);
          if (desc) {
            confirmAndExecute(desc, execute);
          } else {
            execute();
          }
          break;
        }

        case "receive": {
          const execute = () => {
            const params: Record<string, string> = {};
            if (result.itemId) params.itemId = result.itemId;
            if (result.quantity != null) params.quantity = String(result.quantity);
            router.push({ pathname: "/receive", params });
          };
          const desc = buildDescription(result);
          if (desc) {
            confirmAndExecute(desc, execute);
          } else {
            execute();
          }
          break;
        }

        case "add-item": {
          const sid = sessionIdRef.current;
          if (!sid) {
            Alert.alert(
              "Add Item",
              "Open a counting session first, then use voice to add items.",
            );
            break;
          }
          const execute = () => {
            const saId = subAreaIdRef.current ?? "";
            const area = areaNameRef.current ?? "";
            let path = `/session/${sid}/scan-weigh?subAreaId=${saId}&areaName=${encodeURIComponent(area)}`;
            if (result.itemId) path += `&itemId=${result.itemId}`;
            router.push(path as any);
          };
          const desc = buildDescription(result);
          if (desc) {
            confirmAndExecute(desc, execute);
          } else {
            execute();
          }
          break;
        }

        case "navigate": {
          router.push(result.screen as any);
          break;
        }

        case "stop-listening": {
          // Handled in the result listener before dispatch
          break;
        }
      }
    },
    [router, buildDescription, confirmAndExecute],
  );

  // ── Cleanup all listeners and timers ───────────────────────────

  const cleanupAll = useCallback(() => {
    subsRef.current.forEach((unsub) => unsub());
    subsRef.current.length = 0;
    if (continuousTimeoutRef.current) {
      clearTimeout(continuousTimeoutRef.current);
      continuousTimeoutRef.current = null;
    }
    setMode("idle");
    stopPulse();
  }, [stopPulse]);

  // ── Reset continuous idle timeout ──────────────────────────────

  const resetContinuousTimeout = useCallback(() => {
    if (continuousTimeoutRef.current) {
      clearTimeout(continuousTimeoutRef.current);
    }
    continuousTimeoutRef.current = setTimeout(() => {
      // 60s with no final results → exit continuous mode
      stopRequestedRef.current = true;
      ExpoSpeechRecognitionModule.stop();
    }, 60_000);
  }, []);

  // ── Start speech recognition ────────────────────────────────────

  const startRecognition = useCallback(
    (continuous: boolean) => {
      const ctx = contextRef.current;
      const profileNames = ctx.scaleProfiles.map((p) => p.name);
      const topItemNames = ctx.inventoryItems.slice(0, 50).map((i) => i.name);
      const subAreaLabels = ctx.subAreas.map((s) => s.label);

      ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        interimResults: false,
        continuous,
        requiresOnDeviceRecognition: false,
        contextualStrings: [
          "connect to scale",
          "transfer",
          "receive",
          "add",
          "stop listening",
          "stop",
          "go to inventory",
          "go to sessions",
          "go to settings",
          "go to transfer",
          "go to receive",
          ...profileNames,
          ...topItemNames,
          ...subAreaLabels,
        ],
      });
    },
    [],
  );

  // ── Set up listeners and start ──────────────────────────────────

  const beginListening = useCallback(
    async (continuous: boolean) => {
      const permResult =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permResult.granted) {
        Alert.alert(
          "Permission Required",
          "Microphone and speech recognition permissions are needed for voice commands.",
        );
        return;
      }

      // Clean up any existing listeners
      subsRef.current.forEach((unsub) => unsub());
      subsRef.current.length = 0;

      stopRequestedRef.current = false;
      restartCountRef.current = 0;
      const targetMode = continuous ? "continuous" : "single";
      setMode(targetMode);

      subsRef.current.push(
        ExpoSpeechRecognitionModule.addListener("start", () => {
          startPulse();
        }).remove,
      );

      subsRef.current.push(
        ExpoSpeechRecognitionModule.addListener("end", () => {
          if (modeRef.current === "continuous" && !stopRequestedRef.current) {
            // Auto-restart in continuous mode
            if (restartCountRef.current >= 3) {
              // Too many restarts with no results — give up
              cleanupAll();
              return;
            }
            restartCountRef.current++;
            setTimeout(() => {
              if (modeRef.current === "continuous" && !stopRequestedRef.current) {
                startRecognition(true);
              }
            }, 300);
          } else {
            cleanupAll();
          }
        }).remove,
      );

      subsRef.current.push(
        ExpoSpeechRecognitionModule.addListener("result", (event) => {
          if (!event.isFinal) return;
          const transcript = event.results[0]?.transcript ?? "";
          const result = parseVoiceCommand(transcript, contextRef.current);

          // Reset restart counter on any result
          restartCountRef.current = 0;
          lastResultTimeRef.current = Date.now();

          // Reset idle timeout in continuous mode
          if (modeRef.current === "continuous") {
            resetContinuousTimeout();
          }

          if (!result) {
            Alert.alert("Voice Command", `Didn't understand: "${transcript}"`);
            return;
          }

          // Handle stop-listening
          if (result.action === "stop-listening") {
            stopRequestedRef.current = true;
            ExpoSpeechRecognitionModule.stop();
            return;
          }

          dispatchCommand(result);
        }).remove,
      );

      subsRef.current.push(
        ExpoSpeechRecognitionModule.addListener("error", (event) => {
          if (event.error === "no-speech" && modeRef.current === "continuous") {
            // In continuous mode, no-speech is normal — just let "end" handle restart
            return;
          }
          if (event.error !== "no-speech") {
            cleanupAll();
            Alert.alert(
              "Voice Error",
              event.message || "Speech recognition failed. Check your internet connection.",
            );
          }
        }).remove,
      );

      // Start idle timeout for continuous mode
      if (continuous) {
        resetContinuousTimeout();
      }

      startRecognition(continuous);
    },
    [startPulse, cleanupAll, startRecognition, dispatchCommand, resetContinuousTimeout],
  );

  // ── Long press detection ────────────────────────────────────────

  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const handlePressIn = useCallback(() => {
    longPressTriggeredRef.current = false;
    pressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      // Long press → continuous mode
      if (mode === "idle") {
        beginListening(true);
      }
    }, 500);
  }, [mode, beginListening]);

  const handlePressOut = useCallback(() => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }

    if (longPressTriggeredRef.current) {
      // Long press was already handled in pressIn timer
      return;
    }

    // Short press
    if (mode === "idle") {
      beginListening(false);
    } else {
      // Tap while listening → stop
      stopRequestedRef.current = true;
      ExpoSpeechRecognitionModule.stop();
    }
  }, [mode, beginListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      subsRef.current.forEach((unsub) => unsub());
      subsRef.current.length = 0;
      if (continuousTimeoutRef.current) clearTimeout(continuousTimeoutRef.current);
      if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    };
  }, []);

  const isListening = mode !== "idle";
  const isContinuous = mode === "continuous";

  return (
    <Animated.View
      style={[styles.wrapper, { transform: [{ scale: pulseAnim }] }]}
    >
      <TouchableOpacity
        style={[
          styles.button,
          isListening && !isContinuous && styles.buttonListening,
          isContinuous && styles.buttonContinuous,
        ]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.7}
      >
        <Text style={styles.icon}>
          {isListening ? "..." : "MIC"}
        </Text>
      </TouchableOpacity>
      {isListening && (
        <Text style={[styles.label, isContinuous && styles.labelContinuous]}>
          {isContinuous ? "Continuous" : "Listening..."}
        </Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    bottom: 100,
    right: 20,
    alignItems: "center",
    zIndex: 999,
  },
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#E9B44C",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  buttonListening: {
    backgroundColor: "#dc2626",
  },
  buttonContinuous: {
    backgroundColor: "#22c55e",
  },
  icon: {
    color: "#0B1623",
    fontSize: 13,
    fontWeight: "800",
  },
  label: {
    marginTop: 4,
    color: "#EAF0FF",
    fontSize: 11,
    fontWeight: "600",
  },
  labelContinuous: {
    color: "#22c55e",
  },
});
