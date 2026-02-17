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
      <h1 className="mb-6 text-2xl font-bold text-[#EAF0FF]">Draft Beer / Kegs</h1>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Tap Board</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tapLines?.map((tap) => {
            const assignment = tap.tapAssignments[0];
            return (
              <div key={tap.id} className="rounded-lg border border-white/10 bg-[#16283F] p-4">
                <h3 className="font-medium">{tap.name}</h3>
                {assignment ? (
                  <div className="mt-2 text-sm">
                    <p className="text-[#EAF0FF]">
                      {assignment.kegInstance.inventoryItem.name}
                    </p>
                    <p className="text-xs text-[#EAF0FF]/60">
                      Tapped: {assignment.effectiveStartTs
                        ? new Date(assignment.effectiveStartTs).toLocaleDateString()
                        : "—"}
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm italic text-[#EAF0FF]/40">Empty</p>
                )}
              </div>
            );
          })}
          {tapLines?.length === 0 && (
            <p className="text-sm text-[#EAF0FF]/60">No tap lines configured.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Keg Inventory ({kegs?.length ?? 0})</h2>
        <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {kegs?.map((keg) => (
                <tr key={keg.id} className="hover:bg-[#16283F]/60">
                  <td className="px-4 py-3">{keg.inventoryItem.name}</td>
                  <td className="px-4 py-3">{keg.kegSize.name} ({Number(keg.kegSize.totalOz)} oz)</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs capitalize text-[#EAF0FF]/70">
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
