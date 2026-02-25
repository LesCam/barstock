import { useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Alert,
  StyleSheet,
} from "react-native";
import { router } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";

const STATUS_COLORS: Record<string, string> = {
  red: "#EF4444",
  yellow: "#FBBF24",
  green: "#4CAF50",
};

interface EditedPar {
  parLevel: string;
  minLevel: string;
  reorderQty: string;
}

export default function ParLevelsScreen() {
  const { selectedLocationId, user } = useAuth();
  const [belowParOnly, setBelowParOnly] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Map<string, EditedPar>>(new Map());
  const [showSuggest, setShowSuggest] = useState(false);
  const utils = trpc.useUtils();

  const isManager =
    user?.highestRole === "manager" ||
    user?.highestRole === "business_admin" ||
    user?.highestRole === "platform_admin";

  const { data: items, isLoading } = trpc.parLevels.list.useQuery(
    { locationId: selectedLocationId! },
    { enabled: !!selectedLocationId }
  );

  const { data: suggestions, isLoading: suggestLoading } =
    trpc.parLevels.suggestPars.useQuery(
      { locationId: selectedLocationId!, leadTimeDays: 2, safetyStockDays: 1, bufferDays: 3 },
      { enabled: !!selectedLocationId && showSuggest }
    );

  const bulkUpsertMut = trpc.parLevels.bulkUpsert.useMutation({
    onSuccess: () => {
      utils.parLevels.list.invalidate();
      setEdits(new Map());
      setEditingId(null);
      Alert.alert("Saved", "Par levels updated successfully.");
    },
    onError: (err) => Alert.alert("Error", err.message),
  });

  const summary = useMemo(() => {
    if (!items) return { withPar: 0, belowMin: 0 };
    return {
      withPar: items.filter((i: any) => i.parLevelId).length,
      belowMin: items.filter((i: any) => i.needsReorder).length,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    if (!items) return [];
    if (belowParOnly) return items.filter((i: any) => i.needsReorder);
    return items;
  }, [items, belowParOnly]);

  function getEditValue(itemId: string, field: keyof EditedPar, original: number | null): string {
    const edit = edits.get(itemId);
    if (edit) return edit[field];
    return original != null ? String(original) : "";
  }

  function setEditField(itemId: string, field: keyof EditedPar, value: string, item: any) {
    setEdits((prev) => {
      const next = new Map(prev);
      const existing = next.get(itemId) ?? {
        parLevel: item.parLevel != null ? String(item.parLevel) : "",
        minLevel: item.minLevel != null ? String(item.minLevel) : "",
        reorderQty: item.reorderQty != null ? String(item.reorderQty) : "",
      };
      next.set(itemId, { ...existing, [field]: value });
      return next;
    });
  }

  function applySuggestion(sug: any) {
    setEdits((prev) => {
      const next = new Map(prev);
      next.set(sug.inventoryItemId, {
        parLevel: String(sug.suggestedParLevel),
        minLevel: String(sug.suggestedMinLevel),
        reorderQty: next.get(sug.inventoryItemId)?.reorderQty ?? "",
      });
      return next;
    });
  }

  function applyAllSuggestions() {
    if (!suggestions) return;
    setEdits((prev) => {
      const next = new Map(prev);
      for (const sug of suggestions) {
        next.set(sug.inventoryItemId, {
          parLevel: String(sug.suggestedParLevel),
          minLevel: String(sug.suggestedMinLevel),
          reorderQty: next.get(sug.inventoryItemId)?.reorderQty ?? "",
        });
      }
      return next;
    });
    setShowSuggest(false);
  }

  function handleSave() {
    if (!selectedLocationId || edits.size === 0) return;

    const editItems = Array.from(edits.entries())
      .filter(([, e]) => Number(e.parLevel) > 0)
      .map(([itemId, e]) => {
        const original = items?.find((i: any) => i.inventoryItemId === itemId);
        return {
          inventoryItemId: itemId,
          vendorId: original?.vendorId ?? "",
          parLevel: Number(e.parLevel) || 0,
          minLevel: Number(e.minLevel) || 0,
          reorderQty: e.reorderQty ? Number(e.reorderQty) : undefined,
          parUom: (original?.parUom ?? "unit") as "unit" | "package",
          leadTimeDays: original?.leadTimeDays ?? 1,
          safetyStockDays: original?.safetyStockDays ?? 0,
        };
      })
      .filter((i) => i.vendorId);

    if (editItems.length === 0) {
      Alert.alert("No Changes", "Edit at least one par level to save.");
      return;
    }

    bulkUpsertMut.mutate({ locationId: selectedLocationId, items: editItems });
  }

  if (!selectedLocationId) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No location selected.</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#E9B44C" style={{ marginTop: 40 }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredItems}
        keyExtractor={(item: any) => item.inventoryItemId}
        ListHeaderComponent={
          <>
            {/* Summary cards */}
            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Items with Par</Text>
                <Text style={styles.summaryValue}>{summary.withPar}</Text>
              </View>
              <View style={[styles.summaryCard, styles.summaryCardRed]}>
                <Text style={styles.summaryLabelRed}>Below Min</Text>
                <Text style={styles.summaryValueRed}>{summary.belowMin}</Text>
              </View>
            </View>

            {/* Manager actions row */}
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[
                  styles.filterPill,
                  belowParOnly && styles.filterPillActive,
                ]}
                onPress={() => setBelowParOnly(!belowParOnly)}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    belowParOnly && styles.filterPillTextActive,
                  ]}
                >
                  Below Par Only
                </Text>
              </TouchableOpacity>

              {isManager && (
                <>
                  <TouchableOpacity
                    style={styles.suggestPill}
                    onPress={() => setShowSuggest(true)}
                  >
                    <Text style={styles.suggestPillText}>Auto-Suggest</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.reorderPill}
                    onPress={() => router.push("/reorder" as any)}
                  >
                    <Text style={styles.reorderPillText}>Reorder</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </>
        }
        renderItem={({ item }: { item: any }) => {
          const dotColor = STATUS_COLORS[item.status] ?? "#3A4A5A";
          const daysLeft = item.daysToStockout;
          const isExpanded = editingId === item.inventoryItemId && isManager;

          return (
            <TouchableOpacity
              style={styles.itemRow}
              activeOpacity={0.7}
              onPress={() => {
                if (isManager) {
                  setEditingId(
                    editingId === item.inventoryItemId
                      ? null
                      : item.inventoryItemId
                  );
                } else {
                  router.push(`/inventory/${item.inventoryItemId}` as any);
                }
              }}
            >
              <View>
                <View style={styles.itemTopRow}>
                  <View style={styles.itemLeft}>
                    <View
                      style={[styles.statusDot, { backgroundColor: dotColor }]}
                    />
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {item.itemName}
                      </Text>
                      <Text style={styles.itemCategory}>
                        {item.categoryName ?? "Uncategorized"}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.itemCenter}>
                    <Text style={styles.levelText}>
                      {item.currentOnHand?.toFixed(1) ?? "—"}{" "}
                      <Text style={styles.levelDivider}>/</Text>{" "}
                      {item.parLevel?.toFixed(1) ?? "—"}
                    </Text>
                  </View>
                  <View style={styles.itemRight}>
                    {daysLeft != null ? (
                      <Text
                        style={[
                          styles.daysText,
                          daysLeft <= 3
                            ? styles.daysRed
                            : daysLeft <= 7
                            ? styles.daysYellow
                            : styles.daysMuted,
                        ]}
                      >
                        {daysLeft}d
                      </Text>
                    ) : (
                      <Text style={styles.daysMuted}>—</Text>
                    )}
                  </View>
                </View>

                {/* Inline edit fields */}
                {isExpanded && (
                  <View style={styles.editSection}>
                    <View style={styles.editRow}>
                      <Text style={styles.editLabel}>Par Level</Text>
                      <TextInput
                        style={styles.editInput}
                        value={getEditValue(item.inventoryItemId, "parLevel", item.parLevel)}
                        onChangeText={(v) => setEditField(item.inventoryItemId, "parLevel", v, item)}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor="#5A6A7A"
                      />
                    </View>
                    <View style={styles.editRow}>
                      <Text style={styles.editLabel}>Min Level</Text>
                      <TextInput
                        style={styles.editInput}
                        value={getEditValue(item.inventoryItemId, "minLevel", item.minLevel)}
                        onChangeText={(v) => setEditField(item.inventoryItemId, "minLevel", v, item)}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor="#5A6A7A"
                      />
                    </View>
                    <View style={styles.editRow}>
                      <Text style={styles.editLabel}>Reorder Qty</Text>
                      <TextInput
                        style={styles.editInput}
                        value={getEditValue(item.inventoryItemId, "reorderQty", item.reorderQty)}
                        onChangeText={(v) => setEditField(item.inventoryItemId, "reorderQty", v, item)}
                        keyboardType="decimal-pad"
                        placeholder="—"
                        placeholderTextColor="#5A6A7A"
                      />
                    </View>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              {belowParOnly
                ? "No items below par level."
                : "No par levels set yet."}
            </Text>
            <Text style={styles.emptySubtext}>
              Set par levels on the web to track stock levels here.
            </Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />

      {/* Floating save button */}
      {isManager && edits.size > 0 && (
        <TouchableOpacity
          style={styles.saveFloating}
          onPress={handleSave}
          disabled={bulkUpsertMut.isPending}
        >
          {bulkUpsertMut.isPending ? (
            <ActivityIndicator color="#0B1623" />
          ) : (
            <Text style={styles.saveFloatingText}>
              Save Changes ({edits.size})
            </Text>
          )}
        </TouchableOpacity>
      )}

      {/* Auto-Suggest Modal */}
      <Modal
        visible={showSuggest}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSuggest(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Suggested Par Levels</Text>
            <TouchableOpacity onPress={() => setShowSuggest(false)}>
              <Text style={styles.modalClose}>Close</Text>
            </TouchableOpacity>
          </View>

          {suggestLoading ? (
            <ActivityIndicator color="#E9B44C" style={{ marginTop: 40 }} />
          ) : !suggestions || suggestions.length === 0 ? (
            <Text style={styles.modalEmpty}>
              Not enough usage data to generate suggestions.
            </Text>
          ) : (
            <FlatList
              data={suggestions}
              keyExtractor={(s: any) => s.inventoryItemId}
              ListHeaderComponent={
                <TouchableOpacity
                  style={styles.applyAllBtn}
                  onPress={applyAllSuggestions}
                >
                  <Text style={styles.applyAllText}>
                    Apply All ({suggestions.length})
                  </Text>
                </TouchableOpacity>
              }
              renderItem={({ item: sug }: { item: any }) => (
                <View style={styles.sugRow}>
                  <View style={styles.sugInfo}>
                    <Text style={styles.sugName} numberOfLines={1}>
                      {sug.itemName}
                    </Text>
                    <Text style={styles.sugDetail}>
                      Avg: {sug.avgDailyUsage?.toFixed(1)}/day | Current:{" "}
                      {sug.existingParLevel ?? "—"} / {sug.existingMinLevel ?? "—"}
                    </Text>
                    <Text style={styles.sugSuggested}>
                      Suggested: Par {sug.suggestedParLevel} / Min{" "}
                      {sug.suggestedMinLevel}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.applyBtn}
                    onPress={() => applySuggestion(sug)}
                  >
                    <Text style={styles.applyBtnText}>Apply</Text>
                  </TouchableOpacity>
                </View>
              )}
              contentContainerStyle={{ padding: 16 }}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623" },
  listContent: { padding: 16, paddingBottom: 100 },

  // Summary cards
  summaryRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  summaryCard: {
    flex: 1,
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  summaryCardRed: { borderColor: "rgba(239, 68, 68, 0.3)" },
  summaryLabel: { fontSize: 12, color: "#8899AA", fontWeight: "600" },
  summaryLabelRed: { fontSize: 12, color: "#EF4444", fontWeight: "600" },
  summaryValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#EAF0FF",
    marginTop: 4,
  },
  summaryValueRed: {
    fontSize: 24,
    fontWeight: "700",
    color: "#EF4444",
    marginTop: 4,
  },

  // Actions
  actionsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "#16283F",
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  filterPillActive: { backgroundColor: "#E9B44C", borderColor: "#E9B44C" },
  filterPillText: { fontSize: 13, color: "#8899AA", fontWeight: "600" },
  filterPillTextActive: { color: "#0B1623" },
  suggestPill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "#16283F",
    borderWidth: 1,
    borderColor: "#2BA8A040",
  },
  suggestPillText: { fontSize: 13, color: "#2BA8A0", fontWeight: "600" },
  reorderPill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "#16283F",
    borderWidth: 1,
    borderColor: "#E9B44C40",
  },
  reorderPillText: { fontSize: 13, color: "#E9B44C", fontWeight: "600" },

  // Item rows
  itemRow: {
    backgroundColor: "#16283F",
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  itemTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  itemLeft: { flex: 1, flexDirection: "row", alignItems: "center" },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: "600", color: "#EAF0FF" },
  itemCategory: { fontSize: 12, color: "#5A6A7A", marginTop: 2 },
  itemCenter: { marginHorizontal: 12 },
  levelText: { fontSize: 14, fontWeight: "600", color: "#EAF0FF" },
  levelDivider: { color: "#5A6A7A", fontWeight: "400" },
  itemRight: { width: 40, alignItems: "flex-end" },
  daysText: { fontSize: 14, fontWeight: "700" },
  daysRed: { color: "#EF4444" },
  daysYellow: { color: "#FBBF24" },
  daysMuted: { color: "#5A6A7A" },

  // Edit section
  editSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#1E3550",
  },
  editRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  editLabel: { fontSize: 13, color: "#8899AA" },
  editInput: {
    backgroundColor: "#0B1623",
    borderRadius: 8,
    padding: 8,
    width: 80,
    fontSize: 14,
    color: "#EAF0FF",
    textAlign: "center",
    borderWidth: 1,
    borderColor: "#1E3550",
  },

  // Floating save
  saveFloating: {
    position: "absolute",
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: "#E9B44C",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  saveFloatingText: { fontSize: 16, fontWeight: "700", color: "#0B1623" },

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
  modalEmpty: {
    textAlign: "center",
    color: "#5A6A7A",
    fontSize: 14,
    marginTop: 40,
    paddingHorizontal: 24,
  },
  applyAllBtn: {
    backgroundColor: "#2BA8A020",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#2BA8A040",
  },
  applyAllText: { fontSize: 15, fontWeight: "600", color: "#2BA8A0" },
  sugRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16283F",
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  sugInfo: { flex: 1, marginRight: 12 },
  sugName: { fontSize: 14, fontWeight: "600", color: "#EAF0FF" },
  sugDetail: { fontSize: 12, color: "#5A6A7A", marginTop: 2 },
  sugSuggested: { fontSize: 12, color: "#2BA8A0", marginTop: 2, fontWeight: "500" },
  applyBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#E9B44C20",
  },
  applyBtnText: { fontSize: 13, color: "#E9B44C", fontWeight: "600" },
});
