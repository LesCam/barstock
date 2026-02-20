"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";

function getBadgeColor(actionType: string): string {
  if (actionType.startsWith("auth.")) return "bg-red-500/15 text-red-400";
  if (
    actionType.startsWith("inventory") ||
    actionType.startsWith("session.") ||
    actionType.startsWith("transfer.")
  )
    return "bg-blue-500/15 text-blue-400";
  if (actionType.startsWith("settings.")) return "bg-purple-500/15 text-purple-400";
  if (actionType.startsWith("user.")) return "bg-cyan-500/15 text-cyan-400";
  if (
    actionType.startsWith("guide_") ||
    actionType.startsWith("artwork.") ||
    actionType.startsWith("artist.") ||
    actionType.startsWith("art_sale.")
  )
    return "bg-amber-500/15 text-amber-400";
  return "bg-white/5 text-[#E9B44C]";
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function exportCsv(items: any[], isPlatform: boolean) {
  const headers = isPlatform
    ? ["Timestamp", "Business", "Actor", "Action", "Object Type", "Object ID", "Metadata"]
    : ["Timestamp", "Actor", "Action", "Object Type", "Object ID", "Metadata"];
  const rows = items.map((entry) => {
    const actor = entry.actorUser
      ? entry.actorUser.firstName || entry.actorUser.lastName
        ? [entry.actorUser.firstName, entry.actorUser.lastName].filter(Boolean).join(" ")
        : entry.actorUser.email
      : "System";
    const metadata = entry.metadataJson ? JSON.stringify(entry.metadataJson) : "";
    const base = [
      new Date(entry.createdAt).toISOString(),
      actor,
      entry.actionType,
      entry.objectType ?? "",
      entry.objectId ?? "",
      metadata,
    ];
    if (isPlatform) base.splice(1, 0, entry.business?.name ?? "");
    return base;
  });

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell: string) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AuditPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const businessId = user?.businessId as string | undefined;
  const isPlatform = user?.highestRole === "platform_admin";

  const [filterBusinessId, setFilterBusinessId] = useState("");
  const [actionType, setActionType] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [objectType, setObjectType] = useState("");
  const [objectId, setObjectId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // The businessId sent to API: platform admins use filter (empty = all), regular admins use their own
  const queryBusinessId = isPlatform
    ? filterBusinessId || undefined
    : businessId;

  const { data: businesses } = trpc.audit.businesses.useQuery(
    undefined,
    { enabled: isPlatform }
  );

  const { data: actionTypes } = trpc.audit.actionTypes.useQuery(
    { businessId: queryBusinessId },
    { enabled: isPlatform || !!businessId }
  );

  const { data: objectTypes } = trpc.audit.objectTypes.useQuery(
    { businessId: queryBusinessId },
    { enabled: isPlatform || !!businessId }
  );

  const { data: actors } = trpc.audit.actors.useQuery(
    { businessId: queryBusinessId },
    { enabled: isPlatform || !!businessId }
  );

  const { data, isLoading } = trpc.audit.list.useQuery(
    {
      businessId: queryBusinessId,
      ...(actionType && { actionType }),
      ...(actorUserId && { actorUserId }),
      ...(objectType && { objectType }),
      ...(objectType && objectId && { objectId }),
      ...(fromDate && { fromDate: new Date(fromDate) }),
      ...(toDate && { toDate: new Date(toDate + "T23:59:59") }),
      cursor,
      limit: 50,
    },
    { enabled: isPlatform || !!businessId }
  );

  // Accumulate pages
  const [allItems, setAllItems] = useState<any[]>([]);
  const items = cursor ? [...allItems, ...(data?.items ?? [])] : (data?.items ?? []);

  function handleLoadMore() {
    if (data?.nextCursor) {
      setAllItems(items);
      setCursor(data.nextCursor);
    }
  }

  function handleFilterChange() {
    setAllItems([]);
    setCursor(undefined);
  }

  function actorName(actor: { firstName?: string | null; lastName?: string | null; email: string } | null) {
    if (!actor) return "System";
    if (actor.firstName || actor.lastName) return [actor.firstName, actor.lastName].filter(Boolean).join(" ");
    return actor.email;
  }

  const hasFilters = filterBusinessId || actionType || actorUserId || objectType || objectId || fromDate || toDate;

  if (!isPlatform && !businessId) {
    return <div className="text-[#EAF0FF]/60">No business selected.</div>;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-[#EAF0FF]">
        {isPlatform ? "Platform Audit Log" : "Audit Log"}
      </h1>

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap gap-3">
        {isPlatform && (
          <select
            value={filterBusinessId}
            onChange={(e) => { setFilterBusinessId(e.target.value); handleFilterChange(); }}
            className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
          >
            <option value="">All businesses</option>
            {businesses?.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}

        <select
          value={actionType}
          onChange={(e) => { setActionType(e.target.value); handleFilterChange(); }}
          className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
        >
          <option value="">All actions</option>
          {actionTypes?.map((at) => (
            <option key={at} value={at}>{at}</option>
          ))}
        </select>

        <select
          value={actorUserId}
          onChange={(e) => { setActorUserId(e.target.value); handleFilterChange(); }}
          className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
        >
          <option value="">All actors</option>
          {actors?.map((a) => (
            <option key={a.id} value={a.id}>{actorName(a)}</option>
          ))}
        </select>

        <select
          value={objectType}
          onChange={(e) => {
            setObjectType(e.target.value);
            if (!e.target.value) setObjectId("");
            handleFilterChange();
          }}
          className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
        >
          <option value="">All object types</option>
          {objectTypes?.map((ot) => (
            <option key={ot} value={ot}>{ot}</option>
          ))}
        </select>

        {objectType && (
          <input
            type="text"
            value={objectId}
            onChange={(e) => { setObjectId(e.target.value); handleFilterChange(); }}
            placeholder="Object ID"
            className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30"
          />
        )}

        <input
          type="date"
          value={fromDate}
          onChange={(e) => { setFromDate(e.target.value); handleFilterChange(); }}
          className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
          placeholder="From"
        />

        <input
          type="date"
          value={toDate}
          onChange={(e) => { setToDate(e.target.value); handleFilterChange(); }}
          className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
          placeholder="To"
        />

        {hasFilters && (
          <button
            onClick={() => {
              setFilterBusinessId("");
              setActionType("");
              setActorUserId("");
              setObjectType("");
              setObjectId("");
              setFromDate("");
              setToDate("");
              handleFilterChange();
            }}
            className="rounded-md border border-white/10 px-3 py-2 text-sm text-[#EAF0FF]/60 hover:bg-white/5"
          >
            Clear filters
          </button>
        )}

        {items.length > 0 && (
          <button
            onClick={() => exportCsv(items, isPlatform)}
            className="rounded-md border border-white/10 px-3 py-2 text-sm text-[#EAF0FF]/60 hover:bg-white/5"
          >
            Export CSV
          </button>
        )}
      </div>

      {isLoading && !items.length ? (
        <p className="text-[#EAF0FF]/60">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-[#EAF0FF]/60">No audit log entries found.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  {isPlatform && <th className="px-4 py-3">Business</th>}
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Object Type</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {items.map((entry: any) => (
                  <tr
                    key={entry.id}
                    className="cursor-pointer hover:bg-[#0B1623]/40"
                    onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                  >
                    <td
                      className="px-4 py-3 text-xs text-[#EAF0FF]/70"
                      title={new Date(entry.createdAt).toLocaleString()}
                    >
                      {formatRelativeTime(new Date(entry.createdAt))}
                    </td>
                    {isPlatform && (
                      <td className="px-4 py-3 text-[#EAF0FF]/70">
                        {entry.business?.name ?? "—"}
                      </td>
                    )}
                    <td className="px-4 py-3 text-[#EAF0FF]/80">
                      {actorName(entry.actorUser)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getBadgeColor(entry.actionType)}`}>
                        {entry.actionType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#EAF0FF]/70">
                      {entry.objectType}
                    </td>
                    <td className="max-w-[250px] truncate px-4 py-3 text-xs text-[#EAF0FF]/50">
                      {entry.metadataJson ? JSON.stringify(entry.metadataJson).slice(0, 80) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Expanded metadata */}
          {expandedId && (() => {
            const entry = items.find((e: any) => e.id === expandedId);
            if (!entry?.metadataJson) return null;
            return (
              <div className="mt-2 rounded-lg border border-white/10 bg-[#0B1623] p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-[#EAF0FF]/60">Full metadata</span>
                  <button
                    onClick={() => setExpandedId(null)}
                    className="text-xs text-[#EAF0FF]/40 hover:text-[#EAF0FF]/80"
                  >
                    Close
                  </button>
                </div>
                <pre className="max-h-60 overflow-auto text-xs text-[#EAF0FF]/70">
                  {JSON.stringify(entry.metadataJson, null, 2)}
                </pre>
              </div>
            );
          })()}

          {data?.nextCursor && (
            <div className="mt-4 text-center">
              <button
                onClick={handleLoadMore}
                className="rounded-md border border-white/10 px-4 py-2 text-sm text-[#EAF0FF]/80 hover:bg-white/5"
              >
                Load More
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
