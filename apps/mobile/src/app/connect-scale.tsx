import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { scaleManager, type ScaleReading } from "@/lib/scale/scale-manager";
import { getMappingForDevice, setMappingForDevice } from "@/lib/scale/scale-mappings";
import { useScaleHeartbeat } from "@/lib/scale/use-scale-heartbeat";
import { ScaleProfilePicker } from "@/components/ScaleProfilePicker";
import { useAuth } from "@/lib/auth-context";

export default function ConnectScaleSettingsScreen() {
  const { selectedLocationId } = useAuth();

  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<Array<{ id: string; name: string }>>(
    []
  );
  const [connected, setConnected] = useState(scaleManager.isConnected);
  const [connectedDeviceName, setConnectedDeviceName] = useState<string | null>(
    null
  );
  const [lastReading, setLastReading] = useState<ScaleReading | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);

  // Scale profile state
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [showProfilePicker, setShowProfilePicker] = useState(false);
  const [pendingDeviceId, setPendingDeviceId] = useState<string | null>(null);

  // Heartbeat while connected with a profile
  useScaleHeartbeat(profileId);

  useEffect(() => {
    const unsubscribe = scaleManager.onReading((reading) => {
      setLastReading(reading);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = scaleManager.onDisconnect(() => {
      setConnected(false);
      setConnectedDeviceName(null);
      setLastReading(null);
      setProfileId(null);
      setProfileName(null);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    handleScan();
  }, []);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setDevices([]);
    try {
      const found = await scaleManager.scan();
      setDevices(found);
    } catch {
      // Scan may fail on simulator or without BLE
    } finally {
      setScanning(false);
    }
  }, []);

  const handleConnect = useCallback(async (deviceId: string, name: string) => {
    setConnecting(deviceId);
    try {
      await scaleManager.connect(deviceId);
      setConnected(true);
      setConnectedDeviceName(name);

      // Check for existing profile mapping
      const existing = await getMappingForDevice(deviceId);
      if (existing) {
        setProfileId(existing.profileId);
        setProfileName(existing.profileName || null);
      } else if (selectedLocationId) {
        // No mapping — show picker
        setPendingDeviceId(deviceId);
        setShowProfilePicker(true);
      }
    } catch {
      Alert.alert(
        "Connection Failed",
        "Could not connect to scale. Please try again."
      );
    } finally {
      setConnecting(null);
    }
  }, [selectedLocationId]);

  const handleProfileSelect = useCallback(async (selectedProfileId: string, selectedProfileName: string) => {
    if (pendingDeviceId) {
      await setMappingForDevice(pendingDeviceId, selectedProfileId, selectedProfileName);
    }
    setProfileId(selectedProfileId);
    setProfileName(selectedProfileName);
    setShowProfilePicker(false);
    setPendingDeviceId(null);
  }, [pendingDeviceId]);

  const handleProfilePickerCancel = useCallback(() => {
    setShowProfilePicker(false);
    setPendingDeviceId(null);
  }, []);

  const handleDisconnect = useCallback(async () => {
    await scaleManager.disconnect();
    setConnected(false);
    setConnectedDeviceName(null);
    setLastReading(null);
    setProfileId(null);
    setProfileName(null);
  }, []);

  const handleTroubleshooting = useCallback(() => {
    Alert.alert(
      "Troubleshooting Tips",
      "1. Make sure the scale is powered on\n2. Ensure Bluetooth is enabled on your device\n3. Keep the scale within 3 feet / 1 meter\n4. Try turning the scale off and on again\n5. Close and reopen the app if issues persist",
      [{ text: "OK" }]
    );
  }, []);

  const formatWeight = (reading: ScaleReading) => {
    return `${reading.weightGrams.toFixed(1)} g`;
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.heading}>Connect Scale</Text>
        <Text style={styles.subtitle}>
          Pair a Bluetooth supported scale to weigh bottles
        </Text>

        {/* Connected Scale Card */}
        {connected && (
          <View style={styles.connectedCard}>
            <View style={styles.connectedHeader}>
              <View style={styles.checkCircle}>
                <Text style={styles.checkMark}>✓</Text>
              </View>
              <Text style={styles.connectedLabel}>Scale Connected</Text>
            </View>
            <Text style={styles.deviceNameConnected}>
              {profileName
                ? `${profileName} (${connectedDeviceName ?? "Scale"})`
                : connectedDeviceName ?? "Scale"}
            </Text>
            {lastReading && (
              <Text style={styles.liveWeight}>{formatWeight(lastReading)}</Text>
            )}
            <TouchableOpacity
              style={styles.disconnectBtn}
              onPress={handleDisconnect}
            >
              <Text style={styles.disconnectText}>Disconnect</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Searching / Device List */}
        {!connected && (
          <View style={styles.devicesSection}>
            {scanning && (
              <View style={styles.scanningRow}>
                <ActivityIndicator color="#E9B44C" size="small" />
                <Text style={styles.scanningText}>
                  Searching for scales...
                </Text>
              </View>
            )}

            {!scanning && devices.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>
                  No scales found. Tap below to scan again.
                </Text>
              </View>
            )}

            {devices.map((device) => (
              <View key={device.id} style={styles.deviceRow}>
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>{device.name}</Text>
                </View>
                <TouchableOpacity
                  style={styles.connectBtn}
                  onPress={() => handleConnect(device.id, device.name)}
                  disabled={connecting !== null}
                >
                  {connecting === device.id ? (
                    <ActivityIndicator color="#0B1623" size="small" />
                  ) : (
                    <Text style={styles.connectBtnText}>Connect</Text>
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Scan Button */}
        {!connected && (
          <TouchableOpacity
            style={[styles.scanButton, scanning && styles.buttonDisabled]}
            onPress={handleScan}
            disabled={scanning}
          >
            <Text style={styles.scanButtonText}>
              {scanning ? "Scanning..." : "Scan for Devices"}
            </Text>
          </TouchableOpacity>
        )}

        {/* Troubleshooting */}
        <TouchableOpacity
          style={styles.troubleshootLink}
          onPress={handleTroubleshooting}
        >
          <Text style={styles.troubleshootText}>Troubleshooting Tips</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Profile Picker Overlay */}
      {showProfilePicker && selectedLocationId && (
        <ScaleProfilePicker
          locationId={selectedLocationId}
          onSelect={handleProfileSelect}
          onCancel={handleProfilePickerCancel}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B1623",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  heading: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#EAF0FF",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: "#8899AA",
    marginBottom: 24,
  },
  connectedCard: {
    backgroundColor: "#16283F",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#22C55E",
  },
  connectedHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  checkMark: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  connectedLabel: {
    fontSize: 17,
    fontWeight: "700",
    color: "#22C55E",
  },
  deviceNameConnected: {
    fontSize: 15,
    color: "#8899AA",
    marginBottom: 4,
  },
  liveWeight: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#E9B44C",
    marginTop: 8,
  },
  disconnectBtn: {
    marginTop: 16,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#dc2626",
    borderRadius: 8,
  },
  disconnectText: {
    color: "#dc2626",
    fontWeight: "600",
    fontSize: 14,
  },
  devicesSection: {
    marginBottom: 20,
  },
  scanningRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 16,
  },
  scanningText: {
    color: "#8899AA",
    fontSize: 15,
  },
  emptyState: {
    paddingVertical: 24,
    alignItems: "center",
  },
  emptyText: {
    color: "#5A6A7A",
    fontSize: 14,
    textAlign: "center",
  },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  deviceInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  deviceName: {
    color: "#EAF0FF",
    fontSize: 15,
    fontWeight: "500",
  },
  connectBtn: {
    backgroundColor: "#E9B44C",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 80,
    alignItems: "center",
  },
  connectBtnText: {
    color: "#0B1623",
    fontWeight: "700",
    fontSize: 14,
  },
  scanButton: {
    backgroundColor: "#E9B44C",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 20,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  scanButtonText: {
    color: "#0B1623",
    fontSize: 17,
    fontWeight: "700",
  },
  troubleshootLink: {
    alignItems: "center",
    paddingVertical: 8,
  },
  troubleshootText: {
    color: "#8899AA",
    fontSize: 14,
    textDecorationLine: "underline",
  },
});
