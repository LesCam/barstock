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
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Audit Log</h1>

      <div className="mb-4">
        <select
          value={eventTypeFilter}
          onChange={(e) => setEventTypeFilter(e.target.value)}
          className="rounded-md border px-3 py-2 text-sm"
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
        <p className="text-gray-500">Loading...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
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
                <tr key={event.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs">
                    {new Date(event.eventTs).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">
                      {event.eventType.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">{event.inventoryItem.name}</td>
                  <td
                    className={`px-4 py-3 font-mono ${
                      Number(event.quantityDelta) < 0 ? "text-red-600" : "text-green-600"
                    }`}
                  >
                    {Number(event.quantityDelta) > 0 ? "+" : ""}
                    {Number(event.quantityDelta).toFixed(2)}
                  </td>
                  <td className="px-4 py-3">{event.uom}</td>
                  <td className="px-4 py-3 capitalize">{event.sourceSystem}</td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-xs text-gray-500">
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
