import { useState, useMemo, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
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

interface Vendor {
  id: string;
  name: string;
}

export default function ReceiveStockScreen() {
  const { selectedLocationId, user } = useAuth();
  const businessId = user?.businessId;

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [countType, setCountType] = useState<"individual" | "pack">("individual");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [vendorSearch, setVendorSearch] = useState("");
  const [showVendorPicker, setShowVendorPicker] = useState(false);
  const [showNewVendor, setShowNewVendor] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [newVendorEmail, setNewVendorEmail] = useState("");
  const [newVendorPhone, setNewVendorPhone] = useState("");
  const [showReview, setShowReview] = useState(false);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editingQty, setEditingQty] = useState("");
  const sessionCreating = useRef(false);

  const utils = trpc.useUtils();

  // Create a receiving session on mount
  const createSession = trpc.sessions.create.useMutation();
  const closeSession = trpc.sessions.close.useMutation();
  const addLine = trpc.sessions.addLine.useMutation();
  const updateLine = trpc.sessions.updateLine.useMutation({
    onSuccess() {
      utils.sessions.getById.invalidate({ id: sessionId! });
    },
  });
  const deleteLine = trpc.sessions.deleteLine.useMutation({
    onSuccess() {
      utils.sessions.getById.invalidate({ id: sessionId! });
    },
  });

  // Fetch session lines for review
  const { data: sessionData } = trpc.sessions.getById.useQuery(
    { id: sessionId! },
    { enabled: !!sessionId }
  );

  useEffect(() => {
    if (!selectedLocationId || sessionCreating.current) return;
    sessionCreating.current = true;
    createSession.mutateAsync({
      locationId: selectedLocationId,
      sessionType: "receiving" as any,
      startedTs: new Date(),
    }).then((s) => {
      setSessionId(s.id);
    }).catch((e: any) => {
      Alert.alert("Error", e.message ?? "Failed to create session");
      router.back();
    });
  }, [selectedLocationId]);

  const { data: vendors } = trpc.vendors.list.useQuery(
    { businessId: businessId!, activeOnly: true },
    { enabled: !!businessId }
  );

  const filteredVendors = useMemo(() => {
    if (!vendors) return [];
    if (!vendorSearch) return vendors as Vendor[];
    const q = vendorSearch.toLowerCase();
    return (vendors as Vendor[]).filter((v) =>
      v.name.toLowerCase().includes(q)
    );
  }, [vendors, vendorSearch]);

  const createVendorMutation = trpc.vendors.create.useMutation({
    onSuccess(vendor: any) {
      setSelectedVendor({ id: vendor.id, name: vendor.name });
      setShowNewVendor(false);
      setShowVendorPicker(false);
      setNewVendorName("");
      setNewVendorEmail("");
      setNewVendorPhone("");
      utils.vendors.list.invalidate();
    },
    onError(error: { message: string }) {
      Alert.alert("Error", error.message);
    },
  });

  const [loggedCount, setLoggedCount] = useState(0);

  const receiveMutation = trpc.receiving.receive.useMutation({
    async onSuccess() {
      if (sessionId && selectedItem) {
        try {
          await addLine.mutateAsync({
            sessionId,
            inventoryItemId: selectedItem.id,
            countUnits: totalUnits,
            notes: notes.trim() || undefined,
          });
          utils.sessions.getById.invalidate({ id: sessionId });
        } catch {
          // Non-critical — consumption event already logged
        }
      }
      setLoggedCount((c) => c + 1);
      Alert.alert("Stock Received", "Logged successfully. Ready for next item.");
      setSelectedItem(null);
      setCountType("individual");
      setQuantity("");
      setNotes("");
    },
    onError(error: { message: string }) {
      Alert.alert("Error", error.message);
    },
  });

  function handleCreateVendor() {
    if (!newVendorName.trim() || !businessId) return;
    createVendorMutation.mutate({
      businessId,
      name: newVendorName.trim(),
      contactEmail: newVendorEmail.trim() || undefined,
      contactPhone: newVendorPhone.trim() || undefined,
    });
  }

  const packSize = selectedItem?.packSize ? Number(selectedItem.packSize) : null;
  const multiplier = countType === "pack" && packSize ? packSize : 1;
  const totalUnits = quantity ? parseInt(quantity, 10) * multiplier : 0;

  function handleSubmit() {
    if (!selectedItem || !quantity || totalUnits <= 0 || !selectedLocationId) return;
    receiveMutation.mutate({
      locationId: selectedLocationId,
      inventoryItemId: selectedItem.id,
      quantity: totalUnits,
      vendorId: selectedVendor?.id,
      notes: notes.trim() || undefined,
    });
  }

  function handleDone() {
    if (sessionId) {
      closeSession.mutate(
        { sessionId },
        {
          onSuccess() {
            utils.sessions.list.invalidate();
            router.back();
          },
          onError() {
            utils.sessions.list.invalidate();
            router.back();
          },
        }
      );
    } else {
      router.back();
    }
  }

  function handleDeleteLine(lineId: string, itemName: string) {
    Alert.alert("Remove Item", `Remove ${itemName} from this delivery?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => deleteLine.mutate({ id: lineId }),
      },
    ]);
  }

  function handleSaveEdit(lineId: string) {
    const val = parseInt(editingQty, 10);
    if (!val || val <= 0) return;
    updateLine.mutate({ id: lineId, countUnits: val });
    setEditingLineId(null);
    setEditingQty("");
  }

  const canSubmit =
    !!sessionId &&
    !!selectedItem &&
    !!quantity &&
    totalUnits > 0 &&
    !receiveMutation.isPending;

  const reviewLines = sessionData?.lines ?? [];

  if (!sessionId) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#E9B44C" />
        <Text style={{ color: "#8899AA", marginTop: 12 }}>Starting session...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>Receive Stock</Text>

        {/* Vendor Picker */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Vendor</Text>
          <TouchableOpacity
            style={styles.pickerBtn}
            onPress={() => setShowVendorPicker(true)}
          >
            <Text style={selectedVendor ? styles.pickerBtnTextSelected : styles.pickerBtnText}>
              {selectedVendor?.name ?? "Select vendor..."}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Item Search */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Item</Text>
          <ItemSearchBar
            locationId={selectedLocationId!}
            onItemSelected={(item) => {
              setSelectedItem(item);
              setQuantity("");
            }}
            placeholder="Search items or scan barcode..."
          />
        </View>

        {selectedItem && (
          <>
            <View style={styles.itemCard}>
              <Text style={styles.itemName}>{selectedItem.name}</Text>
              <Text style={styles.itemType}>
                {selectedItem.type.replace("_", " ")}
                {packSize ? ` — Pack of ${packSize}` : ""}
              </Text>
            </View>

            {/* Pack Type Picker */}
            {packSize && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Count By</Text>
                <View style={styles.countTypeRow}>
                  <TouchableOpacity
                    style={[
                      styles.countTypeBtn,
                      countType === "individual" && styles.countTypeBtnActive,
                    ]}
                    onPress={() => setCountType("individual")}
                  >
                    <Text
                      style={[
                        styles.countTypeBtnText,
                        countType === "individual" && styles.countTypeBtnTextActive,
                      ]}
                    >
                      Individual Units
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.countTypeBtn,
                      countType === "pack" && styles.countTypeBtnActive,
                    ]}
                    onPress={() => setCountType("pack")}
                  >
                    <Text
                      style={[
                        styles.countTypeBtnText,
                        countType === "pack" && styles.countTypeBtnTextActive,
                      ]}
                    >
                      Packs of {packSize}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Quantity */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Quantity</Text>
              <View style={styles.quantityDisplay}>
                <Text style={styles.quantityValue}>{quantity || "0"}</Text>
                <Text style={styles.quantityUnit}>
                  {countType === "pack" && packSize
                    ? `× ${packSize} = ${totalUnits} ${selectedItem.baseUom}`
                    : selectedItem.baseUom}
                </Text>
              </View>
              <NumericKeypad value={quantity} onChange={setQuantity} />
            </View>

            {/* Notes */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Notes (optional)</Text>
              <TextInput
                style={styles.notesInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="Invoice #, delivery notes..."
                placeholderTextColor="#5A6A7A"
                multiline
              />
            </View>
          </>
        )}
      </ScrollView>

      {/* Footer: action buttons */}
      <View style={styles.footer}>
        {loggedCount > 0 && (
          <Text style={styles.loggedTally}>
            {loggedCount} item{loggedCount !== 1 ? "s" : ""} logged
          </Text>
        )}
        <TouchableOpacity
          style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          <Text style={styles.submitBtnText}>
            {receiveMutation.isPending ? "Submitting..." : "Log Received Stock"}
          </Text>
        </TouchableOpacity>
        <View style={styles.bottomRow}>
          <TouchableOpacity
            style={[styles.reviewBtn, reviewLines.length === 0 && styles.btnDisabled]}
            onPress={() => setShowReview(true)}
            disabled={reviewLines.length === 0}
          >
            <Text style={styles.reviewBtnText}>
              Review ({reviewLines.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.doneBtn}
            onPress={handleDone}
            disabled={closeSession.isPending}
          >
            <Text style={styles.doneBtnText}>
              {closeSession.isPending ? "Closing..." : "Done"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Review Modal */}
      <Modal visible={showReview} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Review Delivery</Text>
            <TouchableOpacity onPress={() => setShowReview(false)}>
              <Text style={styles.modalClose}>Close</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.reviewList}>
            {reviewLines.length === 0 ? (
              <Text style={styles.reviewEmpty}>No items logged yet.</Text>
            ) : (
              reviewLines.map((line: any) => {
                const isEditing = editingLineId === line.id;
                const itemPack = line.inventoryItem?.packSize
                  ? Number(line.inventoryItem.packSize)
                  : null;

                return (
                  <View key={line.id} style={styles.reviewRow}>
                    <View style={styles.reviewInfo}>
                      <Text style={styles.reviewItemName}>
                        {line.inventoryItem?.name ?? "Unknown"}
                      </Text>
                      <Text style={styles.reviewItemMeta}>
                        {line.inventoryItem?.type?.replace("_", " ") ?? ""}
                        {itemPack ? ` | Pack of ${itemPack}` : ""}
                      </Text>
                    </View>

                    {isEditing ? (
                      <View style={styles.reviewEditGroup}>
                        <TextInput
                          style={styles.reviewQtyInput}
                          value={editingQty}
                          onChangeText={setEditingQty}
                          keyboardType="number-pad"
                          autoFocus
                          selectTextOnFocus
                        />
                        <TouchableOpacity
                          style={styles.reviewSaveBtn}
                          onPress={() => handleSaveEdit(line.id)}
                        >
                          <Text style={styles.reviewSaveBtnText}>Save</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.reviewActions}>
                        <TouchableOpacity
                          onPress={() => {
                            setEditingLineId(line.id);
                            setEditingQty(String(line.countUnits ?? 0));
                          }}
                        >
                          <Text style={styles.reviewQty}>
                            {line.countUnits ?? 0} {line.inventoryItem?.baseUom ?? ""}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() =>
                            handleDeleteLine(line.id, line.inventoryItem?.name ?? "item")
                          }
                        >
                          <Text style={styles.deleteIcon}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Vendor Picker Modal */}
      <Modal visible={showVendorPicker} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Vendor</Text>
            <TouchableOpacity onPress={() => setShowVendorPicker(false)}>
              <Text style={styles.modalClose}>Done</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.vendorSearchInput}
            value={vendorSearch}
            onChangeText={setVendorSearch}
            placeholder="Search vendors..."
            placeholderTextColor="#5A6A7A"
            autoFocus
          />

          <ScrollView style={styles.vendorList}>
            {filteredVendors.map((v) => (
              <TouchableOpacity
                key={v.id}
                style={[
                  styles.vendorRow,
                  selectedVendor?.id === v.id && styles.vendorRowActive,
                ]}
                onPress={() => {
                  setSelectedVendor(v);
                  setShowVendorPicker(false);
                  setVendorSearch("");
                }}
              >
                <Text style={styles.vendorName}>{v.name}</Text>
              </TouchableOpacity>
            ))}

            {vendorSearch.length > 0 && filteredVendors.length === 0 && (
              <View style={styles.noResults}>
                <Text style={styles.noResultsText}>
                  No vendor found for "{vendorSearch}"
                </Text>
                <TouchableOpacity
                  style={styles.addVendorBtn}
                  onPress={() => {
                    setNewVendorName(vendorSearch);
                    setShowNewVendor(true);
                  }}
                >
                  <Text style={styles.addVendorBtnText}>
                    Add "{vendorSearch}" as New Vendor
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {vendorSearch.length === 0 && (
              <TouchableOpacity
                style={styles.addVendorRow}
                onPress={() => {
                  setNewVendorName("");
                  setShowNewVendor(true);
                }}
              >
                <Text style={styles.addVendorRowText}>+ Add New Vendor</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* New Vendor Modal */}
      <Modal visible={showNewVendor} animationType="slide" transparent>
        <View style={styles.newVendorBackdrop}>
          <View style={styles.newVendorSheet}>
            <Text style={styles.newVendorTitle}>Add New Vendor</Text>
            <Text style={styles.newVendorSubtitle}>
              Enter what you know — the business owner will be notified to complete the details.
            </Text>

            <Text style={styles.fieldLabel}>Name *</Text>
            <TextInput
              style={styles.fieldInput}
              value={newVendorName}
              onChangeText={setNewVendorName}
              placeholder="Vendor name"
              placeholderTextColor="#5A6A7A"
              autoFocus
            />

            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput
              style={styles.fieldInput}
              value={newVendorEmail}
              onChangeText={setNewVendorEmail}
              placeholder="contact@vendor.com"
              placeholderTextColor="#5A6A7A"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.fieldLabel}>Phone</Text>
            <TextInput
              style={styles.fieldInput}
              value={newVendorPhone}
              onChangeText={setNewVendorPhone}
              placeholder="(555) 123-4567"
              placeholderTextColor="#5A6A7A"
              keyboardType="phone-pad"
            />

            <View style={styles.newVendorActions}>
              <TouchableOpacity
                style={styles.newVendorCancel}
                onPress={() => setShowNewVendor(false)}
              >
                <Text style={styles.newVendorCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.newVendorSave,
                  (!newVendorName.trim() || createVendorMutation.isPending) &&
                    styles.newVendorSaveDisabled,
                ]}
                onPress={handleCreateVendor}
                disabled={!newVendorName.trim() || createVendorMutation.isPending}
              >
                <Text style={styles.newVendorSaveText}>
                  {createVendorMutation.isPending ? "Saving..." : "Save Vendor"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 120 },
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
  pickerBtn: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  pickerBtnText: { color: "#5A6A7A", fontSize: 15 },
  pickerBtnTextSelected: { color: "#EAF0FF", fontSize: 15, fontWeight: "500" },
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
  countTypeRow: { flexDirection: "row", gap: 8 },
  countTypeBtn: {
    flex: 1,
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 14,
    borderWidth: 2,
    borderColor: "#16283F",
    alignItems: "center",
  },
  countTypeBtnActive: { borderColor: "#E9B44C" },
  countTypeBtnText: { color: "#8899AA", fontSize: 14, fontWeight: "500" },
  countTypeBtnTextActive: { color: "#EAF0FF" },
  quantityDisplay: { alignItems: "center", marginBottom: 16 },
  quantityValue: { fontSize: 48, fontWeight: "bold", color: "#EAF0FF" },
  quantityUnit: { color: "#5A6A7A", fontSize: 14, marginTop: 4 },
  notesInput: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 14,
    color: "#EAF0FF",
    fontSize: 15,
    minHeight: 60,
    borderWidth: 1,
    borderColor: "#1E3550",
    textAlignVertical: "top",
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingTop: 8,
    backgroundColor: "#0B1623",
    borderTopWidth: 1,
    borderTopColor: "#1E3550",
  },
  loggedTally: {
    color: "#4CAF50",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 8,
  },
  submitBtn: {
    backgroundColor: "#4CAF50",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 10,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  bottomRow: {
    flexDirection: "row",
    gap: 10,
  },
  reviewBtn: {
    flex: 1,
    backgroundColor: "#16283F",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E9B44C",
  },
  reviewBtnText: { color: "#E9B44C", fontSize: 16, fontWeight: "600" },
  doneBtn: {
    flex: 1,
    backgroundColor: "#16283F",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  doneBtnText: { color: "#8899AA", fontSize: 16, fontWeight: "600" },
  btnDisabled: { opacity: 0.4 },

  // Review modal
  reviewList: { flex: 1, paddingHorizontal: 16 },
  reviewEmpty: { color: "#5A6A7A", textAlign: "center", marginTop: 40, fontSize: 15 },
  reviewRow: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  reviewInfo: { flex: 1, marginRight: 12 },
  reviewItemName: { color: "#EAF0FF", fontSize: 15, fontWeight: "600" },
  reviewItemMeta: {
    color: "#5A6A7A",
    fontSize: 12,
    textTransform: "capitalize",
    marginTop: 2,
  },
  reviewActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  reviewQty: {
    color: "#E9B44C",
    fontSize: 16,
    fontWeight: "700",
    minWidth: 50,
    textAlign: "right",
  },
  deleteIcon: {
    color: "#dc2626",
    fontSize: 18,
    fontWeight: "700",
    paddingHorizontal: 4,
  },
  reviewEditGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  reviewQtyInput: {
    backgroundColor: "#0F1D2E",
    borderRadius: 8,
    padding: 8,
    color: "#EAF0FF",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    width: 60,
    borderWidth: 1,
    borderColor: "#E9B44C",
  },
  reviewSaveBtn: {
    backgroundColor: "#E9B44C",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  reviewSaveBtnText: { color: "#0B1623", fontSize: 14, fontWeight: "700" },

  // Shared modal styles
  modalContainer: { flex: 1, backgroundColor: "#0B1623", paddingTop: 60 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  modalTitle: { fontSize: 22, fontWeight: "bold", color: "#EAF0FF" },
  modalClose: { color: "#E9B44C", fontSize: 16, fontWeight: "600" },
  vendorSearchInput: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 14,
    marginHorizontal: 16,
    color: "#EAF0FF",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#1E3550",
    marginBottom: 12,
  },
  vendorList: { flex: 1, paddingHorizontal: 16 },
  vendorRow: {
    backgroundColor: "#16283F",
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  vendorRowActive: { borderColor: "#E9B44C" },
  vendorName: { color: "#EAF0FF", fontSize: 15, fontWeight: "500" },
  noResults: { alignItems: "center", paddingVertical: 20 },
  noResultsText: { color: "#5A6A7A", fontSize: 14, marginBottom: 12 },
  addVendorBtn: {
    backgroundColor: "#1E3550",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E9B44C",
  },
  addVendorBtnText: { color: "#E9B44C", fontSize: 15, fontWeight: "600" },
  addVendorRow: {
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  addVendorRowText: { color: "#2BA8A0", fontSize: 15, fontWeight: "600" },

  // New vendor modal
  newVendorBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-start",
    paddingTop: 80,
    padding: 20,
  },
  newVendorSheet: {
    backgroundColor: "#16283F",
    borderRadius: 16,
    padding: 20,
  },
  newVendorTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#EAF0FF",
    marginBottom: 4,
  },
  newVendorSubtitle: {
    fontSize: 13,
    color: "#8899AA",
    marginBottom: 20,
    lineHeight: 18,
  },
  fieldLabel: {
    color: "#8899AA",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 12,
  },
  fieldInput: {
    backgroundColor: "#0F1D2E",
    borderRadius: 8,
    padding: 12,
    color: "#EAF0FF",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  newVendorActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  newVendorCancel: {
    flex: 1,
    backgroundColor: "#0F1D2E",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
  },
  newVendorCancelText: { color: "#8899AA", fontSize: 16, fontWeight: "600" },
  newVendorSave: {
    flex: 2,
    backgroundColor: "#E9B44C",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
  },
  newVendorSaveDisabled: { opacity: 0.4 },
  newVendorSaveText: { color: "#0B1623", fontSize: 16, fontWeight: "700" },
});
