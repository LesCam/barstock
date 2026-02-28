"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "@/components/location-context";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  ScatterChart, Scatter, ZAxis, ReferenceLine,
  LineChart, Line,
} from "recharts";
import { HelpLink } from "@/components/help-link";

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
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Staff Scorecards</h1>
          <HelpLink section="sessions" tooltip="Learn about counting sessions" />
        </div>
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

  const scatterData = useMemo(() => {
    if (!staff.length || !accountability?.sessions) return [];
    return staff.map((s) => {
      const userSessions = accountability.sessions.filter(
        (sess: any) => sess.participants?.some((p: any) => p.userId === s.userId)
      );
      const validSessions = userSessions.filter((sess: any) => sess.itemsPerHour > 0);
      const avgSpeed = validSessions.length > 0
        ? validSessions.reduce((sum: number, sess: any) => sum + sess.itemsPerHour, 0) / validSessions.length
        : 0;
      return {
        name: s.displayName,
        x: Number(avgSpeed.toFixed(1)),
        y: Number(s.accuracyRate.toFixed(1)),
        z: s.sessionsCounted,
        color: s.accuracyRate >= 95 ? "#4CAF50" : s.accuracyRate >= 85 ? "#E9B44C" : "#EF4444",
      };
    }).filter((d) => d.x > 0);
  }, [staff, accountability]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Staff Scorecards</h1>
          <HelpLink section="sessions" tooltip="Learn about counting sessions" />
        </div>
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

      {/* Speed vs Quality Scatter Chart */}
      {scatterData.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Speed vs Quality</h2>
          <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
            <ResponsiveContainer width="100%" height={320}>
              <ScatterChart margin={{ top: 10, right: 20, bottom: 40, left: 20 }}>
                <XAxis
                  dataKey="x"
                  type="number"
                  name="Items/Hr"
                  tick={{ fill: "#EAF0FF80", fontSize: 11 }}
                  label={{ value: "Avg Items/Hr", position: "bottom", offset: 20, fill: "#EAF0FF80", fontSize: 12 }}
                />
                <YAxis
                  dataKey="y"
                  type="number"
                  name="Accuracy %"
                  domain={[Math.min(70, ...scatterData.map((d) => d.y)) - 5, 100]}
                  tick={{ fill: "#EAF0FF80", fontSize: 11 }}
                  tickFormatter={(v) => `${v}%`}
                  label={{ value: "Accuracy %", angle: -90, position: "insideLeft", fill: "#EAF0FF80", fontSize: 12 }}
                />
                <ZAxis dataKey="z" range={[60, 300]} name="Sessions" />
                <Tooltip
                  content={({ payload }) => {
                    if (!payload || payload.length === 0) return null;
                    const d = payload[0]?.payload as (typeof scatterData)[0];
                    if (!d) return null;
                    return (
                      <div className="rounded border border-white/20 bg-[#0B1623] p-2 text-xs">
                        <p className="font-medium text-[#EAF0FF]">{d.name}</p>
                        <p className="text-[#EAF0FF]/60">Speed: {d.x} items/hr</p>
                        <p className="text-[#EAF0FF]/60">Accuracy: {d.y}%</p>
                        <p className="text-[#EAF0FF]/60">Sessions: {d.z}</p>
                      </div>
                    );
                  }}
                />
                <ReferenceLine y={95} stroke="#4CAF50" strokeDasharray="4 4" opacity={0.6} />
                {avgItemsPerHour > 0 && (
                  <ReferenceLine x={Number(avgItemsPerHour.toFixed(1))} stroke="#EAF0FF40" strokeDasharray="4 4" />
                )}
                <Scatter data={scatterData}>
                  {scatterData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} opacity={0.85} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            <div className="mt-2 flex items-center justify-center gap-4 text-xs text-[#EAF0FF]/50">
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#4CAF50]" /> ≥95%</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#E9B44C]" /> 85–95%</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#EF4444]" /> &lt;85%</span>
              <span className="text-[#EAF0FF]/30">|</span>
              <span>Bubble size = session count</span>
            </div>
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

          {/* Variance Rate Over Time */}
          {accountability?.sessions && (() => {
            const trendSessions = accountability.sessions
              .filter((s: any) => s.participants?.some((p: any) => p.userId === expandedUserId))
              .sort((a: any, b: any) => new Date(a.startedTs).getTime() - new Date(b.startedTs).getTime())
              .map((s: any) => ({
                date: new Date(s.startedTs).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                varianceRate: Number((s.varianceRate ?? 0).toFixed(1)),
              }));
            return trendSessions.length >= 2 ? (
              <div>
                <h4 className="mb-3 text-sm font-semibold text-[#EAF0FF]/80">Variance Rate Over Time</h4>
                <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={trendSessions} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                      <defs>
                        <linearGradient id="greenZone" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#4CAF50" stopOpacity={0.1} />
                          <stop offset="100%" stopColor="#4CAF50" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={{ fill: "#EAF0FF80", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis
                        tick={{ fill: "#EAF0FF80", fontSize: 11 }}
                        tickFormatter={(v) => `${v}%`}
                        axisLine={false}
                        tickLine={false}
                        domain={[0, (dataMax: number) => Math.max(25, Math.ceil(dataMax * 1.2))]}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#0B1623", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#EAF0FF" }}
                        formatter={(value) => [`${value}%`, "Variance Rate"]}
                      />
                      <ReferenceLine y={10} stroke="#4CAF50" strokeDasharray="3 3" opacity={0.5} />
                      <ReferenceLine y={20} stroke="#EF4444" strokeDasharray="3 3" opacity={0.5} />
                      <Line
                        type="monotone"
                        dataKey="varianceRate"
                        stroke="#E9B44C"
                        strokeWidth={2}
                        dot={{ fill: "#E9B44C", r: 4 }}
                        activeDot={{ r: 6, fill: "#E9B44C" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="mt-2 flex items-center justify-center gap-4 text-xs text-[#EAF0FF]/50">
                    <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-[#4CAF50]" /> Good (&lt;10%)</span>
                    <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-[#EF4444]" /> High (&gt;20%)</span>
                  </div>
                </div>
              </div>
            ) : null;
          })()}

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
