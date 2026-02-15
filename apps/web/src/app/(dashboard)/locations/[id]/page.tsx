"use client";

import { use } from "react";
import { trpc } from "@/lib/trpc";

export default function LocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: location } = trpc.locations.getById.useQuery({ locationId: id });
  const { data: stats } = trpc.locations.stats.useQuery({ locationId: id });

  if (!location) return <div className="text-gray-500">Loading...</div>;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">{location.name}</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Unmapped Items" value={stats?.unmappedCount ?? 0} alert={!!stats?.unmappedCount} />
        <StatCard label="Open Sessions" value={stats?.openSessions ?? 0} />
        <StatCard
          label="Last POS Import"
          value={stats?.lastPosImport ? new Date(stats.lastPosImport).toLocaleDateString() : "Never"}
        />
        <StatCard label="Timezone" value={location.timezone} />
      </div>

      <div className="mt-8 rounded-lg border bg-white p-5">
        <h2 className="mb-3 text-lg font-semibold">Location Details</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">Closeout Hour</dt>
            <dd className="font-medium">{location.closeoutHour}:00</dd>
          </div>
          <div>
            <dt className="text-gray-500">ID</dt>
            <dd className="font-mono text-xs">{location.id}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function StatCard({ label, value, alert }: { label: string; value: string | number; alert?: boolean }) {
  return (
    <div className={`rounded-lg border bg-white p-4 ${alert ? "border-amber-300 bg-amber-50" : ""}`}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
