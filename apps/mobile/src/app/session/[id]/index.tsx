import { useState, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  SectionList,
  ScrollView,
  Modal,
  StyleSheet,
  Alert,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";
import { VarianceReasonModal } from "@/components/VarianceReasonModal";
import type { VarianceReason } from "@barstock/types";

interface BarArea {
  id: string;
  name: string;
  subAreas: { id: string; name: string; sortOrder: number }[];
}

interface UncountedItem {
  inventoryItemId: string;
  name: string;
  type: string;
  baseUom: string;
  subAreaName: string;
  acknowledged: boolean;
}

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { selectedLocationId } = useAuth();
  const utils = trpc.useUtils();

  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [selectedSubAreaId, setSelectedSubAreaId] = useState<string | null>(null);
  const [showVerification, setShowVerification] = useState(false);
  const [uncountedItems, setUncountedItems] = useState<UncountedItem[]>([]);
  const [varianceItem, setVarianceItem] = useState<{
    itemId: string;
    name: string;
    variance: number;
  } | null>(null);
  const [varianceReasons, setVarianceReasons] = useState<
    Array<{ itemId: string; reason: VarianceReason }>
  >([]);

  const { data: session, isLoading } = trpc.sessions.getById.useQuery({ id: id! });

  const { data: areas } = trpc.areas.listBarAreas.useQuery(
    { locationId: selectedLocationId! },
    { enabled: !!selectedLocationId }
  );

  // Live expected items for currently selected area
  const { data: expectedItems } = trpc.sessions.expectedItemsForArea.useQuery(
    {
      locationId: selectedLocationId!,
      barAreaId: selectedAreaId!,
      subAreaId: selectedSubAreaId ?? undefined,
    },
    { enabled: !!selectedLocationId && !!selectedAreaId }
  );

  // Compute which expected items have been counted in this session
  const expectedChecklist = useMemo(() => {
    if (!expectedItems || !session?.lines) return [];
    const countedItemIds = new Set(
      session.lines
        .filter((l: any) =>
          selectedSubAreaId
            ? l.subArea?.id === selectedSubAreaId
            : l.subArea?.barArea?.id === selectedAreaId
        )
        .map((l: any) => l.inventoryItemId)
    );
    return expectedItems.map((item: any) => ({
      ...item,
      counted: countedItemIds.has(item.inventoryItemId),
    }));
  }, [expectedItems, session?.lines, selectedAreaId, selectedSubAreaId]);

  const expectedTotal = expectedChecklist.length;
  const expectedCounted = expectedChecklist.filter((i: any) => i.counted).length;

  function handleExpectedItemTap(item: { inventoryItemId: string; name: string; type: string }) {
    if (!areaSelected) return;
    const params = `subAreaId=${selectedSubAreaId ?? ""}&areaName=${encodeURIComponent(areaLabel)}&itemId=${item.inventoryItemId}`;

    if (item.type === "liquor" || item.type === "wine") {
      Alert.alert(item.name, "How do you want to count this?", [
        {
          text: "Weigh Bottle",
          onPress: () => router.push(`/session/${id}/liquor?${params}` as any),
        },
        {
          text: "Full Unit Count",
          onPress: () => router.push(`/session/${id}/packaged?${params}` as any),
        },
        { text: "Cancel", style: "cancel" },
      ]);
    } else {
      router.push(`/session/${id}/packaged?${params}` as any);
    }
  }

  const closeMutation = trpc.sessions.close.useMutation({
    onSuccess() {
      setShowVerification(false);
      Alert.alert("Session Closed", "Adjustments have been created.");
      utils.sessions.getById.invalidate({ id: id! });
    },
    onError(error: { message: string }) {
      Alert.alert("Error", error.message);
    },
  });

  // Resolve selected area/subarea objects
  const selectedArea = areas?.find((a: BarArea) => a.id === selectedAreaId) ?? null;
  const selectedSubArea = selectedArea?.subAreas.find(
    (sa: { id: string }) => sa.id === selectedSubAreaId
  ) ?? null;

  // Auto-select first area if none selected
  if (areas?.length && !selectedAreaId) {
    const first = areas[0] as BarArea;
    setSelectedAreaId(first.id);
    if (first.subAreas.length > 0) {
      setSelectedSubAreaId(first.subAreas[0].id);
    }
  }

  // When area changes, auto-select first sub-area
  function handleAreaSelect(area: BarArea) {
    setSelectedAreaId(area.id);
    if (area.subAreas.length > 0) {
      setSelectedSubAreaId(area.subAreas[0].id);
    } else {
      setSelectedSubAreaId(null);
    }
  }

  // Group session lines by bar area for display
  const groupedLines = useMemo(() => {
    if (!session?.lines) return [];

    const groups = new Map<string, { areaName: string; lines: typeof session.lines }>();

    for (const line of session.lines) {
      const areaName = line.subArea?.barArea?.name ?? "No Area";
      const key = line.subArea?.barArea?.id ?? "none";
      if (!groups.has(key)) {
        groups.set(key, { areaName, lines: [] });
      }
      groups.get(key)!.lines.push(line);
    }

    return Array.from(groups.entries()).map(([key, group]) => ({
      title: group.areaName,
      data: group.lines,
    }));
  }, [session?.lines]);

  // Get distinct bar area IDs worked this session
  const workedAreaIds = useMemo(() => {
    if (!session?.lines) return [];
    const ids = new Set<string>();
    for (const line of session.lines) {
      if (line.subArea?.barArea?.id) {
        ids.add(line.subArea.barArea.id);
      }
    }
    return Array.from(ids);
  }, [session?.lines]);

  // Handle close session — triggers verification flow
  async function handleCloseSession() {
    if (workedAreaIds.length === 0) {
      // No area-tagged items — just close directly
      closeMutation.mutate({ sessionId: id! });
      return;
    }

    // Fetch expected items for each worked area and compare
    try {
      const allExpected: UncountedItem[] = [];

      for (const areaId of workedAreaIds) {
        const expected = await utils.sessions.expectedItemsForArea.fetch({
          locationId: selectedLocationId!,
          barAreaId: areaId,
        });

        const countedItemIds = new Set(
          session!.lines
            .filter((l: any) => l.subArea?.barArea?.id === areaId)
            .map((l: any) => l.inventoryItemId)
        );

        for (const item of expected) {
          if (!countedItemIds.has(item.inventoryItemId)) {
            allExpected.push({
              inventoryItemId: item.inventoryItemId,
              name: item.name,
              type: item.type,
              baseUom: item.baseUom,
              subAreaName: item.subAreaName,
              acknowledged: false,
            });
          }
        }
      }

      if (allExpected.length === 0) {
        // All expected items counted — close directly
        closeMutation.mutate({
          sessionId: id!,
          varianceReasons: varianceReasons,
        });
      } else {
        setUncountedItems(allExpected);
        setShowVerification(true);
      }
    } catch (error: any) {
      Alert.alert("Error", error.message ?? "Failed to verify items");
    }
  }

  function toggleAcknowledge(itemId: string) {
    setUncountedItems((prev) =>
      prev.map((item) =>
        item.inventoryItemId === itemId
          ? { ...item, acknowledged: !item.acknowledged }
          : item
      )
    );
  }

  function handleConfirmClose() {
    const allAcknowledged = uncountedItems.every((item) => item.acknowledged);
    if (!allAcknowledged) {
      Alert.alert(
        "Unacknowledged Items",
        "Please acknowledge all uncounted items before closing."
      );
      return;
    }
    closeMutation.mutate({
      sessionId: id!,
      varianceReasons: varianceReasons,
    });
  }

  if (isLoading || !session) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Loading session...</Text>
      </View>
    );
  }

  const isOpen = !session.endedTs;
  const areaSelected = !!selectedSubAreaId || (!!selectedAreaId && selectedArea?.subAreas.length === 0);

  // Build area display label for current selection
  const areaLabel = selectedArea
    ? selectedSubArea
      ? `${selectedArea.name} — ${selectedSubArea.name}`
      : selectedArea.name
    : "Select Area";

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{session.sessionType} Session</Text>
        <Text style={isOpen ? styles.badgeOpen : styles.badgeClosed}>
          {isOpen ? "Open" : "Closed"}
        </Text>
      </View>

      <Text style={styles.meta}>
        Started: {new Date(session.startedTs).toLocaleString()}
      </Text>

      {/* Area Picker */}
      {isOpen && areas && areas.length > 0 && (
        <View style={styles.areaPicker}>
          <Text style={styles.areaPickerLabel}>Count Area</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.areaPills}
          >
            {(areas as BarArea[]).map((area) => (
              <TouchableOpacity
                key={area.id}
                style={[
                  styles.areaPill,
                  selectedAreaId === area.id && styles.areaPillActive,
                ]}
                onPress={() => handleAreaSelect(area)}
              >
                <Text
                  style={[
                    styles.areaPillText,
                    selectedAreaId === area.id && styles.areaPillTextActive,
                  ]}
                >
                  {area.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Sub-area pills */}
          {selectedArea && selectedArea.subAreas.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.subAreaPills}
            >
              {selectedArea.subAreas.map((sa: { id: string; name: string }) => (
                <TouchableOpacity
                  key={sa.id}
                  style={[
                    styles.subAreaPill,
                    selectedSubAreaId === sa.id && styles.subAreaPillActive,
                  ]}
                  onPress={() => setSelectedSubAreaId(sa.id)}
                >
                  <Text
                    style={[
                      styles.subAreaPillText,
                      selectedSubAreaId === sa.id && styles.subAreaPillTextActive,
                    ]}
                  >
                    {sa.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Current area banner */}
          {areaSelected && (
            <View style={styles.areaBanner}>
              <Text style={styles.areaBannerText}>{areaLabel}</Text>
            </View>
          )}
        </View>
      )}

      {/* Count actions — for new items not on expected list */}
      {isOpen && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, !areaSelected && styles.actionBtnDisabled]}
            disabled={!areaSelected}
            onPress={() =>
              router.push(
                `/session/${id}/packaged?subAreaId=${selectedSubAreaId ?? ""}&areaName=${encodeURIComponent(areaLabel)}` as any
              )
            }
          >
            <Text style={styles.actionText}>Count New Item</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, !areaSelected && styles.actionBtnDisabled]}
            disabled={!areaSelected}
            onPress={() =>
              router.push(
                `/session/${id}/liquor?subAreaId=${selectedSubAreaId ?? ""}&areaName=${encodeURIComponent(areaLabel)}` as any
              )
            }
          >
            <Text style={styles.actionText}>Weigh Bottle</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, !areaSelected && styles.actionBtnDisabled]}
            disabled={!areaSelected}
            onPress={() =>
              router.push(
                `/session/${id}/draft?subAreaId=${selectedSubAreaId ?? ""}&areaName=${encodeURIComponent(areaLabel)}` as any
              )
            }
          >
            <Text style={styles.actionText}>Draft Verify</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Expected Items Checklist */}
      {isOpen && expectedTotal > 0 && (
        <View style={styles.expectedSection}>
          <Text style={styles.expectedTitle}>
            Expected in {areaLabel} — {expectedCounted}/{expectedTotal}
          </Text>
          {expectedChecklist.map((item: any) =>
            item.counted ? (
              <View
                key={item.inventoryItemId}
                style={[styles.expectedRow, styles.expectedRowCounted]}
              >
                <View style={[styles.expectedCheck, styles.expectedCheckDone]}>
                  <Text style={styles.expectedCheckmark}>✓</Text>
                </View>
                <Text style={[styles.expectedName, styles.expectedNameCounted]}>
                  {item.name}
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                key={item.inventoryItemId}
                style={styles.expectedRow}
                onPress={() => handleExpectedItemTap(item)}
              >
                <View style={styles.expectedCheck} />
                <Text style={styles.expectedName}>{item.name}</Text>
                <Text style={styles.expectedType}>
                  {item.type.replace("_", " ")}
                </Text>
              </TouchableOpacity>
            )
          )}
        </View>
      )}

      {/* Counted Items — grouped by area */}
      <Text style={styles.sectionTitle}>
        Counted Items ({session.lines.length})
      </Text>

      <SectionList
        style={styles.itemList}
        sections={groupedLines}
        keyExtractor={(line) => line.id}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item: line }) => (
          <View style={styles.lineRow}>
            <View style={styles.lineInfo}>
              <Text style={styles.lineName}>{line.inventoryItem.name}</Text>
              {line.subArea && (
                <Text style={styles.lineSubArea}>{line.subArea.name}</Text>
              )}
            </View>
            <Text style={styles.lineCount}>
              {line.countUnits != null
                ? `${Number(line.countUnits)} ${line.inventoryItem.baseUom}`
                : line.grossWeightGrams != null
                  ? `${Number(line.grossWeightGrams)}g`
                  : line.percentRemaining != null
                    ? `${Number(line.percentRemaining)}%`
                    : "—"}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No items counted yet.</Text>
        }
      />

      {/* Footer actions */}
      {isOpen && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.transferBtn}
            onPress={() =>
              router.push(
                `/transfer?sessionId=${id}&locationId=${selectedLocationId}` as any
              )
            }
          >
            <Text style={styles.transferBtnText}>Transfer Items</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={handleCloseSession}
            disabled={closeMutation.isPending}
          >
            <Text style={styles.closeBtnText}>
              {closeMutation.isPending ? "Closing..." : "Close Session"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Verification Modal */}
      <Modal visible={showVerification} animationType="slide">
        <View style={styles.verificationContainer}>
          <Text style={styles.verificationTitle}>Uncounted Items</Text>
          <Text style={styles.verificationSubtitle}>
            The following items were expected in the areas you worked but were not counted.
            Acknowledge each item to proceed.
          </Text>

          <ScrollView style={styles.verificationList}>
            {uncountedItems.map((item) => (
              <TouchableOpacity
                key={item.inventoryItemId}
                style={[
                  styles.verificationItem,
                  item.acknowledged && styles.verificationItemAcknowledged,
                ]}
                onPress={() => toggleAcknowledge(item.inventoryItemId)}
              >
                <View style={styles.verificationItemInfo}>
                  <Text style={styles.verificationItemName}>{item.name}</Text>
                  <Text style={styles.verificationItemArea}>
                    {item.subAreaName}
                  </Text>
                </View>
                <View
                  style={[
                    styles.checkbox,
                    item.acknowledged && styles.checkboxChecked,
                  ]}
                >
                  {item.acknowledged && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.verificationActions}>
            <TouchableOpacity
              style={styles.verificationCancel}
              onPress={() => setShowVerification(false)}
            >
              <Text style={styles.verificationCancelText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.verificationConfirm,
                closeMutation.isPending && styles.verificationConfirmDisabled,
              ]}
              onPress={handleConfirmClose}
              disabled={closeMutation.isPending}
            >
              <Text style={styles.verificationConfirmText}>
                {closeMutation.isPending ? "Closing..." : "Confirm & Close"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Variance Reason Modal */}
      {varianceItem && (
        <VarianceReasonModal
          visible={true}
          itemName={varianceItem.name}
          variance={varianceItem.variance}
          onSelect={(reason) => {
            setVarianceReasons((prev) => [
              ...prev,
              { itemId: varianceItem.itemId, reason },
            ]);
            setVarianceItem(null);
          }}
          onCancel={() => setVarianceItem(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623", padding: 16 },
  loading: { textAlign: "center", color: "#5A6A7A", marginTop: 40 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#EAF0FF",
    textTransform: "capitalize",
  },
  meta: { fontSize: 12, color: "#8899AA", marginBottom: 12 },
  badgeOpen: {
    backgroundColor: "#1E3550",
    color: "#E9B44C",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
    overflow: "hidden",
  },
  badgeClosed: {
    backgroundColor: "#1E3550",
    color: "#5A6A7A",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
    overflow: "hidden",
  },

  // Area picker
  areaPicker: { marginBottom: 16 },
  areaPickerLabel: {
    color: "#8899AA",
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  areaPills: { flexDirection: "row", marginBottom: 8 },
  areaPill: {
    backgroundColor: "#16283F",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  areaPillActive: {
    backgroundColor: "#1E3550",
    borderColor: "#E9B44C",
  },
  areaPillText: { color: "#8899AA", fontSize: 14, fontWeight: "500" },
  areaPillTextActive: { color: "#E9B44C" },

  subAreaPills: { flexDirection: "row", marginBottom: 8 },
  subAreaPill: {
    backgroundColor: "#0F1D2E",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  subAreaPillActive: { borderColor: "#2BA8A0", backgroundColor: "#12293E" },
  subAreaPillText: { color: "#5A6A7A", fontSize: 13, fontWeight: "500" },
  subAreaPillTextActive: { color: "#2BA8A0" },

  areaBanner: {
    backgroundColor: "#1E3550",
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
  },
  areaBannerText: { color: "#EAF0FF", fontSize: 14, fontWeight: "600" },

  // Actions
  actions: { flexDirection: "row", gap: 8, marginBottom: 12 },
  actionBtn: {
    flex: 1,
    backgroundColor: "#16283F",
    borderWidth: 1,
    borderColor: "#1E3550",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  actionBtnDisabled: { opacity: 0.4 },
  actionText: { fontSize: 13, fontWeight: "500", color: "#EAF0FF" },

  transferBtn: {
    backgroundColor: "#16283F",
    borderWidth: 1,
    borderColor: "#2BA8A0",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  transferBtnText: { color: "#2BA8A0", fontSize: 14, fontWeight: "600" },

  // Footer
  footer: {
    borderTopWidth: 1,
    borderTopColor: "#1E3550",
    paddingTop: 12,
    paddingBottom: 8,
  },

  // Item list
  itemList: { flex: 1 },

  // Expected items checklist
  expectedSection: {
    backgroundColor: "#12293E",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  expectedTitle: {
    color: "#E9B44C",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 10,
  },
  expectedRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  expectedRowCounted: { opacity: 0.5 },
  expectedCheck: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#5A6A7A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  expectedCheckDone: {
    borderColor: "#2BA8A0",
    backgroundColor: "#2BA8A0",
  },
  expectedCheckmark: { color: "#fff", fontSize: 12, fontWeight: "bold" },
  expectedName: { color: "#EAF0FF", fontSize: 14, flex: 1 },
  expectedType: {
    color: "#5A6A7A",
    fontSize: 11,
    textTransform: "capitalize",
    marginLeft: 8,
  },
  expectedNameCounted: {
    textDecorationLine: "line-through",
    color: "#5A6A7A",
  },

  // Section list
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#5A6A7A",
    marginBottom: 8,
  },
  sectionHeader: {
    backgroundColor: "#0F1D2E",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    marginTop: 4,
  },
  sectionHeaderText: { color: "#E9B44C", fontSize: 13, fontWeight: "600" },
  lineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#16283F",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3550",
  },
  lineInfo: { flex: 1 },
  lineName: { fontSize: 14, fontWeight: "500", color: "#EAF0FF" },
  lineSubArea: { fontSize: 11, color: "#5A6A7A", marginTop: 2 },
  lineCount: { fontSize: 14, color: "#8899AA" },
  emptyText: {
    textAlign: "center",
    color: "#5A6A7A",
    marginTop: 20,
    fontSize: 14,
  },

  // Close button
  closeBtn: {
    backgroundColor: "#dc2626",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 16,
  },
  closeBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },

  // Verification modal
  verificationContainer: {
    flex: 1,
    backgroundColor: "#0B1623",
    padding: 16,
    paddingTop: 60,
  },
  verificationTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#EAF0FF",
    marginBottom: 8,
  },
  verificationSubtitle: {
    fontSize: 14,
    color: "#8899AA",
    marginBottom: 20,
    lineHeight: 20,
  },
  verificationList: { flex: 1 },
  verificationItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#16283F",
    padding: 14,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E9B44C",
  },
  verificationItemAcknowledged: {
    borderColor: "#1E3550",
    opacity: 0.7,
  },
  verificationItemInfo: { flex: 1 },
  verificationItemName: { fontSize: 15, fontWeight: "500", color: "#EAF0FF" },
  verificationItemArea: { fontSize: 12, color: "#5A6A7A", marginTop: 2 },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#5A6A7A",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  checkboxChecked: {
    borderColor: "#2BA8A0",
    backgroundColor: "#2BA8A0",
  },
  checkmark: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  verificationActions: {
    flexDirection: "row",
    gap: 12,
    paddingTop: 16,
  },
  verificationCancel: {
    flex: 1,
    backgroundColor: "#16283F",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
  },
  verificationCancelText: { color: "#8899AA", fontSize: 16, fontWeight: "600" },
  verificationConfirm: {
    flex: 2,
    backgroundColor: "#dc2626",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
  },
  verificationConfirmDisabled: { opacity: 0.5 },
  verificationConfirmText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
