"use client";

import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";

export default function SessionsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const locationId = user?.locationIds?.[0];

  const { data: sessions, isLoading } = trpc.sessions.list.useQuery(
    { locationId: locationId!, openOnly: false },
    { enabled: !!locationId }
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#EAF0FF]">Inventory Sessions</h1>
        <button className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E]">
          New Session
        </button>
      </div>

      {isLoading ? (
        <p className="text-[#EAF0FF]/60">Loading...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
              <tr>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Ended</th>
                <th className="px-4 py-3">Created By</th>
                <th className="px-4 py-3">Lines</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sessions?.map((s) => (
                <tr key={s.id} className="hover:bg-[#16283F]/60">
                  <td className="px-4 py-3 capitalize">{s.sessionType}</td>
                  <td className="px-4 py-3 text-xs">
                    {new Date(s.startedTs).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {s.endedTs ? new Date(s.endedTs).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3">{s.createdByUser?.email ?? "—"}</td>
                  <td className="px-4 py-3">{s._count.lines}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        s.endedTs
                          ? "bg-white/5 text-[#EAF0FF]/70"
                          : "bg-[#E9B44C]/10 text-[#E9B44C]"
                      }`}
                    >
                      {s.endedTs ? "Closed" : "Open"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
