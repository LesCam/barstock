"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend,
  LineChart, Line, ComposedChart,
} from "recharts";

type ActiveTab = "variance" | "cogs" | "usage" | "patterns" | "staff" | "recipes" | "pourCost";
type VarianceSortKey = "itemName" | "categoryName" | "variance" | "variancePercent" | "valueImpact";
type UsageSortKey = "name" | "categoryName" | "quantityUsed" | "unitCost" | "totalCost";
type PatternSortKey = "itemName" | "categoryName" | "sessionsAppeared" | "avgVariance" | "totalEstimatedLoss" | "trend";
type StaffSortKey = "displayName" | "sessionsCounted" | "linesCounted" | "accuracyRate" | "avgVarianceMagnitude" | "manualEntryRate" | "trend";
type SessionSortKey = "startedTs" | "durationMinutes" | "totalLines" | "itemsPerHour" | "varianceRate" | "manualEntryRate" | "participantCount";
type RecipeSortKey = "recipeName" | "recipeCategory" | "totalServings" | "totalCost" | "avgCostPerServing" | "pctOfTotalCost";
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
  const [recipeSortKey, setRecipeSortKey] = useState<RecipeSortKey>("totalCost");
  const [recipeSortDir, setRecipeSortDir] = useState<SortDir>("desc");
  const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null);
  const [recipeGranularity, setRecipeGranularity] = useState<"day" | "week" | "month">("day");
  const [recipeGranularityOverride, setRecipeGranularityOverride] = useState(false);

  // Usage enhancements
  const [usageMetric, setUsageMetric] = useState<"cost" | "qty">("cost");
  const [expandedUsageItemId, setExpandedUsageItemId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareDateRange, setCompareDateRange] = useState({
    from: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    to: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  });
  const [usageGroupBy, setUsageGroupBy] = useState<"item" | "vendor">("item");
  const [showMA, setShowMA] = useState(false);

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

  // --- Usage Over Time ---
  const [granularity, setGranularity] = useState<"day" | "week" | "month">("day");
  const [granularityOverride, setGranularityOverride] = useState(false);
  const [usageCategoryFilter, setUsageCategoryFilter] = useState<string>("");

  // Auto-detect granularity when date range changes
  const smartGranularity = useMemo(() => {
    const from = new Date(dateRange.from);
    const to = new Date(dateRange.to);
    const days = Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
    if (days <= 14) return "day" as const;
    if (days <= 90) return "week" as const;
    return "month" as const;
  }, [dateRange.from, dateRange.to]);

  // Apply smart default unless user has manually overridden
  const effectiveGranularity = granularityOverride ? granularity : smartGranularity;

  const { data: usageOverTime } = trpc.reports.usageOverTime.useQuery(
    {
      locationId: locationId!,
      fromDate: new Date(dateRange.from),
      toDate: toEndOfDay(dateRange.to, effectiveEod),
      granularity: effectiveGranularity,
      categoryId: usageCategoryFilter || undefined,
    },
    { enabled: !!locationId && activeTab === "usage" }
  );

  const { data: categories } = trpc.itemCategories.list.useQuery(
    { businessId: businessId!, activeOnly: true },
    { enabled: !!businessId && activeTab === "usage" }
  );

  // --- Usage Item Detail (drill-down) ---
  const { data: usageItemDetail } = trpc.reports.usageItemDetail.useQuery(
    {
      locationId: locationId!,
      itemId: expandedUsageItemId!,
      fromDate: new Date(dateRange.from),
      toDate: toEndOfDay(dateRange.to, effectiveEod),
      granularity: effectiveGranularity,
    },
    { enabled: !!locationId && !!expandedUsageItemId && activeTab === "usage" }
  );

  // --- Usage Compare Period ---
  const { data: usageOverTimeCompare } = trpc.reports.usageOverTime.useQuery(
    {
      locationId: locationId!,
      fromDate: new Date(compareDateRange.from),
      toDate: toEndOfDay(compareDateRange.to, effectiveEod),
      granularity: effectiveGranularity,
      categoryId: usageCategoryFilter || undefined,
    },
    { enabled: !!locationId && activeTab === "usage" && compareMode }
  );

  // --- Usage By Vendor ---
  const { data: usageByVendor } = trpc.reports.usageByVendor.useQuery(
    {
      locationId: locationId!,
      fromDate: new Date(dateRange.from),
      toDate: toEndOfDay(dateRange.to, effectiveEod),
      granularity: effectiveGranularity,
      categoryId: usageCategoryFilter || undefined,
    },
    { enabled: !!locationId && activeTab === "usage" && usageGroupBy === "vendor" }
  );

  // --- Recipe Analytics ---
  const effectiveRecipeGranularity = recipeGranularityOverride ? recipeGranularity : smartGranularity;

  const { data: recipeAnalytics } = trpc.reports.recipeAnalytics.useQuery(
    {
      locationId: locationId!,
      fromDate: new Date(dateRange.from),
      toDate: toEndOfDay(dateRange.to, effectiveEod),
      granularity: effectiveRecipeGranularity,
    },
    { enabled: !!locationId && activeTab === "recipes" }
  );

  const { data: recipeDetail } = trpc.reports.recipeDetail.useQuery(
    {
      locationId: locationId!,
      recipeId: expandedRecipeId!,
      fromDate: new Date(dateRange.from),
      toDate: toEndOfDay(dateRange.to, effectiveEod),
    },
    { enabled: !!locationId && !!expandedRecipeId && activeTab === "recipes" }
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

  // --- Recipe sorting ---
  function toggleRecipeSort(key: RecipeSortKey) {
    if (recipeSortKey === key) {
      setRecipeSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setRecipeSortKey(key);
      setRecipeSortDir("desc");
    }
  }

  const sortedRecipes = useMemo(() => {
    if (!recipeAnalytics?.recipes) return [];
    const lc = filter.toLowerCase();
    const filtered = recipeAnalytics.recipes.filter(
      (r) =>
        r.recipeName.toLowerCase().includes(lc) ||
        (r.recipeCategory ?? "").toLowerCase().includes(lc)
    );
    return [...filtered].sort((a, b) => {
      const aVal = a[recipeSortKey];
      const bVal = b[recipeSortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        const cmp = aVal.toLowerCase().localeCompare(bVal.toLowerCase());
        return recipeSortDir === "asc" ? cmp : -cmp;
      }
      const aNum = (aVal as number) ?? 0;
      const bNum = (bVal as number) ?? 0;
      return recipeSortDir === "asc" ? aNum - bNum : bNum - aNum;
    });
  }, [recipeAnalytics, filter, recipeSortKey, recipeSortDir]);

  function RecipeSortHeader({ label, field, className }: { label: string; field: RecipeSortKey; className?: string }) {
    const active = recipeSortKey === field;
    return (
      <th
        className={`cursor-pointer select-none px-4 py-3 hover:text-[#EAF0FF]/80 ${className ?? ""}`}
        onClick={() => toggleRecipeSort(field)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <span className={`text-xs ${active ? "text-[#E9B44C]" : "text-[#EAF0FF]/30"}`}>
            {active ? (recipeSortDir === "asc" ? "\u25B2" : "\u25BC") : "\u25B2"}
          </span>
        </span>
      </th>
    );
  }

  // --- Recipe chart data ---
  const recipeCostChartData = useMemo(() => {
    if (!recipeAnalytics?.trendBuckets) return [];
    return recipeAnalytics.trendBuckets.map((b) => {
      const d = new Date(b.period);
      let label: string;
      if (effectiveRecipeGranularity === "day") {
        label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      } else if (effectiveRecipeGranularity === "week") {
        label = `Wk ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
      } else {
        label = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      }
      return { ...b, label };
    });
  }, [recipeAnalytics, effectiveRecipeGranularity]);

  const recipeAreaChartData = useMemo(() => {
    if (!recipeAnalytics?.trendBuckets || !recipeAnalytics?.recipeSeries) return [];
    return recipeAnalytics.trendBuckets.map((b, i) => {
      const d = new Date(b.period);
      let label: string;
      if (effectiveRecipeGranularity === "day") {
        label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      } else if (effectiveRecipeGranularity === "week") {
        label = `Wk ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
      } else {
        label = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      }
      const point: Record<string, string | number> = { label };
      for (const series of recipeAnalytics.recipeSeries) {
        point[series.recipeName] = series.dataPoints[i]?.cost ?? 0;
      }
      return point;
    });
  }, [recipeAnalytics, effectiveRecipeGranularity]);

  const topRecipesByBarChart = useMemo(() => {
    if (!recipeAnalytics?.recipes) return [];
    return recipeAnalytics.recipes.slice(0, 10).map((r) => ({
      name: r.recipeName.length > 20 ? r.recipeName.slice(0, 18) + "..." : r.recipeName,
      cost: r.totalCost,
    }));
  }, [recipeAnalytics]);

  const topIngredientsPieData = useMemo(() => {
    if (!recipeAnalytics?.topIngredients) return [];
    return recipeAnalytics.topIngredients.map((ing) => ({
      name: ing.ingredientName.length > 20 ? ing.ingredientName.slice(0, 18) + "..." : ing.ingredientName,
      value: ing.totalCost,
    }));
  }, [recipeAnalytics]);

  // --- Usage Over Time chart data ---
  const AREA_COLORS = ["#E9B44C", "#4CAF50", "#2196F3", "#FF5722", "#9C27B0", "#00BCD4", "#FF9800", "#607D8B", "#E91E63", "#8BC34A", "#795548"];

  const formatBucketLabel = (period: string, gran: "day" | "week" | "month") => {
    const d = new Date(period);
    if (gran === "day") return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (gran === "week") return `Wk ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  };

  const usageChartData = useMemo(() => {
    if (!usageOverTime?.buckets) return [];
    return usageOverTime.buckets.map((b) => ({
      ...b,
      label: formatBucketLabel(b.period, effectiveGranularity),
      value: usageMetric === "cost" ? b.totalCost : b.totalQty,
    }));
  }, [usageOverTime, effectiveGranularity, usageMetric]);

  const areaChartData = useMemo(() => {
    if (!usageOverTime?.buckets || !usageOverTime?.itemSeries) return [];
    return usageOverTime.buckets.map((b, i) => {
      const point: Record<string, string | number> = {
        label: formatBucketLabel(b.period, effectiveGranularity),
      };
      for (const series of usageOverTime.itemSeries) {
        const dp = series.dataPoints[i];
        point[series.itemName] = usageMetric === "cost" ? (dp?.cost ?? 0) : (dp?.qty ?? 0);
      }
      return point;
    });
  }, [usageOverTime, effectiveGranularity, usageMetric]);

  // Compare mode chart data
  const compareChartData = useMemo(() => {
    if (!compareMode || !usageOverTime?.buckets) return [];
    const currentBuckets = usageOverTime.buckets;
    const compareBuckets = usageOverTimeCompare?.buckets ?? [];
    const maxLen = Math.max(currentBuckets.length, compareBuckets.length);
    const data: Array<{ label: string; current: number; comparison: number }> = [];
    for (let i = 0; i < maxLen; i++) {
      const cur = currentBuckets[i];
      const cmp = compareBuckets[i];
      data.push({
        label: cur
          ? formatBucketLabel(cur.period, effectiveGranularity)
          : cmp
            ? `Day ${i + 1}`
            : `Day ${i + 1}`,
        current: cur ? (usageMetric === "cost" ? cur.totalCost : cur.totalQty) : 0,
        comparison: cmp ? (usageMetric === "cost" ? cmp.totalCost : cmp.totalQty) : 0,
      });
    }
    return data;
  }, [compareMode, usageOverTime, usageOverTimeCompare, effectiveGranularity, usageMetric]);

  // Vendor area chart data
  const vendorAreaChartData = useMemo(() => {
    if (!usageByVendor?.buckets || !usageByVendor?.vendorSeries) return [];
    return usageByVendor.buckets.map((b, i) => {
      const point: Record<string, string | number> = {
        label: formatBucketLabel(b.period, effectiveGranularity),
      };
      for (const series of usageByVendor.vendorSeries) {
        const dp = series.dataPoints[i];
        point[series.vendorName] = usageMetric === "cost" ? (dp?.cost ?? 0) : (dp?.qty ?? 0);
      }
      return point;
    });
  }, [usageByVendor, effectiveGranularity, usageMetric]);

  // Item drill-down chart data
  const itemDetailChartData = useMemo(() => {
    if (!usageItemDetail?.periods) return [];
    return usageItemDetail.periods.map((p) => ({
      label: formatBucketLabel(p.period, effectiveGranularity),
      value: usageMetric === "cost" ? p.cost : p.qty,
    }));
  }, [usageItemDetail, effectiveGranularity, usageMetric]);

  // Moving average data (7-period)
  const usageChartDataWithMA = useMemo(() => {
    if (!usageChartData.length) return usageChartData;
    const MA_WINDOW = 7;
    return usageChartData.map((d, i) => {
      if (i < MA_WINDOW - 1) return { ...d, ma: null };
      const slice = usageChartData.slice(i - MA_WINDOW + 1, i + 1);
      const avg = slice.reduce((s, p) => s + (p.value as number), 0) / MA_WINDOW;
      return { ...d, ma: avg };
    });
  }, [usageChartData]);

  // % change vs prior period (compare current total to same-length prior period from buckets)
  const usagePriorPctChange = useMemo(() => {
    if (!usageOverTime?.buckets || usageOverTime.buckets.length < 2) return null;
    const buckets = usageOverTime.buckets;
    const half = Math.floor(buckets.length / 2);
    const currentSlice = buckets.slice(half);
    const priorSlice = buckets.slice(0, half);
    const currentTotal = currentSlice.reduce((s, b) => s + (usageMetric === "cost" ? b.totalCost : b.totalQty), 0);
    const priorTotal = priorSlice.reduce((s, b) => s + (usageMetric === "cost" ? b.totalCost : b.totalQty), 0);
    if (priorTotal === 0) return null;
    return ((currentTotal - priorTotal) / priorTotal) * 100;
  }, [usageOverTime, usageMetric]);

  // Anomaly detection: items whose latest period value > 2x their mean
  const anomalyItemIds = useMemo(() => {
    const set = new Set<string>();
    if (!usageOverTime?.itemSeries) return set;
    for (const series of usageOverTime.itemSeries) {
      const vals = series.dataPoints.map((dp: any) => usageMetric === "cost" ? (dp?.cost ?? 0) : (dp?.qty ?? 0));
      if (vals.length < 2) continue;
      const mean = vals.reduce((s: number, v: number) => s + v, 0) / vals.length;
      const latest = vals[vals.length - 1];
      if (mean > 0 && latest > 2 * mean) set.add(series.itemId);
    }
    return set;
  }, [usageOverTime, usageMetric]);

  // Pour Cost tab data
  const { data: pourCostData, isLoading: pourCostLoading } = trpc.reports.pourCost.useQuery(
    {
      locationId: locationId!,
      fromDate: new Date(dateRange.from),
      toDate: toEndOfDay(dateRange.to, effectiveEod),
    },
    { enabled: !!locationId && activeTab === "pourCost" }
  );

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: "variance", label: "Variance" },
    { key: "cogs", label: "COGS" },
    { key: "usage", label: "Usage" },
    { key: "patterns", label: "Patterns" },
    { key: "staff", label: "Staff" },
    { key: "recipes", label: "Recipes" },
    { key: "pourCost", label: "Pour Cost" },
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
            {usagePriorPctChange != null && (
              <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
                <p className="text-sm text-[#EAF0FF]/60">vs Prior Period</p>
                <p className={`text-2xl font-bold ${usagePriorPctChange > 0 ? "text-red-400" : usagePriorPctChange < 0 ? "text-green-400" : "text-[#EAF0FF]"}`}>
                  {usagePriorPctChange > 0 ? "+" : ""}{usagePriorPctChange.toFixed(1)}%
                </p>
              </div>
            )}
          </div>

          {/* Usage Over Time Charts */}
          <div className="mb-8">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h3 className="text-base font-semibold">Usage Over Time</h3>
              {/* Granularity picker */}
              <div className="flex items-center gap-1 rounded-lg bg-[#0B1623] p-0.5">
                {(["day", "week", "month"] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => { setGranularity(g); setGranularityOverride(true); }}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      effectiveGranularity === g
                        ? "bg-[#16283F] text-[#E9B44C]"
                        : "text-[#EAF0FF]/60 hover:text-[#EAF0FF]/80"
                    }`}
                  >
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </button>
                ))}
              </div>
              {/* Cost/Qty toggle */}
              <div className="flex items-center gap-1 rounded-lg bg-[#0B1623] p-0.5">
                {(["cost", "qty"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setUsageMetric(m)}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      usageMetric === m
                        ? "bg-[#16283F] text-[#E9B44C]"
                        : "text-[#EAF0FF]/60 hover:text-[#EAF0FF]/80"
                    }`}
                  >
                    {m === "cost" ? "Cost ($)" : "Quantity"}
                  </button>
                ))}
              </div>
              {/* Category filter */}
              <select
                value={usageCategoryFilter}
                onChange={(e) => setUsageCategoryFilter(e.target.value)}
                className="rounded-md border border-white/10 bg-[#0B1623] px-2 py-1 text-xs text-[#EAF0FF]"
              >
                <option value="">All Categories</option>
                {(categories ?? []).map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              {/* By Item / By Vendor toggle */}
              <div className="flex items-center gap-1 rounded-lg bg-[#0B1623] p-0.5">
                {(["item", "vendor"] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setUsageGroupBy(g)}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      usageGroupBy === g
                        ? "bg-[#16283F] text-[#E9B44C]"
                        : "text-[#EAF0FF]/60 hover:text-[#EAF0FF]/80"
                    }`}
                  >
                    {g === "item" ? "By Item" : "By Vendor"}
                  </button>
                ))}
              </div>
              {/* Compare toggle */}
              <button
                onClick={() => setCompareMode(!compareMode)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  compareMode
                    ? "bg-[#16283F] text-[#E9B44C]"
                    : "rounded-lg bg-[#0B1623] text-[#EAF0FF]/60 hover:text-[#EAF0FF]/80"
                }`}
              >
                Compare
              </button>
              {/* Moving Average toggle */}
              <label className="flex items-center gap-1.5 text-xs text-[#EAF0FF]/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showMA}
                  onChange={(e) => setShowMA(e.target.checked)}
                  className="rounded border-white/20 bg-[#0B1623]"
                />
                Show MA
              </label>
            </div>

            {/* Compare date range picker */}
            {compareMode && (
              <div className="mb-3 flex items-center gap-3">
                <span className="text-xs text-[#EAF0FF]/60">Compare with:</span>
                <input
                  type="date"
                  value={compareDateRange.from}
                  onChange={(e) => setCompareDateRange((d) => ({ ...d, from: e.target.value }))}
                  className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-1.5 text-xs text-[#EAF0FF] [color-scheme:dark]"
                />
                <input
                  type="date"
                  value={compareDateRange.to}
                  onChange={(e) => setCompareDateRange((d) => ({ ...d, to: e.target.value }))}
                  className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-1.5 text-xs text-[#EAF0FF] [color-scheme:dark]"
                />
              </div>
            )}

            {/* Total Usage Trend — Bar Chart or Compare Grouped Bar */}
            <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
              {compareMode && compareChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={compareChartData}>
                    <XAxis dataKey="label" tick={{ fill: "#EAF0FF", fontSize: 12 }} axisLine={{ stroke: "#ffffff1a" }} tickLine={false} />
                    <YAxis tick={{ fill: "#EAF0FF99", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => usageMetric === "cost" ? `$${v}` : `${v}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0B1623", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#EAF0FF" }}
                      formatter={(value, name) => [
                        usageMetric === "cost" ? `$${Number(value ?? 0).toFixed(2)}` : Number(value ?? 0).toFixed(1),
                        name === "current" ? "Current Period" : "Comparison Period",
                      ]}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11, color: "#EAF0FF" }}
                      formatter={(value) => value === "current" ? "Current Period" : "Comparison Period"}
                    />
                    <Bar dataKey="current" fill="#E9B44C" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="comparison" fill="#4CAF50" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : usageChartDataWithMA.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={usageChartDataWithMA}>
                    <XAxis dataKey="label" tick={{ fill: "#EAF0FF", fontSize: 12 }} axisLine={{ stroke: "#ffffff1a" }} tickLine={false} />
                    <YAxis tick={{ fill: "#EAF0FF99", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => usageMetric === "cost" ? `$${v}` : `${v}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0B1623", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#EAF0FF" }}
                      formatter={(value, name) => [
                        usageMetric === "cost" ? `$${Number(value ?? 0).toFixed(2)}` : Number(value ?? 0).toFixed(1),
                        name === "ma" ? "7-period MA" : usageMetric === "cost" ? "Cost" : "Quantity",
                      ]}
                      labelFormatter={(label) => label}
                    />
                    <Bar dataKey="value" fill="#E9B44C" radius={[4, 4, 0, 0]} name={usageMetric === "cost" ? "Cost" : "Quantity"} />
                    {showMA && (
                      <Line type="monotone" dataKey="ma" stroke="#4CAF50" strokeWidth={2} strokeDasharray="5 5" dot={false} name="ma" connectNulls={false} />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-8 text-center text-sm text-[#EAF0FF]/40">No usage data for this period.</p>
              )}
            </div>

            {/* Top Items/Vendor Breakdown (Stacked Area Chart) — hidden during compare mode */}
            {!compareMode && usageGroupBy === "item" && areaChartData.length > 0 && usageOverTime?.itemSeries && usageOverTime.itemSeries.length > 0 && (
              <div className="mt-4">
                <h4 className="mb-2 text-sm font-semibold text-[#EAF0FF]/80">Top Items Breakdown</h4>
                <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
                  <ResponsiveContainer width="100%" height={320}>
                    <AreaChart data={areaChartData}>
                      <XAxis dataKey="label" tick={{ fill: "#EAF0FF", fontSize: 12 }} axisLine={{ stroke: "#ffffff1a" }} tickLine={false} />
                      <YAxis tick={{ fill: "#EAF0FF99", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => usageMetric === "cost" ? `$${v}` : `${v}`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#0B1623", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#EAF0FF" }}
                        formatter={(value, name) => [usageMetric === "cost" ? `$${Number(value ?? 0).toFixed(2)}` : Number(value ?? 0).toFixed(1), name]}
                      />
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
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Vendor Breakdown (Stacked Area Chart) */}
            {!compareMode && usageGroupBy === "vendor" && vendorAreaChartData.length > 0 && usageByVendor?.vendorSeries && usageByVendor.vendorSeries.length > 0 && (
              <div className="mt-4">
                <h4 className="mb-2 text-sm font-semibold text-[#EAF0FF]/80">Top Vendors Breakdown</h4>
                <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
                  <ResponsiveContainer width="100%" height={320}>
                    <AreaChart data={vendorAreaChartData}>
                      <XAxis dataKey="label" tick={{ fill: "#EAF0FF", fontSize: 12 }} axisLine={{ stroke: "#ffffff1a" }} tickLine={false} />
                      <YAxis tick={{ fill: "#EAF0FF99", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => usageMetric === "cost" ? `$${v}` : `${v}`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#0B1623", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#EAF0FF" }}
                        formatter={(value, name) => [usageMetric === "cost" ? `$${Number(value ?? 0).toFixed(2)}` : Number(value ?? 0).toFixed(1), name]}
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
                </div>
              </div>
            )}
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
                  <th className="w-8 px-2 py-3" />
                  <UsageSortHeader label="Item" field="name" />
                  <UsageSortHeader label="Category" field="categoryName" />
                  <UsageSortHeader label="Qty Used" field="quantityUsed" />
                  <th className="px-4 py-3">UOM</th>
                  <UsageSortHeader label="Unit Cost" field="unitCost" />
                  <UsageSortHeader label="Total Cost" field="totalCost" />
                  <th className="px-4 py-3">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sortedUsageItems.map((item) => (
                  <>
                    <tr
                      key={item.itemId}
                      className="cursor-pointer hover:bg-[#0B1623]/60"
                      onClick={() => setExpandedUsageItemId(expandedUsageItemId === item.itemId ? null : item.itemId)}
                    >
                      <td className="px-2 py-3 text-center text-[#EAF0FF]/40">
                        {expandedUsageItemId === item.itemId ? "\u25BC" : "\u25B6"}
                      </td>
                      <td className="px-4 py-3 font-medium">{item.name}</td>
                      <td className="px-4 py-3">{item.categoryName ?? "—"}</td>
                      <td className="px-4 py-3">{item.quantityUsed.toFixed(1)}</td>
                      <td className="px-4 py-3">{item.uom}</td>
                      <td className="px-4 py-3">{item.unitCost != null ? `$${item.unitCost.toFixed(2)}` : "—"}</td>
                      <td className="px-4 py-3">{item.totalCost != null ? `$${item.totalCost.toFixed(2)}` : "—"}</td>
                      <td className="px-4 py-3">
                        {anomalyItemIds.has(item.itemId) && (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-400" title="Usage spike: latest period > 2x average">
                            Spike
                          </span>
                        )}
                      </td>
                    </tr>
                    {expandedUsageItemId === item.itemId && (
                      <tr key={`${item.itemId}-detail`}>
                        <td colSpan={8} className="bg-[#0B1623]/40 px-6 py-3">
                          {itemDetailChartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={200}>
                              <LineChart data={itemDetailChartData}>
                                <XAxis dataKey="label" tick={{ fill: "#EAF0FF", fontSize: 11 }} axisLine={{ stroke: "#ffffff1a" }} tickLine={false} />
                                <YAxis tick={{ fill: "#EAF0FF99", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => usageMetric === "cost" ? `$${v}` : `${v}`} />
                                <Tooltip
                                  contentStyle={{ backgroundColor: "#0B1623", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#EAF0FF" }}
                                  formatter={(value) => [
                                    usageMetric === "cost" ? `$${Number(value ?? 0).toFixed(2)}` : Number(value ?? 0).toFixed(1),
                                    usageMetric === "cost" ? "Cost" : "Quantity",
                                  ]}
                                />
                                <Line type="monotone" dataKey="value" stroke="#E9B44C" strokeWidth={2} dot={{ r: 3, fill: "#E9B44C" }} />
                              </LineChart>
                            </ResponsiveContainer>
                          ) : usageItemDetail ? (
                            <p className="py-3 text-center text-xs text-[#EAF0FF]/40">No usage data for this item in the selected period.</p>
                          ) : (
                            <p className="py-3 text-center text-xs text-[#EAF0FF]/40">Loading usage trend...</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {sortedUsageItems.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-[#EAF0FF]/40">
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

      {/* ── Recipes tab ── */}
      {activeTab === "recipes" && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Recipe Analytics</h2>

          {/* Stat cards */}
          <div className="mb-6 grid gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
              <p className="text-sm text-[#EAF0FF]/60">Recipes Used</p>
              <p className="text-2xl font-bold">{recipeAnalytics?.totalRecipesUsed ?? 0}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
              <p className="text-sm text-[#EAF0FF]/60">Total Servings</p>
              <p className="text-2xl font-bold">{recipeAnalytics?.totalServings ?? 0}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
              <p className="text-sm text-[#EAF0FF]/60">Total Recipe Cost</p>
              <p className="text-2xl font-bold">${(recipeAnalytics?.totalRecipeCost ?? 0).toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-[#E9B44C]/30 bg-[#16283F] p-4">
              <p className="text-sm text-[#E9B44C]">Avg Cost/Serving</p>
              <p className="text-2xl font-bold text-[#E9B44C]">${(recipeAnalytics?.avgCostPerServing ?? 0).toFixed(2)}</p>
            </div>
          </div>

          {/* Granularity selector */}
          <div className="mb-4 flex items-center gap-3">
            <h3 className="text-base font-semibold">Recipe Cost Trend</h3>
            <div className="flex items-center gap-1 rounded-lg bg-[#0B1623] p-0.5">
              {(["day", "week", "month"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => { setRecipeGranularity(g); setRecipeGranularityOverride(true); }}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    effectiveRecipeGranularity === g
                      ? "bg-[#16283F] text-[#E9B44C]"
                      : "text-[#EAF0FF]/60 hover:text-[#EAF0FF]/80"
                  }`}
                >
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Recipe Cost Trend — BarChart */}
          <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
            {recipeCostChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={recipeCostChartData}>
                  <XAxis dataKey="label" tick={{ fill: "#EAF0FF", fontSize: 12 }} axisLine={{ stroke: "#ffffff1a" }} tickLine={false} />
                  <YAxis tick={{ fill: "#EAF0FF99", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0B1623", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#EAF0FF" }}
                    formatter={(value) => [`$${Number(value ?? 0).toFixed(2)}`, "Cost"]}
                  />
                  <Bar dataKey="totalCost" fill="#E9B44C" radius={[4, 4, 0, 0]} name="Total Cost" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-sm text-[#EAF0FF]/40">No recipe cost data for this period.</p>
            )}
          </div>

          {/* Top Recipes Breakdown — Stacked AreaChart */}
          {recipeAreaChartData.length > 0 && recipeAnalytics?.recipeSeries && recipeAnalytics.recipeSeries.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-2 text-sm font-semibold text-[#EAF0FF]/80">Top Recipes Breakdown</h4>
              <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={recipeAreaChartData}>
                    <XAxis dataKey="label" tick={{ fill: "#EAF0FF", fontSize: 12 }} axisLine={{ stroke: "#ffffff1a" }} tickLine={false} />
                    <YAxis tick={{ fill: "#EAF0FF99", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0B1623", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#EAF0FF" }}
                      formatter={(value, name) => [`$${Number(value ?? 0).toFixed(2)}`, name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#EAF0FF" }} />
                    {recipeAnalytics.recipeSeries.map((series, i) => (
                      <Area
                        key={series.recipeId}
                        type="monotone"
                        dataKey={series.recipeName}
                        stackId="1"
                        fill={AREA_COLORS[i % AREA_COLORS.length]}
                        stroke={AREA_COLORS[i % AREA_COLORS.length]}
                        fillOpacity={0.6}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Side-by-side: Top Recipes Bar + Top Ingredients Pie */}
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {/* Horizontal Bar — Top 10 recipes by cost */}
            <div>
              <h4 className="mb-2 text-sm font-semibold text-[#EAF0FF]/80">Top Recipes by Cost</h4>
              <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
                {topRecipesByBarChart.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={topRecipesByBarChart} layout="vertical">
                      <XAxis type="number" tick={{ fill: "#EAF0FF99", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                      <YAxis type="category" dataKey="name" width={140} tick={{ fill: "#EAF0FF", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#0B1623", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#EAF0FF" }}
                        formatter={(value) => [`$${Number(value ?? 0).toFixed(2)}`, "Total Cost"]}
                      />
                      <Bar dataKey="cost" fill="#E9B44C" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="py-8 text-center text-sm text-[#EAF0FF]/40">No recipe data.</p>
                )}
              </div>
            </div>

            {/* Pie — Top 10 ingredients by cost */}
            <div>
              <h4 className="mb-2 text-sm font-semibold text-[#EAF0FF]/80">Top Ingredients by Cost</h4>
              <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
                {topIngredientsPieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={topIngredientsPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                      >
                        {topIngredientsPieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: "#0B1623", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#EAF0FF" }}
                        formatter={(value) => [`$${Number(value ?? 0).toFixed(2)}`, "Cost"]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="py-8 text-center text-sm text-[#EAF0FF]/40">No ingredient data.</p>
                )}
              </div>
            </div>
          </div>

          {/* Search filter */}
          <input
            type="text"
            placeholder="Search recipes..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="mt-6 mb-4 w-full max-w-sm rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
          />

          {/* Sortable recipe table with expandable rows */}
          <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
                <tr>
                  <th className="w-8 px-2 py-3" />
                  <RecipeSortHeader label="Recipe" field="recipeName" />
                  <RecipeSortHeader label="Category" field="recipeCategory" />
                  <RecipeSortHeader label="Servings" field="totalServings" />
                  <RecipeSortHeader label="Total Cost" field="totalCost" />
                  <RecipeSortHeader label="Avg Cost/Serving" field="avgCostPerServing" />
                  <RecipeSortHeader label="% of Total" field="pctOfTotalCost" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sortedRecipes.map((recipe) => (
                  <>
                    <tr
                      key={recipe.recipeId}
                      className="cursor-pointer hover:bg-[#0B1623]/60"
                      onClick={() => setExpandedRecipeId(expandedRecipeId === recipe.recipeId ? null : recipe.recipeId)}
                    >
                      <td className="px-2 py-3 text-center text-[#EAF0FF]/40">
                        {expandedRecipeId === recipe.recipeId ? "\u25BC" : "\u25B6"}
                      </td>
                      <td className="px-4 py-3 font-medium">{recipe.recipeName}</td>
                      <td className="px-4 py-3">{recipe.recipeCategory ?? "—"}</td>
                      <td className="px-4 py-3">{recipe.totalServings}</td>
                      <td className="px-4 py-3">${recipe.totalCost.toFixed(2)}</td>
                      <td className="px-4 py-3">${recipe.avgCostPerServing.toFixed(2)}</td>
                      <td className="px-4 py-3">{recipe.pctOfTotalCost.toFixed(1)}%</td>
                    </tr>
                    {expandedRecipeId === recipe.recipeId && (
                      <tr key={`${recipe.recipeId}-detail`}>
                        <td colSpan={7} className="bg-[#0B1623]/40 px-6 py-3">
                          {recipeDetail ? (
                            recipeDetail.ingredients.length > 0 ? (
                              <table className="w-full text-left text-xs">
                                <thead className="text-[#EAF0FF]/50">
                                  <tr>
                                    <th className="px-3 py-2">Ingredient</th>
                                    <th className="px-3 py-2">Qty/Serving</th>
                                    <th className="px-3 py-2">UOM</th>
                                    <th className="px-3 py-2">Total Qty</th>
                                    <th className="px-3 py-2">Unit Cost</th>
                                    <th className="px-3 py-2">Total Cost</th>
                                    <th className="px-3 py-2">% of Recipe</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                  {recipeDetail.ingredients.map((ing) => (
                                    <tr key={ing.inventoryItemId} className="text-[#EAF0FF]/80">
                                      <td className="px-3 py-2 font-medium">{ing.ingredientName}</td>
                                      <td className="px-3 py-2">{ing.quantityPerServing != null ? ing.quantityPerServing.toFixed(2) : "—"}</td>
                                      <td className="px-3 py-2">{ing.uom}</td>
                                      <td className="px-3 py-2">{ing.totalQty.toFixed(2)}</td>
                                      <td className="px-3 py-2">${ing.unitCost.toFixed(2)}</td>
                                      <td className="px-3 py-2">${ing.totalCost.toFixed(2)}</td>
                                      <td className="px-3 py-2">{ing.pctOfRecipeCost.toFixed(1)}%</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <p className="py-3 text-center text-xs text-[#EAF0FF]/40">No ingredient data for this recipe in the selected period.</p>
                            )
                          ) : (
                            <p className="py-3 text-center text-xs text-[#EAF0FF]/40">Loading ingredient breakdown...</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {sortedRecipes.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-[#EAF0FF]/40">
                      {filter ? "No recipes match your search." : "No recipe depletion data for this period."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Pour Cost tab ── */}
      {activeTab === "pourCost" && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Pour Cost Analysis</h2>

          {pourCostLoading ? (
            <div className="space-y-4">
              <div className="h-20 animate-pulse rounded-lg bg-white/5" />
              <div className="h-64 animate-pulse rounded-lg bg-white/5" />
            </div>
          ) : pourCostData ? (
            <>
              {/* Summary card */}
              <div className="mb-6 grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
                  <p className="text-sm text-[#EAF0FF]/60">Blended Pour Cost</p>
                  <p className={`text-2xl font-bold ${
                    (pourCostData.blendedPourCostPct ?? 0) > 30 ? "text-red-400" :
                    (pourCostData.blendedPourCostPct ?? 0) > 20 ? "text-amber-400" : "text-green-400"
                  }`}>
                    {pourCostData.blendedPourCostPct != null ? `${pourCostData.blendedPourCostPct.toFixed(1)}%` : "N/A"}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
                  <p className="text-sm text-[#EAF0FF]/60">Total Revenue</p>
                  <p className="text-2xl font-bold">${(pourCostData.totalRevenue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
                  <p className="text-sm text-[#EAF0FF]/60">Total Ingredient Cost</p>
                  <p className="text-2xl font-bold">${(pourCostData.totalIngredientCost ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
              </div>

              {/* Pour cost table */}
              <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
                    <tr>
                      <th className="px-4 py-3">POS Item</th>
                      <th className="px-4 py-3">Recipe</th>
                      <th className="px-4 py-3">Qty Sold</th>
                      <th className="px-4 py-3">Avg Price</th>
                      <th className="px-4 py-3">Ingredient Cost</th>
                      <th className="px-4 py-3">Pour Cost %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {pourCostData.items.map((item) => (
                      <tr key={item.posItemId}>
                        <td className="px-4 py-3 font-medium">{item.posItemName}</td>
                        <td className="px-4 py-3 text-[#EAF0FF]/60">{item.recipeName ?? item.mappingMode ?? "—"}</td>
                        <td className="px-4 py-3">{item.totalSold.toFixed(1)}</td>
                        <td className="px-4 py-3">{item.avgSalePrice != null ? `$${item.avgSalePrice.toFixed(2)}` : "—"}</td>
                        <td className="px-4 py-3">${item.totalIngredientCost.toFixed(2)}</td>
                        <td className="px-4 py-3">
                          {item.pourCostPct != null ? (
                            <span className={`font-medium ${
                              item.pourCostPct > 30 ? "text-red-400" :
                              item.pourCostPct > 20 ? "text-amber-400" : "text-green-400"
                            }`}>
                              {item.pourCostPct.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-[#EAF0FF]/30">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {pourCostData.items.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-[#EAF0FF]/40">
                          No pour cost data available. Ensure sales lines have unit sale prices.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="py-8 text-center text-sm text-[#EAF0FF]/40">No data available.</p>
          )}
        </section>
      )}
    </div>
  );
}
