import { useState, useMemo, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  StyleSheet,
} from "react-native";
// Note: Scanner and Add-search use absolute-positioned overlays instead of Modal
// to avoid iOS Modal stacking conflicts that prevent subsequent modals from presenting.
import { useAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { ItemSearchBar } from "@/components/ItemSearchBar";
import { TareWeightEditModal } from "@/components/TareWeightEditModal";
import { CreateItemFromScanModal } from "@/components/CreateItemFromScanModal";

interface TemplateRow {
  id: string;
  inventoryItemId: string;
  containerSizeMl: number;
  emptyBottleWeightG: number;
  fullBottleWeightG: number;
  densityGPerMl: number | null;
  inventoryItem: { name: string; type: string; barcode: string | null };
}

interface SelectedItem {
  id: string;
  name: string;
  type: string;
  barcode: string | null;
  containerSize: unknown;
}

export default function TareWeightsScreen() {
  const { selectedLocationId, user } = useAuth();
  const locationId = selectedLocationId ?? user?.locationIds[0] ?? "";

  const [search, setSearch] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [showAddSearch, setShowAddSearch] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TemplateRow | null>(null);
  const [addingItem, setAddingItem] = useState<SelectedItem | null>(null);
  const [creatingFromScan, setCreatingFromScan] = useState<{ barcode: string } | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const utils = trpc.useUtils();

  const { data: templates, isLoading } = trpc.scale.listTemplates.useQuery(
    { locationId },
    { enabled: !!locationId }
  );

  const updateMutation = trpc.scale.updateTemplate.useMutation({
    onSuccess: () => {
      utils.scale.listTemplates.invalidate({ locationId });
      setEditingTemplate(null);
    },
  });

  const deleteMutation = trpc.scale.deleteTemplate.useMutation({
    onSuccess: () => utils.scale.listTemplates.invalidate({ locationId }),
    onError: (error, variables) => {
      if (error.data?.code === "PRECONDITION_FAILED") {
        Alert.alert(
          "Template In Use",
          error.message + "\n\nThis is a soft delete — historical data will be preserved.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Remove Anyway",
              style: "destructive",
              onPress: () => deleteMutation.mutate({ templateId: variables.templateId, force: true }),
            },
          ]
        );
      } else {
        Alert.alert("Error", error.message ?? "Failed to delete template.");
      }
    },
  });

  const createMutation = trpc.scale.createTemplate.useMutation({
    onSuccess: () => {
      utils.scale.listTemplates.invalidate({ locationId });
      setAddingItem(null);
      setShowAddSearch(false);
    },
  });

  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    const list = templates as TemplateRow[];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (t) =>
        t.inventoryItem.name.toLowerCase().includes(q) ||
        (t.inventoryItem.barcode && t.inventoryItem.barcode.includes(q))
    );
  }, [templates, search]);

  function handleDelete(template: TemplateRow) {
    Alert.alert(
      "Remove Template",
      `Remove tare weight for "${template.inventoryItem.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => deleteMutation.mutate({ templateId: template.id }),
        },
      ]
    );
  }

  function handleEditSave(emptyBottleWeightG: number, fullBottleWeightG: number) {
    if (!editingTemplate) return;
    // Calculate actual density when both weights are measured
    const containerMl = Number(editingTemplate.containerSizeMl);
    const liquidG = fullBottleWeightG - emptyBottleWeightG;
    const densityGPerMl = (liquidG > 0 && containerMl > 0) ? liquidG / containerMl : undefined;
    updateMutation.mutate({
      templateId: editingTemplate.id,
      emptyBottleWeightG,
      fullBottleWeightG,
      densityGPerMl,
    });
  }

  const updateItemMutation = trpc.inventory.update.useMutation();

  function handleAddSave(emptyBottleWeightG: number, fullBottleWeightG: number, name?: string, containerSizeMl?: number) {
    if (!addingItem) return;
    const sizeMl = containerSizeMl ?? (Number(addingItem.containerSize) || 750);

    // Update inventory item name/container if changed
    const originalSizeMl = Number(addingItem.containerSize) || 750;
    if (name && (name !== addingItem.name || sizeMl !== originalSizeMl)) {
      updateItemMutation.mutate({ id: addingItem.id, name, containerSize: sizeMl });
    }

    // Calculate actual density when both weights are provided
    const liquidG = fullBottleWeightG - emptyBottleWeightG;
    const densityGPerMl = (liquidG > 0 && sizeMl > 0) ? liquidG / sizeMl : undefined;

    createMutation.mutate({
      businessId: user?.businessId,
      locationId,
      inventoryItemId: addingItem.id,
      containerSizeMl: sizeMl,
      emptyBottleWeightG,
      fullBottleWeightG,
      densityGPerMl,
    });
  }

  function handleItemSelected(item: SelectedItem) {
    setShowAddSearch(false);
    setAddingItem(item);
  }

  async function handleScan(barcode: string) {
    // Close scanner first — it's a plain View overlay, no Modal dismiss needed
    setShowScanner(false);

    const allTemplates = (templates as TemplateRow[]) ?? [];
    const found = allTemplates.find((t) => t.inventoryItem.barcode === barcode);

    if (found) {
      const idx = filteredTemplates.findIndex((t) => t.id === found.id);
      if (idx >= 0) {
        flatListRef.current?.scrollToIndex({ index: idx, animated: true });
      }
      const tareG = Math.round(Number(found.emptyBottleWeightG));
      Alert.alert(
        "Already Exists",
        `"${found.inventoryItem.name}" already has a tare weight of ${tareG} g.`,
        [
          { text: "Edit", onPress: () => setEditingTemplate(found) },
          { text: "OK", style: "cancel" },
        ]
      );
      return;
    }

    try {
      const item = await utils.inventory.getByBarcode.fetch({
        locationId,
        barcode,
      });
      if (item) {
        setAddingItem(item as SelectedItem);
      } else {
        setCreatingFromScan({ barcode });
      }
    } catch {
      setCreatingFromScan({ barcode });
    }
  }

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search bottles..."
          placeholderTextColor="#999"
          returnKeyType="search"
        />
        <TouchableOpacity
          style={styles.scanBtn}
          onPress={() => setShowScanner(true)}
        >
          <Text style={styles.scanIcon}>&#x2B1A;</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.heading}>Tare Weight Management</Text>

      {/* Column headers */}
      <View style={styles.headerRow}>
        <Text style={[styles.headerText, { flex: 1 }]}>Bottle</Text>
        <Text style={[styles.headerText, { width: 100, textAlign: "center" }]}>
          Tare Weight
        </Text>
        <Text style={[styles.headerText, { width: 56, textAlign: "center" }]}>
          Remove
        </Text>
      </View>

      {/* Template list */}
      <FlatList
        ref={flatListRef}
        data={filteredTemplates}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              {isLoading ? "Loading..." : "No tare weight templates found."}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.inventoryItem.name}</Text>
              {item.inventoryItem.barcode && (
                <Text style={styles.itemBarcode}>
                  #{item.inventoryItem.barcode}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.weightCell}
              onPress={() => setEditingTemplate(item)}
            >
              <Text style={styles.weightText}>
                {Math.round(Number(item.emptyBottleWeightG))} g
              </Text>
              <Text style={styles.editIcon}>&#x270E;</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteCell}
              onPress={() => handleDelete(item)}
            >
              <Text style={styles.deleteIcon}>&#x1F5D1;</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      {/* Add button */}
      <TouchableOpacity
        style={styles.addBtn}
        onPress={() => setShowAddSearch(true)}
      >
        <Text style={styles.addBtnText}>+ Add New Bottle</Text>
      </TouchableOpacity>

      {/* Edit modal */}
      {editingTemplate && (
        <TareWeightEditModal
          visible
          itemName={editingTemplate.inventoryItem.name}
          currentTareWeightG={Number(editingTemplate.emptyBottleWeightG)}
          currentFullWeightG={Number(editingTemplate.fullBottleWeightG)}
          containerSizeMl={Number(editingTemplate.containerSizeMl)}
          onSave={handleEditSave}
          onCancel={() => setEditingTemplate(null)}
        />
      )}

      {/* Add (new template) modal — editable name & container */}
      {addingItem && (
        <TareWeightEditModal
          visible
          editable
          itemName={addingItem.name}
          containerSizeMl={Number(addingItem.containerSize) || 750}
          onSave={handleAddSave}
          onCancel={() => setAddingItem(null)}
        />
      )}

      {/* Quick-create from scan (item not found) */}
      {creatingFromScan && (
        <CreateItemFromScanModal
          key={creatingFromScan.barcode}
          barcode={creatingFromScan.barcode}
          locationId={locationId}
          onSuccess={() => {
            utils.scale.listTemplates.invalidate({ locationId });
            setCreatingFromScan(null);
          }}
          onCancel={() => setCreatingFromScan(null)}
        />
      )}

      {/* Add search — full-screen overlay instead of Modal */}
      {showAddSearch && (
        <View style={styles.fullScreenOverlay}>
          <View style={styles.addBackdrop}>
            <View style={styles.addSheet}>
              <View style={styles.addSheetHeader}>
                <Text style={styles.addSheetTitle}>Select Item</Text>
                <TouchableOpacity onPress={() => setShowAddSearch(false)}>
                  <Text style={styles.addSheetClose}>&#x2715;</Text>
                </TouchableOpacity>
              </View>
              <ItemSearchBar
                locationId={locationId}
                onItemSelected={(item) => handleItemSelected(item as SelectedItem)}
                itemTypeFilter={["liquor", "wine"]}
                placeholder="Search liquor/wine items..."
              />
            </View>
          </View>
        </View>
      )}

      {/* Barcode scanner — full-screen overlay instead of Modal to avoid iOS Modal conflicts */}
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
    backgroundColor: "#f9fafb",
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
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    color: "#1a1a1a",
    fontSize: 15,
  },
  scanBtn: {
    width: 44,
    height: 44,
    backgroundColor: "#2563eb",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  scanIcon: {
    fontSize: 20,
    color: "#fff",
    fontWeight: "bold",
  },
  heading: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1a1a1a",
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#999",
    textTransform: "uppercase",
  },
  listContent: {
    paddingBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 8,
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  itemName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1a1a1a",
  },
  itemBarcode: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },
  weightCell: {
    width: 100,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  weightText: {
    fontSize: 14,
    color: "#1a1a1a",
    fontWeight: "500",
  },
  editIcon: {
    fontSize: 14,
    color: "#2563eb",
  },
  deleteCell: {
    width: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteIcon: {
    fontSize: 18,
    color: "#dc2626",
  },
  emptyBox: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    color: "#999",
  },
  addBtn: {
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 12,
  },
  addBtnText: {
    color: "#fff",
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
    backgroundColor: "#f9fafb",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    minHeight: 400,
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
    color: "#1a1a1a",
  },
  addSheetClose: {
    fontSize: 18,
    color: "#999",
    padding: 4,
  },
});
