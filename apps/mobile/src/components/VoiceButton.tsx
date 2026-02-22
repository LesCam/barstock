import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Alert,
  Animated,
} from "react-native";
import { useRouter } from "expo-router";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";
import {
  parseVoiceCommand,
  type VoiceContext,
} from "@/lib/voice/voice-commands";

export function VoiceButton() {
  const router = useRouter();
  const { selectedLocationId } = useAuth();
  const [listening, setListening] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);
  const contextRef = useRef<VoiceContext>({
    scaleProfiles: [],
    inventoryItems: [],
    subAreas: [],
  });

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

  // ── Speech recognition ───────────────────────────────────────────

  const handlePress = useCallback(async () => {
    if (listening) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }

    const permResult =
      await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permResult.granted) {
      Alert.alert(
        "Permission Required",
        "Microphone and speech recognition permissions are needed for voice commands.",
      );
      return;
    }

    const subs: (() => void)[] = [];

    const cleanup = () => {
      subs.forEach((unsub) => unsub());
      subs.length = 0;
      setListening(false);
      stopPulse();
    };

    subs.push(
      ExpoSpeechRecognitionModule.addListener("start", () => {
        setListening(true);
        startPulse();
      }).remove,
    );

    subs.push(
      ExpoSpeechRecognitionModule.addListener("end", () => {
        cleanup();
      }).remove,
    );

    subs.push(
      ExpoSpeechRecognitionModule.addListener("result", (event) => {
        if (!event.isFinal) return;
        const transcript = event.results[0]?.transcript ?? "";
        const result = parseVoiceCommand(transcript, contextRef.current);

        if (!result) {
          Alert.alert("Voice Command", `Didn't understand: "${transcript}"`);
          return;
        }

        switch (result.action) {
          case "connect-scale": {
            const params: Record<string, string> = {};
            if (result.profileId) params.profileId = result.profileId;
            router.push({ pathname: "/connect-scale", params });
            break;
          }

          case "transfer": {
            const params: Record<string, string> = {};
            if (result.itemId) params.itemId = result.itemId;
            if (result.itemName) params.itemName = result.itemName;
            if (result.quantity != null)
              params.quantity = String(result.quantity);
            if (result.fromSubAreaId) params.fromSubAreaId = result.fromSubAreaId;
            if (result.toSubAreaId) params.toSubAreaId = result.toSubAreaId;

            // Build feedback message
            const parts: string[] = [];
            if (result.quantity != null) parts.push(String(result.quantity));
            if (result.itemName) parts.push(result.itemName);
            const fromLabel = contextRef.current.subAreas.find(
              (s) => s.id === result.fromSubAreaId,
            )?.label;
            const toLabel = contextRef.current.subAreas.find(
              (s) => s.id === result.toSubAreaId,
            )?.label;
            if (fromLabel || toLabel) {
              parts.push("—");
              if (fromLabel) parts.push(`from ${fromLabel}`);
              if (toLabel) parts.push(`to ${toLabel}`);
            }
            if (parts.length > 0) {
              Alert.alert("Transfer", `Transferring ${parts.join(" ")}`);
            }

            router.push({ pathname: "/transfer", params });
            break;
          }

          case "receive": {
            const params: Record<string, string> = {};
            if (result.itemId) params.itemId = result.itemId;
            if (result.itemName) params.itemName = result.itemName;
            if (result.quantity != null)
              params.quantity = String(result.quantity);

            if (result.itemName) {
              const qty = result.quantity != null ? `${result.quantity} ` : "";
              Alert.alert("Receive", `Receiving ${qty}${result.itemName}`);
            }

            router.push({ pathname: "/receive", params });
            break;
          }

          case "add-item": {
            Alert.alert(
              "Add Item",
              "Open a counting session first, then use voice to add items.",
            );
            break;
          }

          case "navigate": {
            router.push(result.screen as any);
            break;
          }
        }
      }).remove,
    );

    subs.push(
      ExpoSpeechRecognitionModule.addListener("error", (event) => {
        cleanup();
        if (event.error !== "no-speech") {
          Alert.alert(
            "Voice Error",
            event.message || "Speech recognition failed. Check your internet connection.",
          );
        }
      }).remove,
    );

    // Build contextual strings for better recognition accuracy
    const ctx = contextRef.current;
    const profileNames = ctx.scaleProfiles.map((p) => p.name);
    const topItemNames = ctx.inventoryItems.slice(0, 50).map((i) => i.name);
    const subAreaLabels = ctx.subAreas.map((s) => s.label);

    ExpoSpeechRecognitionModule.start({
      lang: "en-US",
      interimResults: false,
      continuous: false,
      requiresOnDeviceRecognition: false,
      contextualStrings: [
        "connect to scale",
        "transfer",
        "receive",
        "add",
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
  }, [listening, router, startPulse, stopPulse]);

  return (
    <Animated.View
      style={[styles.wrapper, { transform: [{ scale: pulseAnim }] }]}
    >
      <TouchableOpacity
        style={[styles.button, listening && styles.buttonListening]}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        <Text style={styles.icon}>{listening ? "..." : "MIC"}</Text>
      </TouchableOpacity>
      {listening && <Text style={styles.label}>Listening...</Text>}
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
});
