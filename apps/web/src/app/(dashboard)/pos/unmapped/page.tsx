"use client";

import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";

export default function UnmappedPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const locationId = user?.locationIds?.[0];

  const { data: unmapped, isLoading } = trpc.pos.unmapped.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId }
  );

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Unmapped POS Items</h1>
      <p className="mb-6 text-sm text-gray-500">
        Items sold in the last 7 days that have no inventory mapping. Map them to start tracking depletion.
      </p>

      {isLoading ? (
        <p className="text-gray-500">Loading...</p>
      ) : unmapped?.length === 0 ? (
        <div className="rounded-lg border bg-green-50 p-6 text-center text-green-700">
          All POS items are mapped. Nice work!
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">POS Item</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Qty Sold (7d)</th>
                <th className="px-4 py-3">First Seen</th>
                <th className="px-4 py-3">Last Seen</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {unmapped?.map((item) => (
                <tr key={`${item.source_system}-${item.pos_item_id}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{item.pos_item_name}</div>
                    <div className="font-mono text-xs text-gray-400">{item.pos_item_id}</div>
                  </td>
                  <td className="px-4 py-3 capitalize">{item.source_system}</td>
                  <td className="px-4 py-3 font-medium">{item.qty_sold_7d}</td>
                  <td className="px-4 py-3 text-xs">{new Date(item.first_seen).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-xs">{new Date(item.last_seen).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <button className="rounded-md bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700">
                      Map
                    </button>
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
