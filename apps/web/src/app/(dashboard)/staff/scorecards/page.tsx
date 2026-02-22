"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "@/components/location-context";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";

const PIE_COLORS = ["#E9B44C", "#4CAF50", "#2196F3", "#FF5722", "#9C27B0", "#00BCD4", "#FF9800", "#607D8B"];

export default function StaffScorecardsPage() {
  const { selectedLocationId } = useLocation();
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  // Date range picker state
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));

  const fromDateObj = useMemo(() => new Date(fromDate + "T00:00:00"), [fromDate]);
  const toDateObj = useMemo(() => new Date(toDate + "T23:59:59"), [toDate]);

  const { data: accountability, isLoading } = trpc.reports.staffAccountability.useQuery(
    { locationId: selectedLocationId!, fromDate: fromDateObj, toDate: toDateObj },
    { enabled: !!selectedLocationId }
  );

  const { data: reasonBreakdown } = trpc.reports.staffVarianceReasonBreakdown.useQuery(
    { locationId: selectedLocationId!, userId: expandedUserId ?? undefined, fromDate: fromDateObj, toDate: toDateObj },
    { enabled: !!selectedLocationId && !!expandedUserId }
  );

  const { data: itemVariance } = trpc.reports.staffItemVariance.useQuery(
    { locationId: selectedLocationId!, userId: expandedUserId ?? undefined, limit: 10, fromDate: fromDateObj, toDate: toDateObj },
    { enabled: !!selectedLocationId && !!expandedUserId }
  );

  if (!selectedLocationId) {
    return (
      <div className="flex h-64 items-center justify-center text-[#EAF0FF]/40">
        Select a location to view staff scorecards.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Staff Scorecards</h1>
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border border-white/10 bg-[#16283F]" />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-lg border border-white/10 bg-[#16283F]" />
          ))}
        </div>
      </div>
    );
  }

  const staff = accountability?.staff ?? [];
  const summary = accountability?.summary;

  function accuracyColor(rate: number): string {
    if (rate >= 95) return "#4CAF50";
    if (rate >= 85) return "#E9B44C";
    return "#EF4444";
  }

  function trendArrow(trend: "improving" | "stable" | "worsening"): string {
    if (trend === "improving") return "\u2191";
    if (trend === "worsening") return "\u2193";
    return "\u2192";
  }

  function trendColor(trend: "improving" | "stable" | "worsening"): string {
    if (trend === "improving") return "text-green-400";
    if (trend === "worsening") return "text-red-400";
    return "text-[#EAF0FF]/60";
  }

  const expandedReasons = expandedUserId
    ? reasonBreakdown?.find((s) => s.userId === expandedUserId)
    : null;
  const expandedItems = expandedUserId
    ? itemVariance?.find((s) => s.userId === expandedUserId)
    : null;

  const avgItemsPerHour = useMemo(() => {
    if (!accountability?.sessions || accountability.sessions.length === 0) return 0;
    const validSessions = accountability.sessions.filter((s: any) => s.itemsPerHour > 0);
    if (validSessions.length === 0) return 0;
    return validSessions.reduce((sum: number, s: any) => sum + s.itemsPerHour, 0) / validSessions.length;
  }, [accountability]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Staff Scorecards</h1>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-1.5 text-sm text-[#EAF0FF]"
          />
          <span className="text-xs text-[#EAF0FF]/40">to</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-1.5 text-sm text-[#EAF0FF]"
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-5">
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-sm text-[#EAF0FF]/60">Total Staff</p>
          <p className="text-2xl font-bold">{staff.length}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-sm text-[#EAF0FF]/60">Team Avg Accuracy</p>
          <p className="text-2xl font-bold" style={{ color: accuracyColor(summary?.avgAccuracyRate ?? 0) }}>
            {(summary?.avgAccuracyRate ?? 0).toFixed(1)}%
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-sm text-[#EAF0FF]/60">Avg Manual Entry Rate</p>
          <p className="text-2xl font-bold">{(summary?.avgManualEntryRate ?? 0).toFixed(1)}%</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-sm text-[#EAF0FF]/60">Total Sessions</p>
          <p className="text-2xl font-bold">{summary?.totalSessions ?? 0}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-sm text-[#EAF0FF]/60">Avg Items/Hr</p>
          <p className="text-2xl font-bold">{avgItemsPerHour.toFixed(1)}</p>
        </div>
      </div>

      {/* Team Comparison Chart */}
      {staff.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Team Comparison</h2>
          <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
            <ResponsiveContainer width="100%" height={Math.max(200, staff.length * 48)}>
              <BarChart data={staff.map((s) => ({
                name: s.displayName.length > 20 ? s.displayName.slice(0, 18) + "..." : s.displayName,
                accuracy: Number(s.accuracyRate.toFixed(1)),
                fill: accuracyColor(s.accuracyRate),
              }))} layout="vertical">
                <XAxis type="number" domain={[0, 100]} tick={{ fill: "#EAF0FF99", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#EAF0FF", fontSize: 12 }} axisLine={false} tickLine={false} width={150} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0B1623", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#EAF0FF" }}
                  formatter={(value) => [`${value}%`, "Accuracy"]}
                />
                <Bar dataKey="accuracy" radius={[0, 4, 4, 0]}>
                  {staff.map((s, i) => (
                    <rect key={i} fill={accuracyColor(s.accuracyRate)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Individual Scorecard Cards */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Individual Scorecards</h2>
        {staff.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#EAF0FF]/40">No staff data available. Complete some counting sessions first.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {staff.map((s) => {
              const isExpanded = expandedUserId === s.userId;
              const color = accuracyColor(s.accuracyRate);
              const pct = Math.min(s.accuracyRate, 100);

              return (
                <div key={s.userId} className="flex flex-col">
                  <button
                    onClick={() => setExpandedUserId(isExpanded ? null : s.userId)}
                    className={`rounded-lg border p-4 text-left transition-colors ${
                      isExpanded
                        ? "border-[#E9B44C]/40 bg-[#16283F]"
                        : "border-white/10 bg-[#16283F] hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Accuracy Ring */}
                      <div className="relative h-16 w-16 flex-shrink-0">
                        <div
                          className="absolute inset-0 rounded-full"
                          style={{
                            background: `conic-gradient(${color} ${pct * 3.6}deg, rgba(255,255,255,0.1) ${pct * 3.6}deg)`,
                          }}
                        />
                        <div className="absolute inset-1.5 flex items-center justify-center rounded-full bg-[#16283F]">
                          <span className="text-sm font-bold" style={{ color }}>{Math.round(s.accuracyRate)}%</span>
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-sm font-semibold">{s.displayName}</h3>
                          <span className={`text-sm ${trendColor(s.trend)}`}>{trendArrow(s.trend)}</span>
                        </div>
                        <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-[#EAF0FF]/60">
                          <span>{s.sessionsCounted} sessions</span>
                          <span>{s.linesCounted} lines</span>
                          <span>Manual: {s.manualEntryRate.toFixed(0)}%</span>
                          <span>Avg var: {s.avgVarianceMagnitude.toFixed(1)}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Expanded Detail */}
      {expandedUserId && (
        <div className="space-y-6 rounded-lg border border-[#E9B44C]/20 bg-[#0B1623] p-6">
          <h3 className="text-lg font-semibold">
            Detail: {staff.find((s) => s.userId === expandedUserId)?.displayName}
          </h3>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Variance Reason Breakdown - Pie Chart */}
            <div>
              <h4 className="mb-3 text-sm font-semibold text-[#EAF0FF]/80">Variance Reason Breakdown</h4>
              <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
                {expandedReasons && expandedReasons.reasons.length > 0 ? (
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="50%" height={200}>
                      <PieChart>
                        <Pie
                          data={expandedReasons.reasons.map((r) => ({
                            name: r.label,
                            value: r.count,
                          }))}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={80}
                          dataKey="value"
                          label={false}
                        >
                          {expandedReasons.reasons.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ backgroundColor: "#0B1623", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#EAF0FF" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-1">
                      {expandedReasons.reasons.map((r, i) => (
                        <div key={r.label} className="flex items-center gap-2 text-xs">
                          <span
                            className="inline-block h-3 w-3 rounded-sm"
                            style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                          />
                          <span className="text-[#EAF0FF]/80">{r.label}</span>
                          <span className="text-[#EAF0FF]/40">({r.count})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="py-6 text-center text-sm text-[#EAF0FF]/40">No variance reason data.</p>
                )}
              </div>
            </div>

            {/* Problem Items */}
            <div>
              <h4 className="mb-3 text-sm font-semibold text-[#EAF0FF]/80">Problem Items (Top 10)</h4>
              <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
                {expandedItems && expandedItems.items.length > 0 ? (
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
                      <tr>
                        <th className="px-3 py-2">Item</th>
                        <th className="px-3 py-2">Category</th>
                        <th className="px-3 py-2">Sessions</th>
                        <th className="px-3 py-2">Total Var</th>
                        <th className="px-3 py-2">Avg Var</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {expandedItems.items.map((item) => (
                        <tr key={item.inventoryItemId} className="hover:bg-[#0B1623]/60">
                          <td className="px-3 py-2 font-medium">{item.itemName}</td>
                          <td className="px-3 py-2 text-[#EAF0FF]/60">{item.categoryName ?? "—"}</td>
                          <td className="px-3 py-2">{item.sessionsWithVariance}</td>
                          <td className="px-3 py-2">{item.totalVarianceMagnitude.toFixed(1)}</td>
                          <td className={`px-3 py-2 ${item.avgVariance < 0 ? "text-red-400" : "text-[#EAF0FF]"}`}>
                            {item.avgVariance.toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="py-6 text-center text-sm text-[#EAF0FF]/40">No item variance data.</p>
                )}
              </div>
            </div>
          </div>

          {/* Session History */}
          {accountability?.sessions && (
            <div>
              <h4 className="mb-3 text-sm font-semibold text-[#EAF0FF]/80">Session History</h4>
              <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
                {(() => {
                  const staffSessions = accountability.sessions.filter(
                    (s: any) => s.participants?.some((p: any) => p.userId === expandedUserId)
                  );
                  return staffSessions.length > 0 ? (
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
                        <tr>
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">Duration</th>
                          <th className="px-3 py-2">Items</th>
                          <th className="px-3 py-2">Items/Hr</th>
                          <th className="px-3 py-2">Variance Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {staffSessions.slice(0, 10).map((s: any) => (
                          <tr key={s.sessionId} className="hover:bg-[#0B1623]/60">
                            <td className="px-3 py-2">
                              {new Date(s.startedTs).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </td>
                            <td className="px-3 py-2">{s.durationMinutes}m</td>
                            <td className="px-3 py-2">{s.totalLines}</td>
                            <td className="px-3 py-2">{s.itemsPerHour?.toFixed(1) ?? "—"}</td>
                            <td className={`px-3 py-2 ${s.varianceRate > 20 ? "text-red-400" : s.varianceRate > 10 ? "text-amber-400" : ""}`}>
                              {s.varianceRate?.toFixed(1) ?? "—"}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="py-6 text-center text-sm text-[#EAF0FF]/40">No session history for this staff member.</p>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
