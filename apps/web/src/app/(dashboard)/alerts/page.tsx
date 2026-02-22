"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const RULE_LABELS: Record<string, string> = {
  variancePercent: "Variance",
  lowStock: "Low Stock",
  staleCountDays: "Stale Count",
  kegNearEmpty: "Keg Empty",
  loginFailures: "Login Failures",
  largeAdjustment: "Large Adjustment",
  shrinkagePattern: "Shrinkage",
  parReorderAlert: "Par Reorder",
};

const RULE_COLORS: Record<string, string> = {
  variancePercent: "#FBBF24",
  lowStock: "#F59E0B",
  staleCountDays: "#A78BFA",
  kegNearEmpty: "#60A5FA",
  loginFailures: "#F87171",
  largeAdjustment: "#EF4444",
  shrinkagePattern: "#FB923C",
  parReorderAlert: "#34D399",
};

function formatTimeAgo(dateStr: string | undefined): string {
  if (!dateStr) return "Never";
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (secs < 60) return "Just now";
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400)
    return `${Math.floor(secs / 3600)} hour${Math.floor(secs / 3600) === 1 ? "" : "s"} ago`;
  return `${Math.floor(secs / 86400)} day${Math.floor(secs / 86400) === 1 ? "" : "s"} ago`;
}

export default function AlertsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const businessId: string | undefined = user?.businessId;

  const [ruleFilter, setRuleFilter] = useState<string>("");
  const [weeksBack, setWeeksBack] = useState(4);

  const { data: settings } = trpc.settings.get.useQuery(
    { businessId: businessId! },
    { enabled: !!businessId }
  );

  const { data: history, isLoading: historyLoading } =
    trpc.notifications.alertHistory.useQuery(
      {
        businessId: businessId!,
        ruleType: ruleFilter || undefined,
        limit: 50,
      },
      { enabled: !!businessId }
    );

  const { data: frequency } = trpc.notifications.alertFrequency.useQuery(
    { businessId: businessId!, weeksBack },
    { enabled: !!businessId }
  );

  const { data: topItems } = trpc.notifications.alertTopItems.useQuery(
    { businessId: businessId! },
    { enabled: !!businessId }
  );

  // Summary stats
  const alertRules = (settings as any)?.alertRules as
    | Record<string, { enabled: boolean; threshold: number }>
    | undefined;
  const lastEvaluation = (settings as any)?.lastAlertEvaluation as string | undefined;
  const activeRulesCount = alertRules
    ? Object.values(alertRules).filter((r) => r.enabled).length
    : 0;

  const totalAlerts7d = useMemo(() => {
    if (!history) return 0;
    const cutoff = new Date(Date.now() - 7 * 86400000);
    return history.filter((a) => new Date(a.createdAt) >= cutoff).length;
  }, [history]);

  const mostTriggeredRule = useMemo(() => {
    if (!history || history.length === 0) return "—";
    const counts: Record<string, number> = {};
    for (const a of history) {
      counts[a.rule] = (counts[a.rule] || 0) + 1;
    }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return top ? RULE_LABELS[top[0]] || top[0] : "—";
  }, [history]);

  // Transform frequency data for stacked bar chart
  const chartData = useMemo(() => {
    if (!frequency || frequency.length === 0) return [];
    const byDay: Record<string, Record<string, number>> = {};
    for (const row of frequency) {
      const dayKey = new Date(row.day).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      if (!byDay[dayKey]) byDay[dayKey] = {};
      byDay[dayKey][row.rule] = row.count;
    }
    return Object.entries(byDay).map(([label, rules]) => ({ label, ...rules }));
  }, [frequency]);

  const ruleKeys = useMemo(() => {
    if (!frequency) return [];
    return [...new Set(frequency.map((r) => r.rule))];
  }, [frequency]);

  if (!businessId) {
    return (
      <div className="p-8 text-[#EAF0FF]/60">
        No business context available.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#EAF0FF]">Alert Dashboard</h1>
        <Link
          href="/settings"
          className="rounded-md bg-[#16283F] px-4 py-2 text-sm text-[#E9B44C] hover:bg-[#1a3050]"
        >
          Configure Thresholds
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-xs font-medium uppercase text-[#EAF0FF]/50">
            Alerts (7d)
          </p>
          <p className="mt-1 text-2xl font-bold text-[#EAF0FF]">
            {totalAlerts7d}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-xs font-medium uppercase text-[#EAF0FF]/50">
            Active Rules
          </p>
          <p className="mt-1 text-2xl font-bold text-[#EAF0FF]">
            {activeRulesCount}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-xs font-medium uppercase text-[#EAF0FF]/50">
            Most Triggered
          </p>
          <p className="mt-1 text-2xl font-bold text-[#E9B44C]">
            {mostTriggeredRule}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-xs font-medium uppercase text-[#EAF0FF]/50">
            Last Evaluation
          </p>
          <p className="mt-1 text-2xl font-bold text-[#EAF0FF]">
            {formatTimeAgo(lastEvaluation)}
          </p>
        </div>
      </div>

      {/* Alert Frequency Chart */}
      <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#EAF0FF]">
            Alert Frequency
          </h2>
          <select
            value={weeksBack}
            onChange={(e) => setWeeksBack(Number(e.target.value))}
            className="rounded-md border border-white/10 bg-[#0B1623] px-2 py-1 text-xs text-[#EAF0FF]"
          >
            <option value={2}>2 weeks</option>
            <option value={4}>4 weeks</option>
            <option value={8}>8 weeks</option>
            <option value={12}>12 weeks</option>
          </select>
        </div>
        {chartData.length === 0 ? (
          <p className="py-12 text-center text-sm text-[#EAF0FF]/40">
            No alert data for this period
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData}>
              <XAxis
                dataKey="label"
                tick={{ fill: "#EAF0FF", fontSize: 11 }}
              />
              <YAxis
                tick={{ fill: "#EAF0FF99", fontSize: 11 }}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0B1623",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  fontSize: 12,
                }}
                labelStyle={{ color: "#EAF0FF" }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: "#EAF0FF99" }}
                formatter={(value: string) => RULE_LABELS[value] || value}
              />
              {ruleKeys.map((rule) => (
                <Bar
                  key={rule}
                  dataKey={rule}
                  stackId="alerts"
                  fill={RULE_COLORS[rule] || "#6B7280"}
                  name={rule}
                  radius={[2, 2, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Top Triggered Items */}
      {topItems && topItems.length > 0 && (
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <h2 className="mb-3 text-sm font-semibold text-[#EAF0FF]">
            Top Triggered Items
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-[#EAF0FF]/50">
                <th className="pb-2">Item</th>
                <th className="pb-2 text-right">Alert Count</th>
                <th className="pb-2 text-right">Rule Types</th>
              </tr>
            </thead>
            <tbody>
              {topItems.map((item, i) => (
                <tr
                  key={i}
                  className="border-b border-white/5 text-[#EAF0FF]"
                >
                  <td className="py-2">{item.itemName}</td>
                  <td className="py-2 text-right font-medium">
                    {item.alertCount}
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      {item.rules.map((rule) => (
                        <span
                          key={rule}
                          className="rounded-full px-2 py-0.5 text-[10px]"
                          style={{
                            backgroundColor:
                              (RULE_COLORS[rule] || "#6B7280") + "20",
                            color: RULE_COLORS[rule] || "#6B7280",
                          }}
                        >
                          {RULE_LABELS[rule] || rule}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Alert History */}
      <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#EAF0FF]">
            Alert History
          </h2>
          <select
            value={ruleFilter}
            onChange={(e) => setRuleFilter(e.target.value)}
            className="rounded-md border border-white/10 bg-[#0B1623] px-2 py-1 text-xs text-[#EAF0FF]"
          >
            <option value="">All Rules</option>
            {Object.entries(RULE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {historyLoading ? (
          <p className="py-8 text-center text-sm text-[#EAF0FF]/40">
            Loading...
          </p>
        ) : !history || history.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#EAF0FF]/40">
            No alerts found
          </p>
        ) : (
          <div className="space-y-2">
            {history.map((alert) => (
              <div
                key={alert.id}
                className={`flex items-start justify-between rounded-md border-l-4 bg-[#0B1623] px-4 py-3 ${
                  alert.isRead ? "opacity-60" : ""
                }`}
                style={{
                  borderLeftColor: RULE_COLORS[alert.rule] || "#6B7280",
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{
                        backgroundColor:
                          (RULE_COLORS[alert.rule] || "#6B7280") + "20",
                        color: RULE_COLORS[alert.rule] || "#6B7280",
                      }}
                    >
                      {RULE_LABELS[alert.rule] || alert.rule}
                    </span>
                    {!alert.isRead && (
                      <span className="h-1.5 w-1.5 rounded-full bg-[#E9B44C]" />
                    )}
                  </div>
                  <p className="mt-1 text-sm text-[#EAF0FF]">{alert.title}</p>
                  {alert.body && (
                    <p className="mt-0.5 text-xs text-[#EAF0FF]/50">
                      {alert.body}
                    </p>
                  )}
                </div>
                <span className="ml-4 shrink-0 text-xs text-[#EAF0FF]/30">
                  {new Date(alert.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
