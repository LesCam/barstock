"use client";

import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";

export default function DraftPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const locationId = user?.locationIds?.[0];

  const { data: tapLines } = trpc.draft.listTapLines.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId }
  );

  const { data: kegs } = trpc.draft.listKegs.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId }
  );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Draft Beer / Kegs</h1>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Tap Board</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tapLines?.map((tap) => {
            const assignment = tap.tapAssignments[0];
            return (
              <div key={tap.id} className="rounded-lg border bg-white p-4">
                <h3 className="font-medium">{tap.name}</h3>
                {assignment ? (
                  <div className="mt-2 text-sm">
                    <p className="text-gray-900">
                      {assignment.kegInstance.inventoryItem.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      Tapped: {assignment.effectiveStartTs
                        ? new Date(assignment.effectiveStartTs).toLocaleDateString()
                        : "—"}
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm italic text-gray-400">Empty</p>
                )}
              </div>
            );
          })}
          {tapLines?.length === 0 && (
            <p className="text-sm text-gray-500">No tap lines configured.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Keg Inventory ({kegs?.length ?? 0})</h2>
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {kegs?.map((keg) => (
                <tr key={keg.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{keg.inventoryItem.name}</td>
                  <td className="px-4 py-3">{keg.kegSize.name} ({Number(keg.kegSize.totalOz)} oz)</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize">
                      {keg.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">{new Date(keg.receivedTs).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
