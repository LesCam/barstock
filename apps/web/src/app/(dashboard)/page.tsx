"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

const TIMEZONES = [
  "America/Montreal",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Vancouver",
  "America/Toronto",
  "America/Halifax",
  "America/Edmonton",
  "America/Winnipeg",
  "Europe/London",
  "Europe/Paris",
  "Pacific/Honolulu",
  "America/Anchorage",
];

const ALERT_BORDER_COLORS: Record<string, string> = {
  shrinkagePattern: "border-red-500/60",
  largeAdjustment: "border-red-500/60",
  variancePercent: "border-yellow-500/60",
  lowStock: "border-yellow-500/60",
  staleCountDays: "border-yellow-500/60",
  kegNearEmpty: "border-blue-500/60",
  sessionAutoClosed: "border-purple-500/60",
  loginFailures: "border-red-500/60",
  parReorderAlert: "border-blue-500/60",
};

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function AlertBanner() {
  const { data, isLoading } = trpc.notifications.list.useQuery(
    { limit: 5 },
    { refetchInterval: 60_000 }
  );
  const { data: unreadData } = trpc.notifications.unreadCount.useQuery(
    undefined,
    { refetchInterval: 60_000 }
  );
  const markReadMutation = trpc.notifications.markRead.useMutation();
  const utils = trpc.useUtils();

  if (isLoading || !data) return null;

  const alertNotifications = data.items.filter((n) => {
    const meta = n.metadataJson as Record<string, unknown> | null;
    return meta && typeof meta.rule === "string" && !n.isRead;
  });

  const unreadCount = unreadData ?? 0;

  if (alertNotifications.length === 0 && unreadCount === 0) return null;

  function handleDismiss(id: string) {
    markReadMutation.mutate(
      { id },
      { onSuccess: () => utils.notifications.list.invalidate() }
    );
  }

  return (
    <div className="mb-6 space-y-2">
      {alertNotifications.map((n) => {
        const meta = n.metadataJson as Record<string, unknown>;
        const rule = meta.rule as string;
        const borderColor = ALERT_BORDER_COLORS[rule] ?? "border-white/20";

        return (
          <div
            key={n.id}
            className={`flex items-start gap-3 rounded-lg border-l-4 ${borderColor} bg-[#16283F] px-4 py-3`}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[#EAF0FF]">{n.title}</p>
              {n.body && (
                <p className="mt-0.5 text-xs text-[#EAF0FF]/60 line-clamp-2">
                  {n.body}
                </p>
              )}
              <p className="mt-1 text-xs text-[#EAF0FF]/40">
                {timeAgo(n.createdAt)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {n.linkUrl && (
                <Link
                  href={n.linkUrl}
                  className="text-xs font-medium text-[#E9B44C] hover:text-[#C8922E]"
                >
                  View
                </Link>
              )}
              <button
                onClick={() => handleDismiss(n.id)}
                className="text-xs text-[#EAF0FF]/40 hover:text-[#EAF0FF]/80"
              >
                Dismiss
              </button>
            </div>
          </div>
        );
      })}
      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-[#EAF0FF]/40">{unreadCount} unread</span>
        <Link href="/notifications" className="text-xs font-medium text-[#E9B44C]">
          View all notifications →
        </Link>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const businessId = user?.businessId;
  const highestRole = user?.highestRole;
  const canCreate = highestRole === "platform_admin" || highestRole === "business_admin";
  const isAdmin = canCreate;

  const [showForm, setShowForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("America/Montreal");
  const [closeoutHour, setCloseoutHour] = useState(4);

  const utils = trpc.useUtils();

  const { data: locations } = trpc.locations.listByBusiness.useQuery(
    { businessId: businessId!, activeOnly: !showArchived },
    { enabled: !!businessId }
  );

  const { data: allLocations } = trpc.locations.listByBusiness.useQuery(
    { businessId: businessId!, activeOnly: false },
    { enabled: !!businessId && isAdmin }
  );
  const archivedCount = allLocations ? allLocations.filter((l) => !l.active).length : 0;

  const createMutation = trpc.locations.create.useMutation({
    onSuccess: () => {
      utils.locations.listByBusiness.invalidate({ businessId });
      setShowForm(false);
      setName("");
      setTimezone("America/Montreal");
      setCloseoutHour(4);
    },
  });

  // --- KPI data queries (only when user has a location) ---
  const locationId = user?.locationIds?.[0] as string | undefined;
  const sevenDaysAgo = useMemo(() => new Date(Date.now() - 7 * 86400000), []);
  const now = useMemo(() => new Date(), []);

  const { data: onHand, isLoading: onHandLoading } = trpc.reports.onHand.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId }
  );
  const { data: cogs, isLoading: cogsLoading } = trpc.reports.cogs.useQuery(
    { locationId: locationId!, fromDate: sevenDaysAgo, toDate: now },
    { enabled: !!locationId }
  );
  const { data: variance, isLoading: varianceLoading } = trpc.reports.variance.useQuery(
    { locationId: locationId!, fromDate: sevenDaysAgo, toDate: now },
    { enabled: !!locationId }
  );
  const { data: patterns, isLoading: patternsLoading } = trpc.reports.variancePatterns.useQuery(
    { locationId: locationId!, sessionCount: 10 },
    { enabled: !!locationId }
  );
  const { data: varianceTrend } = trpc.reports.varianceTrend.useQuery(
    { locationId: locationId!, weeksBack: 4 },
    { enabled: !!locationId }
  );
  const { data: staffData } = trpc.reports.staffAccountability.useQuery(
    { locationId: locationId!, fromDate: sevenDaysAgo, toDate: now },
    { enabled: !!locationId }
  );

  const { data: parItems, isLoading: parLoading } = trpc.parLevels.list.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId }
  );

  const { data: coverageStats, isLoading: coverageLoading } = trpc.pos.coverageStats.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId }
  );

  const { data: openPOs, isLoading: openPOsLoading } = trpc.purchaseOrders.list.useQuery(
    { locationId: locationId!, status: "open" },
    { enabled: !!locationId }
  );

  const reorderCount = useMemo(
    () => parItems?.filter((i) => i.needsReorder).length ?? 0,
    [parItems]
  );
  const lowStockCount = useMemo(
    () =>
      parItems?.filter(
        (i) => i.daysToStockout != null && i.daysToStockout <= 3 && !i.needsReorder
      ).length ?? 0,
    [parItems]
  );
  const lowStockItems = useMemo(
    () =>
      parItems
        ?.filter((i) => i.needsReorder)
        .sort((a, b) => (a.daysToStockout ?? Infinity) - (b.daysToStockout ?? Infinity))
        .slice(0, 5) ?? [],
    [parItems]
  );

  const shrinkageSuspects = useMemo(
    () => patterns?.filter((p) => p.isShrinkageSuspect) ?? [],
    [patterns]
  );
  const flaggedItems = useMemo(
    () => patterns?.filter((p) => p.isShrinkageSuspect || p.trend === "worsening").slice(0, 5) ?? [],
    [patterns]
  );
  const recentSessions = useMemo(
    () =>
      staffData?.sessions
        ? [...staffData.sessions].sort((a, b) => new Date(b.startedTs).getTime() - new Date(a.startedTs).getTime()).slice(0, 5)
        : [],
    [staffData]
  );
  const trendChartData = useMemo(
    () =>
      varianceTrend?.map((d) => ({
        ...d,
        label: new Date(d.weekStart).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      })) ?? [],
    [varianceTrend]
  );

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!businessId || !name.trim()) return;
    createMutation.mutate({ businessId, name: name.trim(), timezone, closeoutHour });
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-[#EAF0FF]">Dashboard</h1>
          {isAdmin && archivedCount > 0 && (
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="rounded-md border border-white/10 px-3 py-1 text-xs text-[#EAF0FF]/60 hover:text-[#EAF0FF]/80"
            >
              {showArchived ? "Hide archived" : `Show archived (${archivedCount})`}
            </button>
          )}
        </div>
        {canCreate && businessId && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E]"
          >
            {showForm ? "Cancel" : "+ New Location"}
          </button>
        )}
      </div>

      {isAdmin && <AlertBanner />}

      {/* ── KPI Summary (visible when user has a location) ── */}
      {locationId && (
        <>
          {/* KPI Cards */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link href="/reports" className="rounded-lg border border-white/10 bg-[#16283F] p-4 transition-colors hover:border-[#E9B44C]/30">
              <p className="text-xs font-medium uppercase tracking-wide text-[#EAF0FF]/50">On-Hand Value</p>
              {onHandLoading ? (
                <div className="mt-2 h-8 w-24 animate-pulse rounded bg-white/10" />
              ) : (
                <>
                  <p className="mt-1 text-2xl font-bold text-[#EAF0FF]">${(onHand?.totalValue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  <p className="mt-0.5 text-xs text-[#EAF0FF]/40">{onHand?.totalItems ?? 0} items</p>
                </>
              )}
            </Link>

            <Link href="/reports" className="rounded-lg border border-white/10 bg-[#16283F] p-4 transition-colors hover:border-[#E9B44C]/30">
              <p className="text-xs font-medium uppercase tracking-wide text-[#EAF0FF]/50">COGS (7d)</p>
              {cogsLoading ? (
                <div className="mt-2 h-8 w-24 animate-pulse rounded bg-white/10" />
              ) : (
                <p className="mt-1 text-2xl font-bold text-[#E9B44C]">${(cogs?.cogs ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              )}
            </Link>

            <Link href="/reports" className="rounded-lg border border-white/10 bg-[#16283F] p-4 transition-colors hover:border-[#E9B44C]/30">
              <p className="text-xs font-medium uppercase tracking-wide text-[#EAF0FF]/50">Variance Impact (7d)</p>
              {varianceLoading ? (
                <div className="mt-2 h-8 w-24 animate-pulse rounded bg-white/10" />
              ) : (
                <p className={`mt-1 text-2xl font-bold ${(variance?.totalVarianceValue ?? 0) < 0 ? "text-red-400" : "text-[#EAF0FF]"}`}>
                  ${Math.abs(variance?.totalVarianceValue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  {(variance?.totalVarianceValue ?? 0) < 0 && <span className="ml-1 text-sm font-normal text-red-400">loss</span>}
                </p>
              )}
            </Link>

            <Link href="/reports" className="rounded-lg border border-white/10 bg-[#16283F] p-4 transition-colors hover:border-[#E9B44C]/30">
              <p className="text-xs font-medium uppercase tracking-wide text-[#EAF0FF]/50">Shrinkage Suspects</p>
              {patternsLoading ? (
                <div className="mt-2 h-8 w-12 animate-pulse rounded bg-white/10" />
              ) : (
                <p className={`mt-1 text-2xl font-bold ${shrinkageSuspects.length > 0 ? "text-red-400" : "text-green-400"}`}>
                  {shrinkageSuspects.length}
                </p>
              )}
            </Link>
          </div>

          {/* Par / Reorder / Coverage / Open POs KPI Cards */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link href="/par" className={`rounded-lg border bg-[#16283F] p-4 transition-colors hover:border-[#E9B44C]/30 ${reorderCount > 0 ? "border-red-500/30" : "border-green-500/30"}`}>
              <p className="text-xs font-medium uppercase tracking-wide text-[#EAF0FF]/50">Reorder Needed</p>
              {parLoading ? (
                <div className="mt-2 h-8 w-12 animate-pulse rounded bg-white/10" />
              ) : (
                <>
                  <p className={`mt-1 text-2xl font-bold ${reorderCount > 0 ? "text-red-400" : "text-green-400"}`}>{reorderCount}</p>
                  <p className="mt-0.5 text-xs text-[#EAF0FF]/40">{reorderCount} item{reorderCount !== 1 ? "s" : ""} below min level</p>
                </>
              )}
            </Link>

            <Link href="/par" className={`rounded-lg border bg-[#16283F] p-4 transition-colors hover:border-[#E9B44C]/30 ${lowStockCount > 0 ? "border-amber-500/30" : "border-white/10"}`}>
              <p className="text-xs font-medium uppercase tracking-wide text-[#EAF0FF]/50">Low Stock (&lt;3d)</p>
              {parLoading ? (
                <div className="mt-2 h-8 w-12 animate-pulse rounded bg-white/10" />
              ) : (
                <>
                  <p className={`mt-1 text-2xl font-bold ${lowStockCount > 0 ? "text-amber-400" : "text-[#EAF0FF]"}`}>{lowStockCount}</p>
                  <p className="mt-0.5 text-xs text-[#EAF0FF]/40">{lowStockCount} item{lowStockCount !== 1 ? "s" : ""} running low</p>
                </>
              )}
            </Link>

            <Link href="/pos/unmapped" className={`rounded-lg border bg-[#16283F] p-4 transition-colors hover:border-[#E9B44C]/30 ${
              (coverageStats?.mappedPercent ?? 100) >= 90 ? "border-green-500/30" : (coverageStats?.mappedPercent ?? 100) >= 70 ? "border-amber-500/30" : "border-red-500/30"
            }`}>
              <p className="text-xs font-medium uppercase tracking-wide text-[#EAF0FF]/50">POS Mapping</p>
              {coverageLoading ? (
                <div className="mt-2 h-8 w-12 animate-pulse rounded bg-white/10" />
              ) : (
                <>
                  <p className={`mt-1 text-2xl font-bold ${
                    (coverageStats?.mappedPercent ?? 100) >= 90 ? "text-green-400" : (coverageStats?.mappedPercent ?? 100) >= 70 ? "text-amber-400" : "text-red-400"
                  }`}>{coverageStats?.mappedPercent ?? 100}% mapped</p>
                  <p className="mt-0.5 text-xs text-[#EAF0FF]/40">{(coverageStats?.totalItems ?? 0) - (coverageStats?.mappedItems ?? 0)} unmapped items</p>
                </>
              )}
            </Link>

            <Link href="/orders" className={`rounded-lg border bg-[#16283F] p-4 transition-colors hover:border-[#E9B44C]/30 ${
              (openPOs?.length ?? 0) > 0 ? "border-blue-500/30" : "border-white/10"
            }`}>
              <p className="text-xs font-medium uppercase tracking-wide text-[#EAF0FF]/50">Open Orders</p>
              {openPOsLoading ? (
                <div className="mt-2 h-8 w-12 animate-pulse rounded bg-white/10" />
              ) : (
                <>
                  <p className={`mt-1 text-2xl font-bold ${(openPOs?.length ?? 0) > 0 ? "text-blue-400" : "text-[#EAF0FF]"}`}>{openPOs?.length ?? 0}</p>
                  <p className="mt-0.5 text-xs text-[#EAF0FF]/40">{openPOs?.length ?? 0} order{(openPOs?.length ?? 0) !== 1 ? "s" : ""} pending</p>
                </>
              )}
            </Link>
          </div>

          {/* Low Stock Items */}
          {lowStockItems.length > 0 && (
            <div className="mb-6 rounded-lg border border-white/10 bg-[#16283F] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#EAF0FF]">Items Needing Reorder</h3>
                <Link href="/par" className="text-xs font-medium text-[#E9B44C] hover:text-[#C8922E]">
                  View all →
                </Link>
              </div>
              <div className="space-y-2">
                {lowStockItems.map((item) => (
                  <div
                    key={item.inventoryItemId}
                    className="flex items-center justify-between rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#EAF0FF]">{item.itemName}</p>
                      <p className="text-xs text-[#EAF0FF]/40">{item.vendorName ?? "No vendor"}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-xs">
                      {item.daysToStockout != null ? (
                        <span className={item.daysToStockout <= 3 ? "font-medium text-red-400" : "text-amber-400"}>
                          {item.daysToStockout}d left
                        </span>
                      ) : (
                        <span className="text-[#EAF0FF]/30">—</span>
                      )}
                      <span className={`inline-block h-2 w-2 rounded-full ${item.status === "red" ? "bg-red-500" : item.status === "yellow" ? "bg-yellow-500" : "bg-green-500"}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Two-column: Variance Trend + Flagged Items */}
          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            {/* Variance Trend Mini Chart */}
            <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#EAF0FF]">Variance Trend (4 weeks)</h3>
                <Link href="/reports" className="text-xs font-medium text-[#E9B44C] hover:text-[#C8922E]">
                  View report →
                </Link>
              </div>
              {trendChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={trendChartData}>
                    <XAxis dataKey="label" tick={{ fill: "#EAF0FF", fontSize: 11 }} axisLine={{ stroke: "#ffffff1a" }} tickLine={false} />
                    <YAxis tick={{ fill: "#EAF0FF99", fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0B1623", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#EAF0FF" }}
                      formatter={(value) => [typeof value === "number" ? value.toFixed(1) : value, "Total Variance"]}
                      labelFormatter={(label) => `Week of ${label}`}
                    />
                    <Bar dataKey="totalVarianceUnits" fill="#E9B44C" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-8 text-center text-sm text-[#EAF0FF]/40">No trend data yet.</p>
              )}
            </div>

            {/* Flagged Items */}
            <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#EAF0FF]">Flagged Items</h3>
                <Link href="/reports" className="text-xs font-medium text-[#E9B44C] hover:text-[#C8922E]">
                  View all →
                </Link>
              </div>
              {flaggedItems.length > 0 ? (
                <div className="space-y-2">
                  {flaggedItems.map((item) => (
                    <div
                      key={item.inventoryItemId}
                      className={`flex items-center justify-between rounded-md border px-3 py-2 ${
                        item.isShrinkageSuspect
                          ? "border-red-500/30 bg-red-500/5"
                          : "border-yellow-500/30 bg-yellow-500/5"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[#EAF0FF]">{item.itemName}</p>
                        <p className="text-xs text-[#EAF0FF]/40">{item.categoryName ?? "Uncategorized"}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 text-xs">
                        <span className="text-red-400 font-medium">{item.avgVariance.toFixed(1)}</span>
                        <span className={item.trend === "worsening" ? "text-red-400" : item.trend === "improving" ? "text-green-400" : "text-[#EAF0FF]/40"}>
                          {item.trend === "worsening" ? "\u2193" : item.trend === "improving" ? "\u2191" : "\u2192"}
                        </span>
                        {item.isShrinkageSuspect && (
                          <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-red-400 font-medium">Shrinkage</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-[#EAF0FF]/40">No flagged items.</p>
              )}
            </div>
          </div>

          {/* Recent Sessions */}
          {recentSessions.length > 0 && (
            <div className="mb-6 rounded-lg border border-white/10 bg-[#16283F]">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <h3 className="text-sm font-semibold text-[#EAF0FF]">Recent Sessions</h3>
                <Link href="/sessions" className="text-xs font-medium text-[#E9B44C] hover:text-[#C8922E]">
                  View all →
                </Link>
              </div>
              <div className="divide-y divide-white/5">
                {recentSessions.map((s) => (
                  <div key={s.sessionId} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium text-[#EAF0FF]">
                        {new Date(s.startedTs).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                      <span className="text-xs text-[#EAF0FF]/50">{s.durationMinutes}m</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-[#EAF0FF]/60">
                      <span>{s.totalLines} items</span>
                      <span className={s.varianceRate > 20 ? "text-red-400" : s.varianceRate > 10 ? "text-amber-400" : ""}>
                        {s.varianceRate.toFixed(1)}% variance
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Locations ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {showForm && (
          <form
            onSubmit={handleCreate}
            className="rounded-lg border-2 border-dashed border-[#E9B44C]/30 bg-[#16283F] p-5"
          >
            <h3 className="mb-3 font-semibold text-[#EAF0FF]">New Location</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-[#EAF0FF]/80">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
                  placeholder="e.g. Main Bar"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#EAF0FF]/80">Timezone</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#EAF0FF]/80">
                  Closeout Hour
                  <span
                    title="The hour when the business day ends. E.g. 4:00 AM means late-night sales after midnight still count as the previous day."
                    className="ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-[#16283F] text-xs text-[#EAF0FF]/70"
                  >?</span>
                </label>
                <select
                  value={closeoutHour}
                  onChange={(e) => setCloseoutHour(Number(e.target.value))}
                  className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{i}:00</option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="w-full rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
              >
                {createMutation.isPending ? "Creating..." : "Create Location"}
              </button>
              {createMutation.error && (
                <p className="text-sm text-red-600">{createMutation.error.message}</p>
              )}
            </div>
          </form>
        )}

        {locations?.map((loc) => (
          <Link
            key={loc.id}
            href={`/locations/${loc.id}`}
            className={`rounded-lg border p-5 shadow-sm transition-shadow hover:shadow-md ${
              loc.active
                ? "border-white/10 bg-[#16283F]"
                : "border-amber-500/20 bg-amber-500/5 opacity-70"
            }`}
          >
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-[#EAF0FF]">{loc.name}</h3>
              {!loc.active && (
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-400">
                  Archived
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-[#EAF0FF]/60">{loc.timezone}</p>
            <p className="mt-1 text-xs text-[#EAF0FF]/40">
              Closeout: {loc.closeoutHour}:00
            </p>
          </Link>
        ))}

        {!businessId && (
          <div className="col-span-full rounded-lg border border-white/10 bg-[#16283F] p-5 text-[#EAF0FF]/60">
            Select a business to view locations.
          </div>
        )}
      </div>
    </div>
  );
}
