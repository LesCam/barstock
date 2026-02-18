import { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
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
  countingMethod: string | null;
  categoryName: string | null;
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
  const [fullLocationMode, setFullLocationMode] = useState(false);
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
  const [showReview, setShowReview] = useState(false);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editingQty, setEditingQty] = useState("");

  const { data: session, isLoading } = trpc.sessions.getById.useQuery(
    { id: id! },
    { refetchOnMount: "always" }
  );

  const { data: areas } = trpc.areas.listBarAreas.useQuery(
    { locationId: selectedLocationId! },
    { enabled: !!selectedLocationId }
  );

  // Live expected items for currently selected area
  const { data: expectedItemsForArea } = trpc.sessions.expectedItemsForArea.useQuery(
    {
      locationId: selectedLocationId!,
      barAreaId: selectedAreaId!,
      subAreaId: selectedSubAreaId ?? undefined,
    },
    { enabled: !!selectedLocationId && !!selectedAreaId && !fullLocationMode }
  );

  // Full location expected items (all active items)
  const { data: expectedItemsForLocation } = trpc.sessions.expectedItemsForLocation.useQuery(
    { locationId: selectedLocationId! },
    { enabled: !!selectedLocationId && fullLocationMode }
  );

  const expectedItems = fullLocationMode ? expectedItemsForLocation : expectedItemsForArea;

  // Compute which expected items have been counted in this session
  const expectedChecklist = useMemo(() => {
    if (!expectedItems || !session?.lines) return [];
    if (fullLocationMode) {
      // In full location mode, match by both itemId + subAreaId
      // so Bud Light in Walk-In and Bud Light in Main Bar are tracked separately
      const countedPairs = new Set(
        session.lines.map((l: any) => `${l.inventoryItemId}|${l.subArea?.id ?? ""}`)
      );
      return expectedItems.map((item: any) => ({
        ...item,
        counted: countedPairs.has(`${item.inventoryItemId}|${item.subAreaId ?? ""}`),
      }));
    }
    // Area mode: just check by itemId
    const countedItemIds = new Set(
      session.lines.map((l: any) => l.inventoryItemId)
    );
    return expectedItems.map((item: any) => ({
      ...item,
      counted: countedItemIds.has(item.inventoryItemId),
    }));
  }, [expectedItems, session?.lines, fullLocationMode]);

  const expectedTotal = expectedChecklist.length;
  const expectedCounted = expectedChecklist.filter((i: any) => i.counted).length;

  function handleExpectedItemTap(item: { inventoryItemId: string; name: string; countingMethod: string; subAreaId?: string; subAreaName?: string }) {
    if (!areaSelected) return;
    // In full location mode, use the item's own subAreaId and auto-select it
    let subAreaForItem = selectedSubAreaId ?? "";
    let labelForItem = areaLabel;
    if (fullLocationMode && item.subAreaId) {
      subAreaForItem = item.subAreaId;
      labelForItem = item.subAreaName ?? "Full Location";
      // Auto-select this item's area/subarea in the picker
      for (const area of (areas as BarArea[]) ?? []) {
        const sa = area.subAreas.find((s: { id: string }) => s.id === item.subAreaId);
        if (sa) {
          setSelectedAreaId(area.id);
          setSelectedSubAreaId(sa.id);
          break;
        }
      }
    }
    const params = `subAreaId=${subAreaForItem}&areaName=${encodeURIComponent(labelForItem)}&itemId=${item.inventoryItemId}`;

    if (item.countingMethod === "weighable") {
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
      utils.sessions.list.invalidate();
    },
    onError(error: { message: string }) {
      Alert.alert("Error", error.message);
    },
  });

  const updateLine = trpc.sessions.updateLine.useMutation({
    onSuccess() {
      utils.sessions.getById.invalidate({ id: id! });
    },
  });

  const deleteLine = trpc.sessions.deleteLine.useMutation({
    onSuccess() {
      utils.sessions.getById.invalidate({ id: id! });
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

  // Group session lines by bar area for review modal
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
    return Array.from(groups.entries()).map(([_key, group]) => ({
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
      closeMutation.mutate({ sessionId: id! });
      return;
    }

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
              countingMethod: item.countingMethod,
              categoryName: item.categoryName,
              baseUom: item.baseUom,
              subAreaName: item.subAreaName,
              acknowledged: false,
            });
          }
        }
      }

      if (allExpected.length === 0) {
        closeMutation.mutate({ sessionId: id!, varianceReasons });
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
    closeMutation.mutate({ sessionId: id!, varianceReasons });
  }

  function handleSaveEdit(lineId: string) {
    const val = parseInt(editingQty, 10);
    if (!val || val <= 0) return;
    updateLine.mutate({ id: lineId, countUnits: val });
    setEditingLineId(null);
    setEditingQty("");
  }

  function handleDeleteLine(lineId: string, itemName: string) {
    Alert.alert("Remove Item", `Remove ${itemName}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => deleteLine.mutate({ id: lineId }),
      },
    ]);
  }

  function formatLineValue(line: any) {
    if (line.countUnits != null)
      return `${Number(line.countUnits)} ${line.inventoryItem.baseUom}`;
    if (line.grossWeightGrams != null)
      return `${Number(line.grossWeightGrams)}g`;
    if (line.percentRemaining != null)
      return `${Number(line.percentRemaining)}%`;
    return "—";
  }

  if (isLoading || !session) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Loading session...</Text>
      </View>
    );
  }

  const isOpen = !session.endedTs;
  const areaSelected = fullLocationMode || !!selectedSubAreaId || (!!selectedAreaId && selectedArea?.subAreas.length === 0);
  const areaLabel = fullLocationMode
    ? "Full Location"
    : selectedArea
      ? selectedSubArea
        ? `${selectedArea.name} — ${selectedSubArea.name}`
        : selectedArea.name
      : "Select Area";
  const lineCount = session.lines.length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Inventory Count</Text>
        <Text style={isOpen ? styles.badgeOpen : styles.badgeClosed}>
          {isOpen ? "Open" : "Closed"}
        </Text>
      </View>
      <Text style={styles.meta}>
        Started: {new Date(session.startedTs).toLocaleString()}
        {lineCount > 0 ? ` — ${lineCount} item${lineCount !== 1 ? "s" : ""}` : ""}
      </Text>

      <ScrollView style={styles.mainScroll} showsVerticalScrollIndicator={false}>
        {/* Area Picker */}
        {isOpen && areas && areas.length > 0 && (
          <View style={styles.areaPicker}>
            <View style={styles.areaPickerHeader}>
              <Text style={styles.areaPickerLabel}>Count Area</Text>
              <TouchableOpacity
                onPress={() => setFullLocationMode(!fullLocationMode)}
              >
                <Text style={[styles.fullLocationLink, fullLocationMode && styles.fullLocationLinkActive]}>
                  {fullLocationMode ? "Area View" : "Full Location"}
                </Text>
              </TouchableOpacity>
            </View>

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

            {areaSelected && (
              <View style={styles.areaBanner}>
                <Text style={styles.areaBannerText}>
                  {fullLocationMode ? "Full Audit" : areaLabel}
                </Text>
                {fullLocationMode && selectedSubArea && selectedArea && (
                  <Text style={styles.areaBannerSub}>
                    Counting in: {selectedArea.name} — {selectedSubArea.name}
                  </Text>
                )}
              </View>
            )}
          </View>
        )}

        {/* Count actions */}
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
              Expected{fullLocationMode ? " at Location" : ` in ${areaLabel}`} — {expectedCounted}/{expectedTotal}
            </Text>
            {fullLocationMode ? (
              // Group by area name for full location view
              (() => {
                const groups = new Map<string, typeof expectedChecklist>();
                for (const item of expectedChecklist) {
                  const area = (item as any).subAreaName ?? "Unassigned";
                  if (!groups.has(area)) groups.set(area, []);
                  groups.get(area)!.push(item);
                }
                return Array.from(groups.entries()).map(([area, items]) => (
                  <View key={area}>
                    <Text style={styles.expectedGroupHeader}>{area}</Text>
                    {items.map((item: any) => {
                      const key = `${item.inventoryItemId}|${item.subAreaId ?? ""}`;
                      return item.counted ? (
                        <View
                          key={key}
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
                          key={key}
                          style={styles.expectedRow}
                          onPress={() => handleExpectedItemTap(item)}
                        >
                          <View style={styles.expectedCheck} />
                          <Text style={styles.expectedName}>{item.name}</Text>
                          <Text style={styles.expectedType}>
                            {item.categoryName ?? "Uncategorized"}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ));
              })()
            ) : (
              expectedChecklist.map((item: any) =>
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
                      {item.categoryName ?? "Uncategorized"}
                    </Text>
                  </TouchableOpacity>
                )
              )
            )}
          </View>
        )}

        {/* Closed session — show summary inline */}
        {!isOpen && lineCount > 0 && (
          <View style={styles.closedSummary}>
            <Text style={styles.closedSummaryTitle}>
              {lineCount} item{lineCount !== 1 ? "s" : ""} counted
            </Text>
            {session.lines.slice(0, 5).map((line: any) => (
              <View key={line.id} style={styles.closedLineRow}>
                <Text style={styles.closedLineName}>{line.inventoryItem.name}</Text>
                <Text style={styles.closedLineValue}>{formatLineValue(line)}</Text>
              </View>
            ))}
            {lineCount > 5 && (
              <TouchableOpacity onPress={() => setShowReview(true)}>
                <Text style={styles.closedShowAll}>Show all {lineCount} items...</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      {/* Footer */}
      {isOpen && (
        <View style={styles.footer}>
          <View style={styles.bottomRow}>
            <TouchableOpacity
              style={[styles.reviewBtn, lineCount === 0 && styles.btnDisabled]}
              onPress={() => setShowReview(true)}
              disabled={lineCount === 0}
            >
              <Text style={styles.reviewBtnText}>Review ({lineCount})</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.doneBtn}
              onPress={() => router.back()}
            >
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Review Modal */}
      <Modal visible={showReview} animationType="slide">
        <View style={styles.reviewModalContainer}>
          <View style={styles.reviewModalHeader}>
            <Text style={styles.reviewModalTitle}>
              Review — {lineCount} Item{lineCount !== 1 ? "s" : ""}
            </Text>
            <TouchableOpacity onPress={() => setShowReview(false)}>
              <Text style={styles.reviewModalClose}>Close</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.reviewList}>
            {groupedLines.map((section) => (
              <View key={section.title}>
                <View style={styles.reviewSectionHeader}>
                  <Text style={styles.reviewSectionTitle}>{section.title}</Text>
                </View>
                {section.data.map((line: any) => {
                  const isEditing = editingLineId === line.id;
                  return (
                    <View key={line.id} style={styles.reviewRow}>
                      <View style={styles.reviewInfo}>
                        <Text style={styles.reviewItemName}>
                          {line.inventoryItem?.name ?? "Unknown"}
                        </Text>
                        <Text style={styles.reviewItemMeta}>
                          {line.inventoryItem?.category?.name ?? ""}
                          {line.subArea ? ` | ${line.subArea.name}` : ""}
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
                              setEditingQty(String(line.countUnits ?? line.grossWeightGrams ?? 0));
                            }}
                          >
                            <Text style={styles.reviewQty}>
                              {formatLineValue(line)}
                            </Text>
                          </TouchableOpacity>
                          {isOpen && (
                            <TouchableOpacity
                              onPress={() =>
                                handleDeleteLine(line.id, line.inventoryItem?.name ?? "item")
                              }
                            >
                              <Text style={styles.deleteIcon}>✕</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            ))}
            {lineCount === 0 && (
              <Text style={styles.reviewEmpty}>No items counted yet.</Text>
            )}
          </ScrollView>
        </View>
      </Modal>

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

  mainScroll: { flex: 1 },

  // Area picker
  areaPicker: { marginBottom: 16 },
  areaPickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  areaPickerLabel: {
    color: "#8899AA",
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fullLocationLink: {
    color: "#8899AA",
    fontSize: 13,
    fontWeight: "600",
  },
  fullLocationLinkActive: {
    color: "#E9B44C",
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
  areaBannerSub: { color: "#8899AA", fontSize: 12, marginTop: 2 },

  // Count actions
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
  expectedGroupHeader: {
    color: "#E9B44C",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 10,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
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

  // Closed session summary
  closedSummary: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  closedSummaryTitle: {
    color: "#8899AA",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 10,
  },
  closedLineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3550",
  },
  closedLineName: { color: "#EAF0FF", fontSize: 14, flex: 1 },
  closedLineValue: { color: "#8899AA", fontSize: 14 },
  closedShowAll: {
    color: "#E9B44C",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 10,
  },

  // Footer
  footer: {
    borderTopWidth: 1,
    borderTopColor: "#1E3550",
    paddingTop: 12,
    paddingBottom: 8,
  },
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
  reviewModalContainer: { flex: 1, backgroundColor: "#0B1623", paddingTop: 60 },
  reviewModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  reviewModalTitle: { fontSize: 22, fontWeight: "bold", color: "#EAF0FF" },
  reviewModalClose: { color: "#E9B44C", fontSize: 16, fontWeight: "600" },
  reviewList: { flex: 1, paddingHorizontal: 16 },
  reviewEmpty: { color: "#5A6A7A", textAlign: "center", marginTop: 40, fontSize: 15 },
  reviewSectionHeader: {
    backgroundColor: "#0F1D2E",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    marginTop: 8,
    marginBottom: 4,
  },
  reviewSectionTitle: { color: "#E9B44C", fontSize: 13, fontWeight: "600" },
  reviewRow: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
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
