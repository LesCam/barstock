import { View, Text, TouchableOpacity, Modal, StyleSheet } from "react-native";
import { VarianceReason } from "@barstock/types";

interface VarianceReasonModalProps {
  visible: boolean;
  itemName: string;
  variance: number;
  onSelect: (reason: VarianceReason, notes?: string) => void;
  onCancel: () => void;
}

const reasons: Array<{ value: VarianceReason; label: string }> = [
  { value: "waste_foam", label: "Waste / Foam" },
  { value: "comp", label: "Comp" },
  { value: "staff_drink", label: "Staff Drink" },
  { value: "theft", label: "Theft / Suspected" },
  { value: "breakage", label: "Breakage" },
  { value: "line_cleaning", label: "Line Cleaning" },
  { value: "transfer", label: "Transfer" },
  { value: "unknown", label: "Unknown" },
];

export function VarianceReasonModal({
  visible,
  itemName,
  variance,
  onSelect,
  onCancel,
}: VarianceReasonModalProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Variance Reason Required</Text>
          <Text style={styles.subtitle}>
            {itemName}: {variance > 0 ? "+" : ""}
            {variance.toFixed(1)} units
          </Text>

          {reasons.map((r) => (
            <TouchableOpacity
              key={r.value}
              style={styles.option}
              onPress={() => onSelect(r.value)}
            >
              <Text style={styles.optionText}>{r.label}</Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#666", marginBottom: 16 },
  option: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  optionText: { fontSize: 16 },
  cancelBtn: { paddingVertical: 14, alignItems: "center", marginTop: 8 },
  cancelText: { fontSize: 16, color: "#dc2626", fontWeight: "500" },
});
