import { useState, useRef, useCallback, useEffect } from "react";
import { Alert } from "react-native";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import * as Haptics from "expo-haptics";
import { parseSpokenWeight } from "./voice-commands";

type VoiceWeightStatus = "idle" | "listening" | "processing";

interface UseVoiceWeightOptions {
  onWeight: (grams: number) => void;
  hapticEnabled?: boolean;
}

export function useVoiceWeight({ onWeight, hapticEnabled = true }: UseVoiceWeightOptions) {
  const [status, setStatus] = useState<VoiceWeightStatus>("idle");
  const subsRef = useRef<(() => void)[]>([]);
  const statusRef = useRef<VoiceWeightStatus>("idle");
  const onWeightRef = useRef(onWeight);
  onWeightRef.current = onWeight;

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const cleanup = useCallback(() => {
    subsRef.current.forEach((unsub) => unsub());
    subsRef.current.length = 0;
    setStatus("idle");
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      subsRef.current.forEach((unsub) => unsub());
      subsRef.current.length = 0;
    };
  }, []);

  const startListening = useCallback(async () => {
    if (statusRef.current !== "idle") return;

    const permResult = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permResult.granted) {
      Alert.alert(
        "Permission Required",
        "Microphone permission is needed for voice weight input.",
      );
      return;
    }

    // Clean up any stale listeners
    subsRef.current.forEach((unsub) => unsub());
    subsRef.current.length = 0;

    setStatus("listening");
    if (hapticEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    subsRef.current.push(
      ExpoSpeechRecognitionModule.addListener("result", (event) => {
        if (!event.isFinal) return;
        const transcript = event.results[0]?.transcript ?? "";
        setStatus("processing");

        const grams = parseSpokenWeight(transcript);
        if (grams !== null) {
          if (hapticEnabled) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          onWeightRef.current(grams);
          cleanup();
        } else {
          if (hapticEnabled) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          }
          Alert.alert(
            "Didn't Catch That",
            `Heard: "${transcript}"\n\nTry saying a number like "720" or "three fifty".`,
          );
          cleanup();
        }
      }).remove,
    );

    subsRef.current.push(
      ExpoSpeechRecognitionModule.addListener("error", (event) => {
        if (event.error === "no-speech") {
          if (hapticEnabled) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          }
          Alert.alert("No Speech Detected", "Tap the mic and say the weight in grams.");
        }
        cleanup();
      }).remove,
    );

    subsRef.current.push(
      ExpoSpeechRecognitionModule.addListener("end", () => {
        // If still listening (no result/error triggered cleanup), just reset
        if (statusRef.current !== "idle") {
          cleanup();
        }
      }).remove,
    );

    // Common weight strings to prime recognition
    const contextualStrings = [
      "100", "150", "200", "250", "300", "350", "400", "450",
      "500", "550", "600", "650", "700", "750", "800", "850",
      "900", "950", "1000", "1100", "1200", "1500",
      "one hundred", "two hundred", "three hundred", "four hundred",
      "five hundred", "six hundred", "seven hundred", "eight hundred",
      "seven twenty", "seven fifty", "three fifty", "four fifty",
      "grams",
    ];

    ExpoSpeechRecognitionModule.start({
      lang: "en-US",
      interimResults: false,
      continuous: false,
      requiresOnDeviceRecognition: false,
      contextualStrings,
    });
  }, [hapticEnabled, cleanup]);

  const cancelListening = useCallback(() => {
    if (statusRef.current === "idle") return;
    ExpoSpeechRecognitionModule.stop();
    cleanup();
  }, [cleanup]);

  return { status, startListening, cancelListening };
}
