"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";

type ActiveTab = "variance" | "cogs" | "usage" | "patterns" | "staff";
type VarianceSortKey = "itemName" | "categoryName" | "variance" | "variancePercent" | "valueImpact";
type UsageSortKey = "name" | "categoryName" | "quantityUsed" | "unitCost" | "totalCost";
type PatternSortKey = "itemName" | "categoryName" | "sessionsAppeared" | "avgVariance" | "totalEstimatedLoss" | "trend";
type StaffSortKey = "displayName" | "sessionsCounted" | "linesCounted" | "accuracyRate" | "avgVarianceMagnitude" | "manualEntryRate" | "trend";
type SessionSortKey = "startedTs" | "durationMinutes" | "totalLines" | "itemsPerHour" | "varianceRate" | "manualEntryRate" | "participantCount";
type SortDir = "asc" | "desc";
type HeatmapCell = { dayOfWeek: number; hour: number; totalVariance: number; eventCount: number };

const PIE_COLORS = ["#E9B44C", "#4CAF50", "#2196F3", "#FF5722", "#9C27B0", "#00BCD4", "#FF9800", "#607D8B"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function VarianceHeatmapGrid({ data }: { data: HeatmapCell[] }) {
  const maxVariance = Math.max(...data.map((d) => d.totalVariance), 1);
  const lookup = new Map(data.map((d) => [`${d.dayOfWeek}-${d.hour}`, d]));

  return (
    <div className="overflow-x-auto">
      {/* Hour labels */}
      <div className="flex items-center gap-1">
        <span className="w-9 shrink-0" />
        <div className="flex flex-1">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="flex-1 min-w-[20px] m-[1px] text-center text-xs text-[#EAF0FF]/70">
              {h % 3 === 0 ? `${h}` : ""}
            </div>
          ))}
        </div>
      </div>
      {/* Grid rows */}
      {Array.from({ length: 7 }, (_, day) => (
        <div key={day} className="flex items-center gap-1">
          <span className="w-9 shrink-0 text-right text-xs font-medium text-[#EAF0FF]">{DAY_LABELS[day]}</span>
          <div className="flex flex-1">
            {Array.from({ length: 24 }, (_, hour) => {
              const cell = lookup.get(`${day}-${hour}`);
              const intensity = cell ? cell.totalVariance / maxVariance : 0;
              return (
                <div
                  key={hour}
                  className="group relative flex-1 min-w-[20px] h-5 rounded-[2px] m-[1px] cursor-default"
                  style={{
                    backgroundColor: intensity > 0
                      ? intensity > 0.6
                        ? `rgb(239, 68, 68)`
                        : intensity > 0.3
                          ? `rgb(251, 191, 36)`
                          : `rgb(74, 222, 128)`
                      : "rgba(255,255,255,0.06)",
                  }}
                >
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded bg-[#0B1623] px-2 py-1 text-[11px] text-[#EAF0FF] shadow-lg border border-white/10 group-hover:block">
                    {cell
                      ? `${DAY_LABELS[day]} ${hour}:00 — ${cell.totalVariance.toFixed(1)} units (${cell.eventCount} events)`
                      : `${DAY_LABELS[day]} ${hour}:00 — no data`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {/* Legend */}
      <div className="mt-3 flex items-center justify-end gap-3 text-[11px] text-[#EAF0FF]/60">
        <span>Variance:</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} /> None</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-green-400" /> <span className="text-green-400">Low</span></span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-amber-400" /> <span className="text-amber-400">Medium</span></span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-red-500" /> <span className="text-red-500">High</span></span>
      </div>
    </div>
  );
}

/** Convert a date string + EOD time into the actual end-of-day Date.
 *  If eodTime is at or before "12:00", the business closes after midnight,
 *  so we add a day (e.g. "Feb 21" with EOD "04:00" → Feb 22 04:00). */
function toEndOfDay(dateStr: string, eodTime: string): Date {
  const [hh, mm] = eodTime.split(":").map(Number);
  const [y, m, day] = dateStr.split("-").map(Number);
  const d = new Date(y, m - 1, day); // local midnight
  if (eodTime <= "12:00" && eodTime !== "00:00") {
    d.setDate(d.getDate() + 1);
  }
  d.setHours(hh, mm, 59, 999);
  return d;
}

export default function ReportsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const locationId = user?.locationIds?.[0];
  const businessId = user?.businessId as string | undefined;

  const { data: eodTime } = trpc.settings.endOfDayTime.useQuery(
    { businessId: businessId! },
    { enabled: !!businessId }
  );

  const [activeTab, setActiveTab] = useState<ActiveTab>("variance");
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    to: new Date().toISOString().split("T")[0],
  });

  const [filter, setFilter] = useState("");
  const [varianceSortKey, setVarianceSortKey] = useState<VarianceSortKey>("itemName");
  const [usageSortKey, setUsageSortKey] = useState<UsageSortKey>("name");
  const [patternSortKey, setPatternSortKey] = useState<PatternSortKey>("avgVariance");
  const [patternSortDir, setPatternSortDir] = useState<SortDir>("asc");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [sessionCount, setSessionCount] = useState(10);
  const [staffSortKey, setStaffSortKey] = useState<StaffSortKey>("accuracyRate");
  const [staffSortDir, setStaffSortDir] = useState<SortDir>("asc");
  const [sessionSortKey, setSessionSortKey] = useState<SessionSortKey>("startedTs");
  const [sessionSortDir, setSessionSortDir] = useState<SortDir>("desc");

  const effectiveEod = eodTime ?? "23:59";

  const { data: variance } = trpc.reports.variance.useQuery(
    {
      locationId: locationId!,
      fromDate: new Date(dateRange.from),
      toDate: toEndOfDay(dateRange.to, effectiveEod),
    },
    { enabled: !!locationId && activeTab === "variance" }
  );

  const { data: onHand } = trpc.reports.onHand.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId }
  );

  const { data: cogs } = trpc.reports.cogs.useQuery(
    {
      locationId: locationId!,
      fromDate: new Date(dateRange.from),
      toDate: toEndOfDay(dateRange.to, effectiveEod),
    },
    { enabled: !!locationId && activeTab === "cogs" }
  );

  const { data: usage } = trpc.reports.usage.useQuery(
    {
      locationId: locationId!,
      fromDate: new Date(dateRange.from),
      toDate: toEndOfDay(dateRange.to, effectiveEod),
    },
    { enabled: !!locationId && activeTab === "usage" }
  );

  const { data: patterns } = trpc.reports.variancePatterns.useQuery(
    { locationId: locationId!, sessionCount },
    { enabled: !!locationId && (activeTab === "patterns" || activeTab === "variance") }
  );

  // --- Variance analytics ---
  const [weeksBack, setWeeksBack] = useState(4);

  const { data: varianceTrend } = trpc.reports.varianceTrend.useQuery(
    { locationId: locationId!, weeksBack },
    { enabled: !!locationId && activeTab === "variance" }
  );

  const { data: varianceReasons } = trpc.reports.varianceReasonDistribution.useQuery(
    {
      locationId: locationId!,
      fromDate: new Date(dateRange.from),
      toDate: toEndOfDay(dateRange.to, effectiveEod),
    },
    { enabled: !!locationId && activeTab === "variance" }
  );

  const { data: varianceHeatmap } = trpc.reports.varianceHeatmap.useQuery(
    {
      locationId: locationId!,
      fromDate: new Date(dateRange.from),
      toDate: toEndOfDay(dateRange.to, effectiveEod),
    },
    { enabled: !!locationId && activeTab === "variance" }
  );

  const { data: staffData } = trpc.reports.staffAccountability.useQuery(
    {
      locationId: locationId!,
      fromDate: new Date(dateRange.from),
      toDate: toEndOfDay(dateRange.to, effectiveEod),
    },
    { enabled: !!locationId && activeTab === "staff" }
  );

  // --- Variance sorting ---
  function toggleVarianceSort(key: VarianceSortKey) {
    if (varianceSortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setVarianceSortKey(key);
      setSortDir("asc");
    }
  }

  const sortedVarianceItems = useMemo(() => {
    const lc = filter.toLowerCase();
    const filtered = variance?.items.filter(
      (item) =>
        item.itemName.toLowerCase().includes(lc) ||
        (item.categoryName ?? "").toLowerCase().includes(lc)
    );
    if (!filtered) return [];
    return [...filtered].sort((a, b) => {
      const aVal = a[varianceSortKey];
      const bVal = b[varianceSortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        const cmp = aVal.toLowerCase().localeCompare(bVal.toLowerCase());
        return sortDir === "asc" ? cmp : -cmp;
      }
      const aNum = (aVal as number) ?? 0;
      const bNum = (bVal as number) ?? 0;
      return sortDir === "asc" ? aNum - bNum : bNum - aNum;
    });
  }, [variance, filter, varianceSortKey, sortDir]);

  // --- Usage sorting ---
  function toggleUsageSort(key: UsageSortKey) {
    if (usageSortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setUsageSortKey(key);
      setSortDir("asc");
    }
  }

  const sortedUsageItems = useMemo(() => {
    const lc = filter.toLowerCase();
    const filtered = usage?.items.filter(
      (item) =>
        item.name.toLowerCase().includes(lc) ||
        (item.categoryName ?? "").toLowerCase().includes(lc)
    );
    if (!filtered) return [];
    return [...filtered].sort((a, b) => {
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
  }, [usage, filter, usageSortKey, sortDir]);

  function VarianceSortHeader({ label, field, className }: { label: string; field: VarianceSortKey; className?: string }) {
    const active = varianceSortKey === field;
    return (
      <th
        className={`cursor-pointer select-none px-4 py-3 hover:text-[#EAF0FF]/80 ${className ?? ""}`}
        onClick={() => toggleVarianceSort(field)}
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

  function UsageSortHeader({ label, field, className }: { label: string; field: UsageSortKey; className?: string }) {
    const active = usageSortKey === field;
    return (
      <th
        className={`cursor-pointer select-none px-4 py-3 hover:text-[#EAF0FF]/80 ${className ?? ""}`}
        onClick={() => toggleUsageSort(field)}
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

  // --- Pattern sorting ---
  function togglePatternSort(key: PatternSortKey) {
    if (patternSortKey === key) {
      setPatternSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setPatternSortKey(key);
      setPatternSortDir("asc");
    }
  }

  const sortedPatternItems = useMemo(() => {
    if (!patterns) return [];
    const lc = filter.toLowerCase();
    const filtered = patterns.filter(
      (item) =>
        item.itemName.toLowerCase().includes(lc) ||
        (item.categoryName ?? "").toLowerCase().includes(lc)
    );
    return [...filtered].sort((a, b) => {
      const aVal = a[patternSortKey];
      const bVal = b[patternSortKey];
      if (patternSortKey === "trend") {
        const order = { worsening: 0, stable: 1, improving: 2 };
        const cmp = order[a.trend] - order[b.trend];
        return patternSortDir === "asc" ? cmp : -cmp;
      }
      if (typeof aVal === "string" && typeof bVal === "string") {
        const cmp = aVal.toLowerCase().localeCompare(bVal.toLowerCase());
        return patternSortDir === "asc" ? cmp : -cmp;
      }
      const aNum = (aVal as number) ?? 0;
      const bNum = (bVal as number) ?? 0;
      return patternSortDir === "asc" ? aNum - bNum : bNum - aNum;
    });
  }, [patterns, filter, patternSortKey, patternSortDir]);

  function PatternSortHeader({ label, field, className }: { label: string; field: PatternSortKey; className?: string }) {
    const active = patternSortKey === field;
    return (
      <th
        className={`cursor-pointer select-none px-4 py-3 hover:text-[#EAF0FF]/80 ${className ?? ""}`}
        onClick={() => togglePatternSort(field)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <span className={`text-xs ${active ? "text-[#E9B44C]" : "text-[#EAF0FF]/30"}`}>
            {active ? (patternSortDir === "asc" ? "▲" : "▼") : "▲"}
          </span>
        </span>
      </th>
    );
  }

  // --- Staff sorting ---
  function toggleStaffSort(key: StaffSortKey) {
    if (staffSortKey === key) {
      setStaffSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setStaffSortKey(key);
      setStaffSortDir("asc");
    }
  }

  const sortedStaff = useMemo(() => {
    if (!staffData?.staff) return [];
    return [...staffData.staff].sort((a, b) => {
      if (staffSortKey === "trend") {
        const order = { improving: 0, stable: 1, worsening: 2 };
        const cmp = order[a.trend] - order[b.trend];
        return staffSortDir === "asc" ? cmp : -cmp;
      }
      const aVal = a[staffSortKey];
      const bVal = b[staffSortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        const cmp = aVal.toLowerCase().localeCompare(bVal.toLowerCase());
        return staffSortDir === "asc" ? cmp : -cmp;
      }
      const aNum = (aVal as number) ?? 0;
      const bNum = (bVal as number) ?? 0;
      return staffSortDir === "asc" ? aNum - bNum : bNum - aNum;
    });
  }, [staffData, staffSortKey, staffSortDir]);

  function StaffSortHeader({ label, field, className }: { label: string; field: StaffSortKey; className?: string }) {
    const active = staffSortKey === field;
    return (
      <th
        className={`cursor-pointer select-none px-4 py-3 hover:text-[#EAF0FF]/80 ${className ?? ""}`}
        onClick={() => toggleStaffSort(field)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <span className={`text-xs ${active ? "text-[#E9B44C]" : "text-[#EAF0FF]/30"}`}>
            {active ? (staffSortDir === "asc" ? "\u25B2" : "\u25BC") : "\u25B2"}
          </span>
        </span>
      </th>
    );
  }

  // --- Session sorting ---
  function toggleSessionSort(key: SessionSortKey) {
    if (sessionSortKey === key) {
      setSessionSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSessionSortKey(key);
      setSessionSortDir("asc");
    }
  }

  const sortedSessions = useMemo(() => {
    if (!staffData?.sessions) return [];
    return [...staffData.sessions].sort((a, b) => {
      const aVal = a[sessionSortKey];
      const bVal = b[sessionSortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        const cmp = aVal.localeCompare(bVal);
        return sessionSortDir === "asc" ? cmp : -cmp;
      }
      const aNum = (aVal as number) ?? 0;
      const bNum = (bVal as number) ?? 0;
      return sessionSortDir === "asc" ? aNum - bNum : bNum - aNum;
    });
  }, [staffData, sessionSortKey, sessionSortDir]);

  function SessionSortHeader({ label, field, className }: { label: string; field: SessionSortKey; className?: string }) {
    const active = sessionSortKey === field;
    return (
      <th
        className={`cursor-pointer select-none px-4 py-3 hover:text-[#EAF0FF]/80 ${className ?? ""}`}
        onClick={() => toggleSessionSort(field)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <span className={`text-xs ${active ? "text-[#E9B44C]" : "text-[#EAF0FF]/30"}`}>
            {active ? (sessionSortDir === "asc" ? "\u25B2" : "\u25BC") : "\u25B2"}
          </span>
        </span>
      </th>
    );
  }

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: "variance", label: "Variance" },
    { key: "cogs", label: "COGS" },
    { key: "usage", label: "Usage" },
    { key: "patterns", label: "Patterns" },
    { key: "staff", label: "Staff" },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-[#EAF0FF]">Reports</h1>

      {/* Date range picker */}
      <div className="mb-6 flex gap-3">
        <input
          type="date"
          value={dateRange.from}
          onChange={(e) => setDateRange((d) => ({ ...d, from: e.target.value }))}
          className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] [color-scheme:dark]"
        />
        <input
          type="date"
          value={dateRange.to}
          onChange={(e) => setDateRange((d) => ({ ...d, to: e.target.value }))}
          className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] [color-scheme:dark]"
        />
      </div>

      {/* On-hand summary — always visible */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">On-Hand Summary</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
            <p className="text-sm text-[#EAF0FF]/60">Total Items</p>
            <p className="text-2xl font-bold">{onHand?.totalItems ?? 0}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
            <p className="text-sm text-[#EAF0FF]/60">Total Value</p>
            <p className="text-2xl font-bold">
              ${(onHand?.totalValue ?? 0).toFixed(2)}
            </p>
          </div>
        </div>
      </section>

      {/* Tab navigation */}
      <div className="mb-6 flex gap-1 rounded-lg bg-[#0B1623] p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setFilter(""); }}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-[#16283F] text-[#E9B44C]"
                : "text-[#EAF0FF]/60 hover:text-[#EAF0FF]/80"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Variance tab ── */}
      {activeTab === "variance" && (
        <section>
          {/* Auto-Flags */}
          {(() => {
            const flagged = patterns?.filter(
              (p) => p.isShrinkageSuspect || p.trend === "worsening"
            );
            if (!flagged || flagged.length === 0) return null;
            return (
              <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {flagged.slice(0, 6).map((item) => (
                  <div
                    key={item.inventoryItemId}
                    className={`rounded-lg border p-4 ${
                      item.isShrinkageSuspect
                        ? "border-red-500/30 bg-red-500/10"
                        : "border-yellow-500/30 bg-yellow-500/10"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-[#EAF0FF]">{item.itemName}</p>
                        <p className="text-xs text-[#EAF0FF]/50">{item.categoryName ?? "Uncategorized"}</p>
                      </div>
                      <span className={`text-lg ${item.trend === "worsening" ? "text-red-400" : item.trend === "improving" ? "text-green-400" : "text-[#EAF0FF]/40"}`}>
                        {item.trend === "worsening" ? "\u2193" : item.trend === "improving" ? "\u2191" : "\u2192"}
                      </span>
                    </div>
                    <div className="mt-2 flex gap-4 text-xs text-[#EAF0FF]/60">
                      <span>Avg: <span className="text-red-400 font-medium">{item.avgVariance.toFixed(1)}</span></span>
                      <span>Sessions: {item.sessionsWithVariance}/{item.sessionsAppeared}</span>
                      {item.isShrinkageSuspect && (
                        <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-red-400 font-medium">Shrinkage</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          <h2 className="mb-3 text-lg font-semibold">
            Variance Report — ${(variance?.totalVarianceValue ?? 0).toFixed(2)} impact
          </h2>

          <input
            type="text"
            placeholder="Search items..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="mb-4 w-full max-w-sm rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
          />

          <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
                <tr>
                  <VarianceSortHeader label="Item" field="itemName" />
                  <VarianceSortHeader label="Category" field="categoryName" />
                  <th className="px-4 py-3">Theoretical</th>
                  <th className="px-4 py-3">Actual</th>
                  <VarianceSortHeader label="Variance" field="variance" />
                  <VarianceSortHeader label="%" field="variancePercent" />
                  <VarianceSortHeader label="Value Impact" field="valueImpact" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sortedVarianceItems.map((item) => (
                  <tr key={item.inventoryItemId} className="hover:bg-[#16283F]/60">
                    <td className="px-4 py-3 font-medium">{item.itemName}</td>
                    <td className="px-4 py-3">{item.categoryName ?? "—"}</td>
                    <td className="px-4 py-3">{item.theoretical.toFixed(1)}</td>
                    <td className="px-4 py-3">{item.actual.toFixed(1)}</td>
                    <td
                      className={`px-4 py-3 font-medium ${
                        item.variance < 0 ? "text-red-400" : item.variance > 0 ? "text-green-400" : ""
                      }`}
                    >
                      {item.variance.toFixed(1)}
                    </td>
                    <td className="px-4 py-3">{item.variancePercent.toFixed(1)}%</td>
                    <td className="px-4 py-3">
                      {item.valueImpact != null ? `$${item.valueImpact.toFixed(2)}` : "—"}
                    </td>
                  </tr>
                ))}
                {sortedVarianceItems.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-[#EAF0FF]/40">
                      {filter ? "No items match your search." : "No variance data for this period."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ── Variance Trend Chart ── */}
          <div className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">Variance Trend</h3>
              <div className="flex items-center gap-2">
                <label className="text-xs text-[#EAF0FF]/60">Weeks:</label>
                <select
                  value={weeksBack}
                  onChange={(e) => setWeeksBack(Number(e.target.value))}
                  className="rounded-md border border-white/10 bg-[#0B1623] px-2 py-1 text-xs text-[#EAF0FF]"
                >
                  {[2, 4, 6, 8, 12].map((w) => (
                    <option key={w} value={w}>{w} weeks</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
              {varianceTrend && varianceTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={varianceTrend.map((d) => ({
                    ...d,
                    label: new Date(d.weekStart).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                  }))}>
                    <XAxis dataKey="label" tick={{ fill: "#EAF0FF", fontSize: 12 }} axisLine={{ stroke: "#ffffff1a" }} tickLine={false} />
                    <YAxis tick={{ fill: "#EAF0FF99", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0B1623", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#EAF0FF" }}
                      formatter={(value, name) => {
                        const v = typeof value === "number" ? value : 0;
                        if (name === "totalVarianceUnits") return [v.toFixed(1), "Total Variance"];
                        return [v, name];
                      }}
                      labelFormatter={(label) => `Week of ${label}`}
                    />
                    <Bar dataKey="totalVarianceUnits" fill="#E9B44C" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-8 text-center text-sm text-[#EAF0FF]/40">No trend data available.</p>
              )}
            </div>
          </div>

          {/* ── Reason Distribution + Heatmap row ── */}
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            {/* Reason Distribution Pie */}
            <div>
              <h3 className="mb-3 text-base font-semibold">Reason Distribution</h3>
              <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
                {varianceReasons && varianceReasons.reasons.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie
                          data={varianceReasons.reasons.map((r) => ({ name: r.label, value: r.count }))}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={90}
                          paddingAngle={2}
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                        >
                          {varianceReasons.reasons.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: "#0B1623", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#EAF0FF" }} itemStyle={{ color: "#EAF0FF" }} labelStyle={{ color: "#EAF0FF" }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-3 flex items-center gap-2 text-xs text-[#EAF0FF]/60">
                      <div className="flex-1 rounded-full bg-[#0B1623] h-2 overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full"
                          style={{ width: `${varianceReasons.totalAdjustments > 0 ? (varianceReasons.withReason / varianceReasons.totalAdjustments) * 100 : 0}%` }}
                        />
                      </div>
                      <span>{varianceReasons.withReason}/{varianceReasons.totalAdjustments} with reason</span>
                    </div>
                  </>
                ) : (
                  <p className="py-8 text-center text-sm text-[#EAF0FF]/40">No reason data for this period.</p>
                )}
              </div>
            </div>

            {/* Day/Time Heatmap */}
            <div>
              <h3 className="mb-3 text-base font-semibold">Variance by Day / Hour</h3>
              <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
                {varianceHeatmap && varianceHeatmap.dayTimeGrid.length > 0 ? (
                  <VarianceHeatmapGrid data={varianceHeatmap.dayTimeGrid} />
                ) : (
                  <p className="py-8 text-center text-sm text-[#EAF0FF]/40">No heatmap data for this period.</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Staff Breakdown ── */}
          {varianceHeatmap && varianceHeatmap.staffBreakdown.length > 0 && (
            <div className="mt-8">
              <h3 className="mb-3 text-base font-semibold">Staff Variance Breakdown</h3>
              <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
                    <tr>
                      <th className="px-4 py-3">Staff</th>
                      <th className="px-4 py-3">Sessions</th>
                      <th className="px-4 py-3">Lines Counted</th>
                      <th className="px-4 py-3">Lines w/ Variance</th>
                      <th className="px-4 py-3">Variance Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {varianceHeatmap.staffBreakdown.map((s) => (
                      <tr key={s.userId} className="hover:bg-[#0B1623]/60">
                        <td className="px-4 py-3 font-medium">{s.email}</td>
                        <td className="px-4 py-3">{s.sessionsCounted}</td>
                        <td className="px-4 py-3">{s.linesCounted}</td>
                        <td className="px-4 py-3">{s.linesWithAdjustment}</td>
                        <td className="px-4 py-3">
                          {s.linesCounted > 0
                            ? `${((s.linesWithAdjustment / s.linesCounted) * 100).toFixed(1)}%`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── COGS tab ── */}
      {activeTab === "cogs" && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Cost of Goods Sold</h2>

          {/* COGS formula cards */}
          <div className="mb-6 grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
              <p className="text-sm text-[#EAF0FF]/60">Opening Stock</p>
              <p className="text-2xl font-bold">${(cogs?.openingValue ?? 0).toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
              <p className="text-sm text-[#EAF0FF]/60">+ Purchases</p>
              <p className="text-2xl font-bold text-green-400">${(cogs?.purchasesValue ?? 0).toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
              <p className="text-sm text-[#EAF0FF]/60">- Closing Stock</p>
              <p className="text-2xl font-bold">${(cogs?.closingValue ?? 0).toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-[#E9B44C]/30 bg-[#16283F] p-4">
              <p className="text-sm text-[#E9B44C]">= COGS</p>
              <p className="text-2xl font-bold text-[#E9B44C]">${(cogs?.cogs ?? 0).toFixed(2)}</p>
            </div>
          </div>

          {/* Purchases breakdown */}
          <h3 className="mb-3 text-base font-semibold">Purchases Breakdown</h3>
          <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
                <tr>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Qty Received</th>
                  <th className="px-4 py-3">UOM</th>
                  <th className="px-4 py-3">Unit Cost</th>
                  <th className="px-4 py-3">Total Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {(cogs?.purchases ?? []).map((p, i) => (
                  <tr key={i} className="hover:bg-[#16283F]/60">
                    <td className="px-4 py-3 font-medium">{p.itemName}</td>
                    <td className="px-4 py-3">{p.quantityReceived.toFixed(1)}</td>
                    <td className="px-4 py-3">{p.uom}</td>
                    <td className="px-4 py-3">{p.unitCost != null ? `$${p.unitCost.toFixed(2)}` : "—"}</td>
                    <td className="px-4 py-3">{p.totalCost != null ? `$${p.totalCost.toFixed(2)}` : "—"}</td>
                  </tr>
                ))}
                {(cogs?.purchases ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-[#EAF0FF]/40">
                      No purchases recorded in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Usage tab ── */}
      {activeTab === "usage" && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Usage Report</h2>

          {/* Usage stat cards */}
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
              <p className="text-sm text-[#EAF0FF]/60">Items Used</p>
              <p className="text-2xl font-bold">{usage?.totalItems ?? 0}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
              <p className="text-sm text-[#EAF0FF]/60">Total Usage Cost</p>
              <p className="text-2xl font-bold">${(usage?.totalUsageCost ?? 0).toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
              <p className="text-sm text-[#EAF0FF]/60">Sessions</p>
              <p className="text-2xl font-bold">{usage?.totalSessions ?? 0}</p>
            </div>
          </div>

          <input
            type="text"
            placeholder="Search items..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="mb-4 w-full max-w-sm rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
          />

          <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
                <tr>
                  <UsageSortHeader label="Item" field="name" />
                  <UsageSortHeader label="Category" field="categoryName" />
                  <UsageSortHeader label="Qty Used" field="quantityUsed" />
                  <th className="px-4 py-3">UOM</th>
                  <UsageSortHeader label="Unit Cost" field="unitCost" />
                  <UsageSortHeader label="Total Cost" field="totalCost" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sortedUsageItems.map((item) => (
                  <tr key={item.itemId} className="hover:bg-[#16283F]/60">
                    <td className="px-4 py-3 font-medium">{item.name}</td>
                    <td className="px-4 py-3">{item.categoryName ?? "—"}</td>
                    <td className="px-4 py-3">{item.quantityUsed.toFixed(1)}</td>
                    <td className="px-4 py-3">{item.uom}</td>
                    <td className="px-4 py-3">{item.unitCost != null ? `$${item.unitCost.toFixed(2)}` : "—"}</td>
                    <td className="px-4 py-3">{item.totalCost != null ? `$${item.totalCost.toFixed(2)}` : "—"}</td>
                  </tr>
                ))}
                {sortedUsageItems.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-[#EAF0FF]/40">
                      {filter ? "No items match your search." : "No usage data for this period."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Staff tab ── */}
      {activeTab === "staff" && (
        <section>
          {/* Staff summary cards */}
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
              <p className="text-sm text-[#EAF0FF]/60">Staff Counted</p>
              <p className="text-2xl font-bold">{staffData?.summary.totalStaff ?? 0}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
              <p className="text-sm text-[#EAF0FF]/60">Avg Accuracy</p>
              <p className={`text-2xl font-bold ${
                (staffData?.summary.avgAccuracyRate ?? 0) >= 95 ? "text-green-400" :
                (staffData?.summary.avgAccuracyRate ?? 0) >= 85 ? "text-amber-400" : "text-red-400"
              }`}>
                {(staffData?.summary.avgAccuracyRate ?? 0).toFixed(1)}%
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
              <p className="text-sm text-[#EAF0FF]/60">Avg Manual Rate</p>
              <p className="text-2xl font-bold">{(staffData?.summary.avgManualEntryRate ?? 0).toFixed(1)}%</p>
            </div>
          </div>

          {/* Staff accountability table */}
          <h2 className="mb-3 text-lg font-semibold">Staff Accountability</h2>
          <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
                <tr>
                  <StaffSortHeader label="Staff" field="displayName" />
                  <StaffSortHeader label="Sessions" field="sessionsCounted" />
                  <StaffSortHeader label="Lines" field="linesCounted" />
                  <StaffSortHeader label="Accuracy %" field="accuracyRate" />
                  <StaffSortHeader label="Avg Variance" field="avgVarianceMagnitude" />
                  <StaffSortHeader label="Manual %" field="manualEntryRate" />
                  <StaffSortHeader label="Trend" field="trend" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sortedStaff.map((s) => (
                  <tr key={s.userId} className="hover:bg-[#0B1623]/60">
                    <td className="px-4 py-3 font-medium">{s.displayName}</td>
                    <td className="px-4 py-3">{s.sessionsCounted}</td>
                    <td className="px-4 py-3">{s.linesCounted}</td>
                    <td className={`px-4 py-3 font-medium ${
                      s.accuracyRate >= 95 ? "text-green-400" :
                      s.accuracyRate >= 85 ? "text-amber-400" : "text-red-400"
                    }`}>
                      {s.accuracyRate.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3">{s.avgVarianceMagnitude.toFixed(1)}</td>
                    <td className="px-4 py-3">{s.manualEntryRate.toFixed(1)}%</td>
                    <td className="px-4 py-3">
                      {s.trend === "worsening" && <span className="text-red-400" title="Worsening">&#x2193;</span>}
                      {s.trend === "improving" && <span className="text-green-400" title="Improving">&#x2191;</span>}
                      {s.trend === "stable" && <span className="text-[#EAF0FF]/40" title="Stable">&#x2192;</span>}
                    </td>
                  </tr>
                ))}
                {sortedStaff.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-[#EAF0FF]/40">
                      No staff data for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Session summary cards */}
          <div className="mt-8 mb-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
              <p className="text-sm text-[#EAF0FF]/60">Sessions</p>
              <p className="text-2xl font-bold">{staffData?.summary.totalSessions ?? 0}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
              <p className="text-sm text-[#EAF0FF]/60">Avg Duration</p>
              <p className="text-2xl font-bold">{staffData?.summary.avgSessionDurationMinutes ?? 0}m</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
              <p className="text-sm text-[#EAF0FF]/60">Avg Items/Hr</p>
              <p className="text-2xl font-bold">{staffData?.summary.avgItemsPerHour ?? 0}</p>
            </div>
          </div>

          {/* Session metrics table */}
          <h2 className="mb-3 text-lg font-semibold">Session Metrics</h2>
          <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
                <tr>
                  <SessionSortHeader label="Date" field="startedTs" />
                  <SessionSortHeader label="Duration" field="durationMinutes" />
                  <SessionSortHeader label="Items" field="totalLines" />
                  <SessionSortHeader label="Items/Hr" field="itemsPerHour" />
                  <SessionSortHeader label="Variance %" field="varianceRate" />
                  <SessionSortHeader label="Manual %" field="manualEntryRate" />
                  <SessionSortHeader label="Participants" field="participantCount" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sortedSessions.map((s) => (
                  <tr key={s.sessionId} className="hover:bg-[#0B1623]/60">
                    <td className="px-4 py-3 font-medium">
                      {new Date(s.startedTs).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3">{s.durationMinutes}m</td>
                    <td className="px-4 py-3">{s.totalLines}</td>
                    <td className="px-4 py-3">{s.itemsPerHour}</td>
                    <td className={`px-4 py-3 ${s.varianceRate > 20 ? "text-red-400" : s.varianceRate > 10 ? "text-amber-400" : ""}`}>
                      {s.varianceRate.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3">{s.manualEntryRate.toFixed(1)}%</td>
                    <td className="px-4 py-3">{s.participantCount}</td>
                  </tr>
                ))}
                {sortedSessions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-[#EAF0FF]/40">
                      No session data for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Patterns tab ── */}
      {activeTab === "patterns" && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Variance Patterns</h2>

          {/* Session count input */}
          <div className="mb-4 flex items-center gap-3">
            <label className="text-sm text-[#EAF0FF]/60">Sessions to analyze:</label>
            <input
              type="number"
              min={3}
              max={50}
              value={sessionCount}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (v >= 3 && v <= 50) setSessionCount(v);
              }}
              className="w-20 rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
            />
          </div>

          {/* Pattern summary cards */}
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
              <p className="text-sm text-[#EAF0FF]/60">Items Analyzed</p>
              <p className="text-2xl font-bold">{patterns?.length ?? 0}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
              <p className="text-sm text-[#EAF0FF]/60">Shrinkage Suspects</p>
              <p className={`text-2xl font-bold ${(patterns?.filter((p) => p.isShrinkageSuspect).length ?? 0) > 0 ? "text-red-400" : ""}`}>
                {patterns?.filter((p) => p.isShrinkageSuspect).length ?? 0}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
              <p className="text-sm text-[#EAF0FF]/60">Total Est. Loss</p>
              <p className="text-2xl font-bold text-red-400">
                {(patterns?.reduce((s, p) => s + p.totalEstimatedLoss, 0) ?? 0).toFixed(1)}
              </p>
            </div>
          </div>

          <input
            type="text"
            placeholder="Search items..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="mb-4 w-full max-w-sm rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
          />

          <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
                <tr>
                  <PatternSortHeader label="Item" field="itemName" />
                  <PatternSortHeader label="Category" field="categoryName" />
                  <PatternSortHeader label="Sessions" field="sessionsAppeared" />
                  <PatternSortHeader label="Avg Variance" field="avgVariance" />
                  <PatternSortHeader label="Trend" field="trend" />
                  <PatternSortHeader label="Est. Loss" field="totalEstimatedLoss" />
                  <th className="px-4 py-3">Flag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sortedPatternItems.map((item) => (
                  <tr key={item.inventoryItemId} className="hover:bg-[#0B1623]/60">
                    <td className="px-4 py-3 font-medium">{item.itemName}</td>
                    <td className="px-4 py-3">{item.categoryName ?? "—"}</td>
                    <td className="px-4 py-3">
                      {item.sessionsWithVariance}/{item.sessionsAppeared}
                    </td>
                    <td
                      className={`px-4 py-3 font-medium ${
                        item.avgVariance < 0 ? "text-red-400" : item.avgVariance > 0 ? "text-green-400" : ""
                      }`}
                    >
                      {item.avgVariance.toFixed(1)}
                    </td>
                    <td className="px-4 py-3">
                      {item.trend === "worsening" && (
                        <span className="text-red-400" title="Worsening">&#x2193;</span>
                      )}
                      {item.trend === "improving" && (
                        <span className="text-green-400" title="Improving">&#x2191;</span>
                      )}
                      {item.trend === "stable" && (
                        <span className="text-[#EAF0FF]/40" title="Stable">&#x2192;</span>
                      )}
                    </td>
                    <td className={`px-4 py-3 ${item.totalEstimatedLoss < 0 ? "text-red-400" : ""}`}>
                      {item.totalEstimatedLoss.toFixed(1)}
                    </td>
                    <td className="px-4 py-3">
                      {item.isShrinkageSuspect && (
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500/20 text-xs font-bold text-red-400">
                          !
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {sortedPatternItems.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-[#EAF0FF]/40">
                      {filter ? "No items match your search." : "Not enough session data for pattern analysis."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
