"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";

export default function AuditPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const businessId = user?.businessId as string | undefined;

  const [actionType, setActionType] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: actionTypes } = trpc.audit.actionTypes.useQuery(
    { businessId: businessId! },
    { enabled: !!businessId }
  );

  const { data: actors } = trpc.audit.actors.useQuery(
    { businessId: businessId! },
    { enabled: !!businessId }
  );

  const { data, isLoading } = trpc.audit.list.useQuery(
    {
      businessId: businessId!,
      ...(actionType && { actionType }),
      ...(actorUserId && { actorUserId }),
      ...(fromDate && { fromDate: new Date(fromDate) }),
      ...(toDate && { toDate: new Date(toDate + "T23:59:59") }),
      cursor,
      limit: 50,
    },
    { enabled: !!businessId }
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

  if (!businessId) {
    return <div className="text-[#EAF0FF]/60">No business selected.</div>;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-[#EAF0FF]">Audit Log</h1>

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap gap-3">
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

        {(actionType || actorUserId || fromDate || toDate) && (
          <button
            onClick={() => {
              setActionType("");
              setActorUserId("");
              setFromDate("");
              setToDate("");
              handleFilterChange();
            }}
            className="rounded-md border border-white/10 px-3 py-2 text-sm text-[#EAF0FF]/60 hover:bg-white/5"
          >
            Clear filters
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
                    <td className="px-4 py-3 text-xs text-[#EAF0FF]/70">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-[#EAF0FF]/80">
                      {actorName(entry.actorUser)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs font-medium text-[#E9B44C]">
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
