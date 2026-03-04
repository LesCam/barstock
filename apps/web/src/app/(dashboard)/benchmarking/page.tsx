"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "@/components/location-context";
import Link from "next/link";
import { PageTip } from "@/components/page-tip";
import { HelpLink } from "@/components/help-link";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, ReferenceLine,
} from "recharts";

const METRIC_LABELS: Record<string, { label: string; format: "dollar" | "pct" | "number" | "days"; lowerIsBetter?: boolean }> = {
  onHandValue: { label: "On-Hand Value", format: "dollar" },
  cogs7d: { label: "COGS (7d)", format: "dollar" },
  varianceImpact: { label: "Variance Impact", format: "dollar", lowerIsBetter: true },
  shrinkageSuspects: { label: "Shrinkage Suspects", format: "number", lowerIsBetter: true },
  pourCostPct: { label: "Pour Cost %", format: "pct", lowerIsBetter: true },
  mappingCoveragePct: { label: "Mapping Coverage %", format: "pct" },
  reorderCount: { label: "Items to Reorder", format: "number" },
  avgSessionDurationMin: { label: "Avg Session Duration", format: "number" },
  itemsPerSession: { label: "Items per Session", format: "number" },
  countFrequencyDays: { label: "Count Frequency", format: "days", lowerIsBetter: true },
  activeItemCount: { label: "Active Items", format: "number" },
};

const TREND_METRICS = [
  "pourCostPct", "varianceImpact", "cogs7d", "onHandValue",
  "mappingCoveragePct", "countFrequencyDays",
] as const;

function formatValue(value: number | null, format: string): string {
  if (value == null) return "--";
  switch (format) {
    case "dollar":
      return "$" + Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  lowerIsBetter?: boolean
): string {
  if (value == null || p25 == null || p75 == null) return "text-[#EAF0FF]/60";
  if (lowerIsBetter) {
    if (value <= p25) return "text-green-400";
    if (value >= p75) return "text-red-400";
    return "text-yellow-400";
  }
  if (value >= p75) return "text-green-400";
  if (value <= p25) return "text-red-400";
  return "text-yellow-400";
}

function getIndicatorBg(
  value: number | null,
  p25: number | null,
  p75: number | null,
  lowerIsBetter?: boolean
): string {
  if (value == null || p25 == null || p75 == null) return "bg-white/5";
  if (lowerIsBetter) {
    if (value <= p25) return "bg-green-500/10 border-green-500/20";
    if (value >= p75) return "bg-red-500/10 border-red-500/20";
    return "bg-yellow-500/10 border-yellow-500/20";
  }
  if (value >= p75) return "bg-green-500/10 border-green-500/20";
  if (value <= p25) return "bg-red-500/10 border-red-500/20";
  return "bg-yellow-500/10 border-yellow-500/20";
}

export default function BenchmarkingPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const businessId = user?.businessId as string | undefined;
  const { selectedLocationId, setSelectedLocationId, locations } = useLocation();
  const isPlatformAdmin = user?.highestRole === "platform_admin";
  const isAdmin =
    user?.highestRole === "business_admin" || isPlatformAdmin;

  if (!isAdmin) {
    return (
      <div className="text-[#EAF0FF]/60">
        You need business admin access to view benchmarking data.
      </div>
    );
  }

  if (!businessId) {
    return <div className="text-[#EAF0FF]/60">No business selected.</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[#EAF0FF]">Benchmarking</h1>
            <HelpLink section="benchmarking" tooltip="Learn about benchmarking" />
          </div>
          <p className="mt-1 text-sm text-[#EAF0FF]/50">
            Compare your locations and see how you stack up against the industry
          </p>
        </div>
        {isPlatformAdmin && (
          <Link
            href="/benchmarking/platform"
            className="rounded-md bg-white/10 px-3 py-1.5 text-sm text-[#EAF0FF] hover:bg-white/15"
          >
            Platform View
          </Link>
        )}
      </div>

      <PageTip
        tipId="benchmarking"
        title="Industry Benchmarks"
        description="Compare variance, COGS, and counting cadence against averages."
      />

      <MyLocationsSection businessId={businessId} onSelectLocation={setSelectedLocationId} />
      <IndustryBenchmarksSection businessId={businessId} />
      <CategoryBenchmarksSection businessId={businessId} />
      <TrendSection businessId={businessId} />
      <RankingTrendSection businessId={businessId} />
      <SnapshotActions businessId={businessId} isPlatformAdmin={isPlatformAdmin} />
    </div>
  );
}

// ─── Section A: My Locations Comparison ─────────────────────

function MyLocationsSection({
  businessId,
  onSelectLocation,
}: {
  businessId: string;
  onSelectLocation: (id: string) => void;
}) {
  const sevenDaysAgo = useMemo(() => new Date(Date.now() - 7 * 86400000), []);
  const now = useMemo(() => new Date(), []);

  const { data, isLoading } = trpc.reports.portfolioRollup.useQuery(
    { businessId, fromDate: sevenDaysAgo, toDate: now },
    { staleTime: 5 * 60_000 }
  );

  if (isLoading) {
    return (
      <div className="rounded-lg border border-white/10 bg-[#16283F] p-6">
        <div className="h-6 w-48 animate-pulse rounded bg-white/10" />
        <div className="mt-4 h-48 animate-pulse rounded bg-white/10" />
      </div>
    );
  }

  if (!data?.locations?.length) {
    return (
      <div className="rounded-lg border border-white/10 bg-[#16283F] p-6">
        <h2 className="text-lg font-semibold text-[#EAF0FF]">My Locations</h2>
        <p className="mt-2 text-sm text-[#EAF0FF]/50">No location data available yet.</p>
      </div>
    );
  }

  const fmt = (v: number) =>
    "$" + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (v: number | null) => (v != null ? v.toFixed(1) + "%" : "--");

  return (
    <div className="rounded-lg border border-white/10 bg-[#16283F]">
      <div className="border-b border-white/10 px-6 py-4">
        <h2 className="text-lg font-semibold text-[#EAF0FF]">My Locations</h2>
        <p className="mt-0.5 text-xs text-[#EAF0FF]/40">
          Compare performance across your {data.locations.length} location{data.locations.length !== 1 ? "s" : ""}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs font-medium uppercase tracking-wide text-[#EAF0FF]/50">
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">On-Hand</th>
              <th className="px-4 py-3">COGS (7d)</th>
              <th className="px-4 py-3">Variance</th>
              <th className="px-4 py-3">Pour Cost %</th>
              <th className="px-4 py-3">Mapping %</th>
              <th className="px-4 py-3">Reorder</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {data.locations.map((loc) => (
              <tr key={loc.locationId} className="hover:bg-[#1a3050]">
                <td className="px-4 py-3">
                  <button
                    onClick={() => onSelectLocation(loc.locationId)}
                    className="font-medium text-[#E9B44C] hover:text-[#C8922E]"
                  >
                    {loc.locationName}
                  </button>
                </td>
                <td className="px-4 py-3 text-[#EAF0FF]">{fmt(loc.onHandValue)}</td>
                <td className="px-4 py-3 text-[#EAF0FF]">{fmt(loc.cogs7d)}</td>
                <td className={`px-4 py-3 ${loc.varianceImpact < 0 ? "text-red-400" : "text-[#EAF0FF]"}`}>
                  {fmt(Math.abs(loc.varianceImpact))}
                  {loc.varianceImpact < 0 ? " loss" : ""}
                </td>
                <td className={`px-4 py-3 ${(loc.pourCostPct ?? 0) > 25 ? "text-amber-400" : "text-[#EAF0FF]"}`}>
                  {pct(loc.pourCostPct)}
                </td>
                <td className={`px-4 py-3 ${loc.mappingCoveragePct < 70 ? "text-red-400" : loc.mappingCoveragePct >= 90 ? "text-green-400" : "text-[#EAF0FF]"}`}>
                  {loc.mappingCoveragePct}%
                </td>
                <td className={`px-4 py-3 ${loc.reorderCount > 0 ? "text-red-400" : "text-[#EAF0FF]"}`}>
                  {loc.reorderCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Section B: Industry Benchmarks ─────────────────────────

function IndustryBenchmarksSection({ businessId }: { businessId: string }) {
  const [locationTier, setLocationTier] = useState<string>("all");
  const [itemTier, setItemTier] = useState<string>("all");

  const peerFilter = useMemo(() => {
    const f: Record<string, string> = {};
    if (locationTier !== "all") f.locationCountTier = locationTier;
    if (itemTier !== "all") f.activeItemCountTier = itemTier;
    return Object.keys(f).length > 0 ? f : undefined;
  }, [locationTier, itemTier]);

  const { data: settings } = trpc.settings.get.useQuery({ businessId });
  const { data: benchmarks, isLoading } = trpc.reports.industryBenchmarks.useQuery(
    { businessId, peerFilter: peerFilter as any },
    { enabled: !!businessId, staleTime: 5 * 60_000 }
  );

  const sevenDaysAgo = useMemo(() => new Date(Date.now() - 7 * 86400000), []);
  const now = useMemo(() => new Date(), []);
  const { data: portfolio } = trpc.reports.portfolioRollup.useQuery(
    { businessId, fromDate: sevenDaysAgo, toDate: now },
    { staleTime: 5 * 60_000 }
  );

  const optedIn = settings?.benchmarking?.optedIn ?? false;

  if (!optedIn) {
    return (
      <div className="rounded-lg border border-white/10 bg-[#16283F] p-6">
        <h2 className="text-lg font-semibold text-[#EAF0FF]">Industry Benchmarks</h2>
        <p className="mt-2 text-sm text-[#EAF0FF]/50">
          Opt in to benchmarking in{" "}
          <Link href="/settings" className="text-[#E9B44C] hover:underline">
            Settings
          </Link>{" "}
          to see how your business compares to the industry.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-white/10 bg-[#16283F] p-6">
        <div className="h-6 w-48 animate-pulse rounded bg-white/10" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      </div>
    );
  }

  if (!benchmarks || benchmarks.optedInCount === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-[#16283F] p-6">
        <h2 className="text-lg font-semibold text-[#EAF0FF]">Industry Benchmarks</h2>
        <p className="mt-2 text-sm text-[#EAF0FF]/50">
          No benchmark data available yet. Capture a snapshot to get started.
        </p>
      </div>
    );
  }

  // Compute business averages from portfolio
  const businessAvg: Record<string, number | null> = {};
  if (portfolio?.totals) {
    const t = portfolio.totals;
    const n = t.totalLocations || 1;
    businessAvg.onHandValue = t.totalOnHandValue / n;
    businessAvg.cogs7d = t.totalCogs / n;
    businessAvg.varianceImpact = t.totalVarianceImpact / n;
    businessAvg.shrinkageSuspects = t.totalShrinkageSuspects / n;
    businessAvg.pourCostPct = t.avgPourCostPct;
    businessAvg.mappingCoveragePct = t.avgMappingCoveragePct;
    businessAvg.reorderCount = t.totalReorderCount / n;
  }

  const displayMetrics = [
    "pourCostPct", "varianceImpact", "mappingCoveragePct",
    "cogs7d", "onHandValue", "countFrequencyDays",
    "shrinkageSuspects", "reorderCount", "activeItemCount",
  ];

  return (
    <div className="rounded-lg border border-white/10 bg-[#16283F]">
      <div className="border-b border-white/10 px-6 py-4">
        <h2 className="text-lg font-semibold text-[#EAF0FF]">Industry Benchmarks</h2>
        <p className="mt-0.5 text-xs text-[#EAF0FF]/40">
          Based on {benchmarks.optedInCount} opted-in business{benchmarks.optedInCount !== 1 ? "es" : ""} &middot; Snapshot: {benchmarks.snapshotDate}
        </p>
      </div>

      {/* Peer Group Filters */}
      <div className="border-b border-white/10 px-6 py-3 space-y-2">
        <div className="flex items-center gap-2 text-xs text-[#EAF0FF]/50">
          <span className="font-medium">Locations:</span>
          {(["all", "1", "2-5", "6+"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setLocationTier(t)}
              className={`rounded-full px-2.5 py-0.5 text-xs transition ${
                locationTier === t
                  ? "bg-[#E9B44C] text-white"
                  : "bg-white/5 text-[#EAF0FF]/60 hover:bg-white/10"
              }`}
            >
              {t === "all" ? "All" : t === "1" ? "Single" : t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-[#EAF0FF]/50">
          <span className="font-medium">Item Count:</span>
          {(["all", "1-100", "101-500", "500+"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setItemTier(t)}
              className={`rounded-full px-2.5 py-0.5 text-xs transition ${
                itemTier === t
                  ? "bg-[#E9B44C] text-white"
                  : "bg-white/5 text-[#EAF0FF]/60 hover:bg-white/10"
              }`}
            >
              {t === "all" ? "All" : t}
            </button>
          ))}
        </div>
        {benchmarks.peerGroup && (
          <p className="text-xs text-[#E9B44C]/70">
            Comparing against {benchmarks.peerGroup.filteredCount} business{benchmarks.peerGroup.filteredCount !== 1 ? "es" : ""} in your peer group
          </p>
        )}
      </div>

      <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
        {displayMetrics.map((key) => {
          const meta = METRIC_LABELS[key];
          if (!meta) return null;
          const perc = benchmarks.metrics[key as keyof typeof benchmarks.metrics];
          const myVal = businessAvg[key] ?? null;

          return (
            <div
              key={key}
              className={`rounded-lg border p-4 ${getIndicatorBg(myVal, perc?.p25 ?? null, perc?.p75 ?? null, meta.lowerIsBetter)}`}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-[#EAF0FF]/50">
                {meta.label}
              </p>
              <p className={`mt-1 text-xl font-bold ${getIndicatorColor(myVal, perc?.p25 ?? null, perc?.p75 ?? null, meta.lowerIsBetter)}`}>
                {formatValue(myVal, meta.format)}
              </p>
              <div className="mt-2 flex gap-3 text-xs text-[#EAF0FF]/40">
                <span>P25: {formatValue(perc?.p25 ?? null, meta.format)}</span>
                <span>Median: {formatValue(perc?.p50 ?? null, meta.format)}</span>
                <span>P75: {formatValue(perc?.p75 ?? null, meta.format)}</span>
              </div>
              {/* Position bar */}
              {myVal != null && perc?.p25 != null && perc?.p75 != null && (
                <div className="mt-2 h-1.5 w-full rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[#E9B44C]"
                    style={{
                      width: `${Math.max(0, Math.min(100, perc.p75 !== perc.p25 ? ((myVal - perc.p25) / (perc.p75 - perc.p25)) * 100 : 50))}%`,
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Section C: Trend Over Time ─────────────────────────────

function TrendSection({ businessId }: { businessId: string }) {
  const [selectedMetric, setSelectedMetric] = useState<string>("pourCostPct");

  const { data: trend, isLoading } = trpc.reports.benchmarkTrend.useQuery(
    { businessId, weeks: 12 },
    { staleTime: 5 * 60_000 }
  );

  const meta = METRIC_LABELS[selectedMetric];

  const chartData = useMemo(() => {
    if (!trend) return [];
    return trend.map((pt) => ({
      date: pt.snapshotDate,
      business: pt.business[selectedMetric as keyof typeof pt.business],
      industry: pt.industryMedian[selectedMetric as keyof typeof pt.industryMedian],
    }));
  }, [trend, selectedMetric]);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-white/10 bg-[#16283F] p-6">
        <div className="h-6 w-48 animate-pulse rounded bg-white/10" />
        <div className="mt-4 h-64 animate-pulse rounded bg-white/5" />
      </div>
    );
  }

  if (!trend || trend.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-[#16283F] p-6">
        <h2 className="text-lg font-semibold text-[#EAF0FF]">Trend Over Time</h2>
        <p className="mt-2 text-sm text-[#EAF0FF]/50">
          No trend data yet. Capture snapshots weekly to see trends.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/10 bg-[#16283F]">
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-[#EAF0FF]">Trend Over Time</h2>
          <p className="mt-0.5 text-xs text-[#EAF0FF]/40">Last {trend.length} weeks</p>
        </div>
        <select
          value={selectedMetric}
          onChange={(e) => setSelectedMetric(e.target.value)}
          className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-1.5 text-sm text-[#EAF0FF] focus:border-[#E9B44C]/50 focus:outline-none"
        >
          {TREND_METRICS.map((key) => (
            <option key={key} value={key}>
              {METRIC_LABELS[key]?.label ?? key}
            </option>
          ))}
        </select>
      </div>

      <div className="p-6">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <XAxis
              dataKey="date"
              tick={{ fill: "#EAF0FF80", fontSize: 11 }}
              tickFormatter={(d) => {
                const [, m, day] = (d as string).split("-");
                return `${m}/${day}`;
              }}
            />
            <YAxis
              tick={{ fill: "#EAF0FF80", fontSize: 11 }}
              tickFormatter={(v) => {
                if (!meta) return String(v);
                if (meta.format === "dollar") return "$" + (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v.toFixed(0));
                if (meta.format === "pct") return v.toFixed(0) + "%";
                return v.toFixed(0);
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#16283F",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "0.5rem",
                color: "#EAF0FF",
              }}
              formatter={(value, name) => {
                if (value == null) return ["--", name ?? ""];
                return [formatValue(Number(value), meta?.format ?? "number"), name === "business" ? "Your Business" : "Industry Median"];
              }}
            />
            <Line
              type="monotone"
              dataKey="business"
              stroke="#E9B44C"
              strokeWidth={2}
              dot={{ r: 3, fill: "#E9B44C" }}
              name="business"
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="industry"
              stroke="#6B7280"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              name="industry"
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>

        <div className="mt-3 flex items-center justify-center gap-6 text-xs text-[#EAF0FF]/50">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 bg-[#E9B44C]" /> Your Business
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 border-b border-dashed border-[#6B7280]" /> Industry Median
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Section D: Category Benchmarks ─────────────────────────

const CATEGORY_METRIC_LABELS: Record<string, { label: string; format: "dollar" | "pct" | "number"; lowerIsBetter?: boolean }> = {
  onHandValue: { label: "On-Hand Value", format: "dollar" },
  cogs7d: { label: "COGS (7d)", format: "dollar" },
  varianceImpact: { label: "Variance Impact", format: "dollar", lowerIsBetter: true },
  activeItemCount: { label: "Active Items", format: "number" },
  pourCostPct: { label: "Pour Cost %", format: "pct", lowerIsBetter: true },
};

function CategoryBenchmarksSection({ businessId }: { businessId: string }) {
  const { data: benchmarks } = trpc.reports.industryBenchmarks.useQuery(
    { businessId },
    { enabled: !!businessId, staleTime: 5 * 60_000 }
  );
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const categoryBenchmarks = benchmarks?.categoryBenchmarks;
  if (!categoryBenchmarks?.length) return null;

  const activeGroup = selectedGroup ?? categoryBenchmarks[0]?.groupKey ?? null;
  const current = categoryBenchmarks.find((c) => c.groupKey === activeGroup);

  return (
    <div className="rounded-lg border border-white/10 bg-[#16283F]">
      <div className="border-b border-white/10 px-6 py-4">
        <h2 className="text-lg font-semibold text-[#EAF0FF]">Category Benchmarks</h2>
        <p className="mt-0.5 text-xs text-[#EAF0FF]/40">
          Compare performance by category or counting method
        </p>
      </div>

      {/* Category/group selector pills */}
      <div className="flex flex-wrap gap-2 border-b border-white/10 px-6 py-3">
        {categoryBenchmarks.map((cb) => (
          <button
            key={cb.groupKey}
            onClick={() => setSelectedGroup(cb.groupKey)}
            className={`rounded-full px-3 py-1 text-xs transition ${
              activeGroup === cb.groupKey
                ? "bg-[#E9B44C] text-white"
                : "bg-white/5 text-[#EAF0FF]/60 hover:bg-white/10"
            }`}
          >
            {cb.groupKey}
            <span className="ml-1 text-[10px] opacity-60">
              ({cb.groupType === "category" ? "cat" : "type"}, {cb.businessCount} biz)
            </span>
          </button>
        ))}
      </div>

      {current && (
        <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(CATEGORY_METRIC_LABELS).map(([key, meta]) => {
            const perc = current.metrics[key as keyof typeof current.metrics];
            const myVal = current.callerValue?.[key as keyof typeof current.callerValue] as number | null ?? null;

            return (
              <div
                key={key}
                className={`rounded-lg border p-4 ${getIndicatorBg(myVal, perc?.p25 ?? null, perc?.p75 ?? null, meta.lowerIsBetter)}`}
              >
                <p className="text-xs font-medium uppercase tracking-wide text-[#EAF0FF]/50">
                  {meta.label}
                </p>
                <p className={`mt-1 text-xl font-bold ${getIndicatorColor(myVal, perc?.p25 ?? null, perc?.p75 ?? null, meta.lowerIsBetter)}`}>
                  {formatValue(myVal, meta.format)}
                </p>
                <div className="mt-2 flex gap-3 text-xs text-[#EAF0FF]/40">
                  <span>P25: {formatValue(perc?.p25 ?? null, meta.format)}</span>
                  <span>Median: {formatValue(perc?.p50 ?? null, meta.format)}</span>
                  <span>P75: {formatValue(perc?.p75 ?? null, meta.format)}</span>
                </div>
                {myVal != null && perc?.p25 != null && perc?.p75 != null && (
                  <div className="mt-2 h-1.5 w-full rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-[#E9B44C]"
                      style={{
                        width: `${Math.max(0, Math.min(100, perc.p75 !== perc.p25 ? ((myVal - perc.p25) / (perc.p75 - perc.p25)) * 100 : 50))}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Section E: Ranking Trend ───────────────────────────────

const RANK_METRICS = [
  { key: "pourCostPct", label: "Pour Cost %" },
  { key: "varianceImpact", label: "Variance Impact" },
  { key: "mappingCoveragePct", label: "Mapping Coverage %" },
  { key: "countFrequencyDays", label: "Count Frequency" },
  { key: "onHandValue", label: "On-Hand Value" },
  { key: "cogs7d", label: "COGS (7d)" },
  { key: "shrinkageSuspects", label: "Shrinkage Suspects" },
] as const;

function RankingTrendSection({ businessId }: { businessId: string }) {
  const [selectedMetric, setSelectedMetric] = useState("pourCostPct");

  const { data: history, isLoading } = trpc.reports.percentileHistory.useQuery(
    { businessId, weeks: 12 },
    { staleTime: 10 * 60_000 }
  );

  const chartData = useMemo(() => {
    if (!history) return [];
    return history.map((pt) => ({
      date: pt.snapshotDate,
      rank: pt.ranks[selectedMetric] ?? null,
      count: pt.optedInCount,
    }));
  }, [history, selectedMetric]);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-white/10 bg-[#16283F] p-6">
        <div className="h-6 w-48 animate-pulse rounded bg-white/10" />
        <div className="mt-4 h-64 animate-pulse rounded bg-white/5" />
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-[#16283F] p-6">
        <h2 className="text-lg font-semibold text-[#EAF0FF]">Percentile Ranking Trend</h2>
        <p className="mt-2 text-sm text-[#EAF0FF]/50">
          Not enough data yet. Capture snapshots weekly to track your ranking over time.
        </p>
      </div>
    );
  }

  const metricLabel = RANK_METRICS.find((m) => m.key === selectedMetric)?.label ?? selectedMetric;

  return (
    <div className="rounded-lg border border-white/10 bg-[#16283F]">
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-[#EAF0FF]">Percentile Ranking Trend</h2>
          <p className="mt-0.5 text-xs text-[#EAF0FF]/40">
            Your ranking over {history.length} snapshot{history.length !== 1 ? "s" : ""}
          </p>
        </div>
        <select
          value={selectedMetric}
          onChange={(e) => setSelectedMetric(e.target.value)}
          className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-1.5 text-sm text-[#EAF0FF] focus:border-[#E9B44C]/50 focus:outline-none"
        >
          {RANK_METRICS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="p-6">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <defs>
              <linearGradient id="greenZone" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="yellowZone" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#eab308" stopOpacity={0.1} />
                <stop offset="100%" stopColor="#eab308" stopOpacity={0.03} />
              </linearGradient>
              <linearGradient id="redZone" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.1} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tick={{ fill: "#EAF0FF80", fontSize: 11 }}
              tickFormatter={(d) => {
                const [, m, day] = (d as string).split("-");
                return `${m}/${day}`;
              }}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: "#EAF0FF80", fontSize: 11 }}
              tickFormatter={(v) => `p${v}`}
            />
            <ReferenceLine y={75} stroke="#22c55e" strokeDasharray="3 3" strokeOpacity={0.4} />
            <ReferenceLine y={50} stroke="#eab308" strokeDasharray="3 3" strokeOpacity={0.4} />
            <ReferenceLine y={25} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.4} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#16283F",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "0.5rem",
                color: "#EAF0FF",
              }}
              formatter={(value, _name, props) => {
                if (value == null) return ["--", metricLabel];
                const count = (props?.payload as any)?.count;
                return [`${value}th percentile${count ? ` (${count} businesses)` : ""}`, metricLabel];
              }}
            />
            <Line
              type="monotone"
              dataKey="rank"
              stroke="#E9B44C"
              strokeWidth={2}
              dot={{ r: 4, fill: "#E9B44C" }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>

        <div className="mt-3 flex items-center justify-center gap-6 text-xs text-[#EAF0FF]/50">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-green-400" /> Above p75
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-yellow-400" /> p25–p75
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-red-400" /> Below p25
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Snapshot Actions ───────────────────────────────────────

function SnapshotActions({
  businessId,
  isPlatformAdmin,
}: {
  businessId: string;
  isPlatformAdmin: boolean;
}) {
  const utils = trpc.useUtils();

  const captureBusinessMutation = trpc.reports.captureBusinessSnapshot.useMutation({
    onSuccess: () => {
      utils.reports.industryBenchmarks.invalidate();
      utils.reports.benchmarkTrend.invalidate();
    },
  });

  const captureAllMutation = trpc.reports.captureSnapshots.useMutation({
    onSuccess: () => {
      utils.reports.industryBenchmarks.invalidate();
      utils.reports.benchmarkTrend.invalidate();
    },
  });

  return (
    <div className="rounded-lg border border-white/10 bg-[#16283F] p-6">
      <h2 className="mb-3 text-lg font-semibold text-[#EAF0FF]">Snapshot Actions</h2>
      <p className="mb-4 text-xs text-[#EAF0FF]/40">
        Capture a point-in-time snapshot of your metrics. In production this runs weekly on a schedule.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => captureBusinessMutation.mutate({ businessId })}
          disabled={captureBusinessMutation.isPending}
          className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-white hover:bg-[#D4A43C] disabled:opacity-50"
        >
          {captureBusinessMutation.isPending ? "Capturing..." : "Capture My Snapshot"}
        </button>

        {isPlatformAdmin && (
          <button
            onClick={() => captureAllMutation.mutate({})}
            disabled={captureAllMutation.isPending}
            className="rounded-md bg-white/10 px-4 py-2 text-sm font-medium text-[#EAF0FF] hover:bg-white/15 disabled:opacity-50"
          >
            {captureAllMutation.isPending ? "Capturing All..." : "Capture All Businesses"}
          </button>
        )}
      </div>

      {captureBusinessMutation.isSuccess && (
        <p className="mt-3 text-sm text-green-400">
          Captured {captureBusinessMutation.data} location snapshot{captureBusinessMutation.data !== 1 ? "s" : ""}.
        </p>
      )}
      {captureAllMutation.isSuccess && (
        <p className="mt-3 text-sm text-green-400">
          Captured snapshots for {captureAllMutation.data.businessCount} business{captureAllMutation.data.businessCount !== 1 ? "es" : ""} ({captureAllMutation.data.locationCount} locations).
        </p>
      )}
      {(captureBusinessMutation.error || captureAllMutation.error) && (
        <p className="mt-3 text-sm text-red-400">
          {captureBusinessMutation.error?.message || captureAllMutation.error?.message}
        </p>
      )}
    </div>
  );
}
