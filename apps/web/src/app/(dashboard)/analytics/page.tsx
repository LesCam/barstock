"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "@/components/location-context";
import { PageTip } from "@/components/page-tip";
import { HelpLink } from "@/components/help-link";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";

function RiskBadge({ score }: { score: number }) {
  const color =
    score >= 70
      ? "bg-red-500/20 text-red-400"
      : score >= 40
        ? "bg-yellow-500/20 text-yellow-400"
        : "bg-green-500/20 text-green-400";
  const label = score >= 70 ? "High" : score >= 40 ? "Medium" : "Low";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {label} ({score})
    </span>
  );
}

function SeverityDot({ severity }: { severity: "critical" | "warning" | "info" }) {
  const color =
    severity === "critical"
      ? "bg-red-500"
      : severity === "warning"
        ? "bg-yellow-500"
        : "bg-blue-500";
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

function TrendArrow({ trend }: { trend: "worsening" | "improving" | "stable" }) {
  if (trend === "worsening") return <span className="text-red-400">↓</span>;
  if (trend === "improving") return <span className="text-green-400">↑</span>;
  return <span className="text-[#EAF0FF]/40">→</span>;
}

export default function AnalyticsPage() {
  const { selectedLocationId } = useLocation();
  const [expandedAnomalyId, setExpandedAnomalyId] = useState<string | null>(null);

  const { data: summary, isLoading: loadingSummary } =
    trpc.reports.analyticsSummary.useQuery(
      { locationId: selectedLocationId! },
      { enabled: !!selectedLocationId }
    );

  const { data: anomalies, isLoading: loadingAnomalies } =
    trpc.reports.usageAnomalies.useQuery(
      { locationId: selectedLocationId! },
      { enabled: !!selectedLocationId }
    );

  const { data: ratios, isLoading: loadingRatios } =
    trpc.reports.posDepletionRatios.useQuery(
      { locationId: selectedLocationId! },
      { enabled: !!selectedLocationId }
    );

  const { data: forecasts, isLoading: loadingForecasts } =
    trpc.reports.varianceForecasts.useQuery(
      { locationId: selectedLocationId! },
      { enabled: !!selectedLocationId }
    );

  if (!selectedLocationId) {
    return (
      <div className="flex h-64 items-center justify-center text-[#EAF0FF]/40">
        Select a location to view analytics.
      </div>
    );
  }

  const isLoading =
    loadingSummary || loadingAnomalies || loadingRatios || loadingForecasts;

  // Scatter chart data for POS-to-depletion
  const scatterData = (ratios ?? [])
    .filter((r) => r.posDepletion > 0)
    .map((r) => ({
      x: r.posDepletion,
      y: r.actualDepletion,
      name: r.itemName,
      ratio: r.ratio,
      flag: r.flag,
    }));

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Predictive Analytics</h1>
        <HelpLink section="analytics" tooltip="Learn about analytics" />
      </div>

      <PageTip
        tipId="analytics"
        title="Predictive Insights"
        description="Spot anomalies and risk patterns. Items scored by severity and trend."
      />

      {/* Section A: Risk Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          label="Anomalies This Week"
          value={summary?.anomalyCount ?? "—"}
          loading={loadingSummary}
          color={
            (summary?.anomalyCount ?? 0) > 3
              ? "red"
              : (summary?.anomalyCount ?? 0) > 0
                ? "yellow"
                : "green"
          }
        />
        <KPICard
          label="Depletion Mismatches"
          value={summary?.depletionMismatchCount ?? "—"}
          loading={loadingSummary}
          color={
            (summary?.depletionMismatchCount ?? 0) > 2
              ? "red"
              : (summary?.depletionMismatchCount ?? 0) > 0
                ? "yellow"
                : "green"
          }
        />
        <KPICard
          label="Variance Forecast Risk"
          value={summary?.varianceForecastRiskCount ?? "—"}
          loading={loadingSummary}
          color={
            (summary?.varianceForecastRiskCount ?? 0) > 3
              ? "red"
              : (summary?.varianceForecastRiskCount ?? 0) > 0
                ? "yellow"
                : "green"
          }
        />
        <div className="rounded-lg border border-white/10 bg-[#0B1623] p-4">
          <p className="text-xs uppercase tracking-wide text-[#EAF0FF]/50">
            Overall Risk Score
          </p>
          {loadingSummary ? (
            <div className="mt-2 h-8 w-16 animate-pulse rounded bg-white/5" />
          ) : (
            <div className="mt-2 flex items-center gap-3">
              <span className="text-2xl font-bold text-[var(--text-primary)]">
                {summary?.overallRiskScore ?? 0}
              </span>
              {summary && <RiskBadge score={summary.overallRiskScore} />}
            </div>
          )}
        </div>
      </div>

      {/* Section B: Anomaly Feed */}
      <div className="rounded-lg border border-white/10 bg-[#0B1623] p-4">
        <h2 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">
          Anomaly Feed
        </h2>
        {loadingAnomalies || loadingSummary ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-white/5" />
            ))}
          </div>
        ) : (summary?.topConcerns?.length ?? 0) === 0 &&
          (anomalies?.length ?? 0) === 0 ? (
          <p className="text-sm text-[#EAF0FF]/40">
            No anomalies detected. All items within normal ranges.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase text-[#EAF0FF]/50">
                  <th className="pb-2 pr-4" />
                  <th className="pb-2 pr-4">Item</th>
                  <th className="pb-2 pr-4">Category</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Severity</th>
                  <th className="pb-2">Detail</th>
                </tr>
              </thead>
              <tbody>
                {(anomalies ?? []).map((a) => (
                  <>
                    <tr
                      key={a.inventoryItemId}
                      className={`border-b border-white/5 cursor-pointer hover:bg-white/5 ${
                        Math.abs(a.zScore) > 3
                          ? "bg-red-500/5"
                          : "bg-yellow-500/5"
                      }`}
                      onClick={() =>
                        setExpandedAnomalyId(
                          expandedAnomalyId === a.inventoryItemId
                            ? null
                            : a.inventoryItemId
                        )
                      }
                    >
                      <td className="py-2 pr-2">
                        <SeverityDot
                          severity={
                            Math.abs(a.zScore) > 3 ? "critical" : "warning"
                          }
                        />
                      </td>
                      <td className="py-2 pr-4 font-medium text-[var(--text-primary)]">
                        {a.itemName}
                      </td>
                      <td className="py-2 pr-4 text-[#EAF0FF]/60">
                        {a.categoryName ?? "—"}
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs ${
                            a.type === "usage_spike"
                              ? "bg-red-500/20 text-red-400"
                              : "bg-blue-500/20 text-blue-400"
                          }`}
                        >
                          {a.type === "usage_spike" ? "Spike" : "Drop"}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <span className="font-mono text-xs">
                          z={a.zScore.toFixed(1)}
                        </span>
                      </td>
                      <td className="py-2 text-[#EAF0FF]/60">
                        {a.currentWeekUsage.toFixed(0)} this week vs{" "}
                        {a.rollingMean.toFixed(0)} avg
                      </td>
                    </tr>
                    {expandedAnomalyId === a.inventoryItemId &&
                      a.dowAnomalies.length > 0 && (
                        <tr key={`${a.inventoryItemId}-detail`}>
                          <td colSpan={6} className="bg-white/5 px-6 py-3">
                            <p className="mb-1 text-xs font-medium text-[#EAF0FF]/50">
                              Day-of-week anomalies:
                            </p>
                            <div className="flex gap-3 text-xs">
                              {a.dowAnomalies.map((d) => (
                                <span
                                  key={d.dayOfWeek}
                                  className="rounded bg-red-500/10 px-2 py-1 text-red-400"
                                >
                                  {d.dayOfWeek}: {d.usage.toFixed(0)} (
                                  {d.ratio.toFixed(1)}x avg)
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section C: Variance Forecast */}
      <div className="rounded-lg border border-white/10 bg-[#0B1623] p-4">
        <h2 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">
          Variance Forecast
        </h2>
        {loadingForecasts ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-white/5" />
            ))}
          </div>
        ) : !forecasts || forecasts.length === 0 ? (
          <p className="text-sm text-[#EAF0FF]/40">
            Not enough session data for variance forecasting (need 3+ sessions).
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase text-[#EAF0FF]/50">
                  <th className="pb-2 pr-4">Item</th>
                  <th className="pb-2 pr-4">Sessions</th>
                  <th className="pb-2 pr-4">Predicted Variance</th>
                  <th className="pb-2 pr-4">Confidence Band</th>
                  <th className="pb-2">Trend</th>
                </tr>
              </thead>
              <tbody>
                {forecasts.map((f) => (
                  <tr
                    key={f.inventoryItemId}
                    className={`border-b border-white/5 ${
                      f.predictedVariance < -15
                        ? "bg-red-500/5"
                        : f.predictedVariance < -5
                          ? "bg-yellow-500/5"
                          : ""
                    }`}
                  >
                    <td className="py-2 pr-4 font-medium text-[var(--text-primary)]">
                      {f.itemName}
                      {f.categoryName && (
                        <span className="ml-2 text-xs text-[#EAF0FF]/40">
                          {f.categoryName}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-[#EAF0FF]/60">
                      {f.sessionsWithData}
                    </td>
                    <td
                      className={`py-2 pr-4 font-mono ${
                        f.predictedVariance < -5
                          ? "text-red-400"
                          : f.predictedVariance > 5
                            ? "text-green-400"
                            : "text-[#EAF0FF]/60"
                      }`}
                    >
                      {f.predictedVariance.toFixed(1)}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-[#EAF0FF]/40">
                      {f.confidenceLow.toFixed(1)} to {f.confidenceHigh.toFixed(1)}
                    </td>
                    <td className="py-2">
                      <TrendArrow trend={f.trend} />
                      <span className="ml-1 text-xs text-[#EAF0FF]/40">
                        {f.trend}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section D: POS-to-Depletion Analysis */}
      <div className="rounded-lg border border-white/10 bg-[#0B1623] p-4">
        <h2 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">
          POS vs Actual Depletion
        </h2>
        <p className="mb-4 text-xs text-[#EAF0FF]/40">
          Items above the diagonal line have unexplained loss. Items below may
          have mapping errors.
        </p>
        {loadingRatios ? (
          <div className="h-64 animate-pulse rounded bg-white/5" />
        ) : scatterData.length === 0 ? (
          <p className="text-sm text-[#EAF0FF]/40">
            No POS depletion data available for the last 14 days.
          </p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={360}>
              <ScatterChart margin={{ top: 10, right: 20, bottom: 40, left: 20 }}>
                <XAxis
                  dataKey="x"
                  type="number"
                  name="POS Depletion"
                  tick={{ fill: "#EAF0FF80", fontSize: 11 }}
                  label={{
                    value: "POS-Reported Depletion",
                    position: "bottom",
                    offset: 20,
                    fill: "#EAF0FF80",
                    fontSize: 12,
                  }}
                />
                <YAxis
                  dataKey="y"
                  type="number"
                  name="Actual Depletion"
                  tick={{ fill: "#EAF0FF80", fontSize: 11 }}
                  label={{
                    value: "Actual Depletion",
                    angle: -90,
                    position: "insideLeft",
                    fill: "#EAF0FF80",
                    fontSize: 12,
                  }}
                />
                <Tooltip
                  content={({ payload }) => {
                    if (!payload || payload.length === 0) return null;
                    const d = payload[0]?.payload as (typeof scatterData)[0];
                    if (!d) return null;
                    return (
                      <div className="rounded border border-white/20 bg-[#0B1623] p-2 text-xs">
                        <p className="font-medium text-[var(--text-primary)]">
                          {d.name}
                        </p>
                        <p className="text-[#EAF0FF]/60">
                          POS: {d.x.toFixed(1)} | Actual: {d.y.toFixed(1)}
                        </p>
                        <p className="text-[#EAF0FF]/60">
                          Ratio: {d.ratio.toFixed(2)}x
                        </p>
                        {d.flag && (
                          <p
                            className={
                              d.flag === "potential_theft_waste"
                                ? "text-red-400"
                                : "text-yellow-400"
                            }
                          >
                            {d.flag === "potential_theft_waste"
                              ? "Potential theft/waste"
                              : "Potential mapping error"}
                          </p>
                        )}
                      </div>
                    );
                  }}
                />
                <ReferenceLine
                  segment={[
                    { x: 0, y: 0 },
                    {
                      x: Math.max(...scatterData.map((d) => d.x)),
                      y: Math.max(...scatterData.map((d) => d.x)),
                    },
                  ]}
                  stroke="#EAF0FF30"
                  strokeDasharray="4 4"
                />
                <Scatter data={scatterData}>
                  {scatterData.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={
                        entry.flag === "potential_theft_waste"
                          ? "#ef4444"
                          : entry.flag === "potential_mapping_error"
                            ? "#eab308"
                            : "#3b82f6"
                      }
                      opacity={0.8}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>

            {/* Flagged items table below chart */}
            {ratios && ratios.filter((r) => r.flag !== null).length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs uppercase text-[#EAF0FF]/50">
                      <th className="pb-2 pr-4">Item</th>
                      <th className="pb-2 pr-4">POS Depletion</th>
                      <th className="pb-2 pr-4">Actual Depletion</th>
                      <th className="pb-2 pr-4">Ratio</th>
                      <th className="pb-2">Flag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ratios
                      .filter((r) => r.flag !== null)
                      .map((r) => (
                        <tr
                          key={r.inventoryItemId}
                          className={`border-b border-white/5 ${
                            r.flag === "potential_theft_waste"
                              ? "bg-red-500/5"
                              : "bg-yellow-500/5"
                          }`}
                        >
                          <td className="py-2 pr-4 font-medium text-[var(--text-primary)]">
                            {r.itemName}
                          </td>
                          <td className="py-2 pr-4 font-mono text-[#EAF0FF]/60">
                            {r.posDepletion.toFixed(1)}
                          </td>
                          <td className="py-2 pr-4 font-mono text-[#EAF0FF]/60">
                            {r.actualDepletion.toFixed(1)}
                          </td>
                          <td
                            className={`py-2 pr-4 font-mono ${
                              r.flag === "potential_theft_waste"
                                ? "text-red-400"
                                : "text-yellow-400"
                            }`}
                          >
                            {r.ratio.toFixed(2)}x
                          </td>
                          <td className="py-2">
                            <span
                              className={`rounded px-1.5 py-0.5 text-xs ${
                                r.flag === "potential_theft_waste"
                                  ? "bg-red-500/20 text-red-400"
                                  : "bg-yellow-500/20 text-yellow-400"
                              }`}
                            >
                              {r.flag === "potential_theft_waste"
                                ? "Theft/Waste"
                                : "Mapping Error"}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function KPICard({
  label,
  value,
  loading,
  color,
}: {
  label: string;
  value: string | number;
  loading: boolean;
  color: "red" | "yellow" | "green";
}) {
  const colorClass =
    color === "red"
      ? "text-red-400"
      : color === "yellow"
        ? "text-yellow-400"
        : "text-green-400";

  return (
    <div className="rounded-lg border border-white/10 bg-[#0B1623] p-4">
      <p className="text-xs uppercase tracking-wide text-[#EAF0FF]/50">
        {label}
      </p>
      {loading ? (
        <div className="mt-2 h-8 w-16 animate-pulse rounded bg-white/5" />
      ) : (
        <p className={`mt-2 text-2xl font-bold ${colorClass}`}>{value}</p>
      )}
    </div>
  );
}
