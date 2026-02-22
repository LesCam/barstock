"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

interface PortfolioOverviewProps {
  businessId: string;
  onSelectLocation: (id: string) => void;
}

type SortKey =
  | "locationName"
  | "onHandValue"
  | "cogs7d"
  | "varianceImpact"
  | "shrinkageSuspects"
  | "pourCostPct"
  | "mappingCoveragePct"
  | "reorderCount";

export function PortfolioOverview({ businessId, onSelectLocation }: PortfolioOverviewProps) {
  const sevenDaysAgo = useMemo(() => new Date(Date.now() - 7 * 86400000), []);
  const now = useMemo(() => new Date(), []);

  const { data, isLoading } = trpc.reports.portfolioRollup.useQuery(
    { businessId, fromDate: sevenDaysAgo, toDate: now },
    { staleTime: 5 * 60_000 }
  );

  const [sortKey, setSortKey] = useState<SortKey>("locationName");
  const [sortAsc, setSortAsc] = useState(true);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === "locationName");
    }
  }

  const sortedLocations = useMemo(() => {
    if (!data?.locations) return [];
    return [...data.locations].sort((a, b) => {
      let cmp = 0;
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        cmp = aVal.localeCompare(bVal);
      } else {
        cmp = ((aVal as number) ?? 0) - ((bVal as number) ?? 0);
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [data?.locations, sortKey, sortAsc]);

  const totals = data?.totals;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-lg border border-white/10 bg-[#16283F] p-4">
              <div className="h-4 w-24 animate-pulse rounded bg-white/10" />
              <div className="mt-3 h-8 w-20 animate-pulse rounded bg-white/10" />
            </div>
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-lg border border-white/10 bg-[#16283F]" />
      </div>
    );
  }

  if (!totals) return null;

  const fmt = (v: number) =>
    "$" + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (v: number | null) => (v != null ? v.toFixed(1) + "%" : "--");

  const sortArrow = (key: SortKey) =>
    sortKey === key ? (sortAsc ? " \u25B2" : " \u25BC") : "";

  return (
    <div className="space-y-6">
      {/* Summary KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[#EAF0FF]/50">
            Total On-Hand Value
          </p>
          <p className="mt-1 text-2xl font-bold text-[#EAF0FF]">{fmt(totals.totalOnHandValue)}</p>
          <p className="mt-0.5 text-xs text-[#EAF0FF]/40">
            {totals.totalLocations} location{totals.totalLocations !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[#EAF0FF]/50">
            Total COGS (7d)
          </p>
          <p className="mt-1 text-2xl font-bold text-[#E9B44C]">{fmt(totals.totalCogs)}</p>
        </div>

        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[#EAF0FF]/50">
            Total Variance Impact
          </p>
          <p
            className={`mt-1 text-2xl font-bold ${totals.totalVarianceImpact < 0 ? "text-red-400" : "text-[#EAF0FF]"}`}
          >
            {fmt(Math.abs(totals.totalVarianceImpact))}
            {totals.totalVarianceImpact < 0 && (
              <span className="ml-1 text-sm font-normal text-red-400">loss</span>
            )}
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[#EAF0FF]/50">
            Total Shrinkage Suspects
          </p>
          <p
            className={`mt-1 text-2xl font-bold ${totals.totalShrinkageSuspects > 0 ? "text-red-400" : "text-green-400"}`}
          >
            {totals.totalShrinkageSuspects}
          </p>
        </div>
      </div>

      {/* Location Comparison Table */}
      <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs font-medium uppercase tracking-wide text-[#EAF0FF]/50">
              {(
                [
                  ["locationName", "Location"],
                  ["onHandValue", "On-Hand Value"],
                  ["cogs7d", "COGS (7d)"],
                  ["varianceImpact", "Variance"],
                  ["shrinkageSuspects", "Shrinkage"],
                  ["pourCostPct", "Pour Cost %"],
                  ["mappingCoveragePct", "Mapping %"],
                  ["reorderCount", "Reorder"],
                ] as const
              ).map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => handleSort(key)}
                  className="cursor-pointer whitespace-nowrap px-4 py-3 hover:text-[#EAF0FF]/80"
                >
                  {label}
                  {sortArrow(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {sortedLocations.map((loc) => (
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
                <td
                  className={`px-4 py-3 ${loc.varianceImpact < 0 ? "text-red-400" : "text-[#EAF0FF]"}`}
                >
                  {fmt(Math.abs(loc.varianceImpact))}
                  {loc.varianceImpact < 0 ? " loss" : ""}
                </td>
                <td
                  className={`px-4 py-3 ${loc.shrinkageSuspects > 0 ? "text-red-400" : "text-[#EAF0FF]"}`}
                >
                  {loc.shrinkageSuspects}
                </td>
                <td
                  className={`px-4 py-3 ${
                    (loc.pourCostPct ?? 0) > 25
                      ? "text-amber-400"
                      : "text-[#EAF0FF]"
                  }`}
                >
                  {pct(loc.pourCostPct)}
                </td>
                <td
                  className={`px-4 py-3 ${
                    loc.mappingCoveragePct < 70
                      ? "text-red-400"
                      : loc.mappingCoveragePct >= 90
                        ? "text-green-400"
                        : "text-[#EAF0FF]"
                  }`}
                >
                  {loc.mappingCoveragePct}%
                </td>
                <td
                  className={`px-4 py-3 ${loc.reorderCount > 0 ? "text-red-400" : "text-[#EAF0FF]"}`}
                >
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
