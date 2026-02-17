import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, Modal, StyleSheet } from "react-native";
import { NumericKeypad } from "./NumericKeypad";
import { scaleManager, type ScaleReading } from "@/lib/scale/scale-manager";

interface TareWeightEditModalProps {
  visible: boolean;
  itemName: string;
  currentTareWeightG?: number;
  currentFullWeightG?: number;
  containerSizeMl: number;
  onSave: (emptyBottleWeightG: number, fullBottleWeightG: number) => void;
  onCancel: () => void;
}

type WeightTab = "tare" | "full";

const DEFAULT_DENSITY = 0.95; // g/mL approximate for spirits

export function TareWeightEditModal({
  visible,
  itemName,
  currentTareWeightG,
  currentFullWeightG,
  containerSizeMl,
  onSave,
  onCancel,
}: TareWeightEditModalProps) {
  const [activeTab, setActiveTab] = useState<WeightTab>("tare");
  const [tareValue, setTareValue] = useState(
    currentTareWeightG != null ? String(Math.round(currentTareWeightG)) : ""
  );
  const [fullValue, setFullValue] = useState(
    currentFullWeightG != null ? String(Math.round(currentFullWeightG)) : ""
  );
  const [liveWeight, setLiveWeight] = useState<number | null>(null);
  const scaleConnected = scaleManager.isConnected;

  useEffect(() => {
    if (!scaleConnected) return;
    const unsubscribe = scaleManager.onReading((reading: ScaleReading) => {
      if (reading.stable) {
        setLiveWeight(reading.weightGrams);
      }
    });
    return unsubscribe;
  }, [scaleConnected]);

  function handleReadAsEmpty() {
    if (liveWeight == null) return;
    setTareValue(String(Math.round(liveWeight)));
    setActiveTab("tare");
  }

  function handleReadAsFull() {
    if (liveWeight == null) return;
    setFullValue(String(Math.round(liveWeight)));
    setActiveTab("full");
  }

  const tareG = parseInt(tareValue) || 0;
  const fullG = parseInt(fullValue) || 0;

  // Auto-calculate the counterpart
  const autoFullG = tareG > 0 ? tareG + containerSizeMl * DEFAULT_DENSITY : 0;
  const autoTareG = fullG > 0 && containerSizeMl > 0 ? fullG - containerSizeMl * DEFAULT_DENSITY : 0;

  const effectiveTareG = tareG > 0 ? tareG : Math.max(0, Math.round(autoTareG));
  const effectiveFullG = fullG > 0 ? fullG : Math.round(autoFullG);

  function handleSave() {
    if (effectiveTareG <= 0 && effectiveFullG <= 0) return;
    onSave(effectiveTareG, effectiveFullG);
  }

  const canSave = effectiveTareG > 0 || effectiveFullG > 0;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title} numberOfLines={1}>
            {itemName}
          </Text>

          {/* Tab toggle */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, activeTab === "tare" && styles.tabActive]}
              onPress={() => setActiveTab("tare")}
            >
              <Text
                style={[styles.tabText, activeTab === "tare" && styles.tabTextActive]}
              >
                Tare Weight
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === "full" && styles.tabActive]}
              onPress={() => setActiveTab("full")}
            >
              <Text
                style={[styles.tabText, activeTab === "full" && styles.tabTextActive]}
              >
                Full Weight
              </Text>
            </TouchableOpacity>
          </View>

          {/* Weight display */}
          <View style={styles.displayArea}>
            {activeTab === "tare" ? (
              <>
                <Text style={styles.weightValue}>
                  {tareG > 0 ? tareG : "0"} g
                </Text>
                {tareG > 0 && (
                  <Text style={styles.autoCalc}>
                    Full bottle: ~{Math.round(autoFullG)} g (auto)
                  </Text>
                )}
              </>
            ) : (
              <>
                <Text style={styles.weightValue}>
                  {fullG > 0 ? fullG : "0"} g
                </Text>
                {fullG > 0 && autoTareG > 0 && (
                  <Text style={styles.autoCalc}>
                    Tare weight: ~{Math.round(autoTareG)} g (auto)
                  </Text>
                )}
              </>
            )}
            <Text style={styles.containerInfo}>
              Container: {containerSizeMl} ml
            </Text>
          </View>

          {/* Read from Scale */}
          {scaleConnected && (
            <View>
              {liveWeight != null && (
                <Text style={styles.scaleReading}>
                  Scale: {liveWeight.toFixed(1)} g
                </Text>
              )}
              <View style={styles.scaleButtonRow}>
                <TouchableOpacity
                  style={[styles.scaleBtn, styles.scaleBtnEmpty, liveWeight == null && styles.scaleBtnDisabled]}
                  onPress={handleReadAsEmpty}
                  disabled={liveWeight == null}
                >
                  <Text style={styles.scaleBtnText}>Weigh Empty Bottle</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.scaleBtn, styles.scaleBtnFull, liveWeight == null && styles.scaleBtnDisabled]}
                  onPress={handleReadAsFull}
                  disabled={liveWeight == null}
                >
                  <Text style={styles.scaleBtnText}>Weigh Full Bottle</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Keypad */}
          <NumericKeypad
            value={activeTab === "tare" ? tareValue : fullValue}
            onChange={activeTab === "tare" ? setTareValue : setFullValue}
            maxLength={5}
          />

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!canSave}
            >
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 34,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1a1a1a",
    marginBottom: 12,
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    padding: 3,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#666",
  },
  tabTextActive: {
    color: "#1a1a1a",
    fontWeight: "600",
  },
  displayArea: {
    alignItems: "center",
    marginBottom: 16,
    paddingVertical: 8,
  },
  weightValue: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#1a1a1a",
  },
  weightGrams: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },
  autoCalc: {
    fontSize: 13,
    color: "#2563eb",
    marginTop: 6,
  },
  containerInfo: {
    fontSize: 12,
    color: "#999",
    marginTop: 4,
  },
  scaleReading: {
    fontSize: 16,
    fontWeight: "600",
    color: "#16a34a",
    textAlign: "center",
    marginBottom: 10,
  },
  scaleButtonRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  scaleBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  scaleBtnEmpty: {
    backgroundColor: "#2563eb",
  },
  scaleBtnFull: {
    backgroundColor: "#16a34a",
  },
  scaleBtnDisabled: {
    opacity: 0.4,
  },
  scaleBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  saveBtn: {
    flex: 1,
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  cancelBtnText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "500",
  },
});
