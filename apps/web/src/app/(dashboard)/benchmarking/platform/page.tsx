"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import Link from "next/link";

type SortKey =
  | "businessName"
  | "locationCount"
  | "onHandValue"
  | "cogs7d"
  | "varianceImpact"
  | "pourCostPct"
  | "activeItemCount"
  | "mappingCoveragePct";

export default function PlatformBenchmarksPage() {
  const { data: session } = useSession();
  const user = session?.user as any;

  if (user?.highestRole !== "platform_admin") {
    return (
      <div className="text-[#EAF0FF]/60">
        Platform admin access required.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#EAF0FF]">Platform Benchmarks</h1>
          <p className="mt-1 text-sm text-[#EAF0FF]/50">
            Cross-business comparison — full named data for platform operator
          </p>
        </div>
        <Link
          href="/benchmarking"
          className="rounded-md bg-white/10 px-3 py-1.5 text-sm text-[#EAF0FF] hover:bg-white/15"
        >
          Back to Benchmarking
        </Link>
      </div>

      <PlatformTable />
    </div>
  );
}

function PlatformTable() {
  const { data, isLoading } = trpc.reports.platformBenchmarks.useQuery(
    {},
    { staleTime: 5 * 60_000 }
  );

  const [sortKey, setSortKey] = useState<SortKey>("onHandValue");
  const [sortAsc, setSortAsc] = useState(false);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === "businessName");
    }
  }

  const sorted = useMemo(() => {
    if (!data?.businesses) return [];
    return [...data.businesses].sort((a, b) => {
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
  }, [data?.businesses, sortKey, sortAsc]);

  const sortArrow = (key: SortKey) =>
    sortKey === key ? (sortAsc ? " \u25B2" : " \u25BC") : "";

  if (isLoading) {
    return (
      <div className="h-64 animate-pulse rounded-lg border border-white/10 bg-[#16283F]" />
    );
  }

  if (!data || data.businesses.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-[#16283F] p-6 text-center text-[#EAF0FF]/50">
        No benchmark snapshots found. Trigger a capture first.
      </div>
    );
  }

  const fmt = (v: number | null) =>
    v != null
      ? "$" + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "--";
  const pct = (v: number | null) => (v != null ? v.toFixed(1) + "%" : "--");

  return (
    <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
      <div className="border-b border-white/10 px-6 py-4">
        <p className="text-xs text-[#EAF0FF]/40">
          Snapshot date: {data.snapshotDate} &middot; {data.businesses.length} business{data.businesses.length !== 1 ? "es" : ""}
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left text-xs font-medium uppercase tracking-wide text-[#EAF0FF]/50">
            {(
              [
                ["businessName", "Business"],
                ["locationCount", "# Locations"],
                ["onHandValue", "Total On-Hand"],
                ["cogs7d", "COGS (7d)"],
                ["varianceImpact", "Variance"],
                ["pourCostPct", "Pour Cost %"],
                ["mappingCoveragePct", "Mapping %"],
                ["activeItemCount", "Active Items"],
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
            <th className="px-4 py-3">Opted In</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {sorted.map((biz) => (
            <tr key={biz.businessId} className="hover:bg-[#1a3050]">
              <td className="px-4 py-3 font-medium text-[#EAF0FF]">
                {biz.businessName}
              </td>
              <td className="px-4 py-3 text-[#EAF0FF]">{biz.locationCount}</td>
              <td className="px-4 py-3 text-[#EAF0FF]">{fmt(biz.onHandValue)}</td>
              <td className="px-4 py-3 text-[#EAF0FF]">{fmt(biz.cogs7d)}</td>
              <td className={`px-4 py-3 ${(biz.varianceImpact ?? 0) < 0 ? "text-red-400" : "text-[#EAF0FF]"}`}>
                {fmt(biz.varianceImpact != null ? Math.abs(biz.varianceImpact) : null)}
                {(biz.varianceImpact ?? 0) < 0 ? " loss" : ""}
              </td>
              <td className={`px-4 py-3 ${(biz.pourCostPct ?? 0) > 25 ? "text-amber-400" : "text-[#EAF0FF]"}`}>
                {pct(biz.pourCostPct)}
              </td>
              <td className={`px-4 py-3 ${(biz.mappingCoveragePct ?? 0) < 70 ? "text-red-400" : (biz.mappingCoveragePct ?? 0) >= 90 ? "text-green-400" : "text-[#EAF0FF]"}`}>
                {pct(biz.mappingCoveragePct)}
              </td>
              <td className="px-4 py-3 text-[#EAF0FF]">{biz.activeItemCount}</td>
              <td className="px-4 py-3">
                {biz.optedIn ? (
                  <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-400">
                    Yes
                  </span>
                ) : (
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-[#EAF0FF]/40">
                    No
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
