import { useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
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

export default function ParLevelsScreen() {
  const { selectedLocationId } = useAuth();
  const [belowParOnly, setBelowParOnly] = useState(false);

  const { data: items, isLoading } = trpc.parLevels.list.useQuery(
    { locationId: selectedLocationId! },
    { enabled: !!selectedLocationId }
  );

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

            {/* Filter toggle */}
            <View style={styles.filterRow}>
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
            </View>
          </>
        }
        renderItem={({ item }: { item: any }) => {
          const dotColor = STATUS_COLORS[item.status] ?? "#3A4A5A";
          const daysLeft = item.daysToStockout;

          return (
            <TouchableOpacity
              style={styles.itemRow}
              activeOpacity={0.7}
              onPress={() =>
                router.push(`/inventory/${item.inventoryItemId}` as any)
              }
            >
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623" },
  listContent: { padding: 16, paddingBottom: 40 },

  // Summary cards
  summaryRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  summaryCardRed: {
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  summaryLabel: {
    fontSize: 12,
    color: "#8899AA",
    fontWeight: "600",
  },
  summaryLabelRed: {
    fontSize: 12,
    color: "#EF4444",
    fontWeight: "600",
  },
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

  // Filter
  filterRow: {
    flexDirection: "row",
    marginBottom: 16,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "#16283F",
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  filterPillActive: {
    backgroundColor: "#E9B44C",
    borderColor: "#E9B44C",
  },
  filterPillText: {
    fontSize: 13,
    color: "#8899AA",
    fontWeight: "600",
  },
  filterPillTextActive: {
    color: "#0B1623",
  },

  // Item rows
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16283F",
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  itemLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#EAF0FF",
  },
  itemCategory: {
    fontSize: 12,
    color: "#5A6A7A",
    marginTop: 2,
  },
  itemCenter: {
    marginHorizontal: 12,
  },
  levelText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#EAF0FF",
  },
  levelDivider: {
    color: "#5A6A7A",
    fontWeight: "400",
  },
  itemRight: {
    width: 40,
    alignItems: "flex-end",
  },
  daysText: {
    fontSize: 14,
    fontWeight: "700",
  },
  daysRed: {
    color: "#EF4444",
  },
  daysYellow: {
    color: "#FBBF24",
  },
  daysMuted: {
    color: "#5A6A7A",
  },

  // Empty state
  emptyCard: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 24,
    alignItems: "center",
    marginTop: 20,
  },
  emptyText: {
    fontSize: 15,
    color: "#8899AA",
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 13,
    color: "#5A6A7A",
    textAlign: "center",
    marginTop: 8,
  },
});
