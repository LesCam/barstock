"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "@/components/location-context";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ComposedChart, Line, ReferenceLine,
} from "recharts";

export default function ForecastPage() {
  const { selectedLocationId } = useLocation();
  const [filter, setFilter] = useState("");
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<"itemName" | "forecastDailyUsage" | "daysToStockout" | "needsReorderSoon">("needsReorderSoon");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const { data: forecast, isLoading } = trpc.reports.forecastDashboard.useQuery(
    { locationId: selectedLocationId! },
    { enabled: !!selectedLocationId }
  );

  const { data: accuracy } = trpc.reports.forecastAccuracy.useQuery(
    { locationId: selectedLocationId!, sessionCount: 5 },
    { enabled: !!selectedLocationId }
  );

  const { data: itemDetail } = trpc.reports.forecastItemDetail.useQuery(
    { locationId: selectedLocationId!, itemId: expandedItemId! },
    { enabled: !!selectedLocationId && !!expandedItemId }
  );

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortedItems = useMemo(() => {
    if (!forecast) return [];
    let items = [...forecast.items];
    if (filter) {
      const lower = filter.toLowerCase();
      items = items.filter(
        (i) =>
          i.itemName.toLowerCase().includes(lower) ||
          (i.categoryName ?? "").toLowerCase().includes(lower)
      );
    }
    items.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "itemName":
          return dir * a.itemName.localeCompare(b.itemName);
        case "forecastDailyUsage":
          return dir * (a.forecastDailyUsage - b.forecastDailyUsage);
        case "daysToStockout":
          return dir * ((a.daysToStockout ?? 999) - (b.daysToStockout ?? 999));
        case "needsReorderSoon":
          if (a.needsReorderSoon !== b.needsReorderSoon)
            return a.needsReorderSoon ? -1 : 1;
          return (a.daysToStockout ?? 999) - (b.daysToStockout ?? 999);
        default:
          return 0;
      }
    });
    return items;
  }, [forecast, filter, sortKey, sortDir]);

  if (!selectedLocationId) {
    return (
      <div className="flex h-64 items-center justify-center text-[#EAF0FF]/40">
        Select a location to view forecasts.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Demand Forecast</h1>
        <div className="grid gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border border-white/10 bg-[#16283F]" />
          ))}
        </div>
      </div>
    );
  }

  const summary = forecast?.summary;

  function statusBadge(item: (typeof sortedItems)[0]) {
    if (item.needsReorderSoon) {
      return <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-400">Reorder Now</span>;
    }
    if (item.daysToStockout != null && item.daysToStockout <= 7) {
      return <span className="rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs font-medium text-yellow-400">Low Stock</span>;
    }
    return <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">OK</span>;
  }

  // Chart data for expanded item
  const chartData = itemDetail
    ? [
        ...itemDetail.historical.map((h) => ({
          date: h.date,
          label: new Date(h.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          historical: h.qty,
          forecast: null as number | null,
        })),
        ...itemDetail.forecast.map((f) => ({
          date: f.date,
          label: new Date(f.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          historical: null as number | null,
          forecast: Number(f.qty.toFixed(2)),
        })),
      ]
    : [];

  const sortArrow = (key: typeof sortKey) =>
    sortKey === key ? (sortDir === "asc" ? " \u25B2" : " \u25BC") : "";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Demand Forecast</h1>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-sm text-[#EAF0FF]/60">Items Needing Reorder</p>
          <p className={`text-2xl font-bold ${(summary?.itemsNeedingReorderSoon ?? 0) > 0 ? "text-red-400" : "text-green-400"}`}>
            {summary?.itemsNeedingReorderSoon ?? 0}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-sm text-[#EAF0FF]/60">Projected COGS (7d)</p>
          <p className="text-2xl font-bold">${(summary?.projectedCogs7d ?? 0).toFixed(2)}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-sm text-[#EAF0FF]/60">Forecast Accuracy</p>
          <p className="text-2xl font-bold">
            {accuracy?.avgAccuracy != null ? `${accuracy.avgAccuracy.toFixed(1)}%` : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-sm text-[#EAF0FF]/60">Items Tracked</p>
          <p className="text-2xl font-bold">{summary?.totalItems ?? 0}</p>
        </div>
      </div>

      {/* Search / Filter */}
      <div>
        <input
          type="text"
          placeholder="Search items..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full max-w-sm rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30 focus:border-[#E9B44C]/50 focus:outline-none"
        />
      </div>

      {/* Item Table */}
      <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
            <tr>
              <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("itemName")}>
                Item{sortArrow("itemName")}
              </th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Current Level</th>
              <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("forecastDailyUsage")}>
                Forecast Daily{sortArrow("forecastDailyUsage")}
              </th>
              <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("daysToStockout")}>
                Days to Stockout{sortArrow("daysToStockout")}
              </th>
              <th className="px-4 py-3">Reorder By</th>
              <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("needsReorderSoon")}>
                Status{sortArrow("needsReorderSoon")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {sortedItems.map((item) => (
              <tr
                key={item.inventoryItemId}
                className={`cursor-pointer transition-colors ${
                  expandedItemId === item.inventoryItemId
                    ? "bg-[#0B1623]"
                    : "hover:bg-[#0B1623]/60"
                }`}
                onClick={() =>
                  setExpandedItemId(
                    expandedItemId === item.inventoryItemId ? null : item.inventoryItemId
                  )
                }
              >
                <td className="px-4 py-3 font-medium">{item.itemName}</td>
                <td className="px-4 py-3 text-[#EAF0FF]/60">{item.categoryName ?? "—"}</td>
                <td className="px-4 py-3">
                  {item.currentLevel != null ? item.currentLevel.toFixed(1) : "—"}
                </td>
                <td className="px-4 py-3">{item.forecastDailyUsage.toFixed(2)}</td>
                <td className={`px-4 py-3 ${
                  item.daysToStockout != null && item.daysToStockout <= 3
                    ? "font-semibold text-red-400"
                    : item.daysToStockout != null && item.daysToStockout <= 7
                      ? "text-yellow-400"
                      : ""
                }`}>
                  {item.daysToStockout != null ? `${item.daysToStockout}d` : "—"}
                </td>
                <td className="px-4 py-3">{item.reorderByDate ?? "—"}</td>
                <td className="px-4 py-3">{statusBadge(item)}</td>
              </tr>
            ))}
            {sortedItems.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[#EAF0FF]/40">
                  {filter ? "No items match your search." : "No usage data available for forecasting."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Expanded Row — Item Detail Chart */}
      {expandedItemId && itemDetail && (
        <div className="space-y-4 rounded-lg border border-[#E9B44C]/20 bg-[#0B1623] p-6">
          <h3 className="text-lg font-semibold">
            {forecast?.items.find((i) => i.inventoryItemId === expandedItemId)?.itemName} — Forecast Detail
          </h3>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Historical + Forecast Chart */}
            <div className="lg:col-span-2">
              <h4 className="mb-2 text-sm font-semibold text-[#EAF0FF]/80">Usage History + 30-Day Forecast</h4>
              <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={chartData}>
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#EAF0FF", fontSize: 10 }}
                      axisLine={{ stroke: "#ffffff1a" }}
                      tickLine={false}
                      interval={Math.floor(chartData.length / 10)}
                    />
                    <YAxis tick={{ fill: "#EAF0FF99", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0B1623", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#EAF0FF" }}
                      formatter={(value, name) => [
                        value != null ? Number(value).toFixed(2) : "—",
                        name === "historical" ? "Actual" : "Forecast",
                      ]}
                    />
                    {itemDetail.parLevel != null && (
                      <ReferenceLine
                        y={itemDetail.parLevel}
                        stroke="#4CAF50"
                        strokeDasharray="5 5"
                        label={{ value: "Par", fill: "#4CAF50", fontSize: 10, position: "right" }}
                      />
                    )}
                    {itemDetail.minLevel != null && (
                      <ReferenceLine
                        y={itemDetail.minLevel}
                        stroke="#EF4444"
                        strokeDasharray="5 5"
                        label={{ value: "Min", fill: "#EF4444", fontSize: 10, position: "right" }}
                      />
                    )}
                    <Bar dataKey="historical" fill="#E9B44C" radius={[2, 2, 0, 0]} name="historical" />
                    <Line
                      type="monotone"
                      dataKey="forecast"
                      stroke="#60A5FA"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      dot={false}
                      name="forecast"
                      connectNulls={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Day-of-Week Pattern */}
            <div>
              <h4 className="mb-2 text-sm font-semibold text-[#EAF0FF]/80">Day-of-Week Pattern</h4>
              <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={itemDetail.dowPattern.map((d) => ({
                    day: d.day,
                    usage: Number(d.avgUsage.toFixed(2)),
                    ratio: Number(d.ratio.toFixed(2)),
                  }))}>
                    <XAxis dataKey="day" tick={{ fill: "#EAF0FF", fontSize: 12 }} axisLine={{ stroke: "#ffffff1a" }} tickLine={false} />
                    <YAxis tick={{ fill: "#EAF0FF99", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0B1623", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#EAF0FF" }}
                      formatter={(value, name) => [
                        Number(value).toFixed(2),
                        name === "usage" ? "Avg Usage" : "Ratio",
                      ]}
                    />
                    <Bar dataKey="usage" fill="#E9B44C" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 text-xs text-[#EAF0FF]/40">
                Forecast daily avg: {itemDetail.forecastDailyUsage.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Forecast Accuracy Section */}
      {accuracy && accuracy.sessions.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Forecast Accuracy (Last {accuracy.sessions.length} Sessions)</h2>
          <div className="mb-2 text-sm text-[#EAF0FF]/60">
            Overall avg accuracy: <span className="font-medium text-[#EAF0FF]">{accuracy.avgAccuracy != null ? `${accuracy.avgAccuracy.toFixed(1)}%` : "—"}</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
                <tr>
                  <th className="px-4 py-3">Session Date</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Forecasted</th>
                  <th className="px-4 py-3">Actual</th>
                  <th className="px-4 py-3">Delta</th>
                  <th className="px-4 py-3">Accuracy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {accuracy.sessions.flatMap((session) =>
                  session.items.map((item, idx) => (
                    <tr key={`${session.sessionId}-${item.itemId}-${idx}`} className="hover:bg-[#0B1623]/60">
                      <td className="px-4 py-3">
                        {idx === 0
                          ? new Date(session.startedTs).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : ""}
                      </td>
                      <td className="px-4 py-3 font-medium">{item.itemName}</td>
                      <td className="px-4 py-3">{item.forecasted.toFixed(1)}</td>
                      <td className="px-4 py-3">{item.actual.toFixed(1)}</td>
                      <td className={`px-4 py-3 ${item.delta < 0 ? "text-red-400" : item.delta > 0 ? "text-green-400" : ""}`}>
                        {item.delta > 0 ? "+" : ""}{item.delta.toFixed(1)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-medium ${item.accuracyPct >= 90 ? "text-green-400" : item.accuracyPct >= 70 ? "text-yellow-400" : "text-red-400"}`}>
                          {item.accuracyPct.toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
