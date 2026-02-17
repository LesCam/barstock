import { useState, useCallback, useMemo } from "react";
import { View, Text, TouchableOpacity, ScrollView, Switch, StyleSheet, Alert } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";
import { NumericKeypad } from "@/components/NumericKeypad";
import { ItemSearchBar } from "@/components/ItemSearchBar";
import { ScaleConnector } from "@/components/ScaleConnector";
import type { ScaleReading } from "@/lib/scale/scale-manager";

interface SelectedItem {
  id: string;
  name: string;
  type: string;
  barcode: string | null;
  packSize: unknown;
  containerSize: unknown;
  baseUom: string;
}

export default function LiquorWeighScreen() {
  const { id: sessionId } = useLocalSearchParams<{ id: string }>();
  const { selectedLocationId } = useAuth();
  const utils = trpc.useUtils();

  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [useManual, setUseManual] = useState(false);
  const [manualWeight, setManualWeight] = useState("");
  const [scaleWeight, setScaleWeight] = useState<number | null>(null);
  const [submittedCount, setSubmittedCount] = useState(0);

  const { data: templates } = trpc.scale.listTemplates.useQuery(
    { locationId: selectedLocationId! },
    { enabled: !!selectedLocationId }
  );

  const matchedTemplate = useMemo(() => {
    if (!selectedItem || !templates) return null;
    return templates.find((t: any) => t.inventoryItemId === selectedItem.id) ?? null;
  }, [selectedItem, templates]);

  const grossWeightG = useManual
    ? (manualWeight ? parseInt(manualWeight, 10) : null)
    : scaleWeight;

  const calcQuery = trpc.scale.calculateLiquid.useQuery(
    { templateId: matchedTemplate?.id ?? "", grossWeightG: grossWeightG ?? 0 },
    { enabled: !!matchedTemplate && grossWeightG != null && grossWeightG > 0 }
  );

  const addLineMutation = trpc.sessions.addLine.useMutation();
  const recordMeasurementMutation = trpc.scale.recordMeasurement.useMutation();

  const handleWeightReading = useCallback((reading: ScaleReading) => {
    if (reading.stable) {
      setScaleWeight(reading.weightGrams);
    }
  }, []);

  async function handleSubmit() {
    if (!selectedItem || grossWeightG == null || grossWeightG <= 0) return;

    try {
      // Add session line
      await addLineMutation.mutateAsync({
        sessionId: sessionId!,
        inventoryItemId: selectedItem.id,
        grossWeightGrams: grossWeightG,
        isManual: useManual,
      });

      // Record measurement for tracking
      await recordMeasurementMutation.mutateAsync({
        locationId: selectedLocationId!,
        inventoryItemId: selectedItem.id,
        sessionId: sessionId!,
        grossWeightG,
        isManual: useManual,
        confidenceLevel: useManual ? "estimated" : "measured",
      });

      setSubmittedCount((c) => c + 1);
      setSelectedItem(null);
      setScaleWeight(null);
      setManualWeight("");
      setUseManual(false);
      utils.sessions.getById.invalidate({ id: sessionId! });
    } catch (error: any) {
      Alert.alert("Error", error.message ?? "Failed to submit.");
    }
  }

  async function handleManualCountSubmit() {
    // Fallback: just count units when no template exists
    if (!selectedItem || !manualWeight) return;
    try {
      await addLineMutation.mutateAsync({
        sessionId: sessionId!,
        inventoryItemId: selectedItem.id,
        countUnits: parseInt(manualWeight, 10),
        isManual: true,
      });
      setSubmittedCount((c) => c + 1);
      setSelectedItem(null);
      setManualWeight("");
      utils.sessions.getById.invalidate({ id: sessionId! });
    } catch (error: any) {
      Alert.alert("Error", error.message ?? "Failed to submit.");
    }
  }

  const isPending = addLineMutation.isPending || recordMeasurementMutation.isPending;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>Liquor Weigh</Text>

        <ItemSearchBar
          locationId={selectedLocationId!}
          onItemSelected={(item) => {
            setSelectedItem(item);
            setScaleWeight(null);
            setManualWeight("");
            setUseManual(false);
          }}
          itemTypeFilter={["liquor", "wine"]}
          placeholder="Search liquor/wine or scan..."
        />

        {selectedItem && (
          <>
            {/* Item Card */}
            <View style={styles.itemCard}>
              <View style={styles.itemCardHeader}>
                <Text style={styles.itemName}>{selectedItem.name}</Text>
                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>
                    {selectedItem.type.replace("_", " ")}
                  </Text>
                </View>
              </View>
              {selectedItem.containerSize != null && (
                <Text style={styles.itemMeta}>
                  Container: {String(Number(selectedItem.containerSize))}ml
                </Text>
              )}
            </View>

            {!matchedTemplate && (
              <>
                {/* No Template Warning */}
                <View style={styles.warningBox}>
                  <Text style={styles.warningTitle}>No Bottle Template</Text>
                  <Text style={styles.warningText}>
                    No bottle template exists for this item. You can submit a manual unit count instead.
                  </Text>
                </View>

                {/* Manual Count Fallback */}
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Unit Count</Text>
                  <View style={styles.quantityDisplay}>
                    <Text style={styles.quantityValue}>{manualWeight || "0"}</Text>
                    <Text style={styles.quantityLabel}>units</Text>
                  </View>
                  <NumericKeypad value={manualWeight} onChange={setManualWeight} />
                  <TouchableOpacity
                    style={[
                      styles.submitBtn,
                      (!manualWeight || isPending) && styles.submitBtnDisabled,
                    ]}
                    onPress={handleManualCountSubmit}
                    disabled={!manualWeight || isPending}
                  >
                    <Text style={styles.submitBtnText}>
                      {isPending ? "Submitting..." : "Submit Count"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {matchedTemplate && (
              <>
                {/* Mode Toggle */}
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Manual Weight Entry</Text>
                  <Switch
                    value={useManual}
                    onValueChange={setUseManual}
                    trackColor={{ false: "#1E3550", true: "#E9B44C" }}
                    thumbColor="#EAF0FF"
                  />
                </View>

                {/* Scale or Manual Input */}
                {!useManual ? (
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>Scale</Text>
                    <ScaleConnector onWeightReading={handleWeightReading} />
                    {scaleWeight != null && (
                      <View style={styles.weightResult}>
                        <Text style={styles.weightValue}>{scaleWeight.toFixed(1)}g</Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>Weight (grams)</Text>
                    <View style={styles.quantityDisplay}>
                      <Text style={styles.quantityValue}>{manualWeight || "0"}</Text>
                      <Text style={styles.quantityLabel}>grams</Text>
                    </View>
                    <NumericKeypad
                      value={manualWeight}
                      onChange={setManualWeight}
                      maxLength={5}
                    />
                  </View>
                )}

                {/* Calculation Result */}
                {calcQuery.data && (
                  <View style={styles.calcCard}>
                    <Text style={styles.calcTitle}>Liquid Remaining</Text>
                    <Text style={styles.calcValue}>
                      {calcQuery.data.liquidMl}ml ({calcQuery.data.liquidOz}oz)
                    </Text>
                    <Text style={styles.calcPercent}>
                      {calcQuery.data.percentRemaining}% remaining
                    </Text>
                  </View>
                )}

                {/* Submit */}
                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    (grossWeightG == null || grossWeightG <= 0 || isPending) &&
                      styles.submitBtnDisabled,
                  ]}
                  onPress={handleSubmit}
                  disabled={grossWeightG == null || grossWeightG <= 0 || isPending}
                >
                  <Text style={styles.submitBtnText}>
                    {isPending
                      ? "Submitting..."
                      : `Submit — ${grossWeightG ?? 0}g`}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Running Tally */}
      {submittedCount > 0 && (
        <View style={styles.tally}>
          <Text style={styles.tallyText}>
            {submittedCount} bottle{submittedCount !== 1 ? "s" : ""} weighed this session
          </Text>
        </View>
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
    padding: 16,
    paddingBottom: 80,
  },
  heading: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#EAF0FF",
    marginBottom: 16,
  },
  itemCard: {
    backgroundColor: "#16283F",
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  itemCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#EAF0FF",
    flex: 1,
  },
  typeBadge: {
    backgroundColor: "#1E3550",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  typeBadgeText: {
    color: "#8899AA",
    fontSize: 11,
    textTransform: "capitalize",
  },
  itemMeta: {
    color: "#5A6A7A",
    fontSize: 13,
    marginTop: 4,
  },
  warningBox: {
    backgroundColor: "#3B2A1A",
    borderRadius: 10,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#6B4C2A",
  },
  warningTitle: {
    color: "#E9B44C",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  warningText: {
    color: "#AA9070",
    fontSize: 13,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 14,
  },
  toggleLabel: {
    color: "#EAF0FF",
    fontSize: 15,
    fontWeight: "500",
  },
  section: {
    marginTop: 20,
  },
  sectionLabel: {
    color: "#8899AA",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  weightResult: {
    alignItems: "center",
    marginTop: 12,
    padding: 12,
    backgroundColor: "#16283F",
    borderRadius: 10,
  },
  weightValue: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#E9B44C",
  },
  quantityDisplay: {
    alignItems: "center",
    marginBottom: 16,
  },
  quantityValue: {
    fontSize: 48,
    fontWeight: "bold",
    color: "#EAF0FF",
  },
  quantityLabel: {
    color: "#5A6A7A",
    fontSize: 14,
    marginTop: 4,
  },
  calcCard: {
    backgroundColor: "#16283F",
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    alignItems: "center",
  },
  calcTitle: {
    color: "#8899AA",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  calcValue: {
    color: "#EAF0FF",
    fontSize: 24,
    fontWeight: "bold",
    marginTop: 6,
  },
  calcPercent: {
    color: "#E9B44C",
    fontSize: 16,
    fontWeight: "600",
    marginTop: 4,
  },
  submitBtn: {
    backgroundColor: "#E9B44C",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 20,
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    color: "#0B1623",
    fontSize: 17,
    fontWeight: "700",
  },
  tally: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#16283F",
    padding: 14,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#1E3550",
  },
  tallyText: {
    color: "#E9B44C",
    fontSize: 14,
    fontWeight: "600",
  },
});
