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

const ALERT_BORDER_COLORS: Record<string, string> = {
  shrinkagePattern: "border-red-500/60",
  largeAdjustment: "border-red-500/60",
  variancePercent: "border-yellow-500/60",
  lowStock: "border-yellow-500/60",
  staleCountDays: "border-yellow-500/60",
  kegNearEmpty: "border-blue-500/60",
  sessionAutoClosed: "border-purple-500/60",
  loginFailures: "border-red-500/60",
  parReorderAlert: "border-blue-500/60",
};

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function AlertBanner() {
  const { data, isLoading } = trpc.notifications.list.useQuery(
    { limit: 5 },
    { refetchInterval: 60_000 }
  );
  const { data: unreadData } = trpc.notifications.unreadCount.useQuery(
    undefined,
    { refetchInterval: 60_000 }
  );
  const markReadMutation = trpc.notifications.markRead.useMutation();
  const utils = trpc.useUtils();

  if (isLoading || !data) return null;

  const alertNotifications = data.items.filter((n) => {
    const meta = n.metadataJson as Record<string, unknown> | null;
    return meta && typeof meta.rule === "string" && !n.isRead;
  });

  const unreadCount = unreadData ?? 0;

  if (alertNotifications.length === 0 && unreadCount === 0) return null;

  function handleDismiss(id: string) {
    markReadMutation.mutate(
      { id },
      { onSuccess: () => utils.notifications.list.invalidate() }
    );
  }

  return (
    <div className="mb-6 space-y-2">
      {alertNotifications.map((n) => {
        const meta = n.metadataJson as Record<string, unknown>;
        const rule = meta.rule as string;
        const borderColor = ALERT_BORDER_COLORS[rule] ?? "border-white/20";

        return (
          <div
            key={n.id}
            className={`flex items-start gap-3 rounded-lg border-l-4 ${borderColor} bg-[#16283F] px-4 py-3`}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[#EAF0FF]">{n.title}</p>
              {n.body && (
                <p className="mt-0.5 text-xs text-[#EAF0FF]/60 line-clamp-2">
                  {n.body}
                </p>
              )}
              <p className="mt-1 text-xs text-[#EAF0FF]/40">
                {timeAgo(n.createdAt)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {n.linkUrl && (
                <Link
                  href={n.linkUrl}
                  className="text-xs font-medium text-[#E9B44C] hover:text-[#C8922E]"
                >
                  View
                </Link>
              )}
              <button
                onClick={() => handleDismiss(n.id)}
                className="text-xs text-[#EAF0FF]/40 hover:text-[#EAF0FF]/80"
              >
                Dismiss
              </button>
            </div>
          </div>
        );
      })}
      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-[#EAF0FF]/40">{unreadCount} unread</span>
        <Link href="/notifications" className="text-xs font-medium text-[#E9B44C]">
          View all notifications →
        </Link>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const businessId = user?.businessId;
  const highestRole = user?.highestRole;
  const canCreate = highestRole === "platform_admin" || highestRole === "business_admin";
  const isAdmin = canCreate;

  const [showForm, setShowForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("America/Montreal");
  const [closeoutHour, setCloseoutHour] = useState(4);

  const utils = trpc.useUtils();

  const { data: locations } = trpc.locations.listByBusiness.useQuery(
    { businessId: businessId!, activeOnly: !showArchived },
    { enabled: !!businessId }
  );

  const { data: allLocations } = trpc.locations.listByBusiness.useQuery(
    { businessId: businessId!, activeOnly: false },
    { enabled: !!businessId && isAdmin }
  );
  const archivedCount = allLocations ? allLocations.filter((l) => !l.active).length : 0;

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
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-[#EAF0FF]">Dashboard</h1>
          {isAdmin && archivedCount > 0 && (
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="rounded-md border border-white/10 px-3 py-1 text-xs text-[#EAF0FF]/60 hover:text-[#EAF0FF]/80"
            >
              {showArchived ? "Hide archived" : `Show archived (${archivedCount})`}
            </button>
          )}
        </div>
        {canCreate && businessId && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E]"
          >
            {showForm ? "Cancel" : "+ New Location"}
          </button>
        )}
      </div>

      {isAdmin && <AlertBanner />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {showForm && (
          <form
            onSubmit={handleCreate}
            className="rounded-lg border-2 border-dashed border-[#E9B44C]/30 bg-[#16283F] p-5"
          >
            <h3 className="mb-3 font-semibold text-[#EAF0FF]">New Location</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-[#EAF0FF]/80">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
                  placeholder="e.g. Main Bar"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#EAF0FF]/80">Timezone</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
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
                  className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{i}:00</option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="w-full rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
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
            className={`rounded-lg border p-5 shadow-sm transition-shadow hover:shadow-md ${
              loc.active
                ? "border-white/10 bg-[#16283F]"
                : "border-amber-500/20 bg-amber-500/5 opacity-70"
            }`}
          >
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-[#EAF0FF]">{loc.name}</h3>
              {!loc.active && (
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-400">
                  Archived
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-[#EAF0FF]/60">{loc.timezone}</p>
            <p className="mt-1 text-xs text-[#EAF0FF]/40">
              Closeout: {loc.closeoutHour}:00
            </p>
          </Link>
        ))}

        {!businessId && (
          <div className="col-span-full rounded-lg border border-white/10 bg-[#16283F] p-5 text-[#EAF0FF]/60">
            Select a business to view locations.
          </div>
        )}
      </div>
    </div>
  );
}
