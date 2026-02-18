import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";
import { NumericKeypad } from "@/components/NumericKeypad";
import { ItemSearchBar } from "@/components/ItemSearchBar";

interface SelectedItem {
  id: string;
  name: string;
  type: string;
  barcode: string | null;
  packSize: unknown;
  containerSize: unknown;
  baseUom: string;
}

type CountType = "individual" | "full_pack";

export default function PackagedCountScreen() {
  const { id: sessionId } = useLocalSearchParams<{ id: string }>();
  const { selectedLocationId } = useAuth();
  const utils = trpc.useUtils();

  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [countType, setCountType] = useState<CountType>("individual");
  const [quantity, setQuantity] = useState("");
  const [submittedCount, setSubmittedCount] = useState(0);

  const addLineMutation = trpc.sessions.addLine.useMutation({
    onSuccess() {
      setSubmittedCount((c) => c + 1);
      setSelectedItem(null);
      setCountType("individual");
      setQuantity("");
      utils.sessions.getById.invalidate({ id: sessionId! });
    },
    onError(error: { message: string }) {
      Alert.alert("Error", error.message);
    },
  });

  const packSize = selectedItem?.packSize ? Number(selectedItem.packSize) : null;
  const multiplier = countType === "full_pack" && packSize ? packSize : 1;
  const countUnits = quantity ? parseInt(quantity, 10) * multiplier : 0;

  function handleSubmit() {
    if (!selectedItem || !quantity || countUnits <= 0) return;
    addLineMutation.mutate({
      sessionId: sessionId!,
      inventoryItemId: selectedItem.id,
      countUnits,
      isManual: false,
    });
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>Packaged Count</Text>

        <ItemSearchBar
          locationId={selectedLocationId!}
          onItemSelected={(item) => {
            setSelectedItem(item);
            setCountType("individual");
            setQuantity("");
          }}
          onBarcodeNotFound={() => {
            Alert.alert(
              "Item Not Recognized",
              "Set this item aside — the barcode hasn't been registered yet."
            );
          }}
          itemTypeFilter={undefined}
          placeholder="Search packaged items or scan..."
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
              {packSize && (
                <Text style={styles.itemMeta}>
                  Pack of {packSize}
                </Text>
              )}
              {selectedItem.barcode && (
                <Text style={styles.itemMeta}>
                  Barcode: {selectedItem.barcode}
                </Text>
              )}
            </View>

            {/* Count Type Radio */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Count Type</Text>
              <View style={styles.radioGroup}>
                <TouchableOpacity
                  style={[
                    styles.radioBtn,
                    countType === "individual" && styles.radioBtnActive,
                  ]}
                  onPress={() => setCountType("individual")}
                >
                  <Text
                    style={[
                      styles.radioText,
                      countType === "individual" && styles.radioTextActive,
                    ]}
                  >
                    Individual Units
                  </Text>
                </TouchableOpacity>
                {packSize && (
                  <TouchableOpacity
                    style={[
                      styles.radioBtn,
                      countType === "full_pack" && styles.radioBtnActive,
                    ]}
                    onPress={() => setCountType("full_pack")}
                  >
                    <Text
                      style={[
                        styles.radioText,
                        countType === "full_pack" && styles.radioTextActive,
                      ]}
                    >
                      Full Pack — Pack of {packSize}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Quantity Display */}
            <View style={styles.quantityDisplay}>
              <Text style={styles.quantityValue}>
                {quantity || "0"}
              </Text>
              <Text style={styles.quantityLabel}>
                {countType === "full_pack" && packSize
                  ? `× ${packSize} = ${countUnits} units`
                  : "units"}
              </Text>
            </View>

            {/* Submit Button (above keypad) */}
            <TouchableOpacity
              style={[
                styles.submitBtn,
                (!quantity || addLineMutation.isPending) && styles.submitBtnDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!quantity || addLineMutation.isPending}
            >
              <Text style={styles.submitBtnText}>
                {addLineMutation.isPending ? "Submitting..." : `Submit — ${countUnits} units`}
              </Text>
            </TouchableOpacity>

            {/* Numeric Keypad */}
            <NumericKeypad value={quantity} onChange={setQuantity} />
          </>
        )}
      </ScrollView>

      {/* Running Tally */}
      {submittedCount > 0 && (
        <View style={styles.tally}>
          <Text style={styles.tallyText}>
            {submittedCount} item{submittedCount !== 1 ? "s" : ""} counted this session
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
  section: {
    marginTop: 20,
  },
  sectionLabel: {
    color: "#8899AA",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  radioGroup: {
    gap: 8,
  },
  radioBtn: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 14,
    borderWidth: 2,
    borderColor: "#16283F",
  },
  radioBtnActive: {
    borderColor: "#E9B44C",
  },
  radioText: {
    color: "#8899AA",
    fontSize: 15,
    fontWeight: "500",
  },
  radioTextActive: {
    color: "#EAF0FF",
  },
  quantityDisplay: {
    alignItems: "center",
    marginVertical: 20,
  },
  quantityValue: {
    fontSize: 56,
    fontWeight: "bold",
    color: "#EAF0FF",
  },
  quantityLabel: {
    color: "#5A6A7A",
    fontSize: 14,
    marginTop: 4,
  },
  submitBtn: {
    backgroundColor: "#E9B44C",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
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
