"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";

type ActiveTab = "variance" | "cogs" | "usage" | "patterns";
type VarianceSortKey = "itemName" | "categoryName" | "variance" | "variancePercent" | "valueImpact";
type UsageSortKey = "name" | "categoryName" | "quantityUsed" | "unitCost" | "totalCost";
type PatternSortKey = "itemName" | "categoryName" | "sessionsAppeared" | "avgVariance" | "totalEstimatedLoss" | "trend";
type SortDir = "asc" | "desc";

export default function ReportsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const locationId = user?.locationIds?.[0];

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

  const { data: variance } = trpc.reports.variance.useQuery(
    {
      locationId: locationId!,
      fromDate: new Date(dateRange.from),
      toDate: new Date(dateRange.to),
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
      toDate: new Date(dateRange.to),
    },
    { enabled: !!locationId && activeTab === "cogs" }
  );

  const { data: usage } = trpc.reports.usage.useQuery(
    {
      locationId: locationId!,
      fromDate: new Date(dateRange.from),
      toDate: new Date(dateRange.to),
    },
    { enabled: !!locationId && activeTab === "usage" }
  );

  const { data: patterns } = trpc.reports.variancePatterns.useQuery(
    { locationId: locationId!, sessionCount },
    { enabled: !!locationId && activeTab === "patterns" }
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

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: "variance", label: "Variance" },
    { key: "cogs", label: "COGS" },
    { key: "usage", label: "Usage" },
    { key: "patterns", label: "Patterns" },
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
          className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
        />
        <input
          type="date"
          value={dateRange.to}
          onChange={(e) => setDateRange((d) => ({ ...d, to: e.target.value }))}
          className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
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
