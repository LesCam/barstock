import { useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Share,
  StyleSheet,
} from "react-native";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";

export default function ReorderScreen() {
  const { selectedLocationId } = useAuth();
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);
  const [qtyEdits, setQtyEdits] = useState<Map<string, number>>(new Map());
  const [creatingVendor, setCreatingVendor] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const { data: suggestions, isLoading } = trpc.parLevels.suggestions.useQuery(
    { locationId: selectedLocationId! },
    { enabled: !!selectedLocationId, staleTime: 5 * 60 * 1000 }
  );

  const createPOMut = trpc.purchaseOrders.create.useMutation({
    onSuccess: (result, variables) => {
      utils.purchaseOrders.list.invalidate();
      setCreatingVendor(null);
      Alert.alert(
        "PO Created",
        `Purchase order created for ${suggestions?.find((s: any) => s.vendorId === variables.vendorId)?.vendorName ?? "vendor"}.`,
        [
          { text: "OK" },
          {
            text: "Share",
            onPress: () => shareOrder(result.id),
          },
        ]
      );
    },
    onError: (err) => {
      setCreatingVendor(null);
      Alert.alert("Error", err.message);
    },
  });

  function getOrderQty(itemId: string, defaultQty: number): number {
    return qtyEdits.get(itemId) ?? defaultQty;
  }

  function setOrderQty(itemId: string, value: string) {
    const num = Number(value);
    if (!isNaN(num) && num >= 0) {
      setQtyEdits((prev) => {
        const next = new Map(prev);
        next.set(itemId, num);
        return next;
      });
    }
  }

  function handleCreatePO(vendor: any) {
    if (!selectedLocationId) return;

    const lines = vendor.items
      .map((item: any) => ({
        inventoryItemId: item.inventoryItemId,
        orderedQty: getOrderQty(item.inventoryItemId, item.orderQty),
        orderedUom: item.parUom as "unit" | "package",
      }))
      .filter((l: any) => l.orderedQty > 0);

    if (lines.length === 0) {
      Alert.alert("No Items", "All order quantities are zero.");
      return;
    }

    setCreatingVendor(vendor.vendorId);
    createPOMut.mutate({
      locationId: selectedLocationId,
      vendorId: vendor.vendorId,
      lines,
    });
  }

  async function shareOrder(orderId: string) {
    try {
      const textData = await utils.purchaseOrders.textOrder.fetch({ id: orderId });
      if (textData) {
        await Share.share({ message: typeof textData === "string" ? textData : JSON.stringify(textData) });
      }
    } catch {
      // Silently fail — user can share later from web
    }
  }

  function estimateVendorTotal(vendor: any): number {
    return vendor.items.reduce((sum: number, item: any) => {
      const qty = getOrderQty(item.inventoryItemId, item.orderQty);
      return sum + (item.estimatedCost != null ? (qty / item.orderQty) * item.estimatedCost : 0);
    }, 0);
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

  if (!suggestions || suggestions.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No items need reordering.</Text>
          <Text style={styles.emptySubtext}>
            All items are at or above par levels.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={suggestions}
        keyExtractor={(vendor: any) => vendor.vendorId}
        renderItem={({ item: vendor }: { item: any }) => {
          const isExpanded = expandedVendor === vendor.vendorId;
          const estTotal = estimateVendorTotal(vendor);

          return (
            <View style={styles.vendorCard}>
              <TouchableOpacity
                style={styles.vendorHeader}
                onPress={() =>
                  setExpandedVendor(isExpanded ? null : vendor.vendorId)
                }
                activeOpacity={0.7}
              >
                <View style={styles.vendorInfo}>
                  <Text style={styles.vendorName}>{vendor.vendorName}</Text>
                  <Text style={styles.vendorMeta}>
                    {vendor.itemCount} item{vendor.itemCount !== 1 ? "s" : ""}{" "}
                    | Est. ${estTotal.toFixed(2)}
                  </Text>
                </View>
                <Text style={styles.chevron}>{isExpanded ? "▼" : "▶"}</Text>
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.vendorItems}>
                  {vendor.items.map((item: any) => (
                    <View key={item.inventoryItemId} style={styles.itemRow}>
                      <View style={styles.itemInfo}>
                        <Text style={styles.itemName} numberOfLines={1}>
                          {item.itemName}
                        </Text>
                        <Text style={styles.itemDetail}>
                          On hand: {item.currentOnHand.toFixed(1)} | Par:{" "}
                          {item.parLevel}
                          {item.vendorSku ? ` | SKU: ${item.vendorSku}` : ""}
                        </Text>
                      </View>
                      <TextInput
                        style={styles.qtyInput}
                        value={String(getOrderQty(item.inventoryItemId, item.orderQty))}
                        onChangeText={(v) => setOrderQty(item.inventoryItemId, v)}
                        keyboardType="decimal-pad"
                      />
                    </View>
                  ))}

                  <TouchableOpacity
                    style={[
                      styles.createPOBtn,
                      creatingVendor === vendor.vendorId && styles.createPOBtnDisabled,
                    ]}
                    onPress={() => handleCreatePO(vendor)}
                    disabled={creatingVendor === vendor.vendorId}
                  >
                    {creatingVendor === vendor.vendorId ? (
                      <ActivityIndicator color="#0B1623" />
                    ) : (
                      <Text style={styles.createPOBtnText}>Create PO</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623" },
  listContent: { padding: 16, paddingBottom: 40 },

  vendorCard: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#1E3550",
    overflow: "hidden",
  },
  vendorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  vendorInfo: { flex: 1 },
  vendorName: { fontSize: 16, fontWeight: "600", color: "#EAF0FF" },
  vendorMeta: { fontSize: 13, color: "#5A6A7A", marginTop: 2 },
  chevron: { fontSize: 14, color: "#5A6A7A" },

  vendorItems: {
    borderTopWidth: 1,
    borderTopColor: "#1E3550",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1E355050",
  },
  itemInfo: { flex: 1, marginRight: 12 },
  itemName: { fontSize: 14, fontWeight: "500", color: "#EAF0FF" },
  itemDetail: { fontSize: 12, color: "#5A6A7A", marginTop: 2 },
  qtyInput: {
    backgroundColor: "#0B1623",
    borderRadius: 8,
    padding: 8,
    width: 60,
    fontSize: 14,
    color: "#EAF0FF",
    textAlign: "center",
    borderWidth: 1,
    borderColor: "#1E3550",
  },

  createPOBtn: {
    backgroundColor: "#E9B44C",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 12,
  },
  createPOBtnDisabled: { opacity: 0.6 },
  createPOBtnText: { fontSize: 15, fontWeight: "700", color: "#0B1623" },

  emptyCard: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 24,
    alignItems: "center",
    margin: 16,
    marginTop: 40,
  },
  emptyText: { fontSize: 15, color: "#8899AA", textAlign: "center" },
  emptySubtext: {
    fontSize: 13,
    color: "#5A6A7A",
    textAlign: "center",
    marginTop: 8,
  },
});
