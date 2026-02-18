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
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { ItemSearchBar } from "@/components/ItemSearchBar";
import { TareWeightEditModal } from "@/components/TareWeightEditModal";
import { CreateItemFromScanModal } from "@/components/CreateItemFromScanModal";
import { scaleManager } from "@/lib/scale/scale-manager";

interface TemplateRow {
  id: string;
  inventoryItemId: string;
  containerSizeMl: number;
  emptyBottleWeightG: number | null;
  fullBottleWeightG: number | null;
  densityGPerMl: number | null;
  inventoryItem: { name: string; type: string; barcode: string | null };
}

interface SelectedItem {
  id: string;
  name: string;
  type: string;
  barcode: string | null;
  containerSize: unknown;
  prefill?: {
    tareG: number | null;
    fullG: number | null;
    containerMl: number;
    density: number | null;
  };
}

export default function TareWeightsScreen() {
  const router = useRouter();
  const { selectedLocationId, user } = useAuth();
  const locationId = selectedLocationId ?? user?.locationIds[0] ?? "";

  const [search, setSearch] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [showAddSearch, setShowAddSearch] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TemplateRow | null>(null);
  const [viewingTemplate, setViewingTemplate] = useState<TemplateRow | null>(null);
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
    onError: (error, variables) => {
      if (error.data?.code === "CONFLICT") {
        Alert.alert(
          "Template Exists",
          error.message,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Override",
              onPress: () => createMutation.mutate({ ...variables, force: true }),
            },
          ]
        );
      } else {
        Alert.alert("Error", error.message ?? "Failed to create template.");
      }
    },
  });

  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    const list = [...(templates as TemplateRow[])].sort((a, b) =>
      a.inventoryItem.name.localeCompare(b.inventoryItem.name)
    );
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (t) =>
        t.inventoryItem.name.toLowerCase().includes(q) ||
        (t.inventoryItem.barcode && t.inventoryItem.barcode.includes(q))
    );
  }, [templates, search]);


  function promptScaleOrEdit(template: TemplateRow) {
    if (scaleManager.isConnected) {
      setEditingTemplate(template);
      return;
    }
    Alert.alert(
      "Scale Not Connected",
      "Connect to a scale for live weighing, or edit weights manually.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Edit Manually", onPress: () => setEditingTemplate(template) },
        { text: "Connect Scale", onPress: () => router.push("/connect-scale") },
      ]
    );
  }

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

  function handleEditSave(emptyBottleWeightG: number | null, fullBottleWeightG: number | null) {
    if (!editingTemplate) return;
    if (emptyBottleWeightG != null && fullBottleWeightG != null) {
      // Both measured — derive actual density
      const containerMl = Number(editingTemplate.containerSizeMl);
      const liquidG = fullBottleWeightG - emptyBottleWeightG;
      const densityGPerMl = (liquidG > 0 && containerMl > 0) ? liquidG / containerMl : undefined;
      updateMutation.mutate({
        templateId: editingTemplate.id,
        emptyBottleWeightG,
        fullBottleWeightG,
        densityGPerMl,
      });
    } else {
      // Only one weight — store measured one, null the other
      updateMutation.mutate({
        templateId: editingTemplate.id,
        emptyBottleWeightG: emptyBottleWeightG ?? null,
        fullBottleWeightG: fullBottleWeightG ?? null,
      });
    }
  }

  const updateItemMutation = trpc.inventory.update.useMutation();

  function handleAddSave(emptyBottleWeightG: number | null, fullBottleWeightG: number | null, name?: string, containerSizeMl?: number) {
    if (!addingItem) return;
    const sizeMl = containerSizeMl ?? (Number(addingItem.containerSize) || 750);

    // Update inventory item name/container if changed
    const originalSizeMl = Number(addingItem.containerSize) || 750;
    if (name && (name !== addingItem.name || sizeMl !== originalSizeMl)) {
      updateItemMutation.mutate({ id: addingItem.id, name, containerSize: sizeMl });
    }

    // Calculate actual density when both weights are provided
    const densityGPerMl = (emptyBottleWeightG != null && fullBottleWeightG != null)
      ? (() => { const liquidG = fullBottleWeightG - emptyBottleWeightG; return (liquidG > 0 && sizeMl > 0) ? liquidG / sizeMl : undefined; })()
      : undefined;

    createMutation.mutate({
      businessId: user?.businessId,
      locationId,
      inventoryItemId: addingItem.id,
      containerSizeMl: sizeMl,
      emptyBottleWeightG: emptyBottleWeightG ?? undefined,
      fullBottleWeightG: fullBottleWeightG ?? undefined,
      densityGPerMl,
    });
  }

  function handleItemSelected(item: SelectedItem) {
    setShowAddSearch(false);
    addItemWithPrefill(item);
  }

  function addItemWithPrefill(item: SelectedItem) {
    // Check if this item already has a template — pre-fill weights
    const allTemplates = (templates as TemplateRow[]) ?? [];
    const existing = allTemplates.find((t) => t.inventoryItemId === item.id);
    if (existing) {
      item.prefill = {
        tareG: existing.emptyBottleWeightG != null ? Number(existing.emptyBottleWeightG) : null,
        fullG: existing.fullBottleWeightG != null ? Number(existing.fullBottleWeightG) : null,
        containerMl: Number(existing.containerSizeMl),
        density: existing.densityGPerMl != null ? Number(existing.densityGPerMl) : null,
      };
    }
    setAddingItem(item);
  }

  async function handleScan(barcode: string) {
    // Close scanner first — it's a plain View overlay, no Modal dismiss needed
    setShowScanner(false);

    try {
      const item = await utils.inventory.getByBarcode.fetch({
        locationId,
        barcode,
      });
      if (item) {
        addItemWithPrefill({
          id: item.id,
          name: (item as any).name,
          type: (item as any).type,
          barcode: (item as any).barcode,
          containerSize: (item as any).containerSize,
        });
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
          placeholderTextColor="#5A6A7A"
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
        <Text style={[styles.headerText, { width: 60, textAlign: "center" }]}>
          Tare
        </Text>
        <Text style={[styles.headerText, { width: 60, textAlign: "center" }]}>
          Full
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
            {isLoading ? (
              <Text style={styles.emptyText}>Loading...</Text>
            ) : search.trim() ? (
              <Text style={styles.emptyText}>No bottles matching "{search}"</Text>
            ) : (
              <>
                <Text style={styles.emptyTitle}>No bottles yet</Text>
                <Text style={styles.emptyText}>
                  Tap "+ Add New Bottle" below or scan a barcode to set up your first tare weight.
                </Text>
              </>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setViewingTemplate(item)}>
              <Text style={styles.itemName}>{item.inventoryItem.name}</Text>
              {item.inventoryItem.barcode && (
                <Text style={styles.itemBarcode}>
                  #{item.inventoryItem.barcode}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.weightCell}
              onPress={() => promptScaleOrEdit(item)}
            >
              <Text style={styles.weightText}>
                {item.emptyBottleWeightG != null
                  ? `${Math.round(Number(item.emptyBottleWeightG))}g`
                  : (() => {
                      const d = Number(item.densityGPerMl) || 0.95;
                      const derived = Number(item.fullBottleWeightG) - Number(item.containerSizeMl) * d;
                      return `~${Math.round(derived)}g`;
                    })()}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.weightCell}
              onPress={() => promptScaleOrEdit(item)}
            >
              <Text style={styles.weightText}>
                {item.fullBottleWeightG != null
                  ? `${Math.round(Number(item.fullBottleWeightG))}g`
                  : (() => {
                      const d = Number(item.densityGPerMl) || 0.95;
                      const derived = Number(item.emptyBottleWeightG) + Number(item.containerSizeMl) * d;
                      return `~${Math.round(derived)}g`;
                    })()}
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
          currentTareWeightG={editingTemplate.emptyBottleWeightG != null ? Number(editingTemplate.emptyBottleWeightG) : undefined}
          currentFullWeightG={editingTemplate.fullBottleWeightG != null ? Number(editingTemplate.fullBottleWeightG) : undefined}
          containerSizeMl={Number(editingTemplate.containerSizeMl)}
          densityGPerMl={editingTemplate.densityGPerMl != null ? Number(editingTemplate.densityGPerMl) : null}
          onSave={handleEditSave}
          onCancel={() => setEditingTemplate(null)}
        />
      )}

      {/* Add (new template) modal — editable name & container, pre-filled if existing */}
      {addingItem && (
        <TareWeightEditModal
          key={addingItem.id + (addingItem.prefill ? "-prefill" : "")}
          visible
          editable
          itemName={addingItem.name}
          containerSizeMl={addingItem.prefill?.containerMl ?? (Number(addingItem.containerSize) || 750)}
          currentTareWeightG={addingItem.prefill?.tareG ?? undefined}
          currentFullWeightG={addingItem.prefill?.fullG ?? undefined}
          densityGPerMl={addingItem.prefill?.density}
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

      {/* Read-only bottle info overlay */}
      {viewingTemplate && (
        <View style={styles.fullScreenOverlay}>
          <View style={styles.addBackdrop}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setViewingTemplate(null)} />
            <View style={styles.infoSheet}>
              <Text style={styles.infoTitle}>{viewingTemplate.inventoryItem.name}</Text>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Barcode</Text>
                <Text style={styles.infoValue}>
                  {viewingTemplate.inventoryItem.barcode || "—"}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Container Size</Text>
                <Text style={styles.infoValue}>
                  {Number(viewingTemplate.containerSizeMl)} ml
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Tare Weight</Text>
                <Text style={styles.infoValue}>
                  {viewingTemplate.emptyBottleWeightG != null
                    ? `${Math.round(Number(viewingTemplate.emptyBottleWeightG))} g`
                    : (() => {
                        const d = Number(viewingTemplate.densityGPerMl) || 0.95;
                        const derived = Number(viewingTemplate.fullBottleWeightG) - Number(viewingTemplate.containerSizeMl) * d;
                        return `~${Math.round(derived)} g (est.)`;
                      })()}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Full Weight</Text>
                <Text style={styles.infoValue}>
                  {viewingTemplate.fullBottleWeightG != null
                    ? `${Math.round(Number(viewingTemplate.fullBottleWeightG))} g`
                    : (() => {
                        const d = Number(viewingTemplate.densityGPerMl) || 0.95;
                        const derived = Number(viewingTemplate.emptyBottleWeightG) + Number(viewingTemplate.containerSizeMl) * d;
                        return `~${Math.round(derived)} g (est.)`;
                      })()}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Density</Text>
                <Text style={styles.infoValue}>
                  {viewingTemplate.densityGPerMl != null
                    ? `${Number(viewingTemplate.densityGPerMl).toFixed(2)} g/ml`
                    : "—"}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.infoCloseBtn}
                onPress={() => setViewingTemplate(null)}
              >
                <Text style={styles.infoCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
  heading: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#EAF0FF",
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3550",
  },
  headerText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#5A6A7A",
    textTransform: "uppercase",
  },
  listContent: {
    paddingBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16283F",
    borderRadius: 8,
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  itemName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#EAF0FF",
  },
  itemBarcode: {
    fontSize: 12,
    color: "#5A6A7A",
    marginTop: 2,
  },
  weightCell: {
    width: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  weightText: {
    fontSize: 14,
    color: "#EAF0FF",
    fontWeight: "500",
  },
  editIcon: {
    fontSize: 14,
    color: "#E9B44C",
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
    color: "#EAF0FF",
  },
  addSheetClose: {
    fontSize: 18,
    color: "#8899AA",
    padding: 4,
  },
  infoSheet: {
    backgroundColor: "#16283F",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#EAF0FF",
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3550",
  },
  infoLabel: {
    fontSize: 15,
    color: "#8899AA",
  },
  infoValue: {
    fontSize: 15,
    fontWeight: "500",
    color: "#EAF0FF",
  },
  infoCloseBtn: {
    backgroundColor: "#1E3550",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 24,
  },
  infoCloseBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#EAF0FF",
  },
});
