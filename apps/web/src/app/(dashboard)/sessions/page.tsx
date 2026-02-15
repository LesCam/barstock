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
        <h1 className="text-2xl font-bold text-gray-900">Inventory Sessions</h1>
        <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          New Session
        </button>
      </div>

      {isLoading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
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
                <tr key={s.id} className="hover:bg-gray-50">
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
                          ? "bg-gray-100 text-gray-600"
                          : "bg-blue-100 text-blue-700"
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
