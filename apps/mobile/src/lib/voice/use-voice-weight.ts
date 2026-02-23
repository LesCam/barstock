import { useState, useRef, useCallback, useEffect } from "react";
import { Alert } from "react-native";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import * as Haptics from "expo-haptics";
import { parseSpokenWeight } from "./voice-commands";

type VoiceWeightStatus = "idle" | "listening" | "processing" | "confirming";

const CONFIRM_WORDS = new Set([
  "submit", "accept", "yes", "confirm", "ok", "okay", "done", "send",
]);

const RETRY_WORDS = new Set([
  "retry", "redo", "again", "reweigh", "re-weigh",
]);

const WEIGHT_CONTEXT_STRINGS = [
  "100", "150", "200", "250", "300", "350", "400", "450",
  "500", "550", "600", "650", "700", "750", "800", "850",
  "900", "950", "1000", "1100", "1200", "1500",
  "one hundred", "two hundred", "three hundred", "four hundred",
  "five hundred", "six hundred", "seven hundred", "eight hundred",
  "seven twenty", "seven fifty", "three fifty", "four fifty",
  "grams",
];

const CONFIRM_CONTEXT_STRINGS = [
  "submit", "accept", "yes", "confirm", "ok", "okay", "done",
  "retry", "redo", "again",
];

interface UseVoiceWeightOptions {
  onWeight: (grams: number) => void;
  onConfirm?: () => void;
  hapticEnabled?: boolean;
}

export function useVoiceWeight({ onWeight, onConfirm, hapticEnabled = true }: UseVoiceWeightOptions) {
  const [status, setStatus] = useState<VoiceWeightStatus>("idle");
  const subsRef = useRef<(() => void)[]>([]);
  const statusRef = useRef<VoiceWeightStatus>("idle");
  const onWeightRef = useRef(onWeight);
  const onConfirmRef = useRef(onConfirm);
  onWeightRef.current = onWeight;
  onConfirmRef.current = onConfirm;

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const cleanupListeners = useCallback(() => {
    subsRef.current.forEach((unsub) => unsub());
    subsRef.current.length = 0;
  }, []);

  const cleanup = useCallback(() => {
    cleanupListeners();
    setStatus("idle");
  }, [cleanupListeners]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      subsRef.current.forEach((unsub) => unsub());
      subsRef.current.length = 0;
    };
  }, []);

  // Forward declarations via refs so the two phases can call each other
  const startWeightListenRef = useRef<() => void>(() => {});
  const startConfirmListenRef = useRef<() => void>(() => {});

  const startWeightListen = useCallback(() => {
    cleanupListeners();
    setStatus("listening");

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

          if (onConfirmRef.current) {
            setTimeout(() => startConfirmListenRef.current(), 300);
          } else {
            cleanup();
          }
        } else {
          if (hapticEnabled) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          }
          Alert.alert(
            "Didn't Catch That",
            `Heard: "${transcript}"\n\nTry saying a number like "720" or "1890.9".`,
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
        if (statusRef.current !== "idle") {
          cleanup();
        }
      }).remove,
    );

    ExpoSpeechRecognitionModule.start({
      lang: "en-US",
      interimResults: false,
      continuous: false,
      requiresOnDeviceRecognition: false,
      contextualStrings: WEIGHT_CONTEXT_STRINGS,
    });
  }, [hapticEnabled, cleanup, cleanupListeners]);

  const startConfirmListen = useCallback(() => {
    cleanupListeners();
    setStatus("confirming");

    // Track whether we already acted (interim results can fire multiple times)
    let acted = false;

    subsRef.current.push(
      ExpoSpeechRecognitionModule.addListener("result", (event) => {
        if (acted) return;
        const transcript = (event.results[0]?.transcript ?? "").toLowerCase().trim();
        const words = transcript.split(/\s+/);
        const isConfirm = words.some((w) => CONFIRM_WORDS.has(w));
        const isRetry = words.some((w) => RETRY_WORDS.has(w));

        if (isConfirm) {
          acted = true;
          if (hapticEnabled) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          ExpoSpeechRecognitionModule.stop();
          cleanupListeners();
          setStatus("idle");
          setTimeout(() => {
            onConfirmRef.current?.();
          }, 50);
        } else if (isRetry) {
          acted = true;
          if (hapticEnabled) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          ExpoSpeechRecognitionModule.stop();
          onWeightRef.current(0);
          setTimeout(() => startWeightListenRef.current(), 300);
        } else if (event.isFinal) {
          // Only try weight parse on final result
          const newWeight = parseSpokenWeight(transcript);
          if (newWeight !== null) {
            acted = true;
            if (hapticEnabled) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
            onWeightRef.current(newWeight);
            setTimeout(() => startConfirmListenRef.current(), 300);
          } else {
            acted = true;
            cleanup();
          }
        }
      }).remove,
    );

    subsRef.current.push(
      ExpoSpeechRecognitionModule.addListener("error", () => {
        cleanup();
      }).remove,
    );

    subsRef.current.push(
      ExpoSpeechRecognitionModule.addListener("end", () => {
        if (statusRef.current !== "idle") {
          cleanup();
        }
      }).remove,
    );

    ExpoSpeechRecognitionModule.start({
      lang: "en-US",
      interimResults: true,
      continuous: false,
      requiresOnDeviceRecognition: false,
      contextualStrings: CONFIRM_CONTEXT_STRINGS,
    });
  }, [hapticEnabled, cleanup, cleanupListeners]);

  // Keep refs in sync
  startWeightListenRef.current = startWeightListen;
  startConfirmListenRef.current = startConfirmListen;

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

    if (hapticEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    startWeightListen();
  }, [hapticEnabled, startWeightListen]);

  const cancelListening = useCallback(() => {
    if (statusRef.current === "idle") return;
    ExpoSpeechRecognitionModule.stop();
    cleanup();
  }, [cleanup]);

  return { status, startListening, cancelListening };
}
