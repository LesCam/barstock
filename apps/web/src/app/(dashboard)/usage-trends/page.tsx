"use client";

import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";
import { useLocation } from "@/components/location-context";
import { PageTip } from "@/components/page-tip";
import { HelpLink } from "@/components/help-link";
import { downloadCsv } from "@/lib/download-csv";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type Period = "7d" | "30d" | "90d";
type Metric = "cost" | "qty";
type UsageSortKey = "name" | "categoryName" | "quantityUsed" | "unitCost" | "totalCost";
type SortDir = "asc" | "desc";

const AREA_COLORS = [
  "#E9B44C", "#4CAF50", "#2196F3", "#FF5722", "#9C27B0",
  "#00BCD4", "#FF9800", "#607D8B", "#E91E63", "#8BC34A",
  "#795548",
];

const PERIOD_CONFIG: Record<Period, { days: number; granularity: "day" | "week"; label: string }> = {
  "7d": { days: 7, granularity: "day", label: "7 Days" },
  "30d": { days: 30, granularity: "day", label: "30 Days" },
  "90d": { days: 90, granularity: "week", label: "90 Days" },
};

function formatBucketLabel(period: string, gran: "day" | "week" | "month") {
  const d = new Date(period);
  if (gran === "day") return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (gran === "week") return `Wk ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default function UsageTrendsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const { selectedLocationId: locationId } = useLocation();
  const businessId = user?.businessId as string | undefined;

  const [period, setPeriod] = useState<Period>("30d");
  const [metric, setMetric] = useState<Metric>("cost");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [stacked, setStacked] = useState(true);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [usageSortKey, setUsageSortKey] = useState<UsageSortKey>("totalCost");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const config = PERIOD_CONFIG[period];
  const now = new Date();
  const fromDate = new Date(now.getTime() - config.days * 24 * 60 * 60 * 1000);
  const toDate = now;

  // Previous period for period-over-period comparison
  const prevFromDate = new Date(fromDate.getTime() - config.days * 24 * 60 * 60 * 1000);
  const prevToDate = fromDate;

  // --- Queries ---

  const { data: usageOverTime, isLoading: loadingOverTime } = trpc.reports.usageOverTime.useQuery(
    {
      locationId: locationId!,
      fromDate,
      toDate,
      granularity: config.granularity,
      categoryId: categoryFilter || undefined,
    },
    { enabled: !!locationId }
  );

  const { data: usageOverTimePrev } = trpc.reports.usageOverTime.useQuery(
    {
      locationId: locationId!,
      fromDate: prevFromDate,
      toDate: prevToDate,
      granularity: config.granularity,
      categoryId: categoryFilter || undefined,
    },
    { enabled: !!locationId }
  );

  const { data: categories } = trpc.itemCategories.list.useQuery(
    { businessId: businessId!, activeOnly: true },
    { enabled: !!businessId }
  );

  const { data: usage, isLoading: loadingUsage } = trpc.reports.usage.useQuery(
    {
      locationId: locationId!,
      fromDate,
      toDate,
    },
    { enabled: !!locationId }
  );

  const { data: usageByVendor, isLoading: loadingVendor } = trpc.reports.usageByVendor.useQuery(
    {
      locationId: locationId!,
      fromDate,
      toDate,
      granularity: config.granularity,
      categoryId: categoryFilter || undefined,
    },
    { enabled: !!locationId }
  );

  const { data: usageItemDetail } = trpc.reports.usageItemDetail.useQuery(
    {
      locationId: locationId!,
      itemId: expandedItemId!,
      fromDate,
      toDate,
      granularity: config.granularity,
    },
    { enabled: !!locationId && !!expandedItemId }
  );

  // --- Computed data ---

  // KPIs
  const totalUnits = useMemo(() => {
    if (!usageOverTime?.buckets) return 0;
    return usageOverTime.buckets.reduce((s, b) => s + b.totalQty, 0);
  }, [usageOverTime]);

  const totalCost = useMemo(() => {
    if (!usageOverTime?.buckets) return 0;
    return usageOverTime.buckets.reduce((s, b) => s + b.totalCost, 0);
  }, [usageOverTime]);

  const avgDaily = useMemo(() => {
    if (!usageOverTime?.buckets || usageOverTime.buckets.length === 0) return 0;
    const total = metric === "cost" ? totalCost : totalUnits;
    return total / config.days;
  }, [usageOverTime, totalCost, totalUnits, metric, config.days]);

  const pctChange = useMemo(() => {
    if (!usageOverTimePrev?.buckets || usageOverTimePrev.buckets.length === 0) return null;
    const prevTotal = usageOverTimePrev.buckets.reduce(
      (s, b) => s + (metric === "cost" ? b.totalCost : b.totalQty),
      0
    );
    const curTotal = metric === "cost" ? totalCost : totalUnits;
    if (prevTotal === 0) return null;
    return ((curTotal - prevTotal) / prevTotal) * 100;
  }, [usageOverTimePrev, totalCost, totalUnits, metric]);

  // Primary stacked area chart data
  const areaChartData = useMemo(() => {
    if (!usageOverTime?.buckets || !usageOverTime?.itemSeries) return [];
    return usageOverTime.buckets.map((b, i) => {
      const point: Record<string, string | number> = {
        label: formatBucketLabel(b.period, config.granularity),
        total: metric === "cost" ? b.totalCost : b.totalQty,
      };
      for (const series of usageOverTime.itemSeries) {
        const dp = series.dataPoints[i];
        point[series.itemName] = metric === "cost" ? (dp?.cost ?? 0) : (dp?.qty ?? 0);
      }
      return point;
    });
  }, [usageOverTime, config.granularity, metric]);

  // Vendor area chart data
  const vendorAreaChartData = useMemo(() => {
    if (!usageByVendor?.buckets || !usageByVendor?.vendorSeries) return [];
    return usageByVendor.buckets.map((b, i) => {
      const point: Record<string, string | number> = {
        label: formatBucketLabel(b.period, config.granularity),
      };
      for (const series of usageByVendor.vendorSeries) {
        const dp = series.dataPoints[i];
        point[series.vendorName] = metric === "cost" ? (dp?.cost ?? 0) : (dp?.qty ?? 0);
      }
      return point;
    });
  }, [usageByVendor, config.granularity, metric]);

  // Item detail bar chart data
  const itemDetailChartData = useMemo(() => {
    if (!usageItemDetail?.periods) return [];
    return usageItemDetail.periods.map((p) => ({
      label: formatBucketLabel(p.period, config.granularity),
      value: metric === "cost" ? p.cost : p.qty,
    }));
  }, [usageItemDetail, config.granularity, metric]);

  // Sorted top items
  const sortedItems = useMemo(() => {
    if (!usage?.items) return [];
    const items = [...usage.items];
    items.sort((a, b) => {
      const aVal = a[usageSortKey];
      const bVal = b[usageSortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        const cmp = aVal.toLowerCase().localeCompare(bVal.toLowerCase());
        return sortDir === "asc" ? cmp : -cmp;
      }
      const aNum = (aVal as number) ?? 0;
      const bNum = (bVal as number) ?? 0;
      return sortDir === "asc" ? aNum - bNum : bNum - aNum;
    });
    return items.slice(0, 15);
  }, [usage, usageSortKey, sortDir]);

  // Toggle sort
  function toggleSort(key: UsageSortKey) {
    if (usageSortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setUsageSortKey(key);
      setSortDir("desc");
    }
  }

  // CSV export
  const handleExport = useCallback(() => {
    if (!sortedItems.length) return;
    const headers = ["Item", "Category", "Qty Used", "UOM", "Unit Cost", "Total Cost"];
    const rows = sortedItems.map((item) => [
      item.name,
      item.categoryName ?? "",
      item.quantityUsed.toFixed(1),
      item.uom,
      item.unitCost != null ? item.unitCost.toFixed(2) : "",
      item.totalCost != null ? item.totalCost.toFixed(2) : "",
    ]);
    downloadCsv(headers, rows, `usage-trends-${period}.csv`);
  }, [sortedItems, period]);

  // Sort header component
  function SortHeader({ label, field }: { label: string; field: UsageSortKey }) {
    const active = usageSortKey === field;
    return (
      <th
        className="cursor-pointer select-none px-4 py-3 hover:text-[#EAF0FF]/80"
        onClick={() => toggleSort(field)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <span className={`text-xs ${active ? "text-[#E9B44C]" : "text-[#EAF0FF]/30"}`}>
            {active ? (sortDir === "asc" ? "▲" : "▼") : "▲"}
          </span>
        </span>
      </th>
    );
  }

  // Tooltip styling
  const tooltipStyle = {
    backgroundColor: "#0B1623",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    color: "#EAF0FF",
  };

  // --- No location selected ---
  if (!locationId) {
    return (
      <div className="flex h-64 items-center justify-center text-[#EAF0FF]/40">
        Select a location to view usage trends.
      </div>
    );
  }

  const isLoading = loadingOverTime || loadingUsage;

  // --- Loading skeleton ---
  if (isLoading && !usageOverTime && !usage) {
    return (
      <div className="space-y-6 p-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Usage Trends</h1>
        <div className="grid gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border border-white/10 bg-[#16283F]" />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-lg border border-white/10 bg-[#16283F]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Usage Trends</h1>
        <HelpLink section="usage-trends" tooltip="Learn about usage trends" />
      </div>

      <PageTip
        tipId="usage-trends"
        title="Usage Trends"
        description="Track consumption patterns over time. Use period pills to change the time window, toggle between cost and quantity, and drill into individual items."
      />

      {/* Controls Bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Period pills */}
        <div className="flex items-center gap-1 rounded-lg bg-[#0B1623] p-0.5">
          {(["7d", "30d", "90d"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                period === p
                  ? "bg-[#16283F] text-[#E9B44C]"
                  : "text-[#EAF0FF]/60 hover:text-[#EAF0FF]/80"
              }`}
            >
              {PERIOD_CONFIG[p].label}
            </button>
          ))}
        </div>

        {/* Category filter */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-md border border-white/10 bg-[#0B1623] px-2 py-1 text-xs text-[#EAF0FF]"
        >
          <option value="">All Categories</option>
          {(categories ?? []).map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>

        {/* Stacked / Total toggle */}
        <div className="flex items-center gap-1 rounded-lg bg-[#0B1623] p-0.5">
          <button
            onClick={() => setStacked(true)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              stacked
                ? "bg-[#16283F] text-[#E9B44C]"
                : "text-[#EAF0FF]/60 hover:text-[#EAF0FF]/80"
            }`}
          >
            Stacked
          </button>
          <button
            onClick={() => setStacked(false)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              !stacked
                ? "bg-[#16283F] text-[#E9B44C]"
                : "text-[#EAF0FF]/60 hover:text-[#EAF0FF]/80"
            }`}
          >
            Total
          </button>
        </div>

        {/* Metric toggle */}
        <div className="flex items-center gap-1 rounded-lg bg-[#0B1623] p-0.5">
          {(["cost", "qty"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                metric === m
                  ? "bg-[#16283F] text-[#E9B44C]"
                  : "text-[#EAF0FF]/60 hover:text-[#EAF0FF]/80"
              }`}
            >
              {m === "cost" ? "Cost ($)" : "Quantity"}
            </button>
          ))}
        </div>

        {/* CSV export */}
        <button
          onClick={handleExport}
          disabled={!sortedItems.length}
          className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-1 text-xs font-medium text-[#EAF0FF]/60 transition-colors hover:text-[#EAF0FF]/80 disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-sm text-[#EAF0FF]/60">Total Units</p>
          <p className="text-2xl font-bold text-[var(--text-primary)]">
            {totalUnits.toFixed(1)}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-sm text-[#EAF0FF]/60">Total Cost</p>
          <p className="text-2xl font-bold text-[var(--text-primary)]">
            ${totalCost.toFixed(2)}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-sm text-[#EAF0FF]/60">
            Avg Daily {metric === "cost" ? "Cost" : "Usage"}
          </p>
          <p className="text-2xl font-bold text-[var(--text-primary)]">
            {metric === "cost" ? `$${avgDaily.toFixed(2)}` : avgDaily.toFixed(1)}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-sm text-[#EAF0FF]/60">vs Prior Period</p>
          {pctChange != null ? (
            <p
              className={`text-2xl font-bold ${
                pctChange > 0
                  ? "text-red-400"
                  : pctChange < 0
                    ? "text-green-400"
                    : "text-[var(--text-primary)]"
              }`}
            >
              {pctChange > 0 ? "+" : ""}
              {pctChange.toFixed(1)}%
            </p>
          ) : (
            <p className="text-2xl font-bold text-[#EAF0FF]/30">--</p>
          )}
        </div>
      </div>

      {/* Primary Area Chart */}
      <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
        <h2 className="mb-3 text-base font-semibold text-[var(--text-primary)]">
          Usage Over Time
        </h2>
        {areaChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={areaChartData}>
              <XAxis
                dataKey="label"
                tick={{ fill: "#EAF0FF", fontSize: 12 }}
                axisLine={{ stroke: "#ffffff1a" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#EAF0FF99", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => (metric === "cost" ? `$${v}` : `${v}`)}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) => [
                  metric === "cost"
                    ? `$${Number(value ?? 0).toFixed(2)}`
                    : Number(value ?? 0).toFixed(1),
                  name,
                ]}
              />
              {stacked && usageOverTime?.itemSeries ? (
                <>
                  <Legend wrapperStyle={{ fontSize: 11, color: "#EAF0FF" }} />
                  {usageOverTime.itemSeries.map((series, i) => (
                    <Area
                      key={series.itemId}
                      type="monotone"
                      dataKey={series.itemName}
                      stackId="1"
                      fill={AREA_COLORS[i % AREA_COLORS.length]}
                      stroke={AREA_COLORS[i % AREA_COLORS.length]}
                      fillOpacity={0.6}
                    />
                  ))}
                </>
              ) : (
                <Area
                  type="monotone"
                  dataKey="total"
                  fill="#E9B44C"
                  stroke="#E9B44C"
                  fillOpacity={0.3}
                  name={metric === "cost" ? "Total Cost" : "Total Qty"}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-12 text-center text-sm text-[#EAF0FF]/40">
            No usage data for this period.
          </p>
        )}
      </div>

      {/* Top 15 Items Table */}
      <div className="rounded-lg border border-white/10 bg-[#16283F]">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Top Items by Usage
          </h2>
          <span className="text-xs text-[#EAF0FF]/40">
            Showing top 15 items
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
              <tr>
                <th className="w-8 px-2 py-3" />
                <SortHeader label="Item" field="name" />
                <SortHeader label="Category" field="categoryName" />
                <SortHeader label="Qty Used" field="quantityUsed" />
                <th className="px-4 py-3">UOM</th>
                <SortHeader label="Unit Cost" field="unitCost" />
                <SortHeader label="Total Cost" field="totalCost" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sortedItems.map((item) => (
                <>
                  <tr
                    key={item.itemId}
                    className={`cursor-pointer transition-colors ${
                      expandedItemId === item.itemId
                        ? "bg-[#0B1623]"
                        : "hover:bg-[#0B1623]/60"
                    }`}
                    onClick={() =>
                      setExpandedItemId(
                        expandedItemId === item.itemId ? null : item.itemId
                      )
                    }
                  >
                    <td className="px-2 py-3 text-center text-[#EAF0FF]/40">
                      {expandedItemId === item.itemId ? "▼" : "▶"}
                    </td>
                    <td className="px-4 py-3 font-medium">{item.name}</td>
                    <td className="px-4 py-3 text-[#EAF0FF]/60">
                      {item.categoryName ?? "—"}
                    </td>
                    <td className="px-4 py-3">{item.quantityUsed.toFixed(1)}</td>
                    <td className="px-4 py-3 text-[#EAF0FF]/60">{item.uom}</td>
                    <td className="px-4 py-3">
                      {item.unitCost != null ? `$${item.unitCost.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {item.totalCost != null ? `$${item.totalCost.toFixed(2)}` : "—"}
                    </td>
                  </tr>
                  {expandedItemId === item.itemId && (
                    <tr key={`${item.itemId}-detail`}>
                      <td colSpan={7} className="bg-[#0B1623]/40 px-6 py-3">
                        {itemDetailChartData.length > 0 ? (
                          <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={itemDetailChartData}>
                              <XAxis
                                dataKey="label"
                                tick={{ fill: "#EAF0FF", fontSize: 11 }}
                                axisLine={{ stroke: "#ffffff1a" }}
                                tickLine={false}
                              />
                              <YAxis
                                tick={{ fill: "#EAF0FF99", fontSize: 10 }}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(v) =>
                                  metric === "cost" ? `$${v}` : `${v}`
                                }
                              />
                              <Tooltip
                                contentStyle={tooltipStyle}
                                formatter={(value) => [
                                  metric === "cost"
                                    ? `$${Number(value ?? 0).toFixed(2)}`
                                    : Number(value ?? 0).toFixed(1),
                                  metric === "cost" ? "Cost" : "Quantity",
                                ]}
                              />
                              <Bar
                                dataKey="value"
                                fill="#E9B44C"
                                radius={[4, 4, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : usageItemDetail ? (
                          <p className="py-3 text-center text-xs text-[#EAF0FF]/40">
                            No usage data for this item in the selected period.
                          </p>
                        ) : (
                          <p className="py-3 text-center text-xs text-[#EAF0FF]/40">
                            Loading usage trend...
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {sortedItems.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-[#EAF0FF]/40"
                  >
                    No usage data for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Vendor Breakdown Chart */}
      <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
        <h2 className="mb-3 text-base font-semibold text-[var(--text-primary)]">
          Usage by Vendor
        </h2>
        {loadingVendor ? (
          <div className="h-64 animate-pulse rounded bg-white/5" />
        ) : vendorAreaChartData.length > 0 &&
          usageByVendor?.vendorSeries &&
          usageByVendor.vendorSeries.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={vendorAreaChartData}>
              <XAxis
                dataKey="label"
                tick={{ fill: "#EAF0FF", fontSize: 12 }}
                axisLine={{ stroke: "#ffffff1a" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#EAF0FF99", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => (metric === "cost" ? `$${v}` : `${v}`)}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) => [
                  metric === "cost"
                    ? `$${Number(value ?? 0).toFixed(2)}`
                    : Number(value ?? 0).toFixed(1),
                  name,
                ]}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: "#EAF0FF" }} />
              {usageByVendor.vendorSeries.map((series, i) => (
                <Area
                  key={series.vendorId}
                  type="monotone"
                  dataKey={series.vendorName}
                  stackId="1"
                  fill={AREA_COLORS[i % AREA_COLORS.length]}
                  stroke={AREA_COLORS[i % AREA_COLORS.length]}
                  fillOpacity={0.6}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-12 text-center text-sm text-[#EAF0FF]/40">
            No vendor usage data for this period.
          </p>
        )}
      </div>
    </div>
  );
}
