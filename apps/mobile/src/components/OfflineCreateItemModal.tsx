import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import * as Crypto from "expo-crypto";
import { useAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { enqueue } from "@/lib/offline-queue";

interface Props {
  barcode?: string;
  locationId: string;
  onSuccess: (item: { id: string; name: string; categoryId: string; barcode?: string; countingMethod?: string }) => void;
  onCancel: () => void;
}

export function OfflineCreateItemModal({
  barcode,
  locationId,
  onSuccess,
  onCancel,
}: Props) {
  const { user } = useAuth();
  const businessId = user?.businessId ?? "";

  const { data: categories } = trpc.itemCategories.list.useQuery(
    { businessId },
    { enabled: !!businessId }
  );

  const [name, setName] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const nameInputRef = useRef<TextInput>(null);

  // Auto-select first category
  useEffect(() => {
    if (selectedCategoryId || !categories?.length) return;
    setSelectedCategoryId(categories[0].id);
  }, [categories, selectedCategoryId]);

  // Auto-focus name input
  useEffect(() => {
    const timer = setTimeout(() => nameInputRef.current?.focus(), 400);
    return () => clearTimeout(timer);
  }, []);

  function handleSave() {
    if (!name.trim() || !selectedCategoryId) return;

    const itemId = Crypto.randomUUID();
    const selectedCategory = categories?.find((c) => c.id === selectedCategoryId);

    // Queue the server-side create
    enqueue("inventory.create", {
      id: itemId,
      locationId,
      name: name.trim(),
      categoryId: selectedCategoryId,
      barcode: barcode || undefined,
      baseUom: "units",
    });

    // Return the new item to the caller
    onSuccess({
      id: itemId,
      name: name.trim(),
      categoryId: selectedCategoryId,
      barcode,
      countingMethod: selectedCategory?.countingMethod,
    });
  }

  const canSave = name.trim().length > 0 && !!selectedCategoryId;

  return (
    <Modal visible animationType="slide" transparent>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.sheet}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Quick Create (Offline)</Text>
              <TouchableOpacity onPress={onCancel}>
                <Text style={styles.closeBtn}>&#x2715;</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.hint}>
              Create a stub item to continue counting. Full details can be added later when online.
            </Text>

            {/* Barcode */}
            {barcode && (
              <>
                <Text style={styles.label}>Barcode</Text>
                <View style={styles.readOnlyField}>
                  <Text style={styles.readOnlyText}>{barcode}</Text>
                </View>
              </>
            )}

            {/* Name */}
            <Text style={styles.label}>Name *</Text>
            <TextInput
              ref={nameInputRef}
              style={styles.textInput}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Absolut Vodka"
              placeholderTextColor="#999"
              returnKeyType="done"
            />

            {/* Category */}
            <Text style={styles.label}>Category</Text>
            <TouchableOpacity
              style={styles.dropdown}
              onPress={() => {
                if (!categories?.length) return;
                Alert.alert("Select Category", undefined, [
                  ...categories.map((cat) => ({
                    text: `${cat.name}${cat.countingMethod !== "weighable" ? ` (${cat.countingMethod === "unit_count" ? "count" : cat.countingMethod})` : ""}`,
                    onPress: () => setSelectedCategoryId(cat.id),
                  })),
                  { text: "Cancel", style: "cancel" },
                ]);
              }}
            >
              <Text style={styles.dropdownText}>
                {categories?.find((c) => c.id === selectedCategoryId)?.name ?? "Select..."}
              </Text>
              <Text style={styles.dropdownArrow}>&#x25BC;</Text>
            </TouchableOpacity>

            {/* Actions */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={!canSave}
              >
                <Text style={styles.saveBtnText}>Create & Count</Text>
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
    maxHeight: "70%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
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
  hint: {
    fontSize: 13,
    color: "#666",
    marginBottom: 12,
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
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  dropdownText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#1a1a1a",
  },
  dropdownArrow: {
    fontSize: 12,
    color: "#999",
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
