"use client";

import { useState } from "react";
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

export default function DashboardPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const businessId = user?.businessId;
  const highestRole = user?.highestRole;
  const canCreate = highestRole === "platform_admin" || highestRole === "business_admin";

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("America/Montreal");
  const [closeoutHour, setCloseoutHour] = useState(4);

  const utils = trpc.useUtils();

  const { data: locations } = trpc.locations.listByBusiness.useQuery(
    { businessId: businessId! },
    { enabled: !!businessId }
  );

  const createMutation = trpc.locations.create.useMutation({
    onSuccess: () => {
      utils.locations.listByBusiness.invalidate({ businessId });
      setShowForm(false);
      setName("");
      setTimezone("America/Montreal");
      setCloseoutHour(4);
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!businessId || !name.trim()) return;
    createMutation.mutate({ businessId, name: name.trim(), timezone, closeoutHour });
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        {canCreate && businessId && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {showForm ? "Cancel" : "+ New Location"}
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {showForm && (
          <form
            onSubmit={handleCreate}
            className="rounded-lg border-2 border-dashed border-blue-300 bg-blue-50 p-5"
          >
            <h3 className="mb-3 font-semibold text-gray-900">New Location</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="e.g. Main Bar"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Timezone</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
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
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{i}:00</option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {createMutation.isPending ? "Creating..." : "Create Location"}
              </button>
              {createMutation.error && (
                <p className="text-sm text-red-600">{createMutation.error.message}</p>
              )}
            </div>
          </form>
        )}

        {locations?.map((loc) => (
          <Link
            key={loc.id}
            href={`/locations/${loc.id}`}
            className="rounded-lg border bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <h3 className="font-semibold text-gray-900">{loc.name}</h3>
            <p className="mt-1 text-sm text-gray-500">{loc.timezone}</p>
            <p className="mt-1 text-xs text-gray-400">
              Closeout: {loc.closeoutHour}:00
            </p>
          </Link>
        ))}

        {!businessId && (
          <div className="col-span-full rounded-lg border bg-white p-5 text-gray-500">
            Select a business to view locations.
          </div>
        )}
      </div>
    </div>
  );
}
