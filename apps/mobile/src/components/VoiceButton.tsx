import { useState, useCallback, useRef } from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Alert,
  Animated,
} from "react-native";
import { useRouter } from "expo-router";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";
import { parseVoiceCommand } from "@/lib/voice/voice-commands";

export function VoiceButton() {
  const router = useRouter();
  const { selectedLocationId } = useAuth();
  const [listening, setListening] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);

  const { data: profiles } = trpc.scaleProfiles.list.useQuery(
    { locationId: selectedLocationId! },
    { enabled: !!selectedLocationId },
  );

  const startPulse = useCallback(() => {
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
  }, [pulseAnim]);

  const stopPulse = useCallback(() => {
    pulseRef.current?.stop();
    pulseAnim.setValue(1);
  }, [pulseAnim]);

  useSpeechRecognitionEvent("start", () => {
    setListening(true);
    startPulse();
  });

  useSpeechRecognitionEvent("end", () => {
    setListening(false);
    stopPulse();
  });

  useSpeechRecognitionEvent("result", (event) => {
    if (!event.isFinal) return;

    const transcript = event.results[0]?.transcript ?? "";
    const result = parseVoiceCommand(transcript, profiles ?? []);

    if (result) {
      const params: Record<string, string> = {};
      if (result.profileId) params.profileId = result.profileId;
      router.push({ pathname: "/connect-scale", params });
    } else {
      Alert.alert("Voice Command", `Didn't understand: "${transcript}"`);
    }
  });

  useSpeechRecognitionEvent("error", (event) => {
    setListening(false);
    stopPulse();
    // "no-speech" is normal — user just didn't say anything
    if (event.error !== "no-speech") {
      Alert.alert("Voice Error", event.message || "Speech recognition failed.");
    }
  });

  const handlePress = useCallback(async () => {
    if (listening) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }

    const { granted } =
      await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      Alert.alert(
        "Permission Required",
        "Microphone and speech recognition permissions are needed for voice commands.",
      );
      return;
    }

    const profileNames = (profiles ?? []).map((p) => p.name);

    ExpoSpeechRecognitionModule.start({
      lang: "en-US",
      interimResults: false,
      continuous: false,
      contextualStrings: ["connect to scale", ...profileNames],
    });
  }, [listening, profiles]);

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
    bottom: 80,
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
