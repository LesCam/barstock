import { useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from "react-native";
import { router } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";
import { BarSparkline } from "@/components/charts/BarSparkline";
import { UsageBarChart } from "@/components/charts/UsageBarChart";
import { UsageChartCard } from "@/components/charts/UsageChartCard";
import { useUsageSparklines } from "@/lib/use-usage-sparklines";
import { useParStatus } from "@/lib/use-par-status";

const PAR_DOT_COLORS: Record<string, string> = {
  red: "#EF4444",
  yellow: "#FBBF24",
  green: "#4CAF50",
};

type ViewMode = "stock" | "usage";
type Period = "7d" | "30d" | "90d";
type Metric = "qty" | "cost";
type GroupBy = "items" | "vendors";

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

function getDateRange(period: Period) {
  const toDate = new Date();
  const fromDate = new Date();
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  fromDate.setDate(fromDate.getDate() - days);
  return { fromDate, toDate };
}

function getGranularity(period: Period): "day" | "week" {
  return period === "90d" ? "week" : "day";
}

function formatBucketLabel(dateStr: string, period: Period): string {
  const d = new Date(dateStr);
  if (period === "7d") {
    return d.toLocaleDateString("en", { weekday: "short" }).slice(0, 3);
  }
  if (period === "90d") {
    return d.toLocaleDateString("en", { month: "short", day: "numeric" });
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function InventoryTab() {
  const { selectedLocationId, user } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>("stock");

  // Usage state
  const [period, setPeriod] = useState<Period>("7d");
  const [metric, setMetric] = useState<Metric>("qty");
  const [groupBy, setGroupBy] = useState<GroupBy>("items");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  // Stock data
  const { data: items } = trpc.inventory.listWithStock.useQuery(
    { locationId: selectedLocationId! },
    { enabled: !!selectedLocationId, staleTime: 30_000 }
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

  // Usage data (conditionally enabled)
  const { fromDate, toDate } = useMemo(() => getDateRange(period), [period]);

  const usageQueryParams = useMemo(
    () => ({
      locationId: selectedLocationId!,
      fromDate,
      toDate,
      granularity: getGranularity(period),
      categoryId: categoryId || undefined,
    }),
    [selectedLocationId, fromDate, toDate, period, categoryId]
  );

  const { data: categories } = trpc.itemCategories.list.useQuery(
    { businessId: user?.businessId! },
    { enabled: !!user?.businessId && viewMode === "usage" }
  );

  const { data: itemData, isLoading: itemsLoading } =
    trpc.reports.usageOverTime.useQuery(usageQueryParams, {
      enabled: !!selectedLocationId && viewMode === "usage" && groupBy === "items",
      staleTime: 5 * 60 * 1000,
    });

  const { data: vendorData, isLoading: vendorsLoading } =
    trpc.reports.usageByVendor.useQuery(usageQueryParams, {
      enabled: !!selectedLocationId && viewMode === "usage" && groupBy === "vendors",
      staleTime: 5 * 60 * 1000,
    });

  const usageLoading = groupBy === "items" ? itemsLoading : vendorsLoading;
  const buckets =
    groupBy === "items" ? itemData?.buckets : vendorData?.buckets;

  const aggregateChartData = useMemo(() => {
    if (!buckets) return [];
    return buckets.map((b: any) => ({
      label: formatBucketLabel(b.period, period),
      value: metric === "cost" ? (b.totalCost ?? 0) : b.totalQty,
    }));
  }, [buckets, period, metric]);

  const topMovers = useMemo(() => {
    if (groupBy !== "items" || !itemData?.itemSeries) return [];
    return itemData.itemSeries
      .map((s) => ({
        itemId: s.itemId,
        itemName: s.itemName,
        totalQty: s.dataPoints.reduce((sum, dp) => sum + dp.qty, 0),
        totalCost: s.dataPoints.reduce(
          (sum, dp) => sum + (dp.cost ?? 0),
          0
        ),
        sparkline: s.dataPoints.map((dp) =>
          metric === "cost" ? (dp.cost ?? 0) : dp.qty
        ),
      }))
      .sort((a, b) =>
        metric === "cost"
          ? b.totalCost - a.totalCost
          : b.totalQty - a.totalQty
      );
  }, [itemData, metric, groupBy]);

  const vendorRows = useMemo(() => {
    if (groupBy !== "vendors" || !vendorData?.vendorSeries) return [];
    return vendorData.vendorSeries
      .map((v: any) => ({
        vendorId: v.vendorId,
        vendorName: v.vendorName,
        totalQty: v.dataPoints.reduce(
          (sum: number, dp: any) => sum + dp.qty,
          0
        ),
        totalCost: v.dataPoints.reduce(
          (sum: number, dp: any) => sum + (dp.cost ?? 0),
          0
        ),
        sparkline: v.dataPoints.map((dp: any) =>
          metric === "cost" ? (dp.cost ?? 0) : dp.qty
        ),
      }))
      .sort((a: any, b: any) =>
        metric === "cost"
          ? b.totalCost - a.totalCost
          : b.totalQty - a.totalQty
      );
  }, [vendorData, metric, groupBy]);

  const usageListData = groupBy === "items" ? topMovers : vendorRows;
  const chartTitle = period === "90d" ? "Weekly Usage" : "Daily Usage";

  // Pinned header (toggle + quick actions)
  const renderPinnedHeader = () => (
    <>
      {/* View toggle */}
      <View style={styles.viewToggleRow}>
        <TouchableOpacity
          style={[styles.viewToggle, viewMode === "stock" && styles.viewToggleActive]}
          onPress={() => setViewMode("stock")}
        >
          <Text style={[styles.viewToggleText, viewMode === "stock" && styles.viewToggleTextActive]}>
            Stock
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewToggle, viewMode === "usage" && styles.viewToggleActive]}
          onPress={() => setViewMode("usage")}
        >
          <Text style={[styles.viewToggleText, viewMode === "usage" && styles.viewToggleTextActive]}>
            Usage
          </Text>
        </TouchableOpacity>
      </View>

      {/* Quick action buttons */}
      <View style={styles.quickActionRow}>
        <TouchableOpacity
          style={styles.quickAction}
          onPress={() => router.push("/forecast" as any)}
        >
          <Text style={styles.quickActionText}>Forecast</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickAction}
          onPress={() => router.push("/shopping-list" as any)}
        >
          <Text style={styles.quickActionText}>Shopping List</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  // Usage list header (toggles + chart)
  const renderUsageHeader = () => (
    <>
      {/* Period toggle */}
      <View style={styles.toggleRow}>
        {(["7d", "30d", "90d"] as Period[]).map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.pill, period === p && styles.pillActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[styles.pillText, period === p && styles.pillTextActive]}>
              {p}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Metric toggle + Group by toggle */}
      <View style={styles.toggleRow}>
        {([
          { key: "qty" as Metric, label: "Quantity" },
          { key: "cost" as Metric, label: "Cost ($)" },
        ]).map((m) => (
          <TouchableOpacity
            key={m.key}
            style={[styles.metricPill, metric === m.key && styles.metricPillActive]}
            onPress={() => setMetric(m.key)}
          >
            <Text style={[styles.metricPillText, metric === m.key && styles.metricPillTextActive]}>
              {m.label}
            </Text>
          </TouchableOpacity>
        ))}

        <View style={styles.separator} />

        {([
          { key: "items" as GroupBy, label: "Items" },
          { key: "vendors" as GroupBy, label: "Vendors" },
        ]).map((g) => (
          <TouchableOpacity
            key={g.key}
            style={[styles.groupPill, groupBy === g.key && styles.groupPillActive]}
            onPress={() => {
              setGroupBy(g.key);
              setExpandedItemId(null);
            }}
          >
            <Text style={[styles.groupPillText, groupBy === g.key && styles.groupPillTextActive]}>
              {g.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Category filter chips */}
      {categories && categories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryScrollContent}
        >
          <TouchableOpacity
            style={[styles.categoryChip, categoryId === null && styles.categoryChipActive]}
            onPress={() => setCategoryId(null)}
          >
            <Text style={[styles.categoryChipText, categoryId === null && styles.categoryChipTextActive]}>
              All
            </Text>
          </TouchableOpacity>
          {categories.map((cat: any) => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.categoryChip, categoryId === cat.id && styles.categoryChipActive]}
              onPress={() => setCategoryId(categoryId === cat.id ? null : cat.id)}
            >
              <Text style={[styles.categoryChipText, categoryId === cat.id && styles.categoryChipTextActive]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Aggregate chart */}
      <View style={styles.chartCard}>
        <Text style={styles.usageSectionTitle}>{chartTitle}</Text>
        {usageLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#E9B44C" />
          </View>
        ) : aggregateChartData.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>No usage data</Text>
          </View>
        ) : (
          <UsageBarChart
            data={aggregateChartData}
            barColor={metric === "cost" ? "#E9B44C" : "#2BA8A0"}
          />
        )}
      </View>

      {/* List header */}
      {usageListData.length > 0 && (
        <Text style={styles.usageSectionTitle}>
          {groupBy === "vendors" ? "Top Vendors" : "Top Movers"}
        </Text>
      )}
    </>
  );

  if (viewMode === "usage") {
    return (
      <View style={styles.container}>
        {renderPinnedHeader()}
        <FlatList
          data={usageListData}
          keyExtractor={(item: any) =>
            groupBy === "items" ? item.itemId : item.vendorId
          }
          ListHeaderComponent={renderUsageHeader()}
          renderItem={({ item }: { item: any }) => {
            if (groupBy === "vendors") {
              return (
                <View style={styles.moverRow}>
                  <View style={styles.moverInfo}>
                    <Text style={styles.moverName} numberOfLines={1}>
                      {item.vendorName}
                    </Text>
                    <Text style={styles.moverQty}>
                      {metric === "cost"
                        ? `$${item.totalCost.toFixed(2)}`
                        : `${item.totalQty.toFixed(1)} total`}
                    </Text>
                  </View>
                  <BarSparkline
                    data={item.sparkline}
                    color={metric === "cost" ? "#E9B44C" : "#9C27B0"}
                  />
                </View>
              );
            }

            return (
              <View>
                <TouchableOpacity
                  style={[
                    styles.moverRow,
                    expandedItemId === item.itemId && styles.moverRowExpanded,
                  ]}
                  activeOpacity={0.7}
                  onPress={() =>
                    setExpandedItemId(
                      expandedItemId === item.itemId ? null : item.itemId
                    )
                  }
                  onLongPress={() =>
                    router.push(`/inventory/${item.itemId}` as any)
                  }
                >
                  <View style={styles.moverInfo}>
                    <Text style={styles.moverName} numberOfLines={1}>
                      {item.itemName}
                    </Text>
                    <Text style={styles.moverQty}>
                      {metric === "cost"
                        ? `$${item.totalCost.toFixed(2)}`
                        : `${item.totalQty.toFixed(1)} total`}
                    </Text>
                  </View>
                  <BarSparkline
                    data={item.sparkline}
                    color={metric === "cost" ? "#E9B44C" : "#4FC3F7"}
                  />
                </TouchableOpacity>
                {expandedItemId === item.itemId && (
                  <View style={styles.expandedCard}>
                    <UsageChartCard
                      itemId={item.itemId}
                      locationId={selectedLocationId!}
                    />
                    <TouchableOpacity
                      style={styles.viewDetailBtn}
                      onPress={() =>
                        router.push(`/inventory/${item.itemId}` as any)
                      }
                    >
                      <Text style={styles.viewDetailBtnText}>
                        View Full Detail
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            !usageLoading ? (
              <Text style={styles.emptyText}>
                No usage data for this period.
              </Text>
            ) : null
          }
          contentContainerStyle={styles.usageListContent}
        />
      </View>
    );
  }

  // Stock view (default)
  return (
    <View style={styles.container}>
      {/* Scan to Import FAB */}
      <TouchableOpacity
        style={styles.scanFab}
        onPress={() => router.push("/scan-import" as any)}
        activeOpacity={0.8}
      >
        <Text style={styles.scanFabText}>Scan Import</Text>
      </TouchableOpacity>

      {renderPinnedHeader()}

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        ListHeaderComponent={
          <>
            {posCoverage && posCoverage.totalItems > 0 && (
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
            )}
            {(() => {
              const belowMinCount = Array.from(parMap.values()).filter(
                (p) => p.status === "red"
              ).length;
              return (
                <TouchableOpacity
                  style={styles.parCard}
                  onPress={() => router.push("/par-levels" as any)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.parCardTitle}>Par Levels</Text>
                  <Text style={styles.parCardMeta}>
                    {belowMinCount > 0
                      ? `${belowMinCount} item${belowMinCount !== 1 ? "s" : ""} below min`
                      : "View par levels & days to stockout"}
                  </Text>
                </TouchableOpacity>
              );
            })()}
          </>
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

  // View toggle
  viewToggleRow: {
    flexDirection: "row",
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 8,
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 3,
  },
  viewToggle: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },
  viewToggleActive: {
    backgroundColor: "#E9B44C",
  },
  viewToggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#5A6A7A",
  },
  viewToggleTextActive: {
    color: "#0B1623",
  },

  // Quick actions
  quickActionRow: {
    flexDirection: "row",
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 8,
  },
  quickAction: {
    flex: 1,
    backgroundColor: "#16283F",
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8899AA",
  },

  // Stock list
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
  parCard: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1E3550",
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 14,
  },
  parCardTitle: { fontSize: 14, fontWeight: "600", color: "#E9B44C" },
  parCardMeta: { fontSize: 12, color: "#8899AA", marginTop: 4 },
  scanFab: {
    position: "absolute",
    bottom: 92,
    right: 16,
    backgroundColor: "#E9B44C",
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
    zIndex: 1000,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  scanFabText: { color: "#0B1623", fontSize: 13, fontWeight: "700" },

  // Usage styles
  usageListContent: { padding: 16 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "#16283F",
  },
  pillActive: {
    backgroundColor: "#E9B44C",
  },
  pillText: {
    fontSize: 13,
    color: "#5A6A7A",
    fontWeight: "600",
  },
  pillTextActive: {
    color: "#0B1623",
  },
  metricPill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "#16283F",
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  metricPillActive: {
    backgroundColor: "#2BA8A0",
    borderColor: "#2BA8A0",
  },
  metricPillText: {
    fontSize: 13,
    color: "#8899AA",
    fontWeight: "600",
  },
  metricPillTextActive: {
    color: "#FFF",
  },
  separator: {
    width: 1,
    height: 20,
    backgroundColor: "#1E3550",
  },
  groupPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "#16283F",
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  groupPillActive: {
    backgroundColor: "#9C27B0",
    borderColor: "#9C27B0",
  },
  groupPillText: {
    fontSize: 13,
    color: "#8899AA",
    fontWeight: "600",
  },
  groupPillTextActive: {
    color: "#FFF",
  },
  categoryScroll: {
    marginBottom: 16,
  },
  categoryScrollContent: {
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "#16283F",
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  categoryChipActive: {
    backgroundColor: "#E9B44C",
    borderColor: "#E9B44C",
  },
  categoryChipText: {
    fontSize: 12,
    color: "#8899AA",
    fontWeight: "600",
  },
  categoryChipTextActive: {
    color: "#0B1623",
  },
  chartCard: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 16,
    marginBottom: 20,
  },
  usageSectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#EAF0FF",
    marginBottom: 12,
  },
  center: {
    height: 160,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    textAlign: "center",
    color: "#5A6A7A",
    fontSize: 14,
    marginTop: 40,
  },
  moverRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#16283F",
    padding: 14,
    borderRadius: 8,
    marginBottom: 8,
  },
  moverRowExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    marginBottom: 0,
  },
  moverInfo: {
    flex: 1,
    marginRight: 12,
  },
  moverName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#EAF0FF",
  },
  moverQty: {
    fontSize: 12,
    color: "#5A6A7A",
    marginTop: 2,
  },
  expandedCard: {
    backgroundColor: "#16283F",
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
    marginBottom: 8,
    borderTopWidth: 1,
    borderTopColor: "#1E3550",
  },
  viewDetailBtn: {
    marginTop: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  viewDetailBtnText: {
    fontSize: 13,
    color: "#E9B44C",
    fontWeight: "600",
  },
});
