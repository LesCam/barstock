"use client";

import { use, useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
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

function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "—";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === "1") {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw;
}

function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export default function LocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const user = session?.user as any;
  const canEdit = ADMIN_ROLES.includes(user?.highestRole ?? "");
  const canDelete = ["platform_admin", "business_admin"].includes(user?.highestRole ?? "");

  const { data: location } = trpc.locations.getById.useQuery({ locationId: id });
  const isArchived = location?.active === false;
  const { data: stats } = trpc.locations.stats.useQuery({ locationId: id });
  const { data: barAreas = [] } = trpc.areas.listBarAreas.useQuery({ locationId: id });
  const { data: tapLines = [] } = trpc.draft.listTapLines.useQuery({ locationId: id });
  const { data: pourProfiles = [] } = trpc.draft.listPourProfiles.useQuery({ locationId: id });

  // Archive state
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const { data: archiveSummary, isFetching: summaryLoading } = trpc.locations.archiveSummary.useQuery(
    { locationId: id },
    { enabled: showArchiveConfirm }
  );

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [closeoutHour, setCloseoutHour] = useState(0);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (location) {
      setName(location.name);
      setTimezone(location.timezone);
      setCloseoutHour(location.closeoutHour);
      setAddress(location.address ?? "");
      setCity(location.city ?? "");
      setProvince(location.province ?? "");
      setPostalCode(location.postalCode ?? "");
      setPhone(formatPhoneInput(location.phone ?? ""));
    }
  }, [location]);

  // Bar areas state
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());
  const [editingBarAreaId, setEditingBarAreaId] = useState<string | null>(null);
  const [editBarAreaName, setEditBarAreaName] = useState("");
  const [editBarAreaSort, setEditBarAreaSort] = useState(0);
  const [editingSubAreaId, setEditingSubAreaId] = useState<string | null>(null);
  const [editSubAreaName, setEditSubAreaName] = useState("");
  const [editSubAreaSort, setEditSubAreaSort] = useState(0);
  const [addingBarArea, setAddingBarArea] = useState(false);
  const [newBarAreaName, setNewBarAreaName] = useState("");
  const [newBarAreaSort, setNewBarAreaSort] = useState(0);
  const [addingSubAreaFor, setAddingSubAreaFor] = useState<string | null>(null);
  const [newSubAreaName, setNewSubAreaName] = useState("");
  const [newSubAreaSort, setNewSubAreaSort] = useState(0);
  const [areaDeleteError, setAreaDeleteError] = useState<string | null>(null);

  // Tap lines state
  const [addingTap, setAddingTap] = useState(false);
  const [newTapName, setNewTapName] = useState("");
  const [newTapBarAreaId, setNewTapBarAreaId] = useState("");
  const [editingTapId, setEditingTapId] = useState<string | null>(null);
  const [editTapName, setEditTapName] = useState("");
  const [editTapBarAreaId, setEditTapBarAreaId] = useState("");
  const [tapDeleteError, setTapDeleteError] = useState<string | null>(null);

  // Pour profiles state
  const [addingProfile, setAddingProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileOz, setNewProfileOz] = useState("");
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editProfileName, setEditProfileName] = useState("");
  const [editProfileOz, setEditProfileOz] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);

  const router = useRouter();
  const utils = trpc.useUtils();
  const invalidateAreas = () => utils.areas.listBarAreas.invalidate({ locationId: id });
  const invalidateTaps = () => utils.draft.listTapLines.invalidate({ locationId: id });
  const invalidateProfiles = () => utils.draft.listPourProfiles.invalidate({ locationId: id });

  const archiveMutation = trpc.locations.archive.useMutation({
    onSuccess: () => {
      router.push("/");
    },
  });

  const restoreMutation = trpc.locations.restore.useMutation({
    onSuccess: () => {
      utils.locations.getById.invalidate({ locationId: id });
    },
  });

  const updateMutation = trpc.locations.update.useMutation({
    onSuccess: () => {
      utils.locations.getById.invalidate({ locationId: id });
      setEditing(false);
    },
  });

  const createBarAreaMut = trpc.areas.createBarArea.useMutation({
    onSuccess: () => { invalidateAreas(); setAddingBarArea(false); setNewBarAreaName(""); },
    onError: (err) => setAreaDeleteError(err.message),
  });
  const updateBarAreaMut = trpc.areas.updateBarArea.useMutation({
    onSuccess: () => { invalidateAreas(); setEditingBarAreaId(null); },
    onError: (err) => setAreaDeleteError(err.message),
  });
  const deleteBarAreaMut = trpc.areas.deleteBarArea.useMutation({
    onSuccess: () => { invalidateAreas(); setAreaDeleteError(null); },
    onError: (err) => setAreaDeleteError(err.message),
  });
  const createSubAreaMut = trpc.areas.createSubArea.useMutation({
    onSuccess: () => { invalidateAreas(); setAddingSubAreaFor(null); setNewSubAreaName(""); },
  });
  const updateSubAreaMut = trpc.areas.updateSubArea.useMutation({
    onSuccess: () => { invalidateAreas(); setEditingSubAreaId(null); },
  });
  const deleteSubAreaMut = trpc.areas.deleteSubArea.useMutation({
    onSuccess: () => { invalidateAreas(); setAreaDeleteError(null); },
    onError: (err) => setAreaDeleteError(err.message),
  });

  const createTapMut = trpc.draft.createTapLine.useMutation({
    onSuccess: () => { invalidateTaps(); setAddingTap(false); setNewTapName(""); setNewTapBarAreaId(""); },
    onError: (err) => setTapDeleteError(err.message),
  });
  const updateTapMut = trpc.draft.updateTapLine.useMutation({
    onSuccess: () => { invalidateTaps(); setEditingTapId(null); },
    onError: (err) => setTapDeleteError(err.message),
  });
  const deleteTapMut = trpc.draft.deleteTapLine.useMutation({
    onSuccess: () => { invalidateTaps(); setTapDeleteError(null); },
    onError: (err) => setTapDeleteError(err.message),
  });

  const createProfileMut = trpc.draft.createPourProfile.useMutation({
    onSuccess: () => { invalidateProfiles(); setAddingProfile(false); setNewProfileName(""); setNewProfileOz(""); },
    onError: (err) => setProfileError(err.message),
  });
  const updateProfileMut = trpc.draft.updatePourProfile.useMutation({
    onSuccess: () => { invalidateProfiles(); setEditingProfileId(null); },
    onError: (err) => setProfileError(err.message),
  });
  const deleteProfileMut = trpc.draft.deletePourProfile.useMutation({
    onSuccess: () => { invalidateProfiles(); setProfileError(null); },
    onError: (err) => setProfileError(err.message),
  });

  function toggleArea(areaId: string) {
    setExpandedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(areaId)) next.delete(areaId);
      else next.add(areaId);
      return next;
    });
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updateMutation.mutate({
      locationId: id,
      name: name.trim(),
      timezone,
      closeoutHour,
      address: address.trim() || null,
      city: city.trim() || null,
      province: province.trim() || null,
      postalCode: postalCode.trim() || null,
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

      {isArchived && (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <div>
            <p className="font-medium text-amber-400">This location is archived</p>
            <p className="text-sm text-amber-400/70">It is hidden from active views. All data is preserved.</p>
          </div>
          {canDelete && (
            <button
              onClick={() => restoreMutation.mutate({ locationId: id })}
              disabled={restoreMutation.isPending}
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {restoreMutation.isPending ? "Restoring..." : "Restore Location"}
            </button>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Unmapped Items" value={stats?.unmappedCount ?? 0} alert={!!stats?.unmappedCount} />
        <StatCard label="Open Sessions" value={stats?.openSessions ?? 0} />
        <StatCard
          label="Last POS Import"
          value={stats?.lastPosImport ? new Date(stats.lastPosImport).toLocaleDateString() : "Never"}
        />
        <StatCard label="Timezone" value={location.timezone} />
      </div>

      {/* Contact Info — always visible */}
      <div className="mt-8 rounded-lg border border-white/10 bg-[#16283F] p-5">
        <h2 className="mb-3 text-lg font-semibold">Contact &amp; Address</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-[#EAF0FF]/60">Street Address</dt>
            <dd className="font-medium">{location.address || "—"}</dd>
          </div>
          <div>
            <dt className="text-[#EAF0FF]/60">City</dt>
            <dd className="font-medium">{location.city || "—"}</dd>
          </div>
          <div>
            <dt className="text-[#EAF0FF]/60">Province / State</dt>
            <dd className="font-medium">{location.province || "—"}</dd>
          </div>
          <div>
            <dt className="text-[#EAF0FF]/60">Postal / Zip Code</dt>
            <dd className="font-medium">{location.postalCode || "—"}</dd>
          </div>
          <div>
            <dt className="text-[#EAF0FF]/60">Phone</dt>
            <dd className="font-medium">{formatPhone(location.phone)}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-4 rounded-lg border border-white/10 bg-[#16283F] p-5">
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
              <label className="block text-sm font-medium text-[#EAF0FF]/80">Street Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] sm:w-1/2"
                placeholder="123 Main St"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-[#EAF0FF]/80">City</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
                  placeholder="Montreal"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#EAF0FF]/80">Province / State</label>
                <input
                  type="text"
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
                  placeholder="QC"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#EAF0FF]/80">Postal / Zip Code</label>
                <input
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
                  placeholder="H2X 1Y4"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#EAF0FF]/80">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] sm:w-1/2"
                placeholder="(555) 555-5555"
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
                  setCity(location.city ?? "");
                  setProvince(location.province ?? "");
                  setPostalCode(location.postalCode ?? "");
                  setPhone(formatPhoneInput(location.phone ?? ""));
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

      {/* Bar Areas */}
      <div className="mt-4 rounded-lg border border-white/10 bg-[#16283F] p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Bar Areas</h2>
          {canEdit && !addingBarArea && (
            <button
              onClick={() => { setNewBarAreaSort(barAreas.length); setAddingBarArea(true); }}
              className="rounded-md bg-[#E9B44C] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#D4A43C]"
            >
              + Add Area
            </button>
          )}
        </div>

        {areaDeleteError && (
          <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {areaDeleteError}
            <button onClick={() => setAreaDeleteError(null)} className="ml-2 underline">Dismiss</button>
          </div>
        )}

        {addingBarArea && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createBarAreaMut.mutate({ locationId: id, name: newBarAreaName.trim(), sortOrder: newBarAreaSort });
            }}
            className="mb-3 flex items-end gap-2 rounded-md border border-white/10 bg-[#0B1623] p-3"
          >
            <div className="flex-1">
              <label className="block text-xs text-[#EAF0FF]/60">Name</label>
              <input
                type="text"
                value={newBarAreaName}
                onChange={(e) => setNewBarAreaName(e.target.value)}
                required
                autoFocus
                className="mt-1 w-full rounded-md border border-white/10 bg-[#16283F] px-2 py-1.5 text-sm text-[#EAF0FF]"
                placeholder="e.g. Main Bar"
              />
            </div>
            <div className="w-20">
              <label className="block text-xs text-[#EAF0FF]/60">Sort</label>
              <input
                type="number"
                value={newBarAreaSort}
                onChange={(e) => setNewBarAreaSort(Number(e.target.value))}
                min={0}
                className="mt-1 w-full rounded-md border border-white/10 bg-[#16283F] px-2 py-1.5 text-sm text-[#EAF0FF]"
              />
            </div>
            <button
              type="submit"
              disabled={createBarAreaMut.isPending}
              className="rounded-md bg-[#E9B44C] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#D4A43C] disabled:opacity-50"
            >
              {createBarAreaMut.isPending ? "Adding..." : "Add"}
            </button>
            <button
              type="button"
              onClick={() => { setAddingBarArea(false); setNewBarAreaName(""); }}
              className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-[#EAF0FF]/60 hover:bg-[#16283F]/60"
            >
              Cancel
            </button>
          </form>
        )}

        {barAreas.length === 0 && !addingBarArea && (
          <p className="text-sm text-[#EAF0FF]/40">No bar areas defined yet.</p>
        )}

        <div className="space-y-1">
          {barAreas.map((area) => {
            const isExpanded = expandedAreas.has(area.id);
            const isEditing = editingBarAreaId === area.id;

            return (
              <div key={area.id} className="rounded-md border border-white/10 bg-[#0B1623]">
                {isEditing ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      updateBarAreaMut.mutate({ id: area.id, name: editBarAreaName.trim(), sortOrder: editBarAreaSort });
                    }}
                    className="flex items-center gap-2 p-2"
                  >
                    <input
                      type="text"
                      value={editBarAreaName}
                      onChange={(e) => setEditBarAreaName(e.target.value)}
                      required
                      autoFocus
                      className="flex-1 rounded-md border border-white/10 bg-[#16283F] px-2 py-1 text-sm text-[#EAF0FF]"
                    />
                    <input
                      type="number"
                      value={editBarAreaSort}
                      onChange={(e) => setEditBarAreaSort(Number(e.target.value))}
                      min={0}
                      className="w-16 rounded-md border border-white/10 bg-[#16283F] px-2 py-1 text-sm text-[#EAF0FF]"
                    />
                    <button type="submit" disabled={updateBarAreaMut.isPending} className="text-sm text-[#E9B44C] hover:underline disabled:opacity-50">
                      {updateBarAreaMut.isPending ? "Saving..." : "Save"}
                    </button>
                    <button type="button" onClick={() => setEditingBarAreaId(null)} className="text-sm text-[#EAF0FF]/60 hover:underline">
                      Cancel
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center gap-2 p-2">
                    <button onClick={() => toggleArea(area.id)} className="text-[#EAF0FF]/60 hover:text-[#EAF0FF]">
                      {isExpanded ? "\u25BC" : "\u25B6"}
                    </button>
                    <span className="flex-1 text-sm font-medium text-[#EAF0FF]">{area.name}</span>
                    <span className="text-xs text-[#EAF0FF]/40">sort: {area.sortOrder}</span>
                    {canEdit && (
                      <button
                        onClick={() => { setEditingBarAreaId(area.id); setEditBarAreaName(area.name); setEditBarAreaSort(area.sortOrder); }}
                        className="text-sm text-[#E9B44C] hover:underline"
                      >
                        Edit
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => { if (confirm(`Delete bar area "${area.name}" and all its sub-areas?`)) deleteBarAreaMut.mutate({ id: area.id }); }}
                        className="text-sm text-red-400 hover:underline"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}

                {isExpanded && (
                  <div className="border-t border-white/5 pb-2 pl-8 pr-2">
                    {area.subAreas.map((sub) =>
                      editingSubAreaId === sub.id ? (
                        <form
                          key={sub.id}
                          onSubmit={(e) => {
                            e.preventDefault();
                            updateSubAreaMut.mutate({ id: sub.id, name: editSubAreaName.trim(), sortOrder: editSubAreaSort });
                          }}
                          className="flex items-center gap-2 py-1"
                        >
                          <span className="text-[#EAF0FF]/30">&mdash;</span>
                          <input
                            type="text"
                            value={editSubAreaName}
                            onChange={(e) => setEditSubAreaName(e.target.value)}
                            required
                            autoFocus
                            className="flex-1 rounded-md border border-white/10 bg-[#16283F] px-2 py-1 text-sm text-[#EAF0FF]"
                          />
                          <input
                            type="number"
                            value={editSubAreaSort}
                            onChange={(e) => setEditSubAreaSort(Number(e.target.value))}
                            min={0}
                            className="w-16 rounded-md border border-white/10 bg-[#16283F] px-2 py-1 text-sm text-[#EAF0FF]"
                          />
                          <button type="submit" disabled={updateSubAreaMut.isPending} className="text-sm text-[#E9B44C] hover:underline disabled:opacity-50">
                            {updateSubAreaMut.isPending ? "Saving..." : "Save"}
                          </button>
                          <button type="button" onClick={() => setEditingSubAreaId(null)} className="text-sm text-[#EAF0FF]/60 hover:underline">
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <div key={sub.id} className="flex items-center gap-2 py-1">
                          <span className="text-[#EAF0FF]/30">&mdash;</span>
                          <span className="flex-1 text-sm text-[#EAF0FF]/80">{sub.name}</span>
                          <span className="text-xs text-[#EAF0FF]/40">sort: {sub.sortOrder}</span>
                          {canEdit && (
                            <button
                              onClick={() => { setEditingSubAreaId(sub.id); setEditSubAreaName(sub.name); setEditSubAreaSort(sub.sortOrder); }}
                              className="text-sm text-[#E9B44C] hover:underline"
                            >
                              Edit
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => { if (confirm(`Delete sub-area "${sub.name}"?`)) deleteSubAreaMut.mutate({ id: sub.id }); }}
                              className="text-sm text-red-400 hover:underline"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )
                    )}

                    {canEdit && addingSubAreaFor === area.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          createSubAreaMut.mutate({ barAreaId: area.id, name: newSubAreaName.trim(), sortOrder: newSubAreaSort });
                        }}
                        className="mt-1 flex items-center gap-2"
                      >
                        <span className="text-[#EAF0FF]/30">&mdash;</span>
                        <input
                          type="text"
                          value={newSubAreaName}
                          onChange={(e) => setNewSubAreaName(e.target.value)}
                          required
                          autoFocus
                          className="flex-1 rounded-md border border-white/10 bg-[#16283F] px-2 py-1 text-sm text-[#EAF0FF]"
                          placeholder="e.g. Well, Top Shelf"
                        />
                        <input
                          type="number"
                          value={newSubAreaSort}
                          onChange={(e) => setNewSubAreaSort(Number(e.target.value))}
                          min={0}
                          className="w-16 rounded-md border border-white/10 bg-[#16283F] px-2 py-1 text-sm text-[#EAF0FF]"
                        />
                        <button type="submit" disabled={createSubAreaMut.isPending} className="text-sm text-[#E9B44C] hover:underline disabled:opacity-50">
                          {createSubAreaMut.isPending ? "Adding..." : "Add"}
                        </button>
                        <button type="button" onClick={() => { setAddingSubAreaFor(null); setNewSubAreaName(""); }} className="text-sm text-[#EAF0FF]/60 hover:underline">
                          Cancel
                        </button>
                      </form>
                    ) : canEdit ? (
                      <button
                        onClick={() => { setNewSubAreaSort(area.subAreas.length); setAddingSubAreaFor(area.id); }}
                        className="mt-1 flex items-center gap-2 text-sm text-[#E9B44C]/70 hover:text-[#E9B44C]"
                      >
                        <span className="text-[#EAF0FF]/30">&mdash;</span>
                        + Add Sub-Area
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tap Lines */}
      <div className="mt-4 rounded-lg border border-white/10 bg-[#16283F] p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Tap Lines</h2>
          {canEdit && !addingTap && (
            <button
              onClick={() => setAddingTap(true)}
              className="rounded-md bg-[#E9B44C] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#D4A43C]"
            >
              + Add Tap
            </button>
          )}
        </div>

        {tapDeleteError && (
          <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {tapDeleteError}
            <button onClick={() => setTapDeleteError(null)} className="ml-2 underline">Dismiss</button>
          </div>
        )}

        {addingTap && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createTapMut.mutate({
                locationId: id,
                name: newTapName.trim(),
                ...(newTapBarAreaId ? { barAreaId: newTapBarAreaId } : {}),
              });
            }}
            className="mb-3 flex items-end gap-2 rounded-md border border-white/10 bg-[#0B1623] p-3"
          >
            <div className="flex-1">
              <label className="block text-xs text-[#EAF0FF]/60">Name</label>
              <input
                type="text"
                value={newTapName}
                onChange={(e) => setNewTapName(e.target.value)}
                required
                autoFocus
                className="mt-1 w-full rounded-md border border-white/10 bg-[#16283F] px-2 py-1.5 text-sm text-[#EAF0FF]"
                placeholder="e.g. Tap 1"
              />
            </div>
            <div className="w-40">
              <label className="block text-xs text-[#EAF0FF]/60">Bar Area</label>
              <select
                value={newTapBarAreaId}
                onChange={(e) => setNewTapBarAreaId(e.target.value)}
                className="mt-1 w-full rounded-md border border-white/10 bg-[#16283F] px-2 py-1.5 text-sm text-[#EAF0FF]"
              >
                <option value="">None</option>
                {barAreas.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={createTapMut.isPending}
              className="rounded-md bg-[#E9B44C] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#D4A43C] disabled:opacity-50"
            >
              {createTapMut.isPending ? "Adding..." : "Add"}
            </button>
            <button
              type="button"
              onClick={() => { setAddingTap(false); setNewTapName(""); setNewTapBarAreaId(""); }}
              className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-[#EAF0FF]/60 hover:bg-[#16283F]/60"
            >
              Cancel
            </button>
          </form>
        )}

        {tapLines.length === 0 && !addingTap && (
          <p className="text-sm text-[#EAF0FF]/40">No tap lines defined yet.</p>
        )}

        {tapLines.length > 0 && (() => {
          const grouped = new Map<string, { name: string; taps: typeof tapLines }>();
          for (const tap of tapLines) {
            const key = tap.barAreaId ?? "__unassigned__";
            const groupName = tap.barArea?.name ?? "Unassigned";
            if (!grouped.has(key)) grouped.set(key, { name: groupName, taps: [] });
            grouped.get(key)!.taps.push(tap);
          }
          // Sort: named areas first (alphabetical), "Unassigned" last
          const entries = [...grouped.entries()].sort(([a], [b]) => {
            if (a === "__unassigned__") return 1;
            if (b === "__unassigned__") return -1;
            return grouped.get(a)!.name.localeCompare(grouped.get(b)!.name);
          });

          return (
            <div className="space-y-3">
              {entries.map(([groupKey, { name: groupName, taps }]) => (
                <div key={groupKey}>
                  <h3 className="mb-1 text-sm font-medium text-[#EAF0FF]/60">{groupName}</h3>
                  <div className="space-y-1">
                    {taps.map((tap) => {
                      const activeAssignment = tap.tapAssignments[0];
                      const kegName = activeAssignment?.kegInstance?.inventoryItem?.name;
                      const isEditing = editingTapId === tap.id;

                      if (isEditing) {
                        return (
                          <form
                            key={tap.id}
                            onSubmit={(e) => {
                              e.preventDefault();
                              updateTapMut.mutate({
                                id: tap.id,
                                name: editTapName.trim(),
                                barAreaId: editTapBarAreaId || null,
                              });
                            }}
                            className="flex items-center gap-2 rounded-md border border-white/10 bg-[#0B1623] p-2"
                          >
                            <input
                              type="text"
                              value={editTapName}
                              onChange={(e) => setEditTapName(e.target.value)}
                              required
                              autoFocus
                              className="flex-1 rounded-md border border-white/10 bg-[#16283F] px-2 py-1 text-sm text-[#EAF0FF]"
                            />
                            <select
                              value={editTapBarAreaId}
                              onChange={(e) => setEditTapBarAreaId(e.target.value)}
                              className="w-36 rounded-md border border-white/10 bg-[#16283F] px-2 py-1 text-sm text-[#EAF0FF]"
                            >
                              <option value="">None</option>
                              {barAreas.map((a) => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                              ))}
                            </select>
                            <button type="submit" disabled={updateTapMut.isPending} className="text-sm text-[#E9B44C] hover:underline disabled:opacity-50">
                              {updateTapMut.isPending ? "Saving..." : "Save"}
                            </button>
                            <button type="button" onClick={() => setEditingTapId(null)} className="text-sm text-[#EAF0FF]/60 hover:underline">
                              Cancel
                            </button>
                          </form>
                        );
                      }

                      return (
                        <div key={tap.id} className="flex items-center gap-2 rounded-md border border-white/10 bg-[#0B1623] p-2">
                          <span className="flex-1 text-sm text-[#EAF0FF]">
                            {tap.name}
                            {kegName && (
                              <span className="ml-2 text-[#EAF0FF]/50">— {kegName} (keg)</span>
                            )}
                          </span>
                          {canEdit && (
                            <button
                              onClick={() => {
                                setEditingTapId(tap.id);
                                setEditTapName(tap.name);
                                setEditTapBarAreaId(tap.barAreaId ?? "");
                              }}
                              className="text-sm text-[#E9B44C] hover:underline"
                            >
                              Edit
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => { if (confirm(`Delete tap line "${tap.name}"?`)) deleteTapMut.mutate({ id: tap.id }); }}
                              className="text-sm text-red-400 hover:underline"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Pour Profiles */}
      <div className="mt-4 rounded-lg border border-white/10 bg-[#16283F] p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Pour Profiles
            {pourProfiles.length > 0 && (
              <span className="ml-2 text-sm font-normal text-[#EAF0FF]/40">({pourProfiles.length})</span>
            )}
          </h2>
          {canEdit && !addingProfile && (
            <button
              onClick={() => setAddingProfile(true)}
              className="rounded-md bg-[#E9B44C] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#D4A43C]"
            >
              + Add Profile
            </button>
          )}
        </div>

        {profileError && (
          <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {profileError}
            <button onClick={() => setProfileError(null)} className="ml-2 underline">Dismiss</button>
          </div>
        )}

        {addingProfile && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createProfileMut.mutate({
                locationId: id,
                name: newProfileName.trim(),
                oz: parseFloat(newProfileOz),
              });
            }}
            className="mb-3 flex items-end gap-2 rounded-md border border-white/10 bg-[#0B1623] p-3"
          >
            <div className="flex-1">
              <label className="block text-xs text-[#EAF0FF]/60">Name</label>
              <input
                type="text"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                required
                autoFocus
                className="mt-1 w-full rounded-md border border-white/10 bg-[#16283F] px-2 py-1.5 text-sm text-[#EAF0FF]"
                placeholder="e.g. 16oz Pint"
              />
            </div>
            <div className="w-24">
              <label className="block text-xs text-[#EAF0FF]/60">Size (oz)</label>
              <input
                type="number"
                value={newProfileOz}
                onChange={(e) => setNewProfileOz(e.target.value)}
                required
                min="0.1"
                step="any"
                className="mt-1 w-full rounded-md border border-white/10 bg-[#16283F] px-2 py-1.5 text-sm text-[#EAF0FF]"
              />
            </div>
            <button
              type="submit"
              disabled={createProfileMut.isPending}
              className="rounded-md bg-[#E9B44C] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#D4A43C] disabled:opacity-50"
            >
              {createProfileMut.isPending ? "Adding..." : "Add"}
            </button>
            <button
              type="button"
              onClick={() => { setAddingProfile(false); setNewProfileName(""); setNewProfileOz(""); }}
              className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-[#EAF0FF]/60 hover:bg-[#16283F]/60"
            >
              Cancel
            </button>
          </form>
        )}

        {pourProfiles.length === 0 && !addingProfile && (
          <p className="text-sm text-[#EAF0FF]/40">No pour profiles defined yet.</p>
        )}

        <div className="space-y-1">
          {pourProfiles.map((profile) => {
            const isEditing = editingProfileId === profile.id;

            if (isEditing) {
              return (
                <form
                  key={profile.id}
                  onSubmit={(e) => {
                    e.preventDefault();
                    updateProfileMut.mutate({
                      id: profile.id,
                      name: editProfileName.trim(),
                      oz: parseFloat(editProfileOz),
                    });
                  }}
                  className="flex items-center gap-2 rounded-md border border-white/10 bg-[#0B1623] p-2"
                >
                  <input
                    type="text"
                    value={editProfileName}
                    onChange={(e) => setEditProfileName(e.target.value)}
                    required
                    autoFocus
                    className="flex-1 rounded-md border border-white/10 bg-[#16283F] px-2 py-1 text-sm text-[#EAF0FF]"
                  />
                  <input
                    type="number"
                    value={editProfileOz}
                    onChange={(e) => setEditProfileOz(e.target.value)}
                    required
                    min="0.1"
                    step="any"
                    className="w-20 rounded-md border border-white/10 bg-[#16283F] px-2 py-1 text-sm text-[#EAF0FF]"
                  />
                  <button type="submit" disabled={updateProfileMut.isPending} className="text-sm text-[#E9B44C] hover:underline disabled:opacity-50">
                    {updateProfileMut.isPending ? "Saving..." : "Save"}
                  </button>
                  <button type="button" onClick={() => setEditingProfileId(null)} className="text-sm text-[#EAF0FF]/60 hover:underline">
                    Cancel
                  </button>
                </form>
              );
            }

            return (
              <div key={profile.id} className="flex items-center gap-2 rounded-md border border-white/10 bg-[#0B1623] p-2">
                <span className={`flex-1 text-sm ${profile.active ? "text-[#EAF0FF]" : "text-[#EAF0FF]/40 line-through"}`}>
                  {profile.name} ({Number(profile.oz)}oz)
                </span>
                {canEdit && (
                  <button
                    onClick={() => {
                      setEditingProfileId(profile.id);
                      setEditProfileName(profile.name);
                      setEditProfileOz(String(Number(profile.oz)));
                    }}
                    className="text-sm text-[#E9B44C] hover:underline"
                  >
                    Edit
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => { if (confirm(`Delete pour profile "${profile.name}"?`)) deleteProfileMut.mutate({ id: profile.id }); }}
                    className="text-sm text-red-400 hover:underline"
                  >
                    Delete
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Archive Location */}
      {canDelete && !isArchived && (
        <div className="mt-8 rounded-lg border border-red-500/20 bg-red-500/5 p-5">
          <h2 className="text-lg font-semibold text-red-400">Danger Zone</h2>
          <p className="mt-1 text-sm text-[#EAF0FF]/60">
            Archiving hides this location and all its data from active views. Data is preserved and can be restored.
          </p>
          {!showArchiveConfirm ? (
            <button
              onClick={() => setShowArchiveConfirm(true)}
              className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20"
            >
              Archive Location
            </button>
          ) : (
            <div className="mt-3 rounded-md border border-red-500/30 bg-[#0B1623] p-4">
              <h3 className="font-medium text-red-400">
                Archive &ldquo;{location.name}&rdquo;?
              </h3>
              <p className="mt-1 text-sm text-[#EAF0FF]/60">
                This will hide the location and all its data from active views. Data is preserved and can be restored.
              </p>

              {summaryLoading ? (
                <p className="mt-3 text-sm text-[#EAF0FF]/40">Loading summary...</p>
              ) : archiveSummary ? (
                <ul className="mt-3 space-y-1 text-sm text-[#EAF0FF]/70">
                  {archiveSummary.inventoryItems > 0 && <li>{archiveSummary.inventoryItems} inventory items</li>}
                  {archiveSummary.inventorySessions > 0 && <li>{archiveSummary.inventorySessions} counting sessions</li>}
                  {archiveSummary.consumptionEvents > 0 && <li>{archiveSummary.consumptionEvents} consumption events (ledger)</li>}
                  {archiveSummary.salesLines > 0 && <li>{archiveSummary.salesLines} sales lines</li>}
                  {archiveSummary.purchaseOrders > 0 && <li>{archiveSummary.purchaseOrders} purchase orders</li>}
                  {archiveSummary.recipes > 0 && <li>{archiveSummary.recipes} recipes</li>}
                  {archiveSummary.parLevels > 0 && <li>{archiveSummary.parLevels} par levels</li>}
                  {archiveSummary.barAreas > 0 && <li>{archiveSummary.barAreas} bar areas</li>}
                  {archiveSummary.tapLines > 0 && <li>{archiveSummary.tapLines} tap lines</li>}
                  {archiveSummary.kegInstances > 0 && <li>{archiveSummary.kegInstances} keg instances</li>}
                  {archiveSummary.scaleProfiles > 0 && <li>{archiveSummary.scaleProfiles} scale profiles</li>}
                  {archiveSummary.posConnections > 0 && <li>{archiveSummary.posConnections} POS connections</li>}
                  {archiveSummary.guideCategories > 0 && <li>{archiveSummary.guideCategories} menu categories</li>}
                  {archiveSummary.guideItems > 0 && <li>{archiveSummary.guideItems} menu items</li>}
                  {archiveSummary.primaryUsers > 0 && (
                    <li className="text-amber-400">
                      {archiveSummary.primaryUsers} users with this as primary location (will need reassignment)
                    </li>
                  )}
                </ul>
              ) : null}

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => archiveMutation.mutate({ locationId: id })}
                  disabled={archiveMutation.isPending}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {archiveMutation.isPending ? "Archiving..." : "Confirm Archive"}
                </button>
                <button
                  onClick={() => setShowArchiveConfirm(false)}
                  className="rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-[#EAF0FF]/80 hover:bg-[#16283F]/60"
                >
                  Cancel
                </button>
              </div>
              {archiveMutation.error && (
                <p className="mt-2 text-sm text-red-400">{archiveMutation.error.message}</p>
              )}
            </div>
          )}
        </div>
      )}
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
