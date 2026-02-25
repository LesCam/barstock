import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";

const UOM_OPTIONS = [
  { value: "oz", label: "oz" },
  { value: "ml", label: "mL" },
  { value: "units", label: "units" },
  { value: "grams", label: "g" },
  { value: "L", label: "L" },
];

interface IngredientRow {
  inventoryItemId: string;
  itemName: string;
  quantity: string;
  uom: string;
}

export default function RecipeCreateEditScreen() {
  const { recipeId } = useLocalSearchParams<{ recipeId?: string }>();
  const { selectedLocationId } = useAuth();
  const utils = trpc.useUtils();
  const isEdit = !!recipeId;

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");

  // Load existing recipe for edit mode
  const { data: existingRecipe } = trpc.recipes.getById.useQuery(
    { id: recipeId! },
    { enabled: isEdit }
  );

  const { data: inventoryItems } = trpc.inventory.list.useQuery(
    { locationId: selectedLocationId! },
    { enabled: !!selectedLocationId }
  );

  useEffect(() => {
    if (existingRecipe && isEdit) {
      setName(existingRecipe.name);
      setCategory(existingRecipe.category ?? "");
      setIngredients(
        existingRecipe.ingredients?.map((ing: any) => ({
          inventoryItemId: ing.inventoryItemId,
          itemName: ing.inventoryItem?.name ?? "Unknown",
          quantity: String(Number(ing.quantity)),
          uom: ing.uom,
        })) ?? []
      );
    }
  }, [existingRecipe, isEdit]);

  const createMut = trpc.recipes.create.useMutation({
    onSuccess: () => {
      utils.recipes.listWithCosts.invalidate();
      utils.recipes.listCategories.invalidate();
      router.back();
    },
    onError: (err) => Alert.alert("Error", err.message),
  });

  const updateMut = trpc.recipes.update.useMutation({
    onSuccess: () => {
      utils.recipes.listWithCosts.invalidate();
      utils.recipes.listCategories.invalidate();
      utils.recipes.getById.invalidate({ id: recipeId! });
      router.back();
    },
    onError: (err) => Alert.alert("Error", err.message),
  });

  const isSaving = createMut.isPending || updateMut.isPending;

  function handleSave() {
    if (!selectedLocationId || !name.trim()) {
      Alert.alert("Missing Info", "Recipe name is required.");
      return;
    }
    const valid = ingredients.filter(
      (i) => i.inventoryItemId && Number(i.quantity) > 0
    );
    if (valid.length === 0) {
      Alert.alert("Missing Info", "Add at least one ingredient.");
      return;
    }
    const payload = {
      name: name.trim(),
      category: category.trim() || undefined,
      ingredients: valid.map((i) => ({
        inventoryItemId: i.inventoryItemId,
        quantity: Number(i.quantity),
        uom: i.uom as any,
      })),
    };

    if (isEdit) {
      updateMut.mutate({ id: recipeId!, ...payload, category: payload.category ?? null });
    } else {
      createMut.mutate({ locationId: selectedLocationId, ...payload });
    }
  }

  function addRow() {
    setIngredients((prev) => [
      ...prev,
      { inventoryItemId: "", itemName: "", quantity: "", uom: "oz" },
    ]);
  }

  function removeRow(index: number) {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  }

  function selectItem(index: number, item: any) {
    setIngredients((prev) =>
      prev.map((row, i) =>
        i === index
          ? { ...row, inventoryItemId: item.id, itemName: item.name }
          : row
      )
    );
    setPickerIndex(null);
    setPickerSearch("");
  }

  function updateRow(index: number, field: keyof IngredientRow, value: string) {
    setIngredients((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  const filteredPickerItems = pickerSearch
    ? inventoryItems?.filter((i) =>
        i.name.toLowerCase().includes(pickerSearch.toLowerCase())
      )
    : inventoryItems;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Recipe Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Margarita"
          placeholderTextColor="#5A6A7A"
        />

        <Text style={styles.label}>Category (optional)</Text>
        <TextInput
          style={styles.input}
          value={category}
          onChangeText={setCategory}
          placeholder="e.g. Cocktails"
          placeholderTextColor="#5A6A7A"
        />

        <Text style={[styles.label, { marginTop: 20 }]}>Ingredients</Text>

        {ingredients.map((ing, index) => (
          <View key={index} style={styles.ingredientCard}>
            <TouchableOpacity
              style={styles.itemPicker}
              onPress={() => {
                setPickerIndex(index);
                setPickerSearch("");
              }}
            >
              <Text
                style={[
                  styles.itemPickerText,
                  !ing.itemName && styles.placeholderText,
                ]}
                numberOfLines={1}
              >
                {ing.itemName || "Select item..."}
              </Text>
            </TouchableOpacity>

            <View style={styles.qtyRow}>
              <TextInput
                style={styles.qtyInput}
                value={ing.quantity}
                onChangeText={(v) => updateRow(index, "quantity", v)}
                placeholder="Qty"
                placeholderTextColor="#5A6A7A"
                keyboardType="decimal-pad"
              />
              <View style={styles.uomRow}>
                {UOM_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.uomChip,
                      ing.uom === opt.value && styles.uomChipActive,
                    ]}
                    onPress={() => updateRow(index, "uom", opt.value)}
                  >
                    <Text
                      style={[
                        styles.uomChipText,
                        ing.uom === opt.value && styles.uomChipTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => removeRow(index)}
              >
                <Text style={styles.removeBtnText}>X</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.addBtn} onPress={addRow}>
          <Text style={styles.addBtnText}>+ Add Ingredient</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="#0B1623" />
          ) : (
            <Text style={styles.saveBtnText}>
              {isEdit ? "Update Recipe" : "Create Recipe"}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Item picker modal */}
      <Modal
        visible={pickerIndex !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPickerIndex(null)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Inventory Item</Text>
            <TouchableOpacity onPress={() => setPickerIndex(null)}>
              <Text style={styles.modalClose}>Done</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.modalSearch}
            placeholder="Search items..."
            placeholderTextColor="#5A6A7A"
            value={pickerSearch}
            onChangeText={setPickerSearch}
            autoFocus
          />
          <FlatList
            data={filteredPickerItems ?? []}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.modalItem}
                onPress={() => selectItem(pickerIndex!, item)}
              >
                <Text style={styles.modalItemText}>{item.name}</Text>
                <Text style={styles.modalItemSub}>
                  {item.category?.name ?? ""}
                </Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.modalEmpty}>No items found</Text>
            }
          />
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623" },
  content: { padding: 16, paddingBottom: 40 },

  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#5A6A7A",
    textTransform: "uppercase",
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: "#16283F",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: "#EAF0FF",
    borderWidth: 1,
    borderColor: "#1E3550",
  },

  ingredientCard: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  itemPicker: {
    backgroundColor: "#0B1623",
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  itemPickerText: { fontSize: 14, color: "#EAF0FF" },
  placeholderText: { color: "#5A6A7A" },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  qtyInput: {
    backgroundColor: "#0B1623",
    borderRadius: 8,
    padding: 8,
    width: 60,
    fontSize: 14,
    color: "#EAF0FF",
    textAlign: "center",
  },
  uomRow: { flexDirection: "row", gap: 4, flex: 1 },
  uomChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: "#0B1623",
  },
  uomChipActive: { backgroundColor: "#E9B44C" },
  uomChipText: { fontSize: 11, color: "#5A6A7A", fontWeight: "600" },
  uomChipTextActive: { color: "#0B1623" },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#EF444430",
    justifyContent: "center",
    alignItems: "center",
  },
  removeBtnText: { fontSize: 12, color: "#EF4444", fontWeight: "700" },

  addBtn: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E9B44C40",
    borderStyle: "dashed",
    alignItems: "center",
    marginTop: 4,
    marginBottom: 24,
  },
  addBtnText: { fontSize: 14, color: "#E9B44C", fontWeight: "600" },

  saveBtn: {
    backgroundColor: "#E9B44C",
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: "center",
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 16, fontWeight: "700", color: "#0B1623" },

  // Modal
  modalContainer: { flex: 1, backgroundColor: "#0B1623" },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3550",
  },
  modalTitle: { fontSize: 17, fontWeight: "600", color: "#EAF0FF" },
  modalClose: { fontSize: 15, color: "#E9B44C", fontWeight: "600" },
  modalSearch: {
    backgroundColor: "#16283F",
    margin: 16,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: "#EAF0FF",
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  modalItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3550",
  },
  modalItemText: { fontSize: 15, color: "#EAF0FF" },
  modalItemSub: { fontSize: 12, color: "#5A6A7A", marginTop: 2 },
  modalEmpty: {
    textAlign: "center",
    color: "#5A6A7A",
    fontSize: 14,
    marginTop: 40,
  },
});
