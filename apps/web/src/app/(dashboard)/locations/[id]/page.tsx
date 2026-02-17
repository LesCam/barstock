"use client";

import { use, useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import Link from "next/link";

const TIMEZONES = [
  "America/Montreal",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Vancouver",
  "America/Toronto",
  "America/Halifax",
  "America/Edmonton",
  "America/Winnipeg",
  "Europe/London",
  "Europe/Paris",
  "Pacific/Honolulu",
  "America/Anchorage",
];

const ADMIN_ROLES = ["platform_admin", "business_admin", "manager"];

export default function LocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const user = session?.user as any;
  const canEdit = ADMIN_ROLES.includes(user?.highestRole ?? "");

  const { data: location } = trpc.locations.getById.useQuery({ locationId: id });
  const { data: stats } = trpc.locations.stats.useQuery({ locationId: id });

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [closeoutHour, setCloseoutHour] = useState(0);

  useEffect(() => {
    if (location) {
      setName(location.name);
      setTimezone(location.timezone);
      setCloseoutHour(location.closeoutHour);
    }
  }, [location]);

  const utils = trpc.useUtils();
  const updateMutation = trpc.locations.update.useMutation({
    onSuccess: () => {
      utils.locations.getById.invalidate({ locationId: id });
      setEditing(false);
    },
  });

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updateMutation.mutate({ locationId: id, name: name.trim(), timezone, closeoutHour });
  }

  if (!location) return <div className="text-gray-500">Loading...</div>;

  return (
    <div>
      <Link href="/" className="mb-4 inline-block text-sm text-blue-600 hover:underline">
        &larr; Back to Dashboard
      </Link>

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
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Location Details</h2>
          {canEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm sm:w-1/2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm sm:w-1/2"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Closeout Hour
                <span
                  title="The hour when the business day ends. E.g. 4:00 AM means late-night sales after midnight still count as the previous day."
                  className="ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-gray-200 text-xs text-gray-600"
                >?</span>
              </label>
              <select
                value={closeoutHour}
                onChange={(e) => setCloseoutHour(Number(e.target.value))}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm sm:w-1/2"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{i}:00</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {updateMutation.isPending ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setName(location.name);
                  setTimezone(location.timezone);
                  setCloseoutHour(location.closeoutHour);
                }}
                className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
            {updateMutation.error && (
              <p className="text-sm text-red-600">{updateMutation.error.message}</p>
            )}
          </form>
        ) : (
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
        )}
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
