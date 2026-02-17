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
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (location) {
      setName(location.name);
      setTimezone(location.timezone);
      setCloseoutHour(location.closeoutHour);
      setAddress(location.address ?? "");
      setPhone(location.phone ?? "");
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
    updateMutation.mutate({
      locationId: id,
      name: name.trim(),
      timezone,
      closeoutHour,
      address: address.trim() || null,
      phone: phone.trim() || null,
    });
  }

  if (!location) return <div className="text-[#EAF0FF]/60">Loading...</div>;

  return (
    <div>
      <Link href="/" className="mb-4 inline-block text-sm text-[#E9B44C] hover:underline">
        &larr; Back to Dashboard
      </Link>

      <h1 className="mb-6 text-2xl font-bold text-[#EAF0FF]">{location.name}</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Unmapped Items" value={stats?.unmappedCount ?? 0} alert={!!stats?.unmappedCount} />
        <StatCard label="Open Sessions" value={stats?.openSessions ?? 0} />
        <StatCard
          label="Last POS Import"
          value={stats?.lastPosImport ? new Date(stats.lastPosImport).toLocaleDateString() : "Never"}
        />
        <StatCard label="Timezone" value={location.timezone} />
      </div>

      <div className="mt-8 rounded-lg border border-white/10 bg-[#16283F] p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Location Details</h2>
          {canEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="rounded-md bg-[#E9B44C] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#D4A43C]"
            >
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#EAF0FF]/80">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] sm:w-1/2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#EAF0FF]/80">Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] sm:w-1/2"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#EAF0FF]/80">
                Closeout Hour
                <span
                  title="The hour when the business day ends. E.g. 4:00 AM means late-night sales after midnight still count as the previous day."
                  className="ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-[#16283F] text-xs text-[#EAF0FF]/70"
                >?</span>
              </label>
              <select
                value={closeoutHour}
                onChange={(e) => setCloseoutHour(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] sm:w-1/2"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{i}:00</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#EAF0FF]/80">Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] sm:w-1/2"
                placeholder="123 Main St, City, Province"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#EAF0FF]/80">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] sm:w-1/2"
                placeholder="(555) 123-4567"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-white hover:bg-[#D4A43C] disabled:opacity-50"
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
                  setAddress(location.address ?? "");
                  setPhone(location.phone ?? "");
                }}
                className="rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-[#EAF0FF]/80 hover:bg-[#16283F]/60"
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
              <dt className="text-[#EAF0FF]/60">Address</dt>
              <dd className="font-medium">{location.address || "—"}</dd>
            </div>
            <div>
              <dt className="text-[#EAF0FF]/60">Phone</dt>
              <dd className="font-medium">{location.phone || "—"}</dd>
            </div>
            <div>
              <dt className="text-[#EAF0FF]/60">Closeout Hour</dt>
              <dd className="font-medium">{location.closeoutHour}:00</dd>
            </div>
            <div>
              <dt className="text-[#EAF0FF]/60">ID</dt>
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
    <div className={`rounded-lg border bg-[#16283F] p-4 ${alert ? "border-amber-500/30 bg-amber-500/10" : ""}`}>
      <p className="text-sm text-[#EAF0FF]/60">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[#EAF0FF]">{value}</p>
    </div>
  );
}
