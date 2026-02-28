import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";

type LineStatus = "pending" | "created" | "requested";

interface SkippedLine {
  id: string;
  descriptionRaw: string;
  unitSizeRaw: string | null;
  unitPriceRaw: number | null;
  quantityRaw: number | null;
  productCodeRaw: string | null;
  selectedCategoryId: string | null;
  status: LineStatus;
}

export default function AddSkippedScreen() {
  const { receiptCaptureId } = useLocalSearchParams<{ receiptCaptureId: string }>();
  const { selectedLocationId, user } = useAuth();
  const businessId = user?.businessId ?? "";
  const locationId = selectedLocationId ?? user?.locationIds[0] ?? "";

  const isManager =
    user?.highestRole === "manager" ||
    user?.highestRole === "business_admin" ||
    user?.highestRole === "platform_admin";

  const [lines, setLines] = useState<SkippedLine[]>([]);
  const [initialized, setInitialized] = useState(false);

  const utils = trpc.useUtils();

  // Fetch receipt
  const { data: receipt, isLoading } = trpc.receipts.getById.useQuery(
    { id: receiptCaptureId! },
    { enabled: !!receiptCaptureId }
  );

  // Fetch categories
  const { data: categories } = trpc.itemCategories.list.useQuery(
    { businessId },
    { enabled: !!businessId }
  );

  // Initialize skipped lines from receipt data
  if (receipt && !initialized) {
    setInitialized(true);
    const skipped = receipt.lines
      .filter((l: any) => l.skipped && !l.inventoryItemId)
      .map((l: any) => ({
        id: l.id,
        descriptionRaw: l.descriptionRaw,
        unitSizeRaw: l.unitSizeRaw ?? null,
        unitPriceRaw: l.unitPriceRaw != null ? Number(l.unitPriceRaw) : null,
        quantityRaw: l.quantityRaw != null ? Number(l.quantityRaw) : null,
        productCodeRaw: l.productCodeRaw ?? null,
        selectedCategoryId: null,
        status: "pending" as LineStatus,
      }));
    setLines(skipped);
  }

  const createMutation = trpc.receipts.createFromSkipped.useMutation({
    onSuccess: (data, variables) => {
      setLines((prev) =>
        prev.map((l) =>
          l.id === variables.receiptLineId ? { ...l, status: "created" } : l
        )
      );
      utils.inventory.list.invalidate();

      if (data.countingMethod === "weighable") {
        Alert.alert(
          "Item Created",
          `"${data.item.name}" added to inventory. Set a tare weight now for accurate counting?`,
          [
            { text: "Skip Tare", style: "cancel" },
            {
              text: "Tare Now",
              onPress: () => router.push("/tare-weights"),
            },
          ]
        );
      }
    },
    onError: (err) => {
      Alert.alert("Error", err.message);
    },
  });

  const requestMutation = trpc.receipts.requestItemCreation.useMutation({
    onSuccess: (_data, variables) => {
      setLines((prev) =>
        prev.map((l) =>
          l.id === variables.receiptLineId ? { ...l, status: "requested" } : l
        )
      );
      Alert.alert("Request Sent", "A manager has been notified to review this item.");
    },
    onError: (err) => {
      Alert.alert("Error", err.message);
    },
  });

  function handleCreate(line: SkippedLine) {
    if (!line.selectedCategoryId) {
      Alert.alert("Select Category", "Please choose a category before creating the item.");
      return;
    }
    createMutation.mutate({
      receiptLineId: line.id,
      categoryId: line.selectedCategoryId,
      locationId,
    });
  }

  function handleRequest(line: SkippedLine) {
    requestMutation.mutate({ receiptLineId: line.id });
  }

  function selectCategory(lineId: string) {
    if (!categories?.length) return;
    Alert.alert("Select Category", undefined, [
      ...categories.map((cat: any) => ({
        text: `${cat.name}${cat.countingMethod !== "weighable" ? ` (${cat.countingMethod === "unit_count" ? "count" : cat.countingMethod})` : ""}`,
        onPress: () =>
          setLines((prev) =>
            prev.map((l) =>
              l.id === lineId ? { ...l, selectedCategoryId: cat.id } : l
            )
          ),
      })),
      { text: "Cancel", style: "cancel" },
    ]);
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#E9B44C" />
        <Text style={styles.loadingText}>Loading skipped items...</Text>
      </View>
    );
  }

  if (lines.length === 0 && initialized) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.emptyText}>No skipped items to add.</Text>
        <TouchableOpacity
          style={styles.doneBtn}
          onPress={() => router.replace("/receive")}
        >
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const completedCount = lines.filter((l) => l.status !== "pending").length;
  const isBusy = createMutation.isPending || requestMutation.isPending;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>Add Skipped Items</Text>
        <Text style={styles.subtitle}>
          {completedCount}/{lines.length} processed
        </Text>

        {lines.map((line) => {
          const selectedCat = categories?.find(
            (c: any) => c.id === line.selectedCategoryId
          );

          return (
            <View
              key={line.id}
              style={[
                styles.card,
                line.status !== "pending" && styles.cardDone,
              ]}
            >
              {/* Status badge */}
              {line.status !== "pending" && (
                <View
                  style={[
                    styles.statusBadge,
                    line.status === "created"
                      ? styles.statusCreated
                      : styles.statusRequested,
                  ]}
                >
                  <Text style={styles.statusText}>
                    {line.status === "created" ? "Created" : "Requested"}
                  </Text>
                </View>
              )}

              {/* Description */}
              <Text style={styles.description}>{line.descriptionRaw}</Text>

              {/* Details row */}
              <View style={styles.detailsRow}>
                {line.unitSizeRaw && (
                  <View style={styles.detailChip}>
                    <Text style={styles.detailText}>{line.unitSizeRaw}</Text>
                  </View>
                )}
                {line.unitPriceRaw != null && (
                  <View style={styles.detailChip}>
                    <Text style={styles.detailText}>
                      ${line.unitPriceRaw.toFixed(2)}
                    </Text>
                  </View>
                )}
                {line.quantityRaw != null && (
                  <View style={styles.detailChip}>
                    <Text style={styles.detailText}>
                      Qty: {line.quantityRaw}
                    </Text>
                  </View>
                )}
                {line.productCodeRaw && (
                  <View style={styles.detailChip}>
                    <Text style={styles.detailText}>
                      #{line.productCodeRaw}
                    </Text>
                  </View>
                )}
              </View>

              {line.status === "pending" && (
                <>
                  {/* Category picker */}
                  {isManager && (
                    <TouchableOpacity
                      style={styles.categoryPicker}
                      onPress={() => selectCategory(line.id)}
                    >
                      <Text
                        style={
                          selectedCat
                            ? styles.categorySelected
                            : styles.categoryPlaceholder
                        }
                      >
                        {selectedCat?.name ?? "Select category..."}
                      </Text>
                      <Text style={styles.categoryArrow}>▼</Text>
                    </TouchableOpacity>
                  )}

                  {/* Action button */}
                  {isManager ? (
                    <TouchableOpacity
                      style={[
                        styles.createBtn,
                        (!line.selectedCategoryId || isBusy) &&
                          styles.createBtnDisabled,
                      ]}
                      onPress={() => handleCreate(line)}
                      disabled={!line.selectedCategoryId || isBusy}
                    >
                      {createMutation.isPending &&
                      createMutation.variables?.receiptLineId === line.id ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.createBtnText}>Create Item</Text>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.requestBtn, isBusy && styles.createBtnDisabled]}
                      onPress={() => handleRequest(line)}
                      disabled={isBusy}
                    >
                      {requestMutation.isPending &&
                      requestMutation.variables?.receiptLineId === line.id ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.requestBtnText}>
                          Request Addition
                        </Text>
                      )}
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.doneBtn}
          onPress={() => router.replace("/receive")}
        >
          <Text style={styles.doneBtnText}>
            {completedCount === lines.length ? "Done" : "Finish Later"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
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
    marginBottom: 4,
  },
  subtitle: {
    color: "#8899AA",
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 16,
  },
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
  emptyText: {
    color: "#8899AA",
    fontSize: 16,
    marginBottom: 20,
  },

  // Cards
  card: {
    backgroundColor: "#16283F",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  cardDone: {
    opacity: 0.5,
  },
  description: {
    color: "#EAF0FF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  detailsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  detailChip: {
    backgroundColor: "#0B1623",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  detailText: {
    color: "#8899AA",
    fontSize: 13,
    fontWeight: "500",
  },

  // Status badge
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    marginBottom: 8,
  },
  statusCreated: {
    backgroundColor: "rgba(76, 175, 80, 0.2)",
  },
  statusRequested: {
    backgroundColor: "rgba(233, 180, 76, 0.2)",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#EAF0FF",
  },

  // Category picker
  categoryPicker: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#0B1623",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#1E3550",
    marginBottom: 10,
  },
  categorySelected: {
    color: "#EAF0FF",
    fontSize: 15,
    fontWeight: "500",
  },
  categoryPlaceholder: {
    color: "#5A6A7A",
    fontSize: 15,
  },
  categoryArrow: {
    color: "#5A6A7A",
    fontSize: 12,
  },

  // Buttons
  createBtn: {
    backgroundColor: "#4CAF50",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  createBtnDisabled: {
    opacity: 0.4,
  },
  createBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  requestBtn: {
    backgroundColor: "#E9B44C",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  requestBtnText: {
    color: "#0B1623",
    fontSize: 15,
    fontWeight: "700",
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
  doneBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  doneBtnText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
});
