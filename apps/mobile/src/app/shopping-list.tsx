import { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Share,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";

interface Vendor {
  id: string;
  name: string;
}

export default function ShoppingListScreen() {
  const { selectedLocationId } = useAuth();

  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [showVendorPicker, setShowVendorPicker] = useState(false);
  const [vendorSearch, setVendorSearch] = useState("");
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);
  const [pickedUpQtys, setPickedUpQtys] = useState<Map<string, string>>(new Map());

  const utils = trpc.useUtils();

  // Fetch reorder suggestions to get vendors with items needing reorder
  const { data: suggestions, isLoading: suggestionsLoading } =
    trpc.parLevels.suggestions.useQuery(
      { locationId: selectedLocationId! },
      { enabled: !!selectedLocationId }
    );

  // Fetch existing open POs for selected vendor
  const { data: existingPOs } = trpc.purchaseOrders.list.useQuery(
    {
      locationId: selectedLocationId!,
      vendorId: selectedVendor?.id,
      status: "open",
    },
    { enabled: !!selectedLocationId && !!selectedVendor }
  );

  // Also check partially fulfilled
  const { data: partialPOs } = trpc.purchaseOrders.list.useQuery(
    {
      locationId: selectedLocationId!,
      vendorId: selectedVendor?.id,
      status: "partially_fulfilled",
    },
    { enabled: !!selectedLocationId && !!selectedVendor }
  );

  // Get selected PO details
  const { data: selectedPO, isLoading: poLoading } =
    trpc.purchaseOrders.getById.useQuery(
      { id: selectedPoId! },
      { enabled: !!selectedPoId }
    );

  const createPO = trpc.purchaseOrders.create.useMutation({
    onSuccess(data) {
      setSelectedPoId(data.id);
      utils.purchaseOrders.list.invalidate();
    },
    onError(error) {
      Alert.alert("Error", error.message);
    },
  });

  const recordPickup = trpc.purchaseOrders.recordPickup.useMutation({
    onSuccess(data) {
      Alert.alert(
        "Pickup Recorded",
        `${data.count} item(s) received into inventory.`
      );
      setPickedUpQtys(new Map());
      utils.purchaseOrders.getById.invalidate();
      utils.purchaseOrders.list.invalidate();
      utils.parLevels.suggestions.invalidate();
    },
    onError(error) {
      Alert.alert("Error", error.message);
    },
  });

  const textOrderQuery = trpc.purchaseOrders.textOrder.useQuery(
    { id: selectedPoId! },
    { enabled: !!selectedPoId }
  );

  // Vendors that have items needing reorder
  const vendorsWithReorders = useMemo(() => {
    if (!suggestions) return [];
    return suggestions.map((s: any) => ({
      id: s.vendorId,
      name: s.vendorName,
      itemCount: s.itemCount,
    }));
  }, [suggestions]);

  const filteredVendors = useMemo(() => {
    if (!vendorSearch) return vendorsWithReorders;
    const q = vendorSearch.toLowerCase();
    return vendorsWithReorders.filter((v: any) =>
      v.name.toLowerCase().includes(q)
    );
  }, [vendorsWithReorders, vendorSearch]);

  // Combine open + partial POs
  const openPOs = useMemo(() => {
    return [...(existingPOs ?? []), ...(partialPOs ?? [])];
  }, [existingPOs, partialPOs]);

  function handleSelectVendor(vendor: Vendor) {
    setSelectedVendor(vendor);
    setShowVendorPicker(false);
    setSelectedPoId(null);
    setPickedUpQtys(new Map());
  }

  function handleCreateOrder() {
    if (!selectedLocationId || !selectedVendor) return;

    const vendorSuggestion = suggestions?.find(
      (s: any) => s.vendorId === selectedVendor.id
    );
    if (!vendorSuggestion) return;

    createPO.mutate({
      locationId: selectedLocationId,
      vendorId: selectedVendor.id,
      lines: vendorSuggestion.items.map((item: any) => ({
        inventoryItemId: item.inventoryItemId,
        orderedQty: item.orderQty,
        orderedUom: item.parUom ?? "unit",
      })),
    });
  }

  function handleRecordPickup() {
    if (!selectedPoId || !selectedPO) return;

    const lines = selectedPO.lines
      .map((line: any) => {
        const qtyStr = pickedUpQtys.get(line.id);
        const qty = qtyStr ? Number(qtyStr) : 0;
        return { lineId: line.id, pickedUpQty: qty };
      })
      .filter((l: any) => l.pickedUpQty > 0);

    if (lines.length === 0) {
      Alert.alert("No Items", "Enter quantities for items you picked up.");
      return;
    }

    recordPickup.mutate({
      purchaseOrderId: selectedPoId,
      lines,
    });
  }

  async function handleShareOrder() {
    if (!textOrderQuery.data) return;
    try {
      await Share.share({ message: textOrderQuery.data });
    } catch {
      // user cancelled
    }
  }

  if (!selectedLocationId) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No location selected.</Text>
      </View>
    );
  }

  // Step 1: No vendor selected — show vendor picker
  if (!selectedVendor) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Select Vendor</Text>

        {suggestionsLoading ? (
          <ActivityIndicator color="#E9B44C" style={{ marginTop: 40 }} />
        ) : vendorsWithReorders.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              No items need reordering right now.
            </Text>
            <Text style={styles.emptySubtext}>
              Items appear here when on-hand drops at or below min level.
            </Text>
          </View>
        ) : (
          <FlatList
            data={vendorsWithReorders}
            keyExtractor={(v: any) => v.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.vendorCard}
                onPress={() => handleSelectVendor(item)}
              >
                <Text style={styles.vendorName}>{item.name}</Text>
                <Text style={styles.vendorMeta}>
                  {item.itemCount} item{item.itemCount !== 1 ? "s" : ""} to
                  order
                </Text>
              </TouchableOpacity>
            )}
            contentContainerStyle={{ paddingBottom: 20 }}
          />
        )}
      </View>
    );
  }

  // Step 2: Vendor selected but no PO — show existing POs or create
  if (!selectedPoId) {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            setSelectedVendor(null);
            setSelectedPoId(null);
          }}
        >
          <Text style={styles.backText}>Change Vendor</Text>
        </TouchableOpacity>

        <Text style={styles.vendorHeader}>{selectedVendor.name}</Text>

        {openPOs.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Open Orders</Text>
            {openPOs.map((po: any) => (
              <TouchableOpacity
                key={po.id}
                style={styles.poCard}
                onPress={() => {
                  setSelectedPoId(po.id);
                  setPickedUpQtys(new Map());
                }}
              >
                <Text style={styles.poTitle}>
                  {po.status === "partially_fulfilled"
                    ? "Partially Fulfilled"
                    : "Open Order"}
                </Text>
                <Text style={styles.poMeta}>
                  {po.lines.length} line(s) — Created{" "}
                  {new Date(po.createdAt).toLocaleDateString()}
                </Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        <TouchableOpacity
          style={[styles.createButton, createPO.isPending && styles.disabled]}
          onPress={handleCreateOrder}
          disabled={createPO.isPending}
        >
          {createPO.isPending ? (
            <ActivityIndicator color="#0B1623" />
          ) : (
            <Text style={styles.createButtonText}>Create New Order</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  // Step 3: PO selected — show shopping list
  if (poLoading || !selectedPO) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#E9B44C" style={{ marginTop: 40 }} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={100}
    >
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => {
          setSelectedPoId(null);
          setPickedUpQtys(new Map());
        }}
      >
        <Text style={styles.backText}>Back to Orders</Text>
      </TouchableOpacity>

      <View style={styles.poHeaderRow}>
        <View>
          <Text style={styles.vendorHeader}>{selectedPO.vendor.name}</Text>
          <Text style={styles.poStatus}>
            Status:{" "}
            {selectedPO.status === "partially_fulfilled"
              ? "Partially Fulfilled"
              : selectedPO.status === "closed"
              ? "Closed"
              : "Open"}
          </Text>
        </View>
      </View>

      <FlatList
        data={selectedPO.lines}
        keyExtractor={(line: any) => line.id}
        renderItem={({ item: line }) => {
          const ordered = Number(line.orderedQty);
          const alreadyPicked = Number(line.pickedUpQty);
          const remaining = Math.max(0, ordered - alreadyPicked);
          const packSize = line.inventoryItem.packSize
            ? Number(line.inventoryItem.packSize)
            : null;
          const uomLabel =
            line.orderedUom === "package" && packSize
              ? `cs (${packSize}/cs)`
              : "units";

          return (
            <View style={styles.lineCard}>
              <View style={styles.lineInfo}>
                <Text style={styles.lineName}>
                  {line.inventoryItem.name}
                </Text>
                {line.inventoryItem.vendorSku && (
                  <Text style={styles.lineSku}>
                    SKU: {line.inventoryItem.vendorSku}
                  </Text>
                )}
                <Text style={styles.lineQty}>
                  Order: {ordered} {uomLabel}
                  {alreadyPicked > 0 && (
                    <Text style={styles.linePickedUp}>
                      {" "}
                      (got {alreadyPicked}, need {remaining})
                    </Text>
                  )}
                </Text>
              </View>
              {remaining > 0 && (
                <View style={styles.gotField}>
                  <Text style={styles.gotLabel}>Got</Text>
                  <TextInput
                    style={styles.gotInput}
                    keyboardType="numeric"
                    value={pickedUpQtys.get(line.id) ?? ""}
                    onChangeText={(text) => {
                      const next = new Map(pickedUpQtys);
                      next.set(line.id, text);
                      setPickedUpQtys(next);
                    }}
                    placeholder={String(remaining)}
                    placeholderTextColor="#5A6A7A"
                  />
                </View>
              )}
              {remaining === 0 && (
                <View style={styles.fulfilledBadge}>
                  <Text style={styles.fulfilledText}>Done</Text>
                </View>
              )}
            </View>
          );
        }}
        contentContainerStyle={{ paddingBottom: 120 }}
      />

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.pickupButton,
            recordPickup.isPending && styles.disabled,
          ]}
          onPress={handleRecordPickup}
          disabled={recordPickup.isPending}
        >
          {recordPickup.isPending ? (
            <ActivityIndicator color="#0B1623" />
          ) : (
            <Text style={styles.pickupButtonText}>Record Pickup</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.shareButton}
          onPress={handleShareOrder}
        >
          <Text style={styles.shareButtonText}>Share Order</Text>
        </TouchableOpacity>
      </View>

      {/* Vendor Picker Modal */}
      <Modal
        visible={showVendorPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowVendorPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Vendor</Text>
            <TextInput
              style={styles.searchInput}
              value={vendorSearch}
              onChangeText={setVendorSearch}
              placeholder="Search vendors..."
              placeholderTextColor="#5A6A7A"
            />
            <FlatList
              data={filteredVendors}
              keyExtractor={(v: any) => v.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => handleSelectVendor(item)}
                >
                  <Text style={styles.modalItemText}>{item.name}</Text>
                </TouchableOpacity>
              )}
              style={{ maxHeight: 300 }}
            />
            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setShowVendorPicker(false)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623", padding: 16 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#8899AA",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 16,
  },
  vendorHeader: {
    fontSize: 20,
    fontWeight: "700",
    color: "#EAF0FF",
    marginBottom: 4,
  },
  backButton: { marginBottom: 12 },
  backText: { fontSize: 14, fontWeight: "600", color: "#42A5F5" },

  // Vendor list
  vendorCard: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  vendorName: { fontSize: 16, fontWeight: "600", color: "#EAF0FF" },
  vendorMeta: { fontSize: 13, color: "#8899AA", marginTop: 4 },

  // PO cards
  poCard: {
    backgroundColor: "#152238",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E9B44C",
  },
  poTitle: { fontSize: 15, fontWeight: "600", color: "#EAF0FF" },
  poMeta: { fontSize: 12, color: "#8899AA", marginTop: 2 },
  poStatus: { fontSize: 13, color: "#8899AA", marginBottom: 8 },
  poHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },

  // Create button
  createButton: {
    backgroundColor: "#E9B44C",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 16,
  },
  createButtonText: { color: "#0B1623", fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.6 },

  // Line items
  lineCard: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  lineInfo: { flex: 1 },
  lineName: { fontSize: 15, fontWeight: "600", color: "#EAF0FF" },
  lineSku: { fontSize: 12, color: "#8899AA", marginTop: 2 },
  lineQty: { fontSize: 13, color: "#6B7FA0", marginTop: 4 },
  linePickedUp: { color: "#4CAF50" },
  gotField: { alignItems: "center", marginLeft: 12 },
  gotLabel: { fontSize: 11, color: "#8899AA", marginBottom: 4 },
  gotInput: {
    width: 60,
    backgroundColor: "#0B1623",
    borderWidth: 1,
    borderColor: "#1E3550",
    borderRadius: 6,
    padding: 8,
    textAlign: "center",
    color: "#EAF0FF",
    fontSize: 16,
    fontWeight: "600",
  },
  fulfilledBadge: {
    backgroundColor: "#4CAF50",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 12,
  },
  fulfilledText: { color: "#fff", fontSize: 12, fontWeight: "600" },

  // Footer
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#0B1623",
    borderTopWidth: 1,
    borderTopColor: "#1E3550",
    padding: 16,
    flexDirection: "row",
    gap: 10,
  },
  pickupButton: {
    flex: 1,
    backgroundColor: "#4CAF50",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
  },
  pickupButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  shareButton: {
    flex: 1,
    backgroundColor: "#16283F",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#42A5F5",
  },
  shareButtonText: { color: "#42A5F5", fontSize: 16, fontWeight: "700" },

  // Empty state
  emptyCard: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 24,
    alignItems: "center",
    marginTop: 20,
  },
  emptyText: { fontSize: 15, color: "#8899AA", textAlign: "center" },
  emptySubtext: {
    fontSize: 13,
    color: "#5A6A7A",
    textAlign: "center",
    marginTop: 8,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: "#16283F",
    borderRadius: 12,
    padding: 20,
    maxHeight: "70%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#EAF0FF",
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: "#0B1623",
    borderRadius: 8,
    padding: 12,
    color: "#EAF0FF",
    fontSize: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  modalItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3550",
  },
  modalItemText: { fontSize: 16, color: "#EAF0FF" },
  modalCancel: { marginTop: 12, alignItems: "center", paddingVertical: 12 },
  modalCancelText: { fontSize: 16, color: "#dc2626", fontWeight: "600" },
});
