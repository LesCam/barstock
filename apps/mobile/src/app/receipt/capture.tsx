import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState, useRef } from "react";
import * as ImagePicker from "expo-image-picker";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";

export default function ReceiptCaptureScreen() {
  const { selectedLocationId } = useAuth();
  const [preview, setPreview] = useState<{ uri: string; base64: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const launchingRef = useRef(false);

  const captureMutation = trpc.receipts.capture.useMutation({
    onSuccess: (data) => {
      setProcessing(false);
      router.replace({
        pathname: "/receipt/confirm",
        params: { receiptCaptureId: data.receiptCaptureId },
      });
    },
    onError: (err) => {
      setProcessing(false);
      Alert.alert("Extraction Failed", err.message, [
        { text: "Retry", onPress: () => handleProcess() },
        { text: "Retake", onPress: () => setPreview(null) },
        { text: "Cancel", onPress: () => router.back(), style: "cancel" },
      ]);
    },
  });

  async function handleLaunchCamera() {
    if (launchingRef.current) return;
    launchingRef.current = true;

    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Camera permission is needed to scan receipts.");
        router.back();
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.7,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        router.back();
        return;
      }

      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert("Error", "Could not read photo data.");
        router.back();
        return;
      }

      setPreview({ uri: asset.uri, base64: asset.base64 });
    } catch (err: any) {
      Alert.alert("Error", `Failed to capture photo: ${err?.message ?? "Unknown error"}`);
      router.back();
    } finally {
      launchingRef.current = false;
    }
  }

  function handleRetake() {
    setPreview(null);
    handleLaunchCamera();
  }

  function handleProcess() {
    if (!preview || !selectedLocationId) return;
    setProcessing(true);
    captureMutation.mutate({
      locationId: selectedLocationId,
      base64Data: preview.base64,
      filename: `receipt-${Date.now()}.jpg`,
    });
  }

  // Processing state
  if (processing) {
    return (
      <View style={styles.processingContainer}>
        <ActivityIndicator size="large" color="#E9B44C" />
        <Text style={styles.processingText}>Analyzing receipt...</Text>
        <Text style={styles.processingSubtext}>
          Extracting items, quantities, and prices
        </Text>
      </View>
    );
  }

  // Preview mode
  if (preview) {
    return (
      <View style={styles.container}>
        <Image
          source={{ uri: preview.uri }}
          style={styles.previewImage}
          contentFit="contain"
        />
        <View style={styles.previewControls}>
          <TouchableOpacity
            style={styles.retakeButton}
            onPress={handleRetake}
          >
            <Text style={styles.retakeText}>Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.processButton}
            onPress={handleProcess}
          >
            <Text style={styles.processText}>Process Receipt</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Launch screen
  return (
    <View style={styles.launchContainer}>
      <TouchableOpacity
        style={styles.launchButton}
        onPress={handleLaunchCamera}
        activeOpacity={0.7}
      >
        <Text style={styles.launchEmoji}>📷</Text>
        <Text style={styles.launchText}>Take Photo of Receipt</Text>
      </TouchableOpacity>

      <Text style={styles.hintText}>
        Take a clear photo of your supplier invoice or receipt
      </Text>

      <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  previewImage: { flex: 1 },
  previewControls: {
    position: "absolute",
    bottom: 40,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
  },
  retakeButton: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  retakeText: { fontSize: 17, fontWeight: "600", color: "#FFF" },
  processButton: {
    flex: 1,
    backgroundColor: "#E9B44C",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  processText: { fontSize: 17, fontWeight: "700", color: "#0B1623" },
  processingContainer: {
    flex: 1,
    backgroundColor: "#0B1623",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  processingText: {
    color: "#EAF0FF",
    fontSize: 18,
    fontWeight: "600",
    marginTop: 20,
  },
  processingSubtext: {
    color: "#5A6A7A",
    fontSize: 14,
    marginTop: 8,
  },
  launchContainer: {
    flex: 1,
    backgroundColor: "#0B1623",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  launchButton: {
    backgroundColor: "#E9B44C",
    paddingHorizontal: 48,
    paddingVertical: 24,
    borderRadius: 16,
    alignItems: "center",
    gap: 8,
  },
  launchEmoji: { fontSize: 48 },
  launchText: { fontSize: 18, fontWeight: "700", color: "#0B1623" },
  hintText: {
    color: "#5A6A7A",
    fontSize: 14,
    marginTop: 16,
    textAlign: "center",
  },
  cancelButton: { marginTop: 24, padding: 14 },
  cancelText: { color: "#5A6A7A", fontSize: 14 },
});
