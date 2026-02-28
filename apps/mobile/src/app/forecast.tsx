import { useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from "react-native";
import { router } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";
import { UsageBarChart } from "@/components/charts/UsageBarChart";
import { BarSparkline } from "@/components/charts/BarSparkline";

function formatCurrency(value: number): string {
  return "$" + value.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type StatusLevel = "reorder" | "low" | "ok";

function getStatus(item: { needsReorderSoon: boolean; daysToStockout: number | null }): StatusLevel {
  if (item.needsReorderSoon) return "reorder";
  if (item.daysToStockout != null && item.daysToStockout <= 7) return "low";
  return "ok";
}

const STATUS_CONFIG: Record<StatusLevel, { label: string; color: string; bg: string }> = {
  reorder: { label: "Reorder Now", color: "#EF4444", bg: "rgba(239, 68, 68, 0.15)" },
  low: { label: "Low Stock", color: "#F59E0B", bg: "rgba(245, 158, 11, 0.15)" },
  ok: { label: "OK", color: "#4CAF50", bg: "rgba(76, 175, 80, 0.15)" },
};

export default function ForecastScreen() {
  const { selectedLocationId } = useAuth();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: dashboard, isLoading } = trpc.reports.forecastDashboard.useQuery(
    { locationId: selectedLocationId! },
    { enabled: !!selectedLocationId }
  );

  const { data: accuracy } = trpc.reports.forecastAccuracy.useQuery(
    { locationId: selectedLocationId!, sessionCount: 5 },
    { enabled: !!selectedLocationId }
  );

  const { data: itemDetail } = trpc.reports.forecastItemDetail.useQuery(
    { locationId: selectedLocationId!, itemId: expandedId! },
    { enabled: !!selectedLocationId && !!expandedId }
  );

  const filteredItems = useMemo(() => {
    if (!dashboard?.items) return [];
    if (!search.trim()) return dashboard.items;
    const q = search.toLowerCase();
    return dashboard.items.filter(
      (i) =>
        i.itemName.toLowerCase().includes(q) ||
        (i.categoryName && i.categoryName.toLowerCase().includes(q))
    );
  }, [dashboard?.items, search]);

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

  const summary = dashboard?.summary;
  const accuracyPct = accuracy?.avgAccuracy;

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.inventoryItemId}
        ListHeaderComponent={
          <>
            {/* Summary Cards */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.cardsScroll}
              contentContainerStyle={styles.cardsRow}
            >
              <View
                style={[
                  styles.summaryCard,
                  summary && summary.itemsNeedingReorderSoon > 0
                    ? styles.summaryCardRed
                    : styles.summaryCardGreen,
                ]}
              >
                <Text
                  style={
                    summary && summary.itemsNeedingReorderSoon > 0
                      ? styles.summaryLabelRed
                      : styles.summaryLabelGreen
                  }
                >
                  Needs Reorder
                </Text>
                <Text
                  style={
                    summary && summary.itemsNeedingReorderSoon > 0
                      ? styles.summaryValueRed
                      : styles.summaryValueGreen
                  }
                >
                  {summary?.itemsNeedingReorderSoon ?? 0}
                </Text>
              </View>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>COGS (7d)</Text>
                <Text style={styles.summaryValue}>
                  {summary ? formatCurrency(summary.projectedCogs7d) : "—"}
                </Text>
              </View>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Accuracy</Text>
                <Text style={styles.summaryValue}>
                  {accuracyPct != null ? `${accuracyPct.toFixed(0)}%` : "—"}
                </Text>
              </View>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Items Tracked</Text>
                <Text style={styles.summaryValue}>
                  {summary?.totalItems ?? 0}
                </Text>
              </View>
            </ScrollView>

            {/* Search */}
            <TextInput
              style={styles.searchInput}
              placeholder="Search items..."
              placeholderTextColor="#5A6A7A"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </>
        }
        renderItem={({ item }) => {
          const status = getStatus(item);
          const config = STATUS_CONFIG[status];
          const isExpanded = expandedId === item.inventoryItemId;

          return (
            <TouchableOpacity
              style={styles.itemRow}
              activeOpacity={0.7}
              onPress={() =>
                setExpandedId(isExpanded ? null : item.inventoryItemId)
              }
            >
              <View>
                {/* Main row */}
                <View style={styles.itemTopRow}>
                  <View style={styles.itemLeft}>
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {item.itemName}
                      </Text>
                      <Text style={styles.itemCategory}>
                        {item.categoryName ?? "Uncategorized"}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.badge, { backgroundColor: config.bg }]}>
                    <Text style={[styles.badgeText, { color: config.color }]}>
                      {config.label}
                    </Text>
                  </View>
                </View>

                {/* Stats row */}
                <View style={styles.statsRow}>
                  <View style={styles.stat}>
                    <Text style={styles.statLabel}>Stockout</Text>
                    <Text
                      style={[
                        styles.statValue,
                        item.daysToStockout != null && item.daysToStockout <= 3
                          ? styles.textRed
                          : item.daysToStockout != null && item.daysToStockout <= 7
                          ? styles.textYellow
                          : null,
                      ]}
                    >
                      {item.daysToStockout != null ? `${item.daysToStockout}d` : "—"}
                    </Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statLabel}>Usage/day</Text>
                    <Text style={styles.statValue}>
                      {item.forecastDailyUsage.toFixed(1)}
                    </Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statLabel}>Reorder by</Text>
                    <Text style={styles.statValue}>
                      {item.reorderByDate ? formatDate(item.reorderByDate) : "—"}
                    </Text>
                  </View>
                </View>

                {/* Expanded Detail */}
                {isExpanded && (
                  <ExpandedDetail
                    item={item}
                    detail={itemDetail}
                    locationId={selectedLocationId}
                  />
                )}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              {search ? "No matching items." : "No forecast data available."}
            </Text>
            <Text style={styles.emptySubtext}>
              Forecast data requires counting sessions and consumption history.
            </Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

function ExpandedDetail({
  item,
  detail,
  locationId,
}: {
  item: { inventoryItemId: string; forecastDailyUsage: number; daysToStockout: number | null; parLevel: number | null; minLevel: number | null };
  detail: any;
  locationId: string;
}) {
  // Show last 14 days of historical data as bar chart
  const chartData = useMemo(() => {
    if (!detail?.historical) return [];
    const recent = detail.historical.slice(-14);
    return recent.map((d: { date: string; qty: number }) => ({
      label: new Date(d.date).toLocaleDateString(undefined, { day: "numeric" }),
      value: d.qty,
    }));
  }, [detail?.historical]);

  // DOW pattern as sparkline data (Sun through Sat)
  const dowData = useMemo(() => {
    if (!detail?.dowPattern) return [];
    return detail.dowPattern.map((d: { ratio: number }) => d.ratio);
  }, [detail?.dowPattern]);

  const dowLabels = detail?.dowPattern?.map((d: { day: string }) => d.day) ?? [];

  return (
    <View style={styles.expandedSection}>
      {!detail ? (
        <ActivityIndicator color="#E9B44C" style={{ marginVertical: 12 }} />
      ) : (
        <>
          {/* Usage chart */}
          {chartData.length > 0 && (
            <View style={styles.chartContainer}>
              <Text style={styles.chartTitle}>Daily Usage (14d)</Text>
              <UsageBarChart data={chartData} height={140} barColor="#E9B44C" />
            </View>
          )}

          {/* Forecast summary */}
          <Text style={styles.forecastSummary}>
            Forecast: {item.forecastDailyUsage.toFixed(1)}/day
            {item.daysToStockout != null
              ? `, stockout in ${item.daysToStockout}d`
              : ""}
          </Text>

          {/* DOW pattern */}
          {dowData.length > 0 && (
            <View style={styles.dowSection}>
              <Text style={styles.dowTitle}>Day-of-Week Pattern</Text>
              <View style={styles.dowChart}>
                {detail.dowPattern.map(
                  (d: { day: string; ratio: number }, i: number) => {
                    const maxRatio = Math.max(
                      ...detail.dowPattern.map((p: { ratio: number }) => p.ratio),
                      1
                    );
                    const barHeight = Math.max(2, (d.ratio / maxRatio) * 32);
                    return (
                      <View key={i} style={styles.dowBar}>
                        <View
                          style={{
                            width: 12,
                            height: barHeight,
                            backgroundColor: "#4FC3F7",
                            borderRadius: 2,
                          }}
                        />
                        <Text style={styles.dowLabel}>{d.day.slice(0, 2)}</Text>
                      </View>
                    );
                  }
                )}
              </View>
            </View>
          )}

          {/* Par/min levels */}
          {(item.parLevel != null || item.minLevel != null) && (
            <Text style={styles.parText}>
              Par: {item.parLevel ?? "—"} / Min: {item.minLevel ?? "—"}
            </Text>
          )}

          {/* View item link */}
          <TouchableOpacity
            style={styles.viewItemBtn}
            onPress={() =>
              router.push(`/inventory/${item.inventoryItemId}` as any)
            }
          >
            <Text style={styles.viewItemText}>View Item</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623" },
  listContent: { padding: 16, paddingBottom: 40 },

  // Summary cards
  cardsScroll: { marginBottom: 12 },
  cardsRow: { gap: 10, paddingRight: 4 },
  summaryCard: {
    width: 130,
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  summaryCardRed: { borderColor: "rgba(239, 68, 68, 0.3)" },
  summaryCardGreen: { borderColor: "rgba(76, 175, 80, 0.3)" },
  summaryLabel: { fontSize: 12, color: "#8899AA", fontWeight: "600" },
  summaryLabelRed: { fontSize: 12, color: "#EF4444", fontWeight: "600" },
  summaryLabelGreen: { fontSize: 12, color: "#4CAF50", fontWeight: "600" },
  summaryValue: {
    fontSize: 22,
    fontWeight: "700",
    color: "#EAF0FF",
    marginTop: 4,
  },
  summaryValueRed: {
    fontSize: 22,
    fontWeight: "700",
    color: "#EF4444",
    marginTop: 4,
  },
  summaryValueGreen: {
    fontSize: 22,
    fontWeight: "700",
    color: "#4CAF50",
    marginTop: 4,
  },

  // Search
  searchInput: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: "#EAF0FF",
    borderWidth: 1,
    borderColor: "#1E3550",
    marginBottom: 12,
  },

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
    justifyContent: "space-between",
  },
  itemLeft: { flex: 1, marginRight: 10 },
  itemInfo: {},
  itemName: { fontSize: 14, fontWeight: "600", color: "#EAF0FF" },
  itemCategory: { fontSize: 12, color: "#5A6A7A", marginTop: 2 },

  // Badge
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: { fontSize: 11, fontWeight: "700" },

  // Stats row
  statsRow: {
    flexDirection: "row",
    marginTop: 10,
    gap: 16,
  },
  stat: {},
  statLabel: { fontSize: 11, color: "#5A6A7A" },
  statValue: { fontSize: 14, fontWeight: "600", color: "#EAF0FF", marginTop: 1 },
  textRed: { color: "#EF4444" },
  textYellow: { color: "#F59E0B" },

  // Expanded
  expandedSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#1E3550",
  },
  chartContainer: { marginBottom: 12 },
  chartTitle: { fontSize: 12, color: "#8899AA", fontWeight: "600", marginBottom: 6 },
  forecastSummary: {
    fontSize: 13,
    color: "#2BA8A0",
    fontWeight: "600",
    marginBottom: 10,
  },

  // DOW
  dowSection: { marginBottom: 10 },
  dowTitle: { fontSize: 12, color: "#8899AA", fontWeight: "600", marginBottom: 6 },
  dowChart: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    height: 52,
  },
  dowBar: { alignItems: "center" },
  dowLabel: { fontSize: 9, color: "#5A6A7A", marginTop: 4 },

  parText: { fontSize: 12, color: "#8899AA", marginBottom: 10 },

  viewItemBtn: {
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: "#0B1623",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  viewItemText: { fontSize: 13, color: "#42A5F5", fontWeight: "600" },

  // Empty
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
});
