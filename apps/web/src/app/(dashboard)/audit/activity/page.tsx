"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import Link from "next/link";

const ACTION_LABELS: Record<string, string> = {
  "auth.login":                    "Login",
  "auth.login_failed":             "Login Failed",
  "auth.login_pin":                "PIN Login",
  "auth.login_pin_failed":         "PIN Login Failed",
  "user.created":                  "User Created",
  "user.updated":                  "User Updated",
  "user.permission.updated":       "Permission Updated",
  "user.location_access.granted":  "Access Granted",
  "user.location_access.revoked":  "Access Revoked",
  "settings.updated":              "Settings Updated",
  "session.created":               "Session Started",
  "session.closed":                "Session Closed",
  "inventory_item.created":        "Item Created",
  "inventory_item.updated":        "Item Updated",
  "stock.received":                "Stock Received",
  "category.created":              "Category Created",
  "category.updated":              "Category Updated",
  "category.deleted":              "Category Deleted",
  "vendor.created":                "Vendor Created",
  "vendor.updated":                "Vendor Updated",
  "vendor.deleted":                "Vendor Deactivated",
  "price.added":                   "Price Added",
  "adjustment.created":            "Adjustment Created",
  "recipe.created":                "Recipe Created",
  "recipe.updated":                "Recipe Updated",
  "recipe.deleted":                "Recipe Deleted",
  "transfer.created":              "Transfer Created",
  "par_level.created":             "Par Level Created",
  "par_level.updated":             "Par Level Updated",
  "par_level.bulk_upserted":       "Par Levels Bulk Updated",
  "par_level.deleted":             "Par Level Deleted",
  "purchase_order.created":        "PO Created",
  "purchase_order.pickup_recorded":"Pickup Recorded",
  "purchase_order.closed":         "PO Closed",
  "guide_category.created":        "Menu Category Created",
  "guide_item.created":            "Menu Item Created",
  "guide_item.updated":            "Menu Item Updated",
  "guide_item.deleted":            "Menu Item Deleted",
};

function getDotColor(actionType: string): string {
  if (actionType.startsWith("auth."))       return "bg-red-400";
  if (actionType.startsWith("stock."))      return "bg-green-400";
  if (actionType.startsWith("adjustment.")) return "bg-orange-400";
  if (actionType.startsWith("session."))    return "bg-purple-400";
  if (actionType.startsWith("inventory"))   return "bg-blue-400";
  if (actionType.startsWith("transfer."))   return "bg-blue-400";
  if (actionType.startsWith("category."))   return "bg-blue-400";
  if (actionType.startsWith("vendor."))     return "bg-blue-400";
  if (actionType.startsWith("price."))      return "bg-blue-400";
  if (actionType.startsWith("recipe."))     return "bg-[#E9B44C]";
  if (actionType.startsWith("settings."))   return "bg-purple-400";
  if (actionType.startsWith("user."))       return "bg-cyan-400";
  if (actionType.startsWith("par_level.") || actionType.startsWith("purchase_order.")) return "bg-teal-400";
  if (actionType.startsWith("guide_") || actionType.startsWith("art"))  return "bg-amber-400";
  return "bg-gray-400";
}

function getBadgeColor(actionType: string): string {
  if (actionType.startsWith("auth."))       return "bg-red-500/15 text-red-400";
  if (actionType.startsWith("stock."))      return "bg-green-500/15 text-green-400";
  if (actionType.startsWith("adjustment.")) return "bg-orange-500/15 text-orange-400";
  if (actionType.startsWith("session."))    return "bg-purple-500/15 text-purple-400";
  if (
    actionType.startsWith("inventory") ||
    actionType.startsWith("transfer.") ||
    actionType.startsWith("category.") ||
    actionType.startsWith("vendor.") ||
    actionType.startsWith("price.")
  )
    return "bg-blue-500/15 text-blue-400";
  if (actionType.startsWith("par_level.") || actionType.startsWith("purchase_order.")) return "bg-teal-500/15 text-teal-400";
  if (actionType.startsWith("recipe."))   return "bg-[#E9B44C]/15 text-[#E9B44C]";
  if (actionType.startsWith("settings.")) return "bg-purple-500/15 text-purple-400";
  if (actionType.startsWith("user."))     return "bg-cyan-500/15 text-cyan-400";
  if (actionType.startsWith("guide_") || actionType.startsWith("art")) return "bg-amber-500/15 text-amber-400";
  return "bg-white/5 text-[#E9B44C]";
}

function formatDescription(entry: { actionType: string; objectType: string | null; objectId: string | null; metadata: any }): string {
  const meta = entry.metadata as any;
  if (meta?.itemName) return meta.itemName;
  if (meta?.name) return meta.name;
  if (meta?.email) return meta.email;
  if (entry.objectType && entry.objectId) return `${entry.objectType} ${entry.objectId.slice(0, 8)}...`;
  return "";
}

export default function UserActivityPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const businessId: string | undefined = user?.businessId;

  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const { data: summary, isLoading: summaryLoading } =
    trpc.audit.activitySummary.useQuery(
      { businessId: businessId! },
      { enabled: !!businessId }
    );

  const { data: timeline, isLoading: timelineLoading } =
    trpc.audit.userActivity.useQuery(
      {
        businessId: businessId!,
        userId: selectedUserId || undefined,
        limit: 100,
      },
      { enabled: !!businessId }
    );

  // Summary stats
  const activeUsers7d = useMemo(() => {
    if (!summary) return 0;
    const cutoff = new Date(Date.now() - 7 * 86400000);
    return summary.filter((u) => new Date(u.lastActiveAt) >= cutoff).length;
  }, [summary]);

  const totalActions7d = useMemo(() => {
    if (!summary) return 0;
    return summary.reduce((sum, u) => sum + u.totalActions, 0);
  }, [summary]);

  const avgActionsPerUser = useMemo(() => {
    if (!summary || summary.length === 0) return 0;
    const total = summary.reduce((sum, u) => sum + u.totalActions, 0);
    return Math.round(total / summary.length);
  }, [summary]);

  // Group timeline entries by date
  const groupedTimeline = useMemo(() => {
    if (!timeline) return [];
    const groups: { date: string; entries: typeof timeline }[] = [];
    let currentDate = "";
    let currentEntries: typeof timeline = [];

    for (const entry of timeline) {
      const dateKey = new Date(entry.createdAt).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      if (dateKey !== currentDate) {
        if (currentEntries.length > 0) {
          groups.push({ date: currentDate, entries: currentEntries });
        }
        currentDate = dateKey;
        currentEntries = [entry];
      } else {
        currentEntries.push(entry);
      }
    }
    if (currentEntries.length > 0) {
      groups.push({ date: currentDate, entries: currentEntries });
    }
    return groups;
  }, [timeline]);

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
        <div>
          <h1 className="text-2xl font-bold text-[#EAF0FF]">
            User Activity Timeline
          </h1>
          <p className="mt-1 text-sm text-[#EAF0FF]/50">
            Track who did what and when across your business
          </p>
        </div>
        <Link
          href="/audit"
          className="rounded-md bg-[#16283F] px-4 py-2 text-sm text-[#E9B44C] hover:bg-[#1a3050]"
        >
          Full Audit Log
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-xs font-medium uppercase text-[#EAF0FF]/50">
            Active Users (7d)
          </p>
          <p className="mt-1 text-2xl font-bold text-[#EAF0FF]">
            {activeUsers7d}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-xs font-medium uppercase text-[#EAF0FF]/50">
            Total Actions
          </p>
          <p className="mt-1 text-2xl font-bold text-[#EAF0FF]">
            {totalActions7d.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-xs font-medium uppercase text-[#EAF0FF]/50">
            Avg Actions/User
          </p>
          <p className="mt-1 text-2xl font-bold text-[#EAF0FF]">
            {avgActionsPerUser}
          </p>
        </div>
      </div>

      {/* Activity Summary Table */}
      <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
        <h2 className="mb-3 text-sm font-semibold text-[#EAF0FF]">
          User Summary
        </h2>
        {summaryLoading ? (
          <p className="py-8 text-center text-sm text-[#EAF0FF]/40">
            Loading...
          </p>
        ) : !summary || summary.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#EAF0FF]/40">
            No activity recorded yet
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-[#EAF0FF]/50">
                <th className="pb-2">User</th>
                <th className="pb-2 text-right">Actions</th>
                <th className="pb-2 text-right">Action Types</th>
                <th className="pb-2 text-right">Top Action</th>
                <th className="pb-2 text-right">Last Active</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((user) => (
                <tr
                  key={user.userId}
                  onClick={() =>
                    setSelectedUserId(
                      selectedUserId === user.userId ? "" : user.userId
                    )
                  }
                  className={`cursor-pointer border-b border-white/5 text-[#EAF0FF] hover:bg-white/5 ${
                    selectedUserId === user.userId ? "bg-[#E9B44C]/10" : ""
                  }`}
                >
                  <td className="py-2">
                    <div>
                      <p className="font-medium">{user.displayName}</p>
                      <p className="text-xs text-[#EAF0FF]/40">
                        {user.email}
                      </p>
                    </div>
                  </td>
                  <td className="py-2 text-right font-medium">
                    {user.totalActions}
                  </td>
                  <td className="py-2 text-right">{user.uniqueActionTypes}</td>
                  <td className="py-2 text-right">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${getBadgeColor(user.topAction)}`}
                    >
                      {ACTION_LABELS[user.topAction] || user.topAction}
                    </span>
                  </td>
                  <td className="py-2 text-right text-xs text-[#EAF0FF]/50">
                    {new Date(user.lastActiveAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* User Filter */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-[#EAF0FF]/70">
          Filter by user:
        </label>
        <select
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
          className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
        >
          <option value="">All Users</option>
          {summary?.map((u) => (
            <option key={u.userId} value={u.userId}>
              {u.displayName}
            </option>
          ))}
        </select>
        {selectedUserId && (
          <button
            onClick={() => setSelectedUserId("")}
            className="text-xs text-[#E9B44C] hover:text-[#D4A43C]"
          >
            Clear
          </button>
        )}
      </div>

      {/* Timeline */}
      <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
        <h2 className="mb-4 text-sm font-semibold text-[#EAF0FF]">
          Activity Timeline
          {selectedUserId && summary && (
            <span className="ml-2 font-normal text-[#EAF0FF]/50">
              — {summary.find((u) => u.userId === selectedUserId)?.displayName}
            </span>
          )}
        </h2>

        {timelineLoading ? (
          <p className="py-8 text-center text-sm text-[#EAF0FF]/40">
            Loading...
          </p>
        ) : groupedTimeline.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#EAF0FF]/40">
            No activity found
          </p>
        ) : (
          <div className="space-y-6">
            {groupedTimeline.map((group) => (
              <div key={group.date}>
                <div className="mb-3 flex items-center gap-2">
                  <div className="h-px flex-1 bg-white/10" />
                  <span className="text-xs font-medium text-[#EAF0FF]/50">
                    {group.date}
                  </span>
                  <div className="h-px flex-1 bg-white/10" />
                </div>

                <div className="relative ml-4 border-l border-white/10 pl-6">
                  {group.entries.map((entry) => (
                    <div key={entry.id} className="relative mb-4 last:mb-0">
                      {/* Timeline dot */}
                      <div
                        className={`absolute -left-[29px] top-1 h-3 w-3 rounded-full border-2 border-[#16283F] ${getDotColor(entry.actionType)}`}
                      />

                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[#EAF0FF]/40">
                              {new Date(entry.createdAt).toLocaleTimeString(
                                "en-US",
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }
                              )}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${getBadgeColor(entry.actionType)}`}
                            >
                              {ACTION_LABELS[entry.actionType] ||
                                entry.actionType}
                            </span>
                            {!selectedUserId && (
                              <span className="text-xs text-[#EAF0FF]/60">
                                {entry.displayName}
                              </span>
                            )}
                          </div>
                          {formatDescription(entry) && (
                            <p className="mt-0.5 text-xs text-[#EAF0FF]/50">
                              {formatDescription(entry)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
