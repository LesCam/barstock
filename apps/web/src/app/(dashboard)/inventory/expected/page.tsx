"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";

type SortKey =
  | "itemName"
  | "categoryName"
  | "lastCountValue"
  | "daysSinceLastCount"
  | "posDepletionSinceCount"
  | "predictedLevel"
  | "avgDailyUsage"
  | "currentOnHand"
  | "status";
type SortDir = "asc" | "desc";

export default function ExpectedOnHandPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const locationId = user?.locationIds?.[0];

  const [filter, setFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("itemName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

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
      if (sortKey === "status") {
        const order = { green: 0, yellow: 1, red: 2 };
        const cmp = order[a.status] - order[b.status];
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
    () => sortedItems.filter((i) => i.status === "yellow" || i.status === "red").length,
    [sortedItems]
  );
  const negativeStock = useMemo(
    () => sortedItems.filter((i) => i.predictedLevel != null && i.predictedLevel <= 0 && i.lastCountValue != null && i.lastCountValue - i.posDepletionSinceCount < 0).length,
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

  function StatusDot({ status }: { status: "green" | "yellow" | "red" }) {
    const colors = { green: "bg-green-400", yellow: "bg-yellow-400", red: "bg-red-400" };
    return <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors[status]}`} />;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-[#EAF0FF]">Expected On-Hand</h1>

      {/* Summary cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
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
                <SortHeader label="Item" field="itemName" />
                <SortHeader label="Category" field="categoryName" />
                <SortHeader label="Last Count" field="lastCountValue" />
                <SortHeader label="Days Ago" field="daysSinceLastCount" />
                <SortHeader label="POS Since" field="posDepletionSinceCount" />
                <SortHeader label="Predicted" field="predictedLevel" />
                <SortHeader label="Avg Daily" field="avgDailyUsage" />
                <SortHeader label="On-Hand" field="currentOnHand" />
                <SortHeader label="Status" field="status" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sortedItems.map((item) => {
                const isNegativePredicted =
                  item.lastCountValue != null &&
                  item.lastCountValue - item.posDepletionSinceCount < 0;
                return (
                  <tr key={item.inventoryItemId} className="hover:bg-[#0B1623]/60">
                    <td className="px-4 py-3 font-medium">{item.itemName}</td>
                    <td className="px-4 py-3">{item.categoryName ?? "—"}</td>
                    <td className="px-4 py-3">
                      {item.lastCountValue != null ? item.lastCountValue.toFixed(1) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {item.daysSinceLastCount != null ? `${item.daysSinceLastCount}d` : "Never"}
                    </td>
                    <td className="px-4 py-3">{item.posDepletionSinceCount.toFixed(1)}</td>
                    <td className={`px-4 py-3 font-medium ${isNegativePredicted ? "text-red-400" : ""}`}>
                      {item.predictedLevel != null
                        ? (item.lastCountValue! - item.posDepletionSinceCount).toFixed(1)
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {item.avgDailyUsage != null ? item.avgDailyUsage.toFixed(1) : "—"}
                    </td>
                    <td className="px-4 py-3">{item.currentOnHand.toFixed(1)}</td>
                    <td className="px-4 py-3">
                      <StatusDot status={item.status} />
                    </td>
                  </tr>
                );
              })}
              {sortedItems.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-[#EAF0FF]/40">
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
