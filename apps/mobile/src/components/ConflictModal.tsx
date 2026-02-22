import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

export interface ConflictData {
  lineId: string;
  myValues: { countUnits?: number; grossWeightGrams?: number; percentRemaining?: number };
  theirValues: { countUnits: number | null; grossWeightGrams: number | null; percentRemaining: number | null };
  theirName: string;
  currentUpdatedAt: string;
}

function formatValue(values: { countUnits?: number | null; grossWeightGrams?: number | null; percentRemaining?: number | null }): string {
  if (values.countUnits != null) return `${values.countUnits} units`;
  if (values.grossWeightGrams != null) return `${values.grossWeightGrams}g`;
  if (values.percentRemaining != null) return `${values.percentRemaining}%`;
  return "\u2014";
}

export function ConflictModal({
  conflict,
  onKeepMine,
  onKeepTheirs,
  onCancel,
}: {
  conflict: ConflictData;
  onKeepMine: () => void;
  onKeepTheirs: () => void;
  onCancel: () => void;
}) {
  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.title}>Conflict Detected</Text>
        <Text style={styles.subtitle}>
          {conflict.theirName} also updated this item.
        </Text>

        <View style={styles.comparison}>
          <View style={styles.side}>
            <Text style={styles.sideLabel}>Your Count</Text>
            <Text style={styles.sideValue}>{formatValue(conflict.myValues)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.side}>
            <Text style={styles.sideLabel}>{conflict.theirName}'s Count</Text>
            <Text style={styles.sideValue}>{formatValue(conflict.theirValues)}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.keepMineBtn} onPress={onKeepMine} activeOpacity={0.7}>
          <Text style={styles.keepMineBtnText}>Keep Mine</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.keepTheirsBtn} onPress={onKeepTheirs} activeOpacity={0.7}>
          <Text style={styles.keepTheirsBtnText}>Keep Theirs</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onCancel} activeOpacity={0.7}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2000,
    padding: 24,
  },
  card: {
    backgroundColor: "#16283F",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 360,
    borderWidth: 1,
    borderColor: "#E9B44C",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#EAF0FF",
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: "#8899AA",
    textAlign: "center",
    marginBottom: 20,
  },
  comparison: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  side: {
    flex: 1,
    alignItems: "center",
  },
  sideLabel: {
    fontSize: 11,
    color: "#8899AA",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sideValue: {
    fontSize: 22,
    fontWeight: "700",
    color: "#EAF0FF",
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: "#1E3550",
    marginHorizontal: 12,
  },
  keepMineBtn: {
    backgroundColor: "#E9B44C",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  keepMineBtnText: {
    color: "#0B1623",
    fontSize: 16,
    fontWeight: "700",
  },
  keepTheirsBtn: {
    borderWidth: 1,
    borderColor: "#5A6A7A",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  keepTheirsBtnText: {
    color: "#EAF0FF",
    fontSize: 16,
    fontWeight: "600",
  },
  cancelText: {
    color: "#5A6A7A",
    fontSize: 14,
    textAlign: "center",
  },
});
