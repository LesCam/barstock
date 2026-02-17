"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";

export default function AuditPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const locationId = user?.locationIds?.[0];
  const [eventTypeFilter, setEventTypeFilter] = useState("");

  const { data: events, isLoading } = trpc.events.list.useQuery(
    {
      locationId: locationId!,
      ...(eventTypeFilter && { eventType: eventTypeFilter }),
      limit: 200,
    },
    { enabled: !!locationId }
  );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-[#EAF0FF]">Audit Log</h1>

      <div className="mb-4">
        <select
          value={eventTypeFilter}
          onChange={(e) => setEventTypeFilter(e.target.value)}
          className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
        >
          <option value="">All event types</option>
          <option value="pos_sale">POS Sale</option>
          <option value="manual_adjustment">Manual Adjustment</option>
          <option value="inventory_count_adjustment">Count Adjustment</option>
          <option value="transfer">Transfer</option>
          <option value="tap_flow">Tap Flow</option>
        </select>
      </div>

      {isLoading ? (
        <p className="text-[#EAF0FF]/60">Loading...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Delta</th>
                <th className="px-4 py-3">UOM</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {events?.map((event) => (
                <tr key={event.id} className="hover:bg-[#16283F]/60">
                  <td className="px-4 py-3 text-xs">
                    {new Date(event.eventTs).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-[#EAF0FF]/70">
                      {event.eventType.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">{event.inventoryItem.name}</td>
                  <td
                    className={`px-4 py-3 font-mono ${
                      Number(event.quantityDelta) < 0 ? "text-red-400" : "text-green-400"
                    }`}
                  >
                    {Number(event.quantityDelta) > 0 ? "+" : ""}
                    {Number(event.quantityDelta).toFixed(2)}
                  </td>
                  <td className="px-4 py-3">{event.uom}</td>
                  <td className="px-4 py-3 capitalize">{event.sourceSystem}</td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-xs text-[#EAF0FF]/60">
                    {event.notes}
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
