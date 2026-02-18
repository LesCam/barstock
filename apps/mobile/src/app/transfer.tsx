import { useState, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";
import { NumericKeypad } from "@/components/NumericKeypad";
import { ItemSearchBar } from "@/components/ItemSearchBar";

interface BarArea {
  id: string;
  name: string;
  subAreas: { id: string; name: string; sortOrder: number }[];
}

interface SelectedItem {
  id: string;
  name: string;
  type: string;
  barcode: string | null;
  packSize: unknown;
  containerSize: unknown;
  baseUom: string;
}

export default function TransferScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId?: string; locationId?: string }>();
  const { selectedLocationId } = useAuth();

  const [fromSubAreaId, setFromSubAreaId] = useState<string | null>(null);
  const [toSubAreaId, setToSubAreaId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [quantity, setQuantity] = useState("");

  const { data: areas } = trpc.areas.listBarAreas.useQuery(
    { locationId: selectedLocationId! },
    { enabled: !!selectedLocationId }
  );

  const transferMutation = trpc.transfers.create.useMutation({
    onSuccess() {
      Alert.alert("Transfer Complete", "Items have been transferred.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    },
    onError(error: { message: string }) {
      Alert.alert("Error", error.message);
    },
  });

  // Build flat list of sub-areas with parent area name for display
  const subAreaOptions = useMemo(() => {
    if (!areas) return [];
    return (areas as BarArea[]).flatMap((area) =>
      area.subAreas.map((sa) => ({
        id: sa.id,
        label: `${area.name} — ${sa.name}`,
        barAreaId: area.id,
      }))
    );
  }, [areas]);

  const fromLabel = subAreaOptions.find((o) => o.id === fromSubAreaId)?.label ?? "Select";
  const toLabel = subAreaOptions.find((o) => o.id === toSubAreaId)?.label ?? "Select";

  function handleSubmit() {
    if (!fromSubAreaId || !toSubAreaId || !selectedItem || !quantity) return;
    if (fromSubAreaId === toSubAreaId) {
      Alert.alert("Same Area", "Source and destination must be different.");
      return;
    }
    transferMutation.mutate({
      locationId: selectedLocationId!,
      inventoryItemId: selectedItem.id,
      fromSubAreaId,
      toSubAreaId,
      quantity: parseInt(quantity, 10),
    });
  }

  const canSubmit =
    !!fromSubAreaId &&
    !!toSubAreaId &&
    fromSubAreaId !== toSubAreaId &&
    !!selectedItem &&
    !!quantity &&
    parseInt(quantity, 10) > 0;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>Transfer Items</Text>

        {/* From Area */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>From Area</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {subAreaOptions.map((sa) => (
              <TouchableOpacity
                key={sa.id}
                style={[
                  styles.areaPill,
                  fromSubAreaId === sa.id && styles.areaPillActive,
                ]}
                onPress={() => setFromSubAreaId(sa.id)}
              >
                <Text
                  style={[
                    styles.areaPillText,
                    fromSubAreaId === sa.id && styles.areaPillTextActive,
                  ]}
                >
                  {sa.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* To Area */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>To Area</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {subAreaOptions
              .filter((sa) => sa.id !== fromSubAreaId)
              .map((sa) => (
                <TouchableOpacity
                  key={sa.id}
                  style={[
                    styles.areaPill,
                    toSubAreaId === sa.id && styles.areaPillActive,
                  ]}
                  onPress={() => setToSubAreaId(sa.id)}
                >
                  <Text
                    style={[
                      styles.areaPillText,
                      toSubAreaId === sa.id && styles.areaPillTextActive,
                    ]}
                  >
                    {sa.label}
                  </Text>
                </TouchableOpacity>
              ))}
          </ScrollView>
        </View>

        {/* Transfer summary banner */}
        {fromSubAreaId && toSubAreaId && fromSubAreaId !== toSubAreaId && (
          <View style={styles.transferBanner}>
            <Text style={styles.transferBannerText}>
              {fromLabel} → {toLabel}
            </Text>
          </View>
        )}

        {/* Item Search */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Item</Text>
          <ItemSearchBar
            locationId={selectedLocationId!}
            onItemSelected={(item) => {
              setSelectedItem(item);
              setQuantity("");
            }}
            placeholder="Search item to transfer..."
          />
        </View>

        {selectedItem && (
          <>
            <View style={styles.itemCard}>
              <Text style={styles.itemName}>{selectedItem.name}</Text>
              <Text style={styles.itemType}>
                {selectedItem.type.replace("_", " ")}
              </Text>
            </View>

            {/* Quantity */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Quantity</Text>
              <View style={styles.quantityDisplay}>
                <Text style={styles.quantityValue}>{quantity || "0"}</Text>
                <Text style={styles.quantityUnit}>{selectedItem.baseUom}</Text>
              </View>
              <NumericKeypad value={quantity} onChange={setQuantity} />
            </View>
          </>
        )}
      </ScrollView>

      {/* Submit */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.submitBtn,
            (!canSubmit || transferMutation.isPending) && styles.submitBtnDisabled,
          ]}
          onPress={handleSubmit}
          disabled={!canSubmit || transferMutation.isPending}
        >
          <Text style={styles.submitBtnText}>
            {transferMutation.isPending ? "Transferring..." : "Confirm Transfer"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 100 },
  heading: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#EAF0FF",
    marginBottom: 16,
  },
  section: { marginBottom: 20 },
  sectionLabel: {
    color: "#8899AA",
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  areaPill: {
    backgroundColor: "#16283F",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  areaPillActive: {
    backgroundColor: "#1E3550",
    borderColor: "#E9B44C",
  },
  areaPillText: { color: "#8899AA", fontSize: 13, fontWeight: "500" },
  areaPillTextActive: { color: "#E9B44C" },
  transferBanner: {
    backgroundColor: "#1E3550",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    marginBottom: 16,
  },
  transferBannerText: { color: "#2BA8A0", fontSize: 15, fontWeight: "600" },
  itemCard: {
    backgroundColor: "#16283F",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  itemName: { fontSize: 18, fontWeight: "600", color: "#EAF0FF" },
  itemType: {
    fontSize: 13,
    color: "#5A6A7A",
    textTransform: "capitalize",
    marginTop: 4,
  },
  quantityDisplay: { alignItems: "center", marginBottom: 16 },
  quantityValue: { fontSize: 48, fontWeight: "bold", color: "#EAF0FF" },
  quantityUnit: { color: "#5A6A7A", fontSize: 14, marginTop: 4 },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: "#0B1623",
    borderTopWidth: 1,
    borderTopColor: "#1E3550",
  },
  submitBtn: {
    backgroundColor: "#E9B44C",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: "#0B1623", fontSize: 17, fontWeight: "700" },
});
