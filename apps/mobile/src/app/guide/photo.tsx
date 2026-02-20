import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, router } from "expo-router";
import { useRef, useState } from "react";
import { CameraView, useCameraPermissions } from "expo-camera";
import { trpc } from "@/lib/trpc";

export default function GuidePhotoScreen() {
  const { guideItemId, locationId } = useLocalSearchParams<{
    guideItemId: string;
    locationId: string;
  }>();
  const utils = trpc.useUtils();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [preview, setPreview] = useState<{ uri: string; base64: string } | null>(null);

  const uploadImage = trpc.productGuide.uploadItemImage.useMutation({
    onSuccess: () => {
      utils.productGuide.getItem.invalidate({ id: guideItemId, locationId });
      utils.productGuide.listItems.invalidate();
      router.back();
    },
    onError: (err) => {
      Alert.alert("Error", err.message);
    },
  });

  async function handleCapture() {
    if (!cameraRef.current) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true });
      if (!photo?.base64 || !photo?.uri) {
        Alert.alert("Error", "Failed to capture photo.");
        return;
      }
      setPreview({ uri: photo.uri, base64: photo.base64 });
    } catch {
      Alert.alert("Error", "Failed to capture photo.");
    }
  }

  function handleRetake() {
    setPreview(null);
  }

  function handleUsePhoto() {
    if (!preview) return;
    uploadImage.mutate({
      id: guideItemId!,
      locationId: locationId!,
      base64Data: preview.base64,
      filename: `guide-${guideItemId}-${Date.now()}.jpg`,
    });
  }

  if (!permission) return null;

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>
          Camera permission is required to take photos.
        </Text>
        <TouchableOpacity style={styles.grantButton} onPress={requestPermission}>
          <Text style={styles.grantButtonText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
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
            disabled={uploadImage.isPending}
          >
            <Text style={styles.retakeText}>Retake</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.usePhotoButton,
              uploadImage.isPending && styles.usePhotoButtonDisabled,
            ]}
            onPress={handleUsePhoto}
            disabled={uploadImage.isPending}
            activeOpacity={0.7}
          >
            {uploadImage.isPending ? (
              <ActivityIndicator color="#0B1623" />
            ) : (
              <Text style={styles.usePhotoText}>Use Photo</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Camera mode
  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back" />

      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.captureButton}
          onPress={handleCapture}
          activeOpacity={0.7}
        >
          <View style={styles.captureInner} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.closeButton}
        onPress={() => router.back()}
      >
        <Text style={styles.closeText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  controls: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
  },
  captureInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#FFF",
    borderWidth: 3,
    borderColor: "#0B1623",
  },
  closeButton: {
    position: "absolute",
    top: 60,
    left: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  closeText: { color: "#FFF", fontSize: 15, fontWeight: "500" },
  // Preview
  previewImage: {
    flex: 1,
  },
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
  retakeText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#FFF",
  },
  usePhotoButton: {
    flex: 1,
    backgroundColor: "#E9B44C",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  usePhotoButtonDisabled: { opacity: 0.6 },
  usePhotoText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0B1623",
  },
  // Permission
  permissionContainer: {
    flex: 1,
    backgroundColor: "#0B1623",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  permissionText: {
    color: "#EAF0FF",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
  },
  grantButton: {
    backgroundColor: "#E9B44C",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    marginBottom: 12,
  },
  grantButtonText: { color: "#0B1623", fontSize: 16, fontWeight: "600" },
  cancelButton: { padding: 14 },
  cancelText: { color: "#5A6A7A", fontSize: 14 },
});
