import { useState, useMemo, useEffect } from "react";
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
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";
import { ItemSearchBar } from "@/components/ItemSearchBar";

interface EditableLine {
  receiptLineId: string;
  lineIndex: number;
  descriptionRaw: string;
  inventoryItemId: string | null;
  inventoryItemName: string | null;
  quantity: string;
  unitPrice: string;
  matchConfidence: number | null;
  matchSource: string | null;
  skipped: boolean;
}

export default function ReceiptConfirmScreen() {
  const { receiptCaptureId } = useLocalSearchParams<{ receiptCaptureId: string }>();
  const { selectedLocationId, user } = useAuth();
  const businessId = user?.businessId;

  const [editableLines, setEditableLines] = useState<EditableLine[]>([]);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [vendorName, setVendorName] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [showVendorPicker, setShowVendorPicker] = useState(false);
  const [vendorSearch, setVendorSearch] = useState("");
  const [itemPickerLineIndex, setItemPickerLineIndex] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(false);

  const utils = trpc.useUtils();

  // Fetch receipt data
  const { data: receipt, isLoading } = trpc.receipts.getById.useQuery(
    { id: receiptCaptureId! },
    { enabled: !!receiptCaptureId }
  );

  // Initialize editable state when receipt data loads
  useEffect(() => {
    if (!receipt || initialized) return;
    setInitialized(true);

    setEditableLines(
      receipt.lines.map((line: any) => ({
        receiptLineId: line.id,
        lineIndex: line.lineIndex,
        descriptionRaw: line.descriptionRaw,
        inventoryItemId: line.inventoryItemId ?? null,
        inventoryItemName: line.inventoryItem?.name ?? null,
        quantity: line.quantityRaw != null ? String(Number(line.quantityRaw)) : "1",
        unitPrice: line.unitPriceRaw != null ? String(Number(line.unitPriceRaw)) : "",
        matchConfidence: line.matchConfidence != null ? Number(line.matchConfidence) : null,
        matchSource: line.matchSource,
        skipped: false,
      }))
    );

    if (receipt.vendorId) {
      setVendorId(receipt.vendorId);
      setVendorName(receipt.vendor?.name ?? null);
    }
    if (receipt.invoiceNumber) setInvoiceNumber(receipt.invoiceNumber);
    if (receipt.invoiceDate) {
      setInvoiceDate(
        new Date(receipt.invoiceDate).toISOString().split("T")[0]
      );
    }
  }, [receipt, initialized]);

  // Fetch vendors for picker
  const { data: vendors } = trpc.vendors.list.useQuery(
    { businessId: businessId! },
    { enabled: !!businessId }
  );

  const filteredVendors = useMemo(() => {
    if (!vendors) return [];
    if (!vendorSearch.trim()) return vendors as any[];
    const q = vendorSearch.toLowerCase();
    return (vendors as any[]).filter((v: any) =>
      v.name.toLowerCase().includes(q)
    );
  }, [vendors, vendorSearch]);

  const confirmMutation = trpc.receipts.confirm.useMutation({
    onSuccess: (data) => {
      utils.receipts.list.invalidate();

      // Check for skipped lines that could be created as new items
      const skippedLines = editableLines.filter(
        (l) => l.skipped && !l.inventoryItemId
      );

      if (skippedLines.length > 0) {
        Alert.alert(
          "Receipt Processed",
          `${data.eventIds.length} item${data.eventIds.length === 1 ? "" : "s"} received.\n\n${skippedLines.length} item${skippedLines.length === 1 ? " was" : "s were"} skipped. Would you like to add them as inventory items?`,
          [
            { text: "Not Now", style: "cancel", onPress: () => router.replace("/receive") },
            {
              text: "Add Items",
              onPress: () =>
                router.replace({
                  pathname: "/receipt/add-skipped",
                  params: { receiptCaptureId: receiptCaptureId! },
                }),
            },
          ]
        );
      } else {
        Alert.alert(
          "Receipt Processed",
          `${data.eventIds.length} item${data.eventIds.length === 1 ? "" : "s"} received successfully.`,
          [{ text: "OK", onPress: () => router.replace("/receive") }]
        );
      }
    },
    onError: (err) => {
      Alert.alert("Error", err.message);
    },
  });

  function updateLine(index: number, updates: Partial<EditableLine>) {
    setEditableLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...updates } : line))
    );
  }

  function handleItemSelected(item: any) {
    if (itemPickerLineIndex == null) return;
    updateLine(itemPickerLineIndex, {
      inventoryItemId: item.id,
      inventoryItemName: item.name,
      matchConfidence: 1.0,
      matchSource: "manual",
    });
    setItemPickerLineIndex(null);
  }

  function handleSubmit() {
    const activeLines = editableLines.filter((l) => !l.skipped);
    const unmatchedCount = activeLines.filter((l) => !l.inventoryItemId).length;

    if (unmatchedCount > 0) {
      Alert.alert(
        "Unmatched Items",
        `${unmatchedCount} line${unmatchedCount === 1 ? " is" : "s are"} not matched to inventory items. Skip them or assign items first.`
      );
      return;
    }

    confirmMutation.mutate({
      receiptCaptureId: receiptCaptureId!,
      vendorId,
      invoiceDate: invoiceDate || null,
      invoiceNumber: invoiceNumber || null,
      lines: editableLines.map((line) => ({
        receiptLineId: line.receiptLineId,
        inventoryItemId: line.skipped ? null : line.inventoryItemId,
        quantity: parseFloat(line.quantity) || 1,
        unitPrice: line.unitPrice ? parseFloat(line.unitPrice) : null,
        skipped: line.skipped,
      })),
    });
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#E9B44C" />
        <Text style={styles.loadingText}>Loading receipt data...</Text>
      </View>
    );
  }

  const activeCount = editableLines.filter((l) => !l.skipped).length;
  const matchedCount = editableLines.filter(
    (l) => !l.skipped && l.inventoryItemId
  ).length;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>Review Receipt</Text>

        {/* Vendor */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Vendor</Text>
          <TouchableOpacity
            style={styles.pickerBtn}
            onPress={() => setShowVendorPicker(true)}
          >
            <Text
              style={
                vendorName ? styles.pickerBtnTextSelected : styles.pickerBtnText
              }
            >
              {vendorName ?? receipt?.vendorNameRaw ?? "Select vendor..."}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Invoice Info */}
        <View style={styles.rowSection}>
          <View style={styles.halfField}>
            <Text style={styles.sectionLabel}>Invoice #</Text>
            <TextInput
              style={styles.fieldInput}
              value={invoiceNumber}
              onChangeText={setInvoiceNumber}
              placeholder="Optional"
              placeholderTextColor="#5A6A7A"
            />
          </View>
          <View style={styles.halfField}>
            <Text style={styles.sectionLabel}>Date</Text>
            <TextInput
              style={styles.fieldInput}
              value={invoiceDate}
              onChangeText={setInvoiceDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#5A6A7A"
            />
          </View>
        </View>

        {/* Summary */}
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>
            {matchedCount}/{activeCount} items matched
          </Text>
        </View>

        {/* Line Items */}
        {editableLines.map((line, index) => (
          <View
            key={line.receiptLineId}
            style={[styles.lineCard, line.skipped && styles.lineCardSkipped]}
          >
            {/* Raw description */}
            <Text style={styles.lineDescription}>{line.descriptionRaw}</Text>

            {/* Matched item */}
            <TouchableOpacity
              style={styles.matchRow}
              onPress={() => setItemPickerLineIndex(index)}
              disabled={line.skipped}
            >
              <Text
                style={
                  line.inventoryItemId
                    ? styles.matchedItemText
                    : styles.unmatchedText
                }
              >
                {line.inventoryItemId
                  ? line.inventoryItemName
                  : "Tap to match item"}
              </Text>
              {line.matchConfidence != null && (
                <View
                  style={[
                    styles.confidenceBadge,
                    line.matchConfidence >= 0.8
                      ? styles.confidenceHigh
                      : line.matchConfidence >= 0.5
                        ? styles.confidenceMedium
                        : styles.confidenceLow,
                  ]}
                >
                  <Text style={styles.confidenceText}>
                    {Math.round(line.matchConfidence * 100)}%
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Quantity + Price */}
            {!line.skipped && (
              <View style={styles.lineFields}>
                <View style={styles.lineField}>
                  <Text style={styles.lineFieldLabel}>Qty</Text>
                  <TextInput
                    style={styles.lineFieldInput}
                    value={line.quantity}
                    onChangeText={(v) => updateLine(index, { quantity: v })}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.lineField}>
                  <Text style={styles.lineFieldLabel}>Unit Price</Text>
                  <TextInput
                    style={styles.lineFieldInput}
                    value={line.unitPrice}
                    onChangeText={(v) => updateLine(index, { unitPrice: v })}
                    keyboardType="decimal-pad"
                    placeholder="--"
                    placeholderTextColor="#5A6A7A"
                  />
                </View>
              </View>
            )}

            {/* Skip toggle */}
            <TouchableOpacity
              style={styles.skipToggle}
              onPress={() => updateLine(index, { skipped: !line.skipped })}
            >
              <Text style={styles.skipToggleText}>
                {line.skipped ? "Include" : "Skip"}
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.submitBtn,
            confirmMutation.isPending && styles.submitBtnDisabled,
          ]}
          onPress={handleSubmit}
          disabled={confirmMutation.isPending}
        >
          {confirmMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>
              Process Receipt ({activeCount} items)
            </Text>
          )}
        </TouchableOpacity>
      </View>

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
            {/* No vendor option */}
            <TouchableOpacity
              style={[styles.vendorRow, !vendorId && styles.vendorRowActive]}
              onPress={() => {
                setVendorId(null);
                setVendorName(null);
                setShowVendorPicker(false);
                setVendorSearch("");
              }}
            >
              <Text style={styles.vendorNameDim}>No vendor</Text>
            </TouchableOpacity>

            {filteredVendors.map((v: any) => (
              <TouchableOpacity
                key={v.id}
                style={[
                  styles.vendorRow,
                  vendorId === v.id && styles.vendorRowActive,
                ]}
                onPress={() => {
                  setVendorId(v.id);
                  setVendorName(v.name);
                  setShowVendorPicker(false);
                  setVendorSearch("");
                }}
              >
                <Text style={styles.vendorNameText}>{v.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* Item Picker Modal */}
      <Modal
        visible={itemPickerLineIndex != null}
        animationType="slide"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Match Item</Text>
            <TouchableOpacity onPress={() => setItemPickerLineIndex(null)}>
              <Text style={styles.modalClose}>Cancel</Text>
            </TouchableOpacity>
          </View>
          {itemPickerLineIndex != null && (
            <View style={styles.itemPickerHint}>
              <Text style={styles.itemPickerHintText}>
                Receipt: "{editableLines[itemPickerLineIndex]?.descriptionRaw}"
              </Text>
            </View>
          )}
          {selectedLocationId && (
            <View style={{ flex: 1, padding: 16 }}>
              <ItemSearchBar
                locationId={selectedLocationId}
                onItemSelected={handleItemSelected}
                placeholder="Search inventory items..."
              />
            </View>
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
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
  section: { marginBottom: 16 },
  sectionLabel: {
    color: "#8899AA",
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  rowSection: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  halfField: { flex: 1 },
  fieldInput: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 12,
    color: "#EAF0FF",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#1E3550",
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
  summaryRow: {
    marginBottom: 12,
    paddingVertical: 8,
  },
  summaryText: {
    color: "#8899AA",
    fontSize: 14,
    fontWeight: "500",
  },

  // Line items
  lineCard: {
    backgroundColor: "#16283F",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  lineCardSkipped: {
    opacity: 0.4,
  },
  lineDescription: {
    color: "#8899AA",
    fontSize: 13,
    fontStyle: "italic",
    marginBottom: 8,
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  matchedItemText: {
    color: "#EAF0FF",
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
  },
  unmatchedText: {
    color: "#E9B44C",
    fontSize: 15,
    fontStyle: "italic",
    flex: 1,
  },
  confidenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: 8,
  },
  confidenceHigh: { backgroundColor: "rgba(76, 175, 80, 0.2)" },
  confidenceMedium: { backgroundColor: "rgba(233, 180, 76, 0.2)" },
  confidenceLow: { backgroundColor: "rgba(220, 38, 38, 0.2)" },
  confidenceText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#EAF0FF",
  },
  lineFields: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 8,
  },
  lineField: { flex: 1 },
  lineFieldLabel: {
    color: "#5A6A7A",
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 4,
  },
  lineFieldInput: {
    backgroundColor: "#0B1623",
    borderRadius: 8,
    padding: 10,
    color: "#EAF0FF",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  skipToggle: {
    alignSelf: "flex-end",
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  skipToggleText: {
    color: "#5A6A7A",
    fontSize: 13,
    fontWeight: "500",
  },

  // Footer
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
    backgroundColor: "#4CAF50",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },

  // Loading
  loadingContainer: {
    flex: 1,
    backgroundColor: "#0B1623",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "#8899AA",
    fontSize: 15,
    marginTop: 12,
  },

  // Vendor picker modal
  modalContainer: {
    flex: 1,
    backgroundColor: "#0B1623",
    paddingTop: 54,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3550",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#EAF0FF",
  },
  modalClose: {
    color: "#E9B44C",
    fontSize: 16,
    fontWeight: "600",
  },
  vendorSearchInput: {
    backgroundColor: "#16283F",
    margin: 16,
    borderRadius: 10,
    padding: 12,
    color: "#EAF0FF",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  vendorList: { flex: 1, paddingHorizontal: 16 },
  vendorRow: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3550",
  },
  vendorRowActive: {
    backgroundColor: "#1E3550",
  },
  vendorNameText: { color: "#EAF0FF", fontSize: 16 },
  vendorNameDim: { color: "#5A6A7A", fontSize: 16, fontStyle: "italic" },

  // Item picker
  itemPickerHint: {
    backgroundColor: "#16283F",
    padding: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
  },
  itemPickerHintText: {
    color: "#8899AA",
    fontSize: 13,
    fontStyle: "italic",
  },
});
