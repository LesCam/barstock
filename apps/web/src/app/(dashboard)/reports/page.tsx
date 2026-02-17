"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";

type SortKey = "itemName" | "itemType" | "variance" | "variancePercent" | "valueImpact";
type SortDir = "asc" | "desc";

export default function ReportsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const locationId = user?.locationIds?.[0];

  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    to: new Date().toISOString().split("T")[0],
  });

  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("itemName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { data: variance } = trpc.reports.variance.useQuery(
    {
      locationId: locationId!,
      fromDate: new Date(dateRange.from),
      toDate: new Date(dateRange.to),
    },
    { enabled: !!locationId }
  );

  const { data: onHand } = trpc.reports.onHand.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId }
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sortedItems = useMemo(() => {
    const lc = filter.toLowerCase();
    const filtered = variance?.items.filter((item) =>
      item.itemName.toLowerCase().includes(lc) ||
      (item.itemType ?? "").toLowerCase().includes(lc)
    );
    if (!filtered) return [];
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        const cmp = aVal.toLowerCase().localeCompare(bVal.toLowerCase());
        return sortDir === "asc" ? cmp : -cmp;
      }
      const aNum = (aVal as number) ?? 0;
      const bNum = (bVal as number) ?? 0;
      return sortDir === "asc" ? aNum - bNum : bNum - aNum;
    });
  }, [variance, filter, sortKey, sortDir]);

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
      <h1 className="mb-6 text-2xl font-bold text-[#EAF0FF]">Reports</h1>

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

      {/* On-hand summary */}
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

      {/* Variance report */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Variance Report — ${(variance?.totalVarianceValue ?? 0).toFixed(2)} impact
        </h2>

        <input
          type="text"
          placeholder="Search items... (e.g. wine, Captain Morgan)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="mb-4 w-full max-w-sm rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
        />

        <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
              <tr>
                <SortHeader label="Item" field="itemName" />
                <SortHeader label="Type" field="itemType" />
                <th className="px-4 py-3">Theoretical</th>
                <th className="px-4 py-3">Actual</th>
                <SortHeader label="Variance" field="variance" />
                <SortHeader label="%" field="variancePercent" />
                <SortHeader label="Value Impact" field="valueImpact" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedItems.map((item) => (
                <tr key={item.inventoryItemId} className="hover:bg-[#16283F]/60">
                  <td className="px-4 py-3 font-medium">{item.itemName}</td>
                  <td className="px-4 py-3">{(item as any).itemType?.replace("_", " ") ?? "—"}</td>
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
              {sortedItems.length === 0 && (
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
    </div>
  );
}
