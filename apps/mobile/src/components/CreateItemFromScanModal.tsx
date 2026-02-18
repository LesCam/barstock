import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { scaleManager, type ScaleReading } from "@/lib/scale/scale-manager";

const DEFAULT_DENSITY = 0.95;

type WeightKind = "full" | "tare";

interface Props {
  barcode: string;
  locationId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function CreateItemFromScanModal({
  barcode,
  locationId,
  onSuccess,
  onCancel,
}: Props) {
  const { user } = useAuth();
  const businessId = user?.businessId ?? "";

  // Fetch weighable categories
  const { data: categories } = trpc.itemCategories.list.useQuery(
    { businessId },
    { enabled: !!businessId }
  );
  const weighableCategories = categories?.filter(
    (c) => c.countingMethod === "weighable"
  );

  // Form state
  const [name, setName] = useState("");
  const [containerSizeMl, setContainerSizeMl] = useState("750");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [newVendorName, setNewVendorName] = useState("");
  const [addingNewVendor, setAddingNewVendor] = useState(false);

  // Auto-select first weighable category
  useEffect(() => {
    if (!selectedCategoryId && weighableCategories?.length) {
      setSelectedCategoryId(weighableCategories[0].id);
    }
  }, [weighableCategories, selectedCategoryId]);

  // Scale weight capture
  const [capturedWeight, setCapturedWeight] = useState<{
    grams: number;
    kind: WeightKind;
  } | null>(null);
  const [pendingReading, setPendingReading] = useState<number | null>(null);

  const nameInputRef = useRef<TextInput>(null);

  // Vendors list
  const { data: vendors, isLoading: vendorsLoading } =
    trpc.vendors.list.useQuery(
      { businessId, activeOnly: true },
      { enabled: !!businessId }
    );

  // Create mutation
  const createMutation = trpc.scale.createItemWithTemplate.useMutation({
    onSuccess: () => onSuccess(),
  });

  // Scale listener
  useEffect(() => {
    const unsubscribe = scaleManager.onReading((reading: ScaleReading) => {
      if (reading.stable && reading.weightGrams > 50) {
        setPendingReading(Math.round(reading.weightGrams));
      }
    });
    return unsubscribe;
  }, []);

  // Auto-focus name input
  useEffect(() => {
    const timer = setTimeout(() => nameInputRef.current?.focus(), 400);
    return () => clearTimeout(timer);
  }, []);

  function handleWeightChoice(kind: WeightKind) {
    if (pendingReading == null) return;
    setCapturedWeight({ grams: pendingReading, kind });
    setPendingReading(null);
  }

  function dismissWeightPrompt() {
    setPendingReading(null);
  }

  function handleSave() {
    const sizeMl = parseInt(containerSizeMl) || 750;
    const emptyG =
      capturedWeight?.kind === "tare" ? capturedWeight.grams : undefined;
    const fullG =
      capturedWeight?.kind === "full" ? capturedWeight.grams : undefined;

    // Use category's default density, or fall back to 0.95
    const selectedCategory = weighableCategories?.find((c) => c.id === selectedCategoryId);
    const density = selectedCategory?.defaultDensity ? Number(selectedCategory.defaultDensity) : DEFAULT_DENSITY;
    const finalEmptyG = emptyG;
    const finalFullG = fullG ?? (emptyG ? undefined : Math.round(sizeMl * density + 300));
    const submitEmptyG = finalEmptyG;
    const submitFullG = finalFullG;

    createMutation.mutate({
      locationId,
      name: name.trim(),
      barcode,
      containerSizeMl: sizeMl,
      categoryId: selectedCategoryId,
      vendorId: selectedVendorId ?? undefined,
      newVendorName:
        addingNewVendor && newVendorName.trim()
          ? newVendorName.trim()
          : undefined,
      emptyBottleWeightG: submitEmptyG,
      fullBottleWeightG: submitFullG,
    });
  }

  const sizeMl = parseInt(containerSizeMl) || 0;
  const canSave = name.trim().length > 0 && sizeMl > 0 && !!selectedCategoryId;

  return (
    <Modal visible animationType="slide" transparent>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.sheet}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Quick Create Item</Text>
              <TouchableOpacity onPress={onCancel}>
                <Text style={styles.closeBtn}>&#x2715;</Text>
              </TouchableOpacity>
            </View>

            {/* Barcode (read-only) */}
            <Text style={styles.label}>Barcode</Text>
            <View style={styles.readOnlyField}>
              <Text style={styles.readOnlyText}>{barcode}</Text>
            </View>

            {/* Name */}
            <Text style={styles.label}>Name *</Text>
            <TextInput
              ref={nameInputRef}
              style={styles.textInput}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Absolut Vodka"
              placeholderTextColor="#999"
              returnKeyType="next"
            />

            {/* Container Size */}
            <Text style={styles.label}>Container Size (ml)</Text>
            <TextInput
              style={styles.textInput}
              value={containerSizeMl}
              onChangeText={(v) =>
                setContainerSizeMl(v.replace(/[^0-9]/g, ""))
              }
              placeholder="750"
              placeholderTextColor="#999"
              keyboardType="numeric"
            />

            {/* Category */}
            <Text style={styles.label}>Category</Text>
            <View style={styles.toggleRow}>
              {weighableCategories?.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.toggleBtn,
                    selectedCategoryId === cat.id && styles.toggleBtnActive,
                  ]}
                  onPress={() => setSelectedCategoryId(cat.id)}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      selectedCategoryId === cat.id && styles.toggleTextActive,
                    ]}
                  >
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Vendor section */}
            <Text style={styles.label}>Vendor (optional)</Text>
            {vendorsLoading ? (
              <ActivityIndicator
                size="small"
                color="#2563eb"
                style={{ marginVertical: 8 }}
              />
            ) : (
              <View style={styles.vendorList}>
                {/* Add New row */}
                <TouchableOpacity
                  style={[
                    styles.vendorRow,
                    addingNewVendor && styles.vendorRowActive,
                  ]}
                  onPress={() => {
                    setAddingNewVendor(true);
                    setSelectedVendorId(null);
                  }}
                >
                  <Text
                    style={[
                      styles.vendorRowText,
                      addingNewVendor && styles.vendorRowTextActive,
                    ]}
                  >
                    + Add New Vendor
                  </Text>
                </TouchableOpacity>
                {addingNewVendor && (
                  <TextInput
                    style={[styles.textInput, { marginTop: 4, marginBottom: 8 }]}
                    value={newVendorName}
                    onChangeText={setNewVendorName}
                    placeholder="Vendor name..."
                    placeholderTextColor="#999"
                    autoFocus
                  />
                )}

                {/* Existing vendors */}
                {vendors?.map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    style={[
                      styles.vendorRow,
                      selectedVendorId === v.id && styles.vendorRowActive,
                    ]}
                    onPress={() => {
                      setSelectedVendorId(
                        selectedVendorId === v.id ? null : v.id
                      );
                      setAddingNewVendor(false);
                      setNewVendorName("");
                    }}
                  >
                    <Text
                      style={[
                        styles.vendorRowText,
                        selectedVendorId === v.id &&
                          styles.vendorRowTextActive,
                      ]}
                    >
                      {v.name}
                    </Text>
                    {selectedVendorId === v.id && (
                      <Text style={styles.checkmark}>&#x2713;</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Scale weight capture info card */}
            {capturedWeight && (
              <View style={styles.weightCard}>
                <Text style={styles.weightCardTitle}>
                  {capturedWeight.kind === "full"
                    ? "Full Bottle Weight"
                    : "Tare Weight"}
                </Text>
                <Text style={styles.weightCardValue}>
                  {(capturedWeight.grams / 1000).toFixed(3)} kg (
                  {capturedWeight.grams} g)
                </Text>
              </View>
            )}

            {/* Scale weight prompt overlay */}
            {pendingReading !== null && (
              <View style={styles.weightPrompt}>
                <Text style={styles.weightPromptTitle}>
                  Scale reading: {(pendingReading / 1000).toFixed(3)} kg
                </Text>
                <Text style={styles.weightPromptQuestion}>
                  Is this a full bottle or tare weight?
                </Text>
                <View style={styles.weightPromptButtons}>
                  <TouchableOpacity
                    style={styles.weightPromptBtn}
                    onPress={() => handleWeightChoice("full")}
                  >
                    <Text style={styles.weightPromptBtnText}>Full</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.weightPromptBtn}
                    onPress={() => handleWeightChoice("tare")}
                  >
                    <Text style={styles.weightPromptBtnText}>Tare</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.weightPromptBtn, styles.weightPromptBtnGray]}
                    onPress={dismissWeightPrompt}
                  >
                    <Text style={styles.weightPromptBtnGrayText}>Ignore</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Error */}
            {createMutation.error && (
              <Text style={styles.errorText}>
                {createMutation.error.message}
              </Text>
            )}

            {/* Actions */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={!canSave || createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelActionBtn} onPress={onCancel}>
                <Text style={styles.cancelActionBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
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
    maxHeight: "90%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1a1a1a",
  },
  closeBtn: {
    fontSize: 18,
    color: "#999",
    padding: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
    marginBottom: 4,
    marginTop: 12,
  },
  readOnlyField: {
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  readOnlyText: {
    fontSize: 15,
    color: "#666",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  textInput: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#1a1a1a",
  },
  toggleRow: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    padding: 3,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  toggleBtnActive: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#666",
  },
  toggleTextActive: {
    color: "#1a1a1a",
    fontWeight: "600",
  },
  vendorList: {
    maxHeight: 180,
  },
  vendorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 2,
  },
  vendorRowActive: {
    backgroundColor: "#eff6ff",
  },
  vendorRowText: {
    fontSize: 15,
    color: "#1a1a1a",
  },
  vendorRowTextActive: {
    color: "#2563eb",
    fontWeight: "600",
  },
  checkmark: {
    fontSize: 16,
    color: "#2563eb",
    fontWeight: "bold",
  },
  weightCard: {
    backgroundColor: "#eff6ff",
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  weightCardTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2563eb",
  },
  weightCardValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1e40af",
    marginTop: 2,
  },
  weightPrompt: {
    backgroundColor: "#fefce8",
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  weightPromptTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#92400e",
  },
  weightPromptQuestion: {
    fontSize: 13,
    color: "#78350f",
    marginTop: 4,
  },
  weightPromptButtons: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  weightPromptBtn: {
    flex: 1,
    backgroundColor: "#2563eb",
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  weightPromptBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  weightPromptBtnGray: {
    backgroundColor: "#e5e7eb",
  },
  weightPromptBtnGrayText: {
    color: "#666",
    fontSize: 14,
    fontWeight: "500",
  },
  errorText: {
    color: "#dc2626",
    fontSize: 13,
    marginTop: 8,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
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
  cancelActionBtn: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  cancelActionBtnText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "500",
  },
});
