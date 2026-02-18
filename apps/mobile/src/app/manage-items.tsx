import { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { UOM } from "@barstock/types";

const CONTAINER_UOMS = [
  { value: UOM.ml, label: "ml" },
  { value: UOM.oz, label: "oz" },
  { value: UOM.L, label: "L" },
] as const;

export default function ManageItemsScreen() {
  const router = useRouter();
  const { selectedLocationId, user } = useAuth();
  const locationId = selectedLocationId ?? user?.locationIds[0] ?? "";
  const businessId = user?.businessId ?? "";

  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scanTarget, setScanTarget] = useState<"search" | "form">("search");

  // Form state
  const [formName, setFormName] = useState("");
  const [formCategoryId, setFormCategoryId] = useState<string>("");
  const [formBarcode, setFormBarcode] = useState("");
  const [formContainerSize, setFormContainerSize] = useState("");
  const [formContainerUom, setFormContainerUom] = useState<UOM>(UOM.ml);
  const [formPackSize, setFormPackSize] = useState("");

  const utils = trpc.useUtils();

  const { data: items, isLoading } = trpc.inventory.list.useQuery(
    { locationId },
    { enabled: !!locationId }
  );

  const { data: categories } = trpc.itemCategories.list.useQuery(
    { businessId },
    { enabled: !!businessId }
  );

  const createMutation = trpc.inventory.create.useMutation({
    onSuccess: () => {
      utils.inventory.list.invalidate({ locationId });
      resetForm();
      setShowForm(false);
    },
    onError: (error) => {
      Alert.alert("Error", error.message ?? "Failed to create item.");
    },
  });

  const filteredItems = useMemo(() => {
    if (!items) return [];
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.category?.name ?? "").toLowerCase().includes(q) ||
        (item.barcode && item.barcode.toLowerCase().includes(q))
    );
  }, [items, search]);

  function resetForm() {
    setFormName("");
    setFormCategoryId(categories?.[0]?.id ?? "");
    setFormBarcode("");
    setFormContainerSize("");
    setFormContainerUom(UOM.ml);
    setFormPackSize("");
  }

  function handleCreate() {
    if (!formName.trim()) {
      Alert.alert("Name Required", "Please enter a name for the item.");
      return;
    }
    if (!formCategoryId) {
      Alert.alert("Category Required", "Please select a category for the item.");
      return;
    }

    const input: any = {
      locationId,
      name: formName.trim(),
      categoryId: formCategoryId,
      baseUom: UOM.units,
    };

    if (formBarcode.trim()) input.barcode = formBarcode.trim();

    const containerNum = parseFloat(formContainerSize);
    if (containerNum > 0) {
      input.containerSize = containerNum;
      input.containerUom = formContainerUom;
    }

    const packNum = parseInt(formPackSize, 10);
    if (packNum > 0) {
      input.packSize = packNum;
      input.packUom = UOM.units;
    }

    createMutation.mutate(input);
  }

  function handleScan(barcode: string) {
    setShowScanner(false);
    if (scanTarget === "form") {
      setFormBarcode(barcode);
    } else {
      setSearch(barcode);
    }
  }

  function openFormScanner() {
    setScanTarget("form");
    setShowScanner(true);
  }

  function openSearchScanner() {
    setScanTarget("search");
    setShowScanner(true);
  }

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search items..."
          placeholderTextColor="#5A6A7A"
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.scanBtn} onPress={openSearchScanner}>
          <Text style={styles.scanIcon}>&#x2B1A;</Text>
        </TouchableOpacity>
      </View>

      {/* Item list */}
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            {isLoading ? (
              <Text style={styles.emptyText}>Loading...</Text>
            ) : search.trim() ? (
              <Text style={styles.emptyText}>No items matching "{search}"</Text>
            ) : (
              <>
                <Text style={styles.emptyTitle}>No items yet</Text>
                <Text style={styles.emptyText}>
                  Tap "+ Add New Item" below to create your first inventory item.
                </Text>
              </>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push(`/inventory/${item.id}`)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemType}>{item.category?.name ?? "Uncategorized"}</Text>
            </View>
            {item.barcode && (
              <Text style={styles.itemBarcode}>#{item.barcode}</Text>
            )}
            <Text style={styles.chevron}>&#x203A;</Text>
          </TouchableOpacity>
        )}
      />

      {/* Add button */}
      <TouchableOpacity
        style={styles.addBtn}
        onPress={() => setShowForm(true)}
      >
        <Text style={styles.addBtnText}>+ Add New Item</Text>
      </TouchableOpacity>

      {/* Create form overlay */}
      {showForm && (
        <View style={styles.fullScreenOverlay}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={styles.addBackdrop}>
              <TouchableOpacity
                style={{ flex: 1 }}
                activeOpacity={1}
                onPress={() => { setShowForm(false); resetForm(); }}
              />
              <View style={styles.addSheet}>
                <ScrollView keyboardShouldPersistTaps="handled">
                  <View style={styles.addSheetHeader}>
                    <Text style={styles.addSheetTitle}>New Item</Text>
                    <TouchableOpacity onPress={() => { setShowForm(false); resetForm(); }}>
                      <Text style={styles.addSheetClose}>&#x2715;</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Name */}
                  <Text style={styles.fieldLabel}>Name *</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={formName}
                    onChangeText={setFormName}
                    placeholder="e.g. Bud Light 12-pack"
                    placeholderTextColor="#5A6A7A"
                    autoFocus
                  />

                  {/* Category */}
                  <Text style={styles.fieldLabel}>Category *</Text>
                  <View style={styles.typeGrid}>
                    {categories?.map((cat) => (
                      <TouchableOpacity
                        key={cat.id}
                        style={[
                          styles.typeChip,
                          formCategoryId === cat.id && styles.typeChipActive,
                        ]}
                        onPress={() => setFormCategoryId(cat.id)}
                      >
                        <Text
                          style={[
                            styles.typeChipText,
                            formCategoryId === cat.id && styles.typeChipTextActive,
                          ]}
                        >
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Barcode */}
                  <Text style={styles.fieldLabel}>Barcode</Text>
                  <View style={styles.barcodeRow}>
                    <TextInput
                      style={[styles.fieldInput, { flex: 1 }]}
                      value={formBarcode}
                      onChangeText={setFormBarcode}
                      placeholder="Optional"
                      placeholderTextColor="#5A6A7A"
                      keyboardType="number-pad"
                    />
                    <TouchableOpacity
                      style={styles.barcodeScanBtn}
                      onPress={openFormScanner}
                    >
                      <Text style={styles.scanIcon}>&#x2B1A;</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Container Size + UOM */}
                  <Text style={styles.fieldLabel}>Container Size</Text>
                  <View style={styles.containerRow}>
                    <TextInput
                      style={[styles.fieldInput, { flex: 1 }]}
                      value={formContainerSize}
                      onChangeText={setFormContainerSize}
                      placeholder="e.g. 750"
                      placeholderTextColor="#5A6A7A"
                      keyboardType="decimal-pad"
                    />
                    <View style={styles.uomPicker}>
                      {CONTAINER_UOMS.map((u) => (
                        <TouchableOpacity
                          key={u.value}
                          style={[
                            styles.uomChip,
                            formContainerUom === u.value && styles.uomChipActive,
                          ]}
                          onPress={() => setFormContainerUom(u.value)}
                        >
                          <Text
                            style={[
                              styles.uomChipText,
                              formContainerUom === u.value && styles.uomChipTextActive,
                            ]}
                          >
                            {u.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Pack Size */}
                  <Text style={styles.fieldLabel}>Pack Size</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={formPackSize}
                    onChangeText={setFormPackSize}
                    placeholder="e.g. 12 for a case"
                    placeholderTextColor="#5A6A7A"
                    keyboardType="number-pad"
                  />

                  {/* Save */}
                  <TouchableOpacity
                    style={[styles.saveBtn, createMutation.isPending && styles.saveBtnDisabled]}
                    onPress={handleCreate}
                    disabled={createMutation.isPending}
                  >
                    <Text style={styles.saveBtnText}>
                      {createMutation.isPending ? "Saving..." : "Save Item"}
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}

      {/* Barcode scanner overlay */}
      {showScanner && (
        <View style={styles.fullScreenOverlay}>
          <BarcodeScanner
            onScan={handleScan}
            onClose={() => setShowScanner(false)}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B1623",
    padding: 16,
  },
  searchRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    height: 44,
    backgroundColor: "#16283F",
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#1E3550",
    color: "#EAF0FF",
    fontSize: 15,
  },
  scanBtn: {
    width: 44,
    height: 44,
    backgroundColor: "#E9B44C",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  scanIcon: {
    fontSize: 20,
    color: "#0B1623",
    fontWeight: "bold",
  },
  listContent: {
    paddingBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16283F",
    borderRadius: 8,
    marginBottom: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  itemName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#EAF0FF",
  },
  itemType: {
    fontSize: 12,
    color: "#5A6A7A",
    marginTop: 2,
  },
  itemBarcode: {
    fontSize: 12,
    color: "#5A6A7A",
    marginRight: 8,
  },
  chevron: {
    fontSize: 22,
    color: "#5A6A7A",
    fontWeight: "300",
  },
  emptyBox: {
    paddingVertical: 40,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#8899AA",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#5A6A7A",
    textAlign: "center",
  },
  addBtn: {
    backgroundColor: "#E9B44C",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 12,
  },
  addBtnText: {
    color: "#0B1623",
    fontSize: 16,
    fontWeight: "600",
  },
  fullScreenOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  addBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  addSheet: {
    backgroundColor: "#0B1623",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: "85%",
  },
  addSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  addSheetTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#EAF0FF",
  },
  addSheetClose: {
    fontSize: 18,
    color: "#8899AA",
    padding: 4,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8899AA",
    marginBottom: 6,
    marginTop: 12,
  },
  fieldInput: {
    height: 44,
    backgroundColor: "#16283F",
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#1E3550",
    color: "#EAF0FF",
    fontSize: 15,
  },
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#16283F",
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  typeChipActive: {
    backgroundColor: "#E9B44C",
    borderColor: "#E9B44C",
  },
  typeChipText: {
    fontSize: 13,
    color: "#8899AA",
    fontWeight: "500",
  },
  typeChipTextActive: {
    color: "#0B1623",
  },
  barcodeRow: {
    flexDirection: "row",
    gap: 8,
  },
  barcodeScanBtn: {
    width: 44,
    height: 44,
    backgroundColor: "#E9B44C",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  containerRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  uomPicker: {
    flexDirection: "row",
    gap: 4,
  },
  uomChip: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#16283F",
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  uomChipActive: {
    backgroundColor: "#E9B44C",
    borderColor: "#E9B44C",
  },
  uomChipText: {
    fontSize: 13,
    color: "#8899AA",
    fontWeight: "500",
  },
  uomChipTextActive: {
    color: "#0B1623",
  },
  saveBtn: {
    backgroundColor: "#E9B44C",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 24,
    marginBottom: 16,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: "#0B1623",
    fontSize: 16,
    fontWeight: "600",
  },
});
