import { useState, useMemo } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { trpc } from "@/lib/trpc";
import { UsageBarChart } from "./UsageBarChart";

type Period = "7d" | "30d";

interface UsageChartCardProps {
  itemId: string;
  locationId: string;
}

function getDateRange(period: Period) {
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - (period === "7d" ? 7 : 30));
  return { fromDate, toDate };
}

function formatLabel(dateStr: string, period: Period): string {
  const d = new Date(dateStr);
  if (period === "7d") {
    return d.toLocaleDateString("en", { weekday: "short" }).slice(0, 3);
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function UsageChartCard({ itemId, locationId }: UsageChartCardProps) {
  const [period, setPeriod] = useState<Period>("7d");
  const { fromDate, toDate } = useMemo(() => getDateRange(period), [period]);

  const { data, isLoading } = trpc.reports.usageItemDetail.useQuery(
    {
      locationId,
      itemId,
      fromDate,
      toDate,
      granularity: period === "7d" ? "day" : "day",
    },
    { staleTime: 5 * 60 * 1000 }
  );

  const chartData = useMemo(() => {
    if (!data?.periods) return [];
    return data.periods.map((p) => ({
      label: formatLabel(p.period, period),
      value: p.qty,
    }));
  }, [data, period]);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Usage</Text>
        <View style={styles.toggleRow}>
          {(["7d", "30d"] as Period[]).map((p) => (
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
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#4FC3F7" />
        </View>
      ) : chartData.length === 0 || chartData.every((d) => d.value === 0) ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No usage data</Text>
        </View>
      ) : (
        <UsageBarChart data={chartData} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: "#EAF0FF",
  },
  toggleRow: {
    flexDirection: "row",
    gap: 6,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#0B1623",
  },
  pillActive: {
    backgroundColor: "#E9B44C",
  },
  pillText: {
    fontSize: 12,
    color: "#5A6A7A",
    fontWeight: "600",
  },
  pillTextActive: {
    color: "#0B1623",
  },
  center: {
    height: 160,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 13,
    color: "#5A6A7A",
  },
});
