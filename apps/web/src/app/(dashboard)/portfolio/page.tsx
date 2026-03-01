"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "@/components/location-context";
import { HelpLink } from "@/components/help-link";
import { PortfolioOverview } from "@/components/portfolio-overview";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ─── Helpers ────────────────────────────────────────────────

function fmt(v: number) {
  return "$" + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(v: number) {
  return (v * 100).toFixed(1) + "%";
}

const TOOLTIP_STYLE = {
  backgroundColor: "#0B1623",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  color: "#EAF0FF",
};

const TREND_METRICS = [
  { key: "onHandValue", label: "On-Hand Value", format: "dollar" },
  { key: "cogs7d", label: "COGS (7d)", format: "dollar" },
  { key: "varianceImpact", label: "Variance Impact", format: "dollar" },
  { key: "pourCostPct", label: "Pour Cost %", format: "pct" },
] as const;

type TrendMetricKey = (typeof TREND_METRICS)[number]["key"];

function formatTrendValue(v: number | null, format: string) {
  if (v == null) return "--";
  if (format === "dollar") return fmt(v);
  if (format === "pct") return v.toFixed(1) + "%";
  return v.toFixed(1);
}

// ─── Sort helpers ───────────────────────────────────────────

type StaffSortKey = "displayName" | "totalSessionsCounted" | "totalLinesCounted" | "varianceRate" | "trend";
type VarSortKey = "itemName" | "locationCount" | "totalEstimatedLoss" | "avgVariance" | "trend";

function sortArrow(active: boolean, asc: boolean) {
  if (!active) return "";
  return asc ? " ▲" : " ▼";
}

// ─── Main Page ──────────────────────────────────────────────

export default function PortfolioPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const businessId = user?.businessId as string | undefined;
  const { setSelectedLocationId } = useLocation();
  const isAdmin =
    user?.highestRole === "business_admin" || user?.highestRole === "platform_admin";

  if (!isAdmin) {
    return (
      <div className="text-[#EAF0FF]/60">
        You need business admin access to view portfolio analytics.
      </div>
    );
  }

  if (!businessId) {
    return <div className="text-[#EAF0FF]/60">No business selected.</div>;
  }

  const now = new Date();
  const fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-[#EAF0FF]">Portfolio Analytics</h1>
          <HelpLink section="portfolio" tooltip="Learn about portfolio analytics" />
        </div>
        <p className="mt-1 text-sm text-[#EAF0FF]/50">
          Compare performance across all your locations
        </p>
      </div>

      {/* KPI Summary (reuse existing component) */}
      <PortfolioOverview
        businessId={businessId}
        onSelectLocation={(id) => setSelectedLocationId(id)}
      />

      {/* Section A: KPI Trends */}
      <TrendSection businessId={businessId} />

      {/* Section B: Staff Comparison */}
      <StaffComparisonSection businessId={businessId} />

      {/* Section C: Cross-Location Variance */}
      <VarianceItemsSection businessId={businessId} />

      {/* Section D: Forecast Summary */}
      <ForecastSection businessId={businessId} />
    </div>
  );
}

// ─── Section A: KPI Trends ──────────────────────────────────

function TrendSection({ businessId }: { businessId: string }) {
  const [metric, setMetric] = useState<TrendMetricKey>("onHandValue");
  const { data, isLoading } = trpc.reports.portfolioTrend.useQuery(
    { businessId, weeks: 12 },
    { staleTime: 5 * 60_000 }
  );

  const selectedMeta = TREND_METRICS.find((m) => m.key === metric)!;

  if (isLoading) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#16283F] p-6">
        <div className="h-6 w-40 animate-pulse rounded bg-white/10 mb-4" />
        <div className="h-[300px] animate-pulse rounded bg-white/5" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#16283F] p-6">
        <h2 className="text-lg font-semibold text-[#EAF0FF] mb-2">KPI Trends</h2>
        <p className="text-sm text-[#EAF0FF]/50">
          No benchmark snapshots yet. Snapshots are captured daily — check back tomorrow.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#16283F] p-6">
      <h2 className="text-lg font-semibold text-[#EAF0FF] mb-4">KPI Trends (12 weeks)</h2>

      {/* Metric selector pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        {TREND_METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              metric === m.key
                ? "bg-[#E9B44C] text-[#0B1623]"
                : "bg-white/10 text-[#EAF0FF]/70 hover:bg-white/15"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <XAxis
            dataKey="date"
            tick={{ fill: "#EAF0FF", fontSize: 10 }}
            axisLine={{ stroke: "#ffffff1a" }}
            tickLine={false}
            tickFormatter={(v: string) => {
              const d = new Date(v);
              return `${d.getMonth() + 1}/${d.getDate()}`;
            }}
          />
          <YAxis
            tick={{ fill: "#EAF0FF", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => formatTrendValue(v, selectedMeta.format)}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v: any) => [formatTrendValue(v, selectedMeta.format), selectedMeta.label]}
            labelFormatter={(v: any) => new Date(v).toLocaleDateString()}
          />
          <Line
            type="monotone"
            dataKey={metric}
            stroke="#E9B44C"
            strokeWidth={2}
            dot={{ fill: "#E9B44C", r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Section B: Staff Comparison ────────────────────────────

function StaffComparisonSection({ businessId }: { businessId: string }) {
  const [sortKey, setSortKey] = useState<StaffSortKey>("varianceRate");
  const [sortAsc, setSortAsc] = useState(false);

  const { data, isLoading } = trpc.reports.portfolioStaffComparison.useQuery(
    { businessId },
    { staleTime: 5 * 60_000 }
  );

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "displayName":
          cmp = a.displayName.localeCompare(b.displayName);
          break;
        case "totalSessionsCounted":
          cmp = a.totalSessionsCounted - b.totalSessionsCounted;
          break;
        case "totalLinesCounted":
          cmp = a.totalLinesCounted - b.totalLinesCounted;
          break;
        case "varianceRate":
          cmp = a.varianceRate - b.varianceRate;
          break;
        case "trend":
          cmp = a.trend.localeCompare(b.trend);
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [data, sortKey, sortAsc]);

  function toggleSort(key: StaffSortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === "displayName"); }
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#16283F] p-6">
        <div className="h-6 w-48 animate-pulse rounded bg-white/10 mb-4" />
        <div className="h-40 animate-pulse rounded bg-white/5" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#16283F] p-6">
      <h2 className="text-lg font-semibold text-[#EAF0FF] mb-4">Staff Comparison</h2>

      {!sorted.length ? (
        <p className="text-sm text-[#EAF0FF]/50">No counting data found across locations.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-[#EAF0FF]/50 text-xs uppercase border-b border-white/10">
                <th className="py-2 pr-4 cursor-pointer" onClick={() => toggleSort("displayName")}>
                  Name{sortArrow(sortKey === "displayName", sortAsc)}
                </th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Locations</th>
                <th className="py-2 pr-4 cursor-pointer text-right" onClick={() => toggleSort("totalSessionsCounted")}>
                  Sessions{sortArrow(sortKey === "totalSessionsCounted", sortAsc)}
                </th>
                <th className="py-2 pr-4 cursor-pointer text-right" onClick={() => toggleSort("totalLinesCounted")}>
                  Lines{sortArrow(sortKey === "totalLinesCounted", sortAsc)}
                </th>
                <th className="py-2 pr-4 cursor-pointer text-right" onClick={() => toggleSort("varianceRate")}>
                  Variance Rate{sortArrow(sortKey === "varianceRate", sortAsc)}
                </th>
                <th className="py-2 cursor-pointer text-right" onClick={() => toggleSort("trend")}>
                  Trend{sortArrow(sortKey === "trend", sortAsc)}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.userId} className="border-b border-white/5 text-[#EAF0FF]">
                  <td className="py-2 pr-4 font-medium">{s.displayName}</td>
                  <td className="py-2 pr-4 text-[#EAF0FF]/60 text-xs">{s.email}</td>
                  <td className="py-2 pr-4 text-xs text-[#EAF0FF]/60">{s.locationNames.join(", ")}</td>
                  <td className="py-2 pr-4 text-right">{s.totalSessionsCounted}</td>
                  <td className="py-2 pr-4 text-right">{s.totalLinesCounted}</td>
                  <td className={`py-2 pr-4 text-right font-medium ${
                    s.varianceRate < 0.05 ? "text-green-400" :
                    s.varianceRate < 0.15 ? "text-amber-400" : "text-red-400"
                  }`}>
                    {pct(s.varianceRate)}
                  </td>
                  <td className="py-2 text-right">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      s.trend === "improving" ? "bg-green-500/20 text-green-400" :
                      s.trend === "worsening" ? "bg-red-500/20 text-red-400" :
                      "bg-white/10 text-[#EAF0FF]/60"
                    }`}>
                      {s.trend}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Section C: Cross-Location Variance ─────────────────────

function VarianceItemsSection({ businessId }: { businessId: string }) {
  const [sortKey, setSortKey] = useState<VarSortKey>("locationCount");
  const [sortAsc, setSortAsc] = useState(false);

  const { data, isLoading } = trpc.reports.portfolioVarianceItems.useQuery(
    { businessId, limit: 20 },
    { staleTime: 5 * 60_000 }
  );

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "itemName":
          cmp = a.itemName.localeCompare(b.itemName);
          break;
        case "locationCount":
          cmp = a.locationCount - b.locationCount;
          break;
        case "totalEstimatedLoss":
          cmp = a.totalEstimatedLoss - b.totalEstimatedLoss;
          break;
        case "avgVariance":
          cmp = a.avgVariance - b.avgVariance;
          break;
        case "trend":
          cmp = a.trend.localeCompare(b.trend);
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [data, sortKey, sortAsc]);

  function toggleSort(key: VarSortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === "itemName"); }
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#16283F] p-6">
        <div className="h-6 w-56 animate-pulse rounded bg-white/10 mb-4" />
        <div className="h-40 animate-pulse rounded bg-white/5" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#16283F] p-6">
      <h2 className="text-lg font-semibold text-[#EAF0FF] mb-4">Cross-Location Variance Items</h2>

      {!sorted.length ? (
        <p className="text-sm text-[#EAF0FF]/50">No variance patterns detected across locations.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-[#EAF0FF]/50 text-xs uppercase border-b border-white/10">
                <th className="py-2 pr-4 cursor-pointer" onClick={() => toggleSort("itemName")}>
                  Item{sortArrow(sortKey === "itemName", sortAsc)}
                </th>
                <th className="py-2 pr-4">Category</th>
                <th className="py-2 pr-4 cursor-pointer text-right" onClick={() => toggleSort("locationCount")}>
                  Locations{sortArrow(sortKey === "locationCount", sortAsc)}
                </th>
                <th className="py-2 pr-4 cursor-pointer text-right" onClick={() => toggleSort("totalEstimatedLoss")}>
                  Total Loss{sortArrow(sortKey === "totalEstimatedLoss", sortAsc)}
                </th>
                <th className="py-2 pr-4 cursor-pointer text-right" onClick={() => toggleSort("avgVariance")}>
                  Avg Variance{sortArrow(sortKey === "avgVariance", sortAsc)}
                </th>
                <th className="py-2 text-right cursor-pointer" onClick={() => toggleSort("trend")}>
                  Trend{sortArrow(sortKey === "trend", sortAsc)}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => (
                <tr key={item.inventoryItemId} className="border-b border-white/5 text-[#EAF0FF]">
                  <td className="py-2 pr-4">
                    <span className="font-medium">{item.itemName}</span>
                    {item.locationCount > 1 && (
                      <span className="ml-2 inline-block rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                        Multi-location
                      </span>
                    )}
                    {item.isShrinkageSuspect && (
                      <span className="ml-1 inline-block rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-medium text-red-400">
                        Shrinkage
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-[#EAF0FF]/60 text-xs">{item.categoryName ?? "--"}</td>
                  <td className="py-2 pr-4 text-right" title={item.locationNames.join(", ")}>
                    {item.locationCount}
                  </td>
                  <td className="py-2 pr-4 text-right text-red-400 font-medium">
                    {fmt(item.totalEstimatedLoss)}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {item.avgVariance.toFixed(1)}
                  </td>
                  <td className="py-2 text-right">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      item.trend === "improving" ? "bg-green-500/20 text-green-400" :
                      item.trend === "worsening" ? "bg-red-500/20 text-red-400" :
                      "bg-white/10 text-[#EAF0FF]/60"
                    }`}>
                      {item.trend}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Section D: Forecast Summary ────────────────────────────

function ForecastSection({ businessId }: { businessId: string }) {
  const { data, isLoading } = trpc.reports.portfolioForecast.useQuery(
    { businessId },
    { staleTime: 5 * 60_000 }
  );

  if (isLoading) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#16283F] p-6">
        <div className="h-6 w-44 animate-pulse rounded bg-white/10 mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded bg-white/5" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-[#16283F] p-6">
      <h2 className="text-lg font-semibold text-[#EAF0FF] mb-4">Forecast Summary (7-day)</h2>

      {/* Totals header */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-lg bg-white/5 p-3">
          <div className="text-xs text-[#EAF0FF]/50">Items Tracked</div>
          <div className="text-xl font-bold text-[#EAF0FF]">{data.totals.totalItemsTracked}</div>
        </div>
        <div className="rounded-lg bg-white/5 p-3">
          <div className="text-xs text-[#EAF0FF]/50">Stockout Risk</div>
          <div className={`text-xl font-bold ${data.totals.totalStockoutRisk > 0 ? "text-red-400" : "text-green-400"}`}>
            {data.totals.totalStockoutRisk}
          </div>
        </div>
        <div className="rounded-lg bg-white/5 p-3">
          <div className="text-xs text-[#EAF0FF]/50">Projected COGS (7d)</div>
          <div className="text-xl font-bold text-[#E9B44C]">{fmt(data.totals.totalProjectedCogs7d)}</div>
        </div>
      </div>

      {/* Per-location cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.locations.map((loc) => (
          <div
            key={loc.locationId}
            className="rounded-lg border border-white/10 bg-white/5 p-4"
          >
            <h3 className="font-semibold text-[#EAF0FF] mb-2">{loc.locationName}</h3>
            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
              <div>
                <span className="text-[#EAF0FF]/50">Items: </span>
                <span className="text-[#EAF0FF]">{loc.itemsTracked}</span>
              </div>
              <div>
                <span className="text-[#EAF0FF]/50">Stockout Risk: </span>
                <span className={loc.stockoutRiskCount > 0 ? "text-red-400 font-medium" : "text-green-400"}>
                  {loc.stockoutRiskCount}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-[#EAF0FF]/50">COGS (7d): </span>
                <span className="text-[#E9B44C]">{fmt(loc.projectedCogs7d)}</span>
              </div>
            </div>
            {loc.topItems.length > 0 && (
              <div>
                <div className="text-[10px] text-[#EAF0FF]/40 uppercase mb-1">Top Items by Usage</div>
                {loc.topItems.map((item, i) => (
                  <div key={i} className="flex justify-between text-xs text-[#EAF0FF]/70">
                    <span className="truncate mr-2">{item.itemName}</span>
                    <span className="text-[#EAF0FF]/50 whitespace-nowrap">
                      {item.forecastDailyUsage.toFixed(1)}/day
                      {item.daysToStockout != null && item.daysToStockout <= 7 && (
                        <span className="ml-1 text-red-400">({item.daysToStockout}d)</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
