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
import { UsageBarChart } from "@/components/charts/UsageBarChart";
import { UsageChartCard } from "@/components/charts/UsageChartCard";
import { BarSparkline } from "@/components/charts/BarSparkline";

type Period = "7d" | "30d" | "90d";
type Metric = "qty" | "cost";

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

export default function UsageTab() {
  const { selectedLocationId, user } = useAuth();
  const [period, setPeriod] = useState<Period>("7d");
  const [metric, setMetric] = useState<Metric>("qty");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const { fromDate, toDate } = useMemo(() => getDateRange(period), [period]);

  const { data: categories } = trpc.itemCategories.list.useQuery(
    { businessId: user?.businessId! },
    { enabled: !!user?.businessId }
  );

  const { data, isLoading } = trpc.reports.usageOverTime.useQuery(
    {
      locationId: selectedLocationId!,
      fromDate,
      toDate,
      granularity: getGranularity(period),
      categoryId: categoryId || undefined,
    },
    {
      enabled: !!selectedLocationId,
      staleTime: 5 * 60 * 1000,
    }
  );

  const aggregateChartData = useMemo(() => {
    if (!data?.buckets) return [];
    return data.buckets.map((b) => ({
      label: formatBucketLabel(b.period, period),
      value: metric === "cost" ? (b.totalCost ?? 0) : b.totalQty,
    }));
  }, [data, period, metric]);

  const topMovers = useMemo(() => {
    if (!data?.itemSeries) return [];
    return data.itemSeries
      .map((s) => ({
        itemId: s.itemId,
        itemName: s.itemName,
        totalQty: s.dataPoints.reduce((sum, dp) => sum + dp.qty, 0),
        totalCost: s.dataPoints.reduce((sum, dp) => sum + (dp.cost ?? 0), 0),
        sparkline: s.dataPoints.map((dp) =>
          metric === "cost" ? (dp.cost ?? 0) : dp.qty
        ),
      }))
      .sort((a, b) =>
        metric === "cost"
          ? b.totalCost - a.totalCost
          : b.totalQty - a.totalQty
      );
  }, [data, metric]);

  const chartTitle =
    period === "90d"
      ? "Weekly Usage"
      : "Daily Usage";

  if (!selectedLocationId) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>Select a location to view usage.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={topMovers}
        keyExtractor={(item) => item.itemId}
        ListHeaderComponent={
          <>
            {/* Period toggle */}
            <View style={styles.toggleRow}>
              {(["7d", "30d", "90d"] as Period[]).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.pill, period === p && styles.pillActive]}
                  onPress={() => setPeriod(p)}
                >
                  <Text
                    style={[
                      styles.pillText,
                      period === p && styles.pillTextActive,
                    ]}
                  >
                    {p}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Metric toggle */}
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
                  <Text
                    style={[
                      styles.metricPillText,
                      metric === m.key && styles.metricPillTextActive,
                    ]}
                  >
                    {m.label}
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
                  style={[
                    styles.categoryChip,
                    categoryId === null && styles.categoryChipActive,
                  ]}
                  onPress={() => setCategoryId(null)}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      categoryId === null && styles.categoryChipTextActive,
                    ]}
                  >
                    All
                  </Text>
                </TouchableOpacity>
                {categories.map((cat: any) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.categoryChip,
                      categoryId === cat.id && styles.categoryChipActive,
                    ]}
                    onPress={() =>
                      setCategoryId(categoryId === cat.id ? null : cat.id)
                    }
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        categoryId === cat.id && styles.categoryChipTextActive,
                      ]}
                    >
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Aggregate chart */}
            <View style={styles.chartCard}>
              <Text style={styles.sectionTitle}>{chartTitle}</Text>
              {isLoading ? (
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

            {/* Top movers header */}
            {topMovers.length > 0 && (
              <Text style={styles.sectionTitle}>Top Movers</Text>
            )}
          </>
        }
        renderItem={({ item }) => (
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
        )}
        ListEmptyComponent={
          !isLoading ? (
            <Text style={styles.emptyText}>No usage data for this period.</Text>
          ) : null
        }
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623" },
  listContent: { padding: 16 },
  toggleRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
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
  sectionTitle: {
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
