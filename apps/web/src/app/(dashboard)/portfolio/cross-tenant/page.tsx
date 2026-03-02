"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { HelpLink } from "@/components/help-link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

function fmt(v: number) {
  return "$" + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

export default function CrossTenantPage() {
  const { data: session } = useSession();
  const user = session?.user as any;

  if (user?.highestRole !== "platform_admin") {
    return (
      <div className="text-[#EAF0FF]/60">
        Platform admin access required to view cross-tenant analytics.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-[#EAF0FF]">Cross-Tenant Analytics</h1>
          <HelpLink section="cross-tenant" tooltip="Platform-wide analytics" />
        </div>
        <p className="mt-1 text-sm text-[#EAF0FF]/50">
          Compare performance across all businesses on the platform
        </p>
      </div>

      <BusinessComparisonTable />
      <PlatformTrendSection />
    </div>
  );
}

function BusinessComparisonTable() {
  const { data, isLoading } = trpc.reports.platformAnalyticsSummary.useQuery(
    {},
    { staleTime: 5 * 60_000 }
  );

  if (isLoading) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#16283F] p-6">
        <div className="h-6 w-48 animate-pulse rounded bg-white/10 mb-4" />
        <div className="h-64 animate-pulse rounded bg-white/5" />
      </div>
    );
  }

  if (!data || !data.businesses || data.businesses.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#16283F] p-6">
        <h2 className="text-lg font-semibold text-[#EAF0FF] mb-2">Business Comparison</h2>
        <p className="text-sm text-[#EAF0FF]/50">
          No benchmark data available. Ensure daily snapshot capture is running.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#16283F] p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[#EAF0FF]">Business Comparison</h2>
        {data.snapshotDate && (
          <span className="text-xs text-[#EAF0FF]/40">Snapshot: {data.snapshotDate}</span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="text-[#EAF0FF]/50 text-xs uppercase border-b border-white/10">
              <th className="py-2 pr-4">Business</th>
              <th className="py-2 pr-4 text-right">Locations</th>
              <th className="py-2 pr-4 text-right">On-Hand Value</th>
              <th className="py-2 pr-4 text-right">COGS (7d)</th>
              <th className="py-2 pr-4 text-right">Variance Impact</th>
              <th className="py-2 pr-4 text-right">Pour Cost %</th>
              <th className="py-2 pr-4 text-right">Risk</th>
              <th className="py-2 text-right">Health</th>
            </tr>
          </thead>
          <tbody>
            {data.businesses.map((biz) => (
              <tr key={biz.businessId} className="border-b border-white/5 text-[#EAF0FF]">
                <td className="py-2 pr-4 font-medium">{biz.businessName}</td>
                <td className="py-2 pr-4 text-right text-[#EAF0FF]/60">{biz.locationCount}</td>
                <td className="py-2 pr-4 text-right">{fmt(biz.onHandValue)}</td>
                <td className="py-2 pr-4 text-right text-[#E9B44C]">{fmt(biz.cogs7d)}</td>
                <td className={`py-2 pr-4 text-right ${biz.varianceImpact < 0 ? "text-red-400" : "text-green-400"}`}>
                  {fmt(biz.varianceImpact)}
                </td>
                <td className="py-2 pr-4 text-right text-[#EAF0FF]/60">
                  {biz.pourCostPct != null ? biz.pourCostPct.toFixed(1) + "%" : "--"}
                </td>
                <td className="py-2 pr-4 text-right">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    biz.riskLevel === "high" ? "bg-red-500/20 text-red-400" :
                    biz.riskLevel === "medium" ? "bg-yellow-500/20 text-yellow-400" :
                    "bg-green-500/20 text-green-400"
                  }`}>
                    {biz.riskScore}
                  </span>
                </td>
                <td className="py-2 text-right">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    biz.healthScore >= 70 ? "bg-green-500/20 text-green-400" :
                    biz.healthScore >= 40 ? "bg-yellow-500/20 text-yellow-400" :
                    "bg-red-500/20 text-red-400"
                  }`}>
                    {biz.healthScore}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PlatformTrendSection() {
  const [metric, setMetric] = useState<TrendMetricKey>("onHandValue");
  const { data, isLoading } = trpc.reports.platformTrend.useQuery(
    { weeks: 12 },
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
        <h2 className="text-lg font-semibold text-[#EAF0FF] mb-2">Platform Trend</h2>
        <p className="text-sm text-[#EAF0FF]/50">No trend data available yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#16283F] p-6">
      <h2 className="text-lg font-semibold text-[#EAF0FF] mb-4">Platform Trend (12 weeks)</h2>

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
            labelFormatter={(v: any) => {
              const d = data.find((p) => p.date === v);
              return `${new Date(v).toLocaleDateString()} (${d?.businessCount ?? 0} businesses)`;
            }}
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
