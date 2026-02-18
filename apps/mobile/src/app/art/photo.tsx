import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useRef, useState } from "react";
import { CameraView, useCameraPermissions } from "expo-camera";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";

export default function ArtworkPhotoScreen() {
  const { artworkId } = useLocalSearchParams<{ artworkId: string }>();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);

  const addPhoto = trpc.artworks.addPhoto.useMutation({
    onSuccess: () => {
      utils.artworks.getById.invalidate({ id: artworkId });
      router.back();
    },
    onError: (err) => {
      setCapturing(false);
      Alert.alert("Error", err.message);
    },
  });

  async function handleCapture() {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true });
      if (!photo?.base64) {
        Alert.alert("Error", "Failed to capture photo.");
        setCapturing(false);
        return;
      }

      addPhoto.mutate({
        businessId: user!.businessId,
        artworkId: artworkId!,
        base64Data: photo.base64,
        filename: `artwork-${artworkId}-${Date.now()}.jpg`,
      });
    } catch {
      Alert.alert("Error", "Failed to capture photo.");
      setCapturing(false);
    }
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

  const busy = capturing || addPhoto.isPending;

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back" />

      <View style={styles.controls}>
        {busy ? (
          <View style={styles.captureButton}>
            <ActivityIndicator color="#0B1623" />
          </View>
        ) : (
          <TouchableOpacity
            style={styles.captureButton}
            onPress={handleCapture}
            activeOpacity={0.7}
          >
            <View style={styles.captureInner} />
          </TouchableOpacity>
        )}
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
