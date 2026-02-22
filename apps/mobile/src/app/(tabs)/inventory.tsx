import { View, Text, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { router } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";
import { BarSparkline } from "@/components/charts/BarSparkline";
import { useUsageSparklines } from "@/lib/use-usage-sparklines";
import { useParStatus } from "@/lib/use-par-status";

const PAR_DOT_COLORS: Record<string, string> = {
  red: "#EF4444",
  yellow: "#FBBF24",
  green: "#4CAF50",
};

function formatStock(
  qty: number | null,
  containerSize: unknown,
  baseUom: string,
  countingMethod: string
): string {
  if (qty === null || qty === 0) return "\u2014";

  if (countingMethod === "unit_count") {
    return `${qty} units`;
  }

  const size = containerSize ? Number(containerSize) : null;

  if (size && size > 0) {
    const full = Math.floor(qty);
    const partial = qty - full;
    const pct = Math.round(partial * 100);

    if (full > 0 && pct > 0) return `${full} full + ${pct}%`;
    if (full > 0) return `${full} full`;
    return `${pct}%`;
  }

  return `${qty} ${baseUom}`;
}

export default function InventoryTab() {
  const { selectedLocationId } = useAuth();
  const { data: items } = trpc.inventory.listWithStock.useQuery(
    { locationId: selectedLocationId! },
    { enabled: !!selectedLocationId }
  );
  const { sparklineMap } = useUsageSparklines(selectedLocationId ?? null);
  const { parMap } = useParStatus(selectedLocationId ?? null);

  const { data: posCoverage } = trpc.pos.coverageStats.useQuery(
    { locationId: selectedLocationId! },
    { enabled: !!selectedLocationId, staleTime: 5 * 60 * 1000 }
  );

  const coverageColor =
    (posCoverage?.mappedPercent ?? 100) >= 90
      ? "#4CAF50"
      : (posCoverage?.mappedPercent ?? 100) >= 70
        ? "#FBBF24"
        : "#EF4444";

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        ListHeaderComponent={
          posCoverage && posCoverage.totalItems > 0 ? (
            <View style={styles.coverageCard}>
              <View style={styles.coverageHeader}>
                <Text style={styles.coverageTitle}>POS Coverage</Text>
                <Text style={[styles.coveragePercent, { color: coverageColor }]}>
                  {posCoverage.mappedPercent}%
                </Text>
              </View>
              <View style={styles.coverageBar}>
                <View
                  style={[
                    styles.coverageBarFill,
                    { width: `${posCoverage.mappedPercent}%`, backgroundColor: coverageColor },
                  ]}
                />
              </View>
              <Text style={styles.coverageDetail}>
                {posCoverage.mappedItems} of {posCoverage.totalItems} POS items mapped
              </Text>
              {posCoverage.totalItems - posCoverage.mappedItems > 0 && (
                <Text style={styles.coverageWarning}>
                  {posCoverage.totalItems - posCoverage.mappedItems} unmapped items — map on web to enable depletion tracking
                </Text>
              )}
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push(`/inventory/${item.id}` as any)}
            activeOpacity={0.7}
          >
            <View style={styles.info}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.type}>{item.category?.name ?? "Uncategorized"}</Text>
            </View>
            {sparklineMap.get(item.id) && (
              <View style={styles.sparklineWrap}>
                <BarSparkline data={sparklineMap.get(item.id)!} />
              </View>
            )}
            {parMap.get(item.id) && (
              <View
                style={[
                  styles.parDot,
                  { backgroundColor: PAR_DOT_COLORS[parMap.get(item.id)!.status] },
                ]}
              />
            )}
            <Text style={styles.stock}>
              {formatStock(
                item.onHandQty,
                item.containerSize,
                item.baseUom,
                item.category?.countingMethod ?? "unit_count"
              )}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No inventory items.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623" },
  row: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#16283F", padding: 16,
    borderBottomWidth: 1, borderBottomColor: "#1E3550",
  },
  info: { flex: 1, marginRight: 12 },
  name: { fontSize: 15, fontWeight: "500", color: "#EAF0FF" },
  type: { fontSize: 12, color: "#5A6A7A", marginTop: 2, textTransform: "capitalize" },
  sparklineWrap: { marginRight: 12 },
  parDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  stock: { fontSize: 14, fontWeight: "600", color: "#4FC3F7" },
  empty: { textAlign: "center", color: "#5A6A7A", marginTop: 40, fontSize: 14 },
  coverageCard: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1E3550",
    margin: 12,
    padding: 14,
  },
  coverageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  coverageTitle: { fontSize: 13, fontWeight: "600", color: "#EAF0FF" },
  coveragePercent: { fontSize: 22, fontWeight: "700" },
  coverageBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#1E3550",
    marginBottom: 8,
    overflow: "hidden",
  },
  coverageBarFill: { height: 6, borderRadius: 3 },
  coverageDetail: { fontSize: 12, color: "#EAF0FF", opacity: 0.7 },
  coverageWarning: { fontSize: 11, color: "#FBBF24", marginTop: 6 },
});
