import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import { scaleManager, type ScaleReading } from "@/lib/scale/scale-manager";

interface ScaleConnectorProps {
  onWeightReading: (reading: ScaleReading) => void;
}

export function ScaleConnector({ onWeightReading }: ScaleConnectorProps) {
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<Array<{ id: string; name: string }>>([]);
  const [connected, setConnected] = useState(scaleManager.isConnected);
  const [lastReading, setLastReading] = useState<ScaleReading | null>(null);

  useEffect(() => {
    const unsubscribe = scaleManager.onReading((reading) => {
      setLastReading(reading);
      if (reading.stable) {
        onWeightReading(reading);
      }
    });
    return unsubscribe;
  }, [onWeightReading]);

  useEffect(() => {
    const unsubscribe = scaleManager.onDisconnect(() => {
      setConnected(false);
      setLastReading(null);
    });
    return unsubscribe;
  }, []);

  async function handleScan() {
    setScanning(true);
    const found = await scaleManager.scan();
    setDevices(found);
    setScanning(false);
  }

  async function handleConnect(deviceId: string) {
    await scaleManager.connect(deviceId);
    setConnected(true);
  }

  async function handleDisconnect() {
    await scaleManager.disconnect();
    setConnected(false);
    setLastReading(null);
  }

  if (connected) {
    return (
      <View style={styles.connectedCard}>
        <Text style={styles.connectedTitle}>Scale Connected</Text>
        {lastReading && (
          <View style={styles.readingRow}>
            <Text style={styles.weight}>{lastReading.weightGrams.toFixed(1)}g</Text>
            <Text style={lastReading.stable ? styles.stable : styles.unstable}>
              {lastReading.stable ? "Stable" : "Settling..."}
            </Text>
          </View>
        )}
        <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
          <Text style={styles.disconnectText}>Disconnect</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Bluetooth Scale</Text>

      <TouchableOpacity style={styles.scanBtn} onPress={handleScan} disabled={scanning}>
        {scanning ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.scanText}>Scan for Scales</Text>
        )}
      </TouchableOpacity>

      {devices.length > 0 && (
        <FlatList
          data={devices}
          keyExtractor={(d) => d.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.deviceRow}
              onPress={() => handleConnect(item.id)}
            >
              <Text style={styles.deviceName}>{item.name}</Text>
              <Text style={styles.connectText}>Connect</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#fff", borderRadius: 8, padding: 16, borderWidth: 1, borderColor: "#e5e7eb" },
  connectedCard: { backgroundColor: "#f0fdf4", borderRadius: 8, padding: 16, borderWidth: 1, borderColor: "#86efac" },
  title: { fontSize: 14, fontWeight: "600", color: "#666", marginBottom: 12 },
  connectedTitle: { fontSize: 14, fontWeight: "600", color: "#16a34a", marginBottom: 8 },
  scanBtn: { backgroundColor: "#2563eb", borderRadius: 8, padding: 12, alignItems: "center" },
  scanText: { color: "#fff", fontWeight: "600" },
  deviceRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  deviceName: { fontSize: 14, fontWeight: "500" },
  connectText: { color: "#2563eb", fontWeight: "500" },
  readingRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginVertical: 8 },
  weight: { fontSize: 32, fontWeight: "bold", color: "#111" },
  stable: { color: "#16a34a", fontWeight: "500" },
  unstable: { color: "#f59e0b", fontWeight: "500" },
  disconnectBtn: { marginTop: 8, padding: 10, alignItems: "center" },
  disconnectText: { color: "#dc2626", fontWeight: "500" },
});
