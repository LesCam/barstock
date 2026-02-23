import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, router } from "expo-router";
import { useState, useRef } from "react";
import * as ImagePicker from "expo-image-picker";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";

export default function ArtworkPhotoScreen() {
  const { artworkId } = useLocalSearchParams<{ artworkId: string }>();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [preview, setPreview] = useState<{ uri: string; base64: string } | null>(null);
  const [launching, setLaunching] = useState(false);
  const launchingRef = useRef(false);

  const addPhoto = trpc.artworks.addPhoto.useMutation({
    onSuccess: () => {
      utils.artworks.getById.invalidate({ id: artworkId });
      utils.artworks.list.invalidate();
      router.back();
    },
    onError: (err) => {
      Alert.alert("Error", err.message);
    },
  });

  async function handleLaunchCamera() {
    if (launchingRef.current) return;
    launchingRef.current = true;
    setLaunching(true);

    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Camera permission is needed to take photos.");
        router.back();
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.7,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        // User cancelled — go back
        router.back();
        return;
      }

      const asset = result.assets[0];
      let base64 = asset.base64;

      if (!base64) {
        Alert.alert("Error", "Could not read photo data.");
        router.back();
        return;
      }

      setPreview({ uri: asset.uri, base64 });
    } catch (err: any) {
      Alert.alert("Error", `Failed to capture photo: ${err?.message ?? "Unknown error"}`);
      router.back();
    } finally {
      launchingRef.current = false;
      setLaunching(false);
    }
  }

  function handleRetake() {
    setPreview(null);
    handleLaunchCamera();
  }

  function handleUsePhoto() {
    if (!preview) return;
    addPhoto.mutate({
      businessId: user!.businessId,
      artworkId: artworkId!,
      base64Data: preview.base64,
      filename: `artwork-${artworkId}-${Date.now()}.jpg`,
    });
  }

  // Preview mode — show captured photo with Use / Retake
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
            disabled={addPhoto.isPending}
          >
            <Text style={styles.retakeText}>Retake</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.usePhotoButton,
              addPhoto.isPending && styles.usePhotoButtonDisabled,
            ]}
            onPress={handleUsePhoto}
            disabled={addPhoto.isPending}
            activeOpacity={0.7}
          >
            {addPhoto.isPending ? (
              <ActivityIndicator color="#0B1623" />
            ) : (
              <Text style={styles.usePhotoText}>Use Photo</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Launch screen — tap to open camera
  return (
    <View style={styles.launchContainer}>
      <TouchableOpacity
        style={[styles.launchButton, launching && { opacity: 0.6 }]}
        onPress={handleLaunchCamera}
        disabled={launching}
        activeOpacity={0.7}
      >
        {launching ? (
          <ActivityIndicator color="#0B1623" size="large" />
        ) : (
          <>
            <Text style={styles.launchEmoji}>📷</Text>
            <Text style={styles.launchText}>Take Photo</Text>
          </>
        )}
      </TouchableOpacity>

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
  usePhotoButton: {
    flex: 1,
    backgroundColor: "#E9B44C",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  usePhotoButtonDisabled: { opacity: 0.6 },
  usePhotoText: { fontSize: 17, fontWeight: "700", color: "#0B1623" },
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
  cancelButton: { marginTop: 24, padding: 14 },
  cancelText: { color: "#5A6A7A", fontSize: 14 },
});
