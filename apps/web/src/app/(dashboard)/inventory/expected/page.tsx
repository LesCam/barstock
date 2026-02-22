"use client";

import { useState, useMemo, Fragment } from "react";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";
import { useLocation } from "@/components/location-context";

type SortKey =
  | "itemName"
  | "categoryName"
  | "lastCountValue"
  | "daysSinceLastCount"
  | "netChangeSinceCount"
  | "predictedLevel"
  | "daysToStockout"
  | "avgDailyUsage"
  | "currentOnHand"
  | "confidence";
type SortDir = "asc" | "desc";

function ConfidenceDot({ confidence }: { confidence: "high" | "medium" | "low" }) {
  const config = {
    high: { color: "bg-green-400", label: "High" },
    medium: { color: "bg-yellow-400", label: "Med" },
    low: { color: "bg-red-400", label: "Low" },
  };
  const { color, label } = config[confidence];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />
      <span className="text-xs">{label}</span>
    </span>
  );
}

function SourceBreakdown({
  posChange,
  tapFlowChange,
  receivingChange,
  transferChange,
  adjustmentChange,
  netChange,
}: {
  posChange: number;
  tapFlowChange: number;
  receivingChange: number;
  transferChange: number;
  adjustmentChange: number;
  netChange: number;
}) {
  const sources = [
    { label: "POS Sales", value: posChange },
    { label: "Tap Flow", value: tapFlowChange },
    { label: "Received", value: receivingChange },
    { label: "Transfers", value: transferChange },
    { label: "Adjustments", value: adjustmentChange },
  ].filter((s) => s.value !== 0);

  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-1 py-2 text-sm sm:grid-cols-3">
      {sources.map((s) => (
        <div key={s.label} className="flex justify-between gap-4">
          <span className="text-[#EAF0FF]/60">{s.label}</span>
          <span className={s.value > 0 ? "text-green-400" : s.value < 0 ? "text-red-400" : ""}>
            {s.value > 0 ? "+" : ""}
            {s.value.toFixed(1)}
          </span>
        </div>
      ))}
      <div className="col-span-full mt-1 flex justify-between gap-4 border-t border-white/10 pt-1">
        <span className="font-medium text-[#EAF0FF]/80">Net Change</span>
        <span className={`font-medium ${netChange > 0 ? "text-green-400" : netChange < 0 ? "text-red-400" : ""}`}>
          {netChange > 0 ? "+" : ""}
          {netChange.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

export default function ExpectedOnHandPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const { selectedLocationId: locationId } = useLocation();

  const [filter, setFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("itemName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: items, isLoading } = trpc.reports.expectedOnHand.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId, refetchInterval: 60_000 }
  );

  const categories = useMemo(() => {
    if (!items) return [];
    const names = new Set(items.map((i) => i.categoryName).filter(Boolean));
    return Array.from(names).sort() as string[];
  }, [items]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sortedItems = useMemo(() => {
    if (!items) return [];
    const lc = filter.toLowerCase();
    const filtered = items.filter((item) => {
      if (lc && !item.itemName.toLowerCase().includes(lc) && !(item.categoryName ?? "").toLowerCase().includes(lc)) {
        return false;
      }
      if (categoryFilter && item.categoryName !== categoryFilter) {
        return false;
      }
      return true;
    });
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (sortKey === "confidence") {
        const order = { high: 0, medium: 1, low: 2 };
        const cmp = order[a.confidence] - order[b.confidence];
        return sortDir === "asc" ? cmp : -cmp;
      }
      if (typeof aVal === "string" && typeof bVal === "string") {
        const cmp = aVal.toLowerCase().localeCompare(bVal.toLowerCase());
        return sortDir === "asc" ? cmp : -cmp;
      }
      const aNum = (aVal as number) ?? -Infinity;
      const bNum = (bVal as number) ?? -Infinity;
      return sortDir === "asc" ? aNum - bNum : bNum - aNum;
    });
  }, [items, filter, categoryFilter, sortKey, sortDir]);

  const needingCount = useMemo(
    () => sortedItems.filter((i) => i.confidence === "medium" || i.confidence === "low").length,
    [sortedItems]
  );
  const negativeStock = useMemo(
    () => sortedItems.filter((i) => i.predictedLevel != null && i.predictedLevel < 0).length,
    [sortedItems]
  );
  const lowStock = useMemo(
    () => sortedItems.filter((i) => i.daysToStockout != null && i.daysToStockout < 3 && i.daysToStockout >= 0).length,
    [sortedItems]
  );

  function SortHeader({ label, field, className }: { label: string; field: SortKey; className?: string }) {
    const active = sortKey === field;
    return (
      <th
        className={`cursor-pointer select-none px-4 py-3 hover:text-[#EAF0FF]/80 ${className ?? ""}`}
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

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-[#EAF0FF]">Expected On-Hand</h1>

      {/* Summary cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-sm text-[#EAF0FF]/60">Total Items</p>
          <p className="text-2xl font-bold">{items?.length ?? 0}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-sm text-[#EAF0FF]/60">Needing Count</p>
          <p className={`text-2xl font-bold ${needingCount > 0 ? "text-yellow-400" : ""}`}>
            {needingCount}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-sm text-[#EAF0FF]/60">Negative Stock</p>
          <p className={`text-2xl font-bold ${negativeStock > 0 ? "text-red-400" : ""}`}>
            {negativeStock}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-sm text-[#EAF0FF]/60">Low Stock (&lt;3d)</p>
          <p className={`text-2xl font-bold ${lowStock > 0 ? "text-orange-400" : ""}`}>
            {lowStock}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search items..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full max-w-sm rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-[#EAF0FF]/60">Loading...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
              <tr>
                <th className="w-8 px-2 py-3" />
                <SortHeader label="Item" field="itemName" />
                <SortHeader label="Category" field="categoryName" />
                <SortHeader label="Last Count" field="lastCountValue" />
                <SortHeader label="Days Ago" field="daysSinceLastCount" />
                <SortHeader label="Net Change" field="netChangeSinceCount" />
                <SortHeader label="Predicted" field="predictedLevel" />
                <SortHeader label="Days Left" field="daysToStockout" />
                <SortHeader label="Avg Daily" field="avgDailyUsage" />
                <SortHeader label="On-Hand" field="currentOnHand" />
                <SortHeader label="Confidence" field="confidence" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sortedItems.map((item) => {
                const isExpanded = expandedId === item.inventoryItemId;
                const isNegative = item.predictedLevel != null && item.predictedLevel < 0;
                return (
                  <Fragment key={item.inventoryItemId}>
                    <tr
                      className="cursor-pointer hover:bg-[#0B1623]/60"
                      onClick={() => setExpandedId(isExpanded ? null : item.inventoryItemId)}
                    >
                      <td className="px-2 py-3 text-center text-[#EAF0FF]/40">
                        {isExpanded ? "▼" : "▶"}
                      </td>
                      <td className="px-4 py-3 font-medium">{item.itemName}</td>
                      <td className="px-4 py-3">{item.categoryName ?? "—"}</td>
                      <td className="px-4 py-3">
                        {item.lastCountValue != null ? item.lastCountValue.toFixed(1) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {item.daysSinceLastCount != null ? `${item.daysSinceLastCount}d` : "Never"}
                      </td>
                      <td className={`px-4 py-3 ${item.netChangeSinceCount > 0 ? "text-green-400" : item.netChangeSinceCount < 0 ? "text-red-400" : ""}`}>
                        {item.netChangeSinceCount > 0 ? "+" : ""}
                        {item.netChangeSinceCount.toFixed(1)}
                      </td>
                      <td className={`px-4 py-3 font-medium ${isNegative ? "text-red-400" : ""}`}>
                        {item.predictedLevel != null ? item.predictedLevel.toFixed(1) : "—"}
                      </td>
                      <td className={`px-4 py-3 ${item.daysToStockout != null && item.daysToStockout < 3 ? "text-orange-400 font-medium" : ""}`}>
                        {item.daysToStockout != null ? `${item.daysToStockout}d` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {item.avgDailyUsage != null ? item.avgDailyUsage.toFixed(1) : "—"}
                      </td>
                      <td className="px-4 py-3">{item.currentOnHand.toFixed(1)}</td>
                      <td className="px-4 py-3">
                        <ConfidenceDot confidence={item.confidence} />
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-[#0B1623]/40">
                        <td colSpan={11} className="px-8 py-3">
                          <SourceBreakdown
                            posChange={item.posChangeSinceCount}
                            tapFlowChange={item.tapFlowChangeSinceCount}
                            receivingChange={item.receivingChangeSinceCount}
                            transferChange={item.transferChangeSinceCount}
                            adjustmentChange={item.adjustmentChangeSinceCount}
                            netChange={item.netChangeSinceCount}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {sortedItems.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-6 text-center text-[#EAF0FF]/40">
                    {filter || categoryFilter
                      ? "No items match your filters."
                      : "No inventory data available."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
