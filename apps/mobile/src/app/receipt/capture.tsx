import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState, useRef, useEffect } from "react";
import * as ImagePicker from "expo-image-picker";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";

interface CapturedPhoto {
  uri: string;
  base64: string;
  filename: string;
}

export default function ReceiptCaptureScreen() {
  const { selectedLocationId } = useAuth();
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [processing, setProcessing] = useState(false);
  const launchingRef = useRef(false);

  function goToConfirm(receiptCaptureId: string) {
    router.replace({
      pathname: "/receipt/confirm",
      params: { receiptCaptureId },
    });
  }

  const captureMutation = trpc.receipts.capture.useMutation({
    onSuccess: (data) => {
      setProcessing(false);
      if (data.possibleDuplicate) {
        const dup = data.possibleDuplicate;
        const when = dup.processedAt
          ? `processed ${new Date(dup.processedAt).toLocaleDateString()}`
          : "not yet processed";
        Alert.alert(
          "Possible Duplicate",
          `A similar receipt was already scanned${dup.invoiceNumber ? ` (Invoice #${dup.invoiceNumber})` : ""}${dup.vendorName ? ` from ${dup.vendorName}` : ""} — ${when}, ${dup.lineCount} items.\n\nContinue anyway?`,
          [
            { text: "Skip", style: "cancel", onPress: () => router.back() },
            { text: "Review Anyway", onPress: () => goToConfirm(data.receiptCaptureId) },
          ]
        );
      } else {
        goToConfirm(data.receiptCaptureId);
      }
    },
    onError: (err) => {
      setProcessing(false);
      Alert.alert("Extraction Failed", err.message, [
        { text: "Retry", onPress: () => handleProcess() },
        { text: "Cancel", style: "cancel" },
      ]);
    },
  });

  // Auto-launch camera on mount
  useEffect(() => {
    handleLaunchCamera();
  }, []);

  async function handleLaunchCamera() {
    if (launchingRef.current) return;
    launchingRef.current = true;

    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Camera permission is needed to scan receipts.");
        if (photos.length === 0) router.back();
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.4,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        if (photos.length === 0) router.back();
        return;
      }

      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert("Error", "Could not read photo data.");
        return;
      }

      setPhotos((prev) => [
        ...prev,
        {
          uri: asset.uri,
          base64: asset.base64!,
          filename: `receipt-${Date.now()}-${photos.length + 1}.jpg`,
        },
      ]);
    } catch (err: any) {
      Alert.alert("Error", `Failed to capture photo: ${err?.message ?? "Unknown error"}`);
      if (photos.length === 0) router.back();
    } finally {
      launchingRef.current = false;
    }
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function handleProcess() {
    if (photos.length === 0 || !selectedLocationId) return;
    setProcessing(true);
    captureMutation.mutate({
      locationId: selectedLocationId,
      images: photos.map((p) => ({
        base64Data: p.base64,
        filename: p.filename,
      })),
    });
  }

  // Processing state
  if (processing) {
    return (
      <View style={styles.processingContainer}>
        <ActivityIndicator size="large" color="#E9B44C" />
        <Text style={styles.processingText}>Analyzing receipt...</Text>
        <Text style={styles.processingSubtext}>
          Extracting items from {photos.length} photo{photos.length === 1 ? "" : "s"}
        </Text>
      </View>
    );
  }

  // Has photos — show review
  if (photos.length > 0) {
    return (
      <View style={styles.container}>
        <ScrollView
          style={styles.photoScroll}
          contentContainerStyle={styles.photoScrollContent}
        >
          <Text style={styles.photoCount}>
            {photos.length} photo{photos.length === 1 ? "" : "s"} captured
          </Text>

          {photos.map((photo, index) => (
            <View key={index} style={styles.photoCard}>
              <Image
                source={{ uri: photo.uri }}
                style={styles.thumbnail}
                contentFit="cover"
              />
              <View style={styles.photoInfo}>
                <Text style={styles.photoLabel}>Page {index + 1}</Text>
              </View>
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => removePhoto(index)}
              >
                <Text style={styles.removeBtnText}>X</Text>
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity
            style={styles.addMoreBtn}
            onPress={handleLaunchCamera}
          >
            <Text style={styles.addMoreText}>+ Add Another Photo</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.bottomControls}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => router.back()}
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.processButton}
            onPress={handleProcess}
          >
            <Text style={styles.processText}>
              Process {photos.length} Photo{photos.length === 1 ? "" : "s"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Launch screen — no photos yet
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
        For long receipts, take multiple photos{"\n"}of different sections
      </Text>

      <TouchableOpacity style={styles.cancelLink} onPress={() => router.back()}>
        <Text style={styles.cancelLinkText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623" },

  // Photo review
  photoScroll: { flex: 1 },
  photoScrollContent: { padding: 16, paddingBottom: 120 },
  photoCount: {
    color: "#EAF0FF",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 16,
  },
  photoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16283F",
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  thumbnail: {
    width: 60,
    height: 80,
    borderRadius: 8,
  },
  photoInfo: {
    flex: 1,
    marginLeft: 12,
  },
  photoLabel: {
    color: "#EAF0FF",
    fontSize: 16,
    fontWeight: "600",
  },
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(220,38,38,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  removeBtnText: {
    color: "#DC2626",
    fontSize: 14,
    fontWeight: "700",
  },
  addMoreBtn: {
    borderWidth: 2,
    borderColor: "#E9B44C",
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 18,
    alignItems: "center",
    marginTop: 4,
  },
  addMoreText: {
    color: "#E9B44C",
    fontSize: 16,
    fontWeight: "600",
  },

  // Bottom controls
  bottomControls: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    padding: 16,
    paddingBottom: 40,
    gap: 12,
    backgroundColor: "#0B1623",
    borderTopWidth: 1,
    borderTopColor: "#1E3550",
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#16283F",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelBtnText: { fontSize: 17, fontWeight: "600", color: "#8899AA" },
  processButton: {
    flex: 2,
    backgroundColor: "#E9B44C",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  processText: { fontSize: 17, fontWeight: "700", color: "#0B1623" },

  // Processing
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

  // Launch
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
    lineHeight: 20,
  },
  cancelLink: { marginTop: 24, padding: 14 },
  cancelLinkText: { color: "#5A6A7A", fontSize: 14 },
});
