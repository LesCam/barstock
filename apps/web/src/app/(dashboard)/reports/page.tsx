"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";

export default function ReportsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const locationId = user?.locationIds?.[0];

  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    to: new Date().toISOString().split("T")[0],
  });

  const { data: variance } = trpc.reports.variance.useQuery(
    {
      locationId: locationId!,
      fromDate: new Date(dateRange.from),
      toDate: new Date(dateRange.to),
    },
    { enabled: !!locationId }
  );

  const { data: onHand } = trpc.reports.onHand.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId }
  );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Reports</h1>

      <div className="mb-6 flex gap-3">
        <input
          type="date"
          value={dateRange.from}
          onChange={(e) => setDateRange((d) => ({ ...d, from: e.target.value }))}
          className="rounded-md border px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={dateRange.to}
          onChange={(e) => setDateRange((d) => ({ ...d, to: e.target.value }))}
          className="rounded-md border px-3 py-2 text-sm"
        />
      </div>

      {/* On-hand summary */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">On-Hand Summary</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border bg-white p-4">
            <p className="text-sm text-gray-500">Total Items</p>
            <p className="text-2xl font-bold">{onHand?.totalItems ?? 0}</p>
          </div>
          <div className="rounded-lg border bg-white p-4">
            <p className="text-sm text-gray-500">Total Value</p>
            <p className="text-2xl font-bold">
              ${(onHand?.totalValue ?? 0).toFixed(2)}
            </p>
          </div>
        </div>
      </section>

      {/* Variance report */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Variance Report — ${(variance?.totalVarianceValue ?? 0).toFixed(2)} impact
        </h2>
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Theoretical</th>
                <th className="px-4 py-3">Actual</th>
                <th className="px-4 py-3">Variance</th>
                <th className="px-4 py-3">%</th>
                <th className="px-4 py-3">Value Impact</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {variance?.items.map((item) => (
                <tr key={item.inventoryItemId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{item.itemName}</td>
                  <td className="px-4 py-3">{item.theoretical.toFixed(1)}</td>
                  <td className="px-4 py-3">{item.actual.toFixed(1)}</td>
                  <td
                    className={`px-4 py-3 font-medium ${
                      item.variance < 0 ? "text-red-600" : item.variance > 0 ? "text-green-600" : ""
                    }`}
                  >
                    {item.variance.toFixed(1)}
                  </td>
                  <td className="px-4 py-3">{item.variancePercent.toFixed(1)}%</td>
                  <td className="px-4 py-3">
                    {item.valueImpact != null ? `$${item.valueImpact.toFixed(2)}` : "—"}
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
