import { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";

// ─── Types & Constants ──────────────────────────────────────

const METRIC_CONFIG: Record<
  string,
  { label: string; format: "dollar" | "pct" | "number" | "days"; lowerIsBetter?: boolean }
> = {
  pourCostPct: { label: "Pour Cost %", format: "pct", lowerIsBetter: true },
  varianceImpact: { label: "Variance Impact", format: "dollar", lowerIsBetter: true },
  cogs7d: { label: "COGS (7d)", format: "dollar" },
  shrinkageSuspects: { label: "Shrinkage Suspects", format: "number", lowerIsBetter: true },
  countFrequencyDays: { label: "Count Frequency", format: "days", lowerIsBetter: true },
  mappingCoveragePct: { label: "Mapping Coverage", format: "pct" },
};

const DISPLAY_METRICS = Object.keys(METRIC_CONFIG);

const TREND_METRICS = [
  "pourCostPct",
  "varianceImpact",
  "cogs7d",
  "onHandValue",
  "mappingCoveragePct",
  "countFrequencyDays",
] as const;

const TREND_METRIC_LABELS: Record<string, string> = {
  pourCostPct: "Pour Cost %",
  varianceImpact: "Variance",
  cogs7d: "COGS (7d)",
  onHandValue: "On-Hand Value",
  mappingCoveragePct: "Mapping %",
  countFrequencyDays: "Count Freq",
};

const PEER_FILTERS = [
  { key: "all", label: "All" },
  { key: "1", label: "Small (1)" },
  { key: "2-5", label: "Medium (2-5)" },
  { key: "6+", label: "Large (6+)" },
] as const;

const SCREEN_WIDTH = Dimensions.get("window").width;
const CHART_WIDTH = SCREEN_WIDTH - 64; // 32px padding on each side
const CHART_HEIGHT = 180;

// ─── Formatting Helpers ─────────────────────────────────────

function formatValue(value: number | null | undefined, format: string): string {
  if (value == null) return "--";
  switch (format) {
    case "dollar":
      return "$" + Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    case "pct":
      return value.toFixed(1) + "%";
    case "days":
      return value.toFixed(1) + "d";
    default:
      return value.toFixed(1);
  }
}

function getIndicatorColor(
  value: number | null,
  p25: number | null,
  p75: number | null,
  lowerIsBetter?: boolean,
): string {
  if (value == null || p25 == null || p75 == null) return "#5A6A7A";
  if (lowerIsBetter) {
    if (value <= p25) return "#4ade80";
    if (value >= p75) return "#f87171";
    return "#fbbf24";
  }
  if (value >= p75) return "#4ade80";
  if (value <= p25) return "#f87171";
  return "#fbbf24";
}

function getPositionPct(
  value: number | null,
  p25: number | null,
  p75: number | null,
): number | null {
  if (value == null || p25 == null || p75 == null || p75 === p25) return null;
  return Math.max(0, Math.min(100, ((value - p25) / (p75 - p25)) * 100));
}

// ─── Custom Mini Line Chart ─────────────────────────────────

function MiniLineChart({
  data,
  width = CHART_WIDTH,
  height = CHART_HEIGHT,
  lineColor = "#E9B44C",
  secondaryData,
  secondaryColor = "#6B7280",
  yDomain,
  xLabels,
  zones,
}: {
  data: (number | null)[];
  width?: number;
  height?: number;
  lineColor?: string;
  secondaryData?: (number | null)[];
  secondaryColor?: string;
  yDomain?: [number, number];
  xLabels?: string[];
  zones?: { from: number; to: number; color: string }[];
}) {
  const allValues = [
    ...data.filter((v): v is number => v != null),
    ...(secondaryData?.filter((v): v is number => v != null) ?? []),
  ];
  if (allValues.length === 0) return null;

  const minY = yDomain?.[0] ?? Math.min(...allValues) * 0.9;
  const maxY = yDomain?.[1] ?? Math.max(...allValues) * 1.1;
  const range = maxY - minY || 1;

  const plotH = height - 24; // bottom padding for labels
  const plotW = width;
  const stepX = data.length > 1 ? plotW / (data.length - 1) : plotW;

  const toY = (v: number) => plotH - ((v - minY) / range) * plotH;

  const renderLine = (values: (number | null)[], color: string, dashed?: boolean) => {
    const segments: { x: number; y: number }[][] = [];
    let current: { x: number; y: number }[] = [];
    values.forEach((v, i) => {
      if (v == null) {
        if (current.length > 0) {
          segments.push(current);
          current = [];
        }
        return;
      }
      current.push({ x: i * stepX, y: toY(v) });
    });
    if (current.length > 0) segments.push(current);

    return segments.map((seg, si) =>
      seg.map((pt, pi) => {
        if (pi === 0) return null;
        const prev = seg[pi - 1];
        const dx = pt.x - prev.x;
        const dy = pt.y - prev.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        return (
          <View
            key={`${si}-${pi}`}
            style={{
              position: "absolute",
              left: prev.x,
              top: prev.y,
              width: len,
              height: dashed ? 1 : 2,
              backgroundColor: color,
              transform: [{ rotate: `${angle}deg` }],
              transformOrigin: "left center",
              opacity: dashed ? 0.6 : 1,
            }}
          />
        );
      }),
    );
  };

  const renderDots = (values: (number | null)[], color: string) =>
    values.map((v, i) => {
      if (v == null) return null;
      return (
        <View
          key={i}
          style={{
            position: "absolute",
            left: i * stepX - 3,
            top: toY(v) - 3,
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: color,
          }}
        />
      );
    });

  return (
    <View style={{ width, height }}>
      {/* Zone backgrounds */}
      {zones?.map((zone, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: toY(zone.to),
            height: toY(zone.from) - toY(zone.to),
            backgroundColor: zone.color,
          }}
        />
      ))}
      {/* Lines */}
      {secondaryData && renderLine(secondaryData, secondaryColor, true)}
      {renderLine(data, lineColor)}
      {renderDots(data, lineColor)}
      {/* X labels */}
      {xLabels && (
        <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between" }}>
          {xLabels.map((label, i) => (
            <Text key={i} style={{ fontSize: 9, color: "#5A6A7A", width: 36, textAlign: "center" }}>
              {label}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ────────────────────────────────────────────

export default function BenchmarkingScreen() {
  const { user } = useAuth();
  const businessId = user?.businessId ?? "";
  const [peerFilter, setPeerFilter] = useState<string>("all");
  const [trendMetric, setTrendMetric] = useState<string>("pourCostPct");
  const [rankMetric, setRankMetric] = useState<string>("pourCostPct");

  const peerFilterInput = useMemo(() => {
    if (peerFilter === "all") return undefined;
    return { locationCountTier: peerFilter as "1" | "2-5" | "6+" };
  }, [peerFilter]);

  // ─── Queries ────────────────────────────────────────────

  const { data: benchmarks, isLoading: benchLoading } = trpc.reports.industryBenchmarks.useQuery(
    { businessId, peerFilter: peerFilterInput },
    { enabled: !!businessId, staleTime: 5 * 60_000 },
  );

  const sevenDaysAgo = useMemo(() => new Date(Date.now() - 7 * 86400000), []);
  const now = useMemo(() => new Date(), []);
  const { data: portfolio } = trpc.reports.portfolioRollup.useQuery(
    { businessId, fromDate: sevenDaysAgo, toDate: now },
    { enabled: !!businessId, staleTime: 5 * 60_000 },
  );

  const { data: trend, isLoading: trendLoading } = trpc.reports.benchmarkTrend.useQuery(
    { businessId, weeks: 12 },
    { enabled: !!businessId, staleTime: 5 * 60_000 },
  );

  const { data: history, isLoading: historyLoading } = trpc.reports.percentileHistory.useQuery(
    { businessId, weeks: 12 },
    { enabled: !!businessId, staleTime: 10 * 60_000 },
  );

  // ─── Computed ───────────────────────────────────────────

  const businessAvg = useMemo((): Record<string, number | null> => {
    if (!portfolio?.totals) return {} as Record<string, number | null>;
    const t = portfolio.totals;
    const n = t.totalLocations || 1;
    return {
      onHandValue: t.totalOnHandValue / n,
      cogs7d: t.totalCogs / n,
      varianceImpact: t.totalVarianceImpact / n,
      shrinkageSuspects: t.totalShrinkageSuspects / n,
      pourCostPct: t.avgPourCostPct ?? null,
      mappingCoveragePct: t.avgMappingCoveragePct ?? null,
      reorderCount: t.totalReorderCount / n,
      countFrequencyDays: (t as any).avgCountFrequencyDays ?? null,
    };
  }, [portfolio]);

  const trendChartData = useMemo(() => {
    if (!trend) return { business: [], industry: [], labels: [] };
    return {
      business: trend.map((pt) => (pt.business as any)[trendMetric] ?? null),
      industry: trend.map((pt) => (pt.industryMedian as any)[trendMetric] ?? null),
      labels: trend.map((pt) => {
        const [, m, d] = pt.snapshotDate.split("-");
        return `${m}/${d}`;
      }),
    };
  }, [trend, trendMetric]);

  const rankChartData = useMemo(() => {
    if (!history) return { ranks: [], labels: [] };
    return {
      ranks: history.map((pt) => (pt.ranks as any)[rankMetric] ?? null),
      labels: history.map((pt) => {
        const [, m, d] = pt.snapshotDate.split("-");
        return `${m}/${d}`;
      }),
    };
  }, [history, rankMetric]);

  // ─── Render ─────────────────────────────────────────────

  if (benchLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#E9B44C" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <Text style={styles.title}>Industry Benchmarks</Text>
      <Text style={styles.subtitle}>
        Based on {benchmarks?.optedInCount ?? 0} anonymous business
        {(benchmarks?.optedInCount ?? 0) !== 1 ? "es" : ""}
      </Text>

      {/* Peer Filter Chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {PEER_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.chip, peerFilter === f.key && styles.chipActive]}
            onPress={() => setPeerFilter(f.key)}
          >
            <Text style={[styles.chipText, peerFilter === f.key && styles.chipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {benchmarks?.peerGroup && (
        <Text style={styles.peerGroupHint}>
          Comparing against {benchmarks.peerGroup.filteredCount} business
          {benchmarks.peerGroup.filteredCount !== 1 ? "es" : ""} in peer group
        </Text>
      )}

      {/* Metric Cards Grid */}
      {(!benchmarks || benchmarks.optedInCount === 0) ? (
        <View style={styles.card}>
          <Text style={styles.emptyText}>
            No benchmark data available yet. Snapshots are captured weekly.
          </Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {DISPLAY_METRICS.map((key) => {
            const cfg = METRIC_CONFIG[key];
            const perc = benchmarks.metrics[key as keyof typeof benchmarks.metrics] as
              | { p25: number | null; p50: number | null; p75: number | null }
              | undefined;
            const myVal = businessAvg[key] ?? null;
            const color = getIndicatorColor(myVal, perc?.p25 ?? null, perc?.p75 ?? null, cfg.lowerIsBetter);
            const posPct = getPositionPct(myVal, perc?.p25 ?? null, perc?.p75 ?? null);

            return (
              <View key={key} style={styles.metricCard}>
                <Text style={styles.metricLabel}>{cfg.label}</Text>
                <Text style={[styles.metricValue, { color }]}>
                  {formatValue(myVal, cfg.format)}
                </Text>
                {/* Position bar */}
                {posPct != null && (
                  <View style={styles.positionBar}>
                    <View style={[styles.positionFill, { width: `${posPct}%` as any, backgroundColor: color }]} />
                  </View>
                )}
                <View style={styles.percentileRow}>
                  <Text style={styles.percentileText}>P25: {formatValue(perc?.p25, cfg.format)}</Text>
                  <Text style={styles.percentileText}>P50: {formatValue(perc?.p50, cfg.format)}</Text>
                  <Text style={styles.percentileText}>P75: {formatValue(perc?.p75, cfg.format)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Trend Chart */}
      <View style={[styles.section, { marginTop: 24 }]}>
        <Text style={styles.sectionTitle}>Trend Over Time</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {TREND_METRICS.map((key) => (
            <TouchableOpacity
              key={key}
              style={[styles.chip, trendMetric === key && styles.chipActive]}
              onPress={() => setTrendMetric(key)}
            >
              <Text style={[styles.chipText, trendMetric === key && styles.chipTextActive]}>
                {TREND_METRIC_LABELS[key] ?? key}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {trendLoading ? (
          <ActivityIndicator size="small" color="#E9B44C" style={{ marginTop: 16 }} />
        ) : trendChartData.business.length === 0 ? (
          <Text style={styles.emptyText}>Not enough data yet. Capture snapshots weekly.</Text>
        ) : (
          <View style={styles.chartContainer}>
            <MiniLineChart
              data={trendChartData.business}
              secondaryData={trendChartData.industry}
              xLabels={
                trendChartData.labels.length <= 6
                  ? trendChartData.labels
                  : trendChartData.labels.filter((_, i) => i % Math.ceil(trendChartData.labels.length / 6) === 0)
              }
            />
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendLine, { backgroundColor: "#E9B44C" }]} />
                <Text style={styles.legendText}>Your Business</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendLine, { backgroundColor: "#6B7280", opacity: 0.6 }]} />
                <Text style={styles.legendText}>Industry Median</Text>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Ranking Chart */}
      <View style={[styles.section, { marginTop: 24 }]}>
        <Text style={styles.sectionTitle}>Percentile Ranking</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {TREND_METRICS.map((key) => (
            <TouchableOpacity
              key={key}
              style={[styles.chip, rankMetric === key && styles.chipActive]}
              onPress={() => setRankMetric(key)}
            >
              <Text style={[styles.chipText, rankMetric === key && styles.chipTextActive]}>
                {TREND_METRIC_LABELS[key] ?? key}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {historyLoading ? (
          <ActivityIndicator size="small" color="#E9B44C" style={{ marginTop: 16 }} />
        ) : rankChartData.ranks.length === 0 ? (
          <Text style={styles.emptyText}>Not enough data yet.</Text>
        ) : (
          <View style={styles.chartContainer}>
            <MiniLineChart
              data={rankChartData.ranks}
              yDomain={[0, 100]}
              xLabels={
                rankChartData.labels.length <= 6
                  ? rankChartData.labels
                  : rankChartData.labels.filter((_, i) => i % Math.ceil(rankChartData.labels.length / 6) === 0)
              }
              zones={[
                { from: 0, to: 25, color: "rgba(239,68,68,0.08)" },
                { from: 25, to: 75, color: "rgba(234,179,8,0.06)" },
                { from: 75, to: 100, color: "rgba(34,197,94,0.08)" },
              ]}
            />
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "#4ade80" }]} />
                <Text style={styles.legendText}>Top 25%</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "#fbbf24" }]} />
                <Text style={styles.legendText}>Middle</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "#f87171" }]} />
                <Text style={styles.legendText}>Bottom 25%</Text>
              </View>
            </View>
          </View>
        )}
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

// ─── Styles ─────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623" },
  content: { padding: 16, paddingBottom: 32 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0B1623" },
  title: { fontSize: 22, fontWeight: "700", color: "#EAF0FF" },
  subtitle: { fontSize: 13, color: "#5A6A7A", marginTop: 4 },
  peerGroupHint: { fontSize: 12, color: "#E9B44C", opacity: 0.7, marginBottom: 8 },
  chipRow: { flexDirection: "row", marginTop: 12, marginBottom: 12 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    marginRight: 8,
  },
  chipActive: { backgroundColor: "#E9B44C" },
  chipText: { fontSize: 13, color: "#5A6A7A" },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricCard: {
    width: (SCREEN_WIDTH - 42) / 2,
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  metricLabel: { fontSize: 11, fontWeight: "600", color: "#5A6A7A", textTransform: "uppercase", letterSpacing: 0.5 },
  metricValue: { fontSize: 22, fontWeight: "700", marginTop: 4 },
  positionBar: { height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.08)", marginTop: 8 },
  positionFill: { height: 4, borderRadius: 2 },
  percentileRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  percentileText: { fontSize: 10, color: "#5A6A7A" },
  section: {},
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#EAF0FF", marginBottom: 4 },
  card: { backgroundColor: "#16283F", borderRadius: 10, padding: 16, borderWidth: 1, borderColor: "#1E3550" },
  emptyText: { fontSize: 13, color: "#5A6A7A", marginTop: 8 },
  chartContainer: { marginTop: 12, backgroundColor: "#16283F", borderRadius: 10, padding: 16, borderWidth: 1, borderColor: "#1E3550" },
  legend: { flexDirection: "row", justifyContent: "center", gap: 16, marginTop: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendLine: { width: 16, height: 2, borderRadius: 1 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: "#5A6A7A" },
});
