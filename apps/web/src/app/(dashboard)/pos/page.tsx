"use client";

import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";
import Link from "next/link";

export default function POSPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const locationId = user?.locationIds?.[0];

  const { data: connections } = trpc.pos.listConnections.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId }
  );

  const { data: mappings } = trpc.mappings.list.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId }
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">POS Connections</h1>
        <Link
          href="/pos/unmapped"
          className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
        >
          View Unmapped Items
        </Link>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Connections</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {connections?.map((conn) => (
            <div key={conn.id} className="rounded-lg border bg-white p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium capitalize">{conn.sourceSystem}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    conn.status === "active"
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {conn.status}
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-500">Method: {conn.method}</p>
              {conn.lastSuccessTs && (
                <p className="mt-1 text-xs text-gray-400">
                  Last sync: {new Date(conn.lastSuccessTs).toLocaleString()}
                </p>
              )}
              {conn.lastError && (
                <p className="mt-1 text-xs text-red-500">{conn.lastError}</p>
              )}
            </div>
          ))}
          {connections?.length === 0 && (
            <p className="text-sm text-gray-500">No POS connections configured.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Item Mappings ({mappings?.length ?? 0})</h2>
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">POS Item ID</th>
                <th className="px-4 py-3">Inventory Item</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {mappings?.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{m.posItemId}</td>
                  <td className="px-4 py-3">{m.inventoryItem.name}</td>
                  <td className="px-4 py-3">{m.mode.replace("_", " ")}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        m.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {m.active ? "Yes" : "No"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
