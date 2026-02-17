"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";

const ROLES = [
  { value: "staff", label: "Staff" },
  { value: "manager", label: "Manager" },
  { value: "curator", label: "Curator" },
  { value: "accounting", label: "Accounting" },
  { value: "business_admin", label: "Business Admin" },
] as const;

function stripPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits || null;
}

function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "—";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)})${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === "1") {
    return `(${digits.slice(1, 4)})${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw;
}

function formatPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)})${digits.slice(3)}`;
  return `(${digits.slice(0, 3)})${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function formatRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ── Invite Staff Form ─────────────────────────────────────────

function InviteStaffForm({
  businessId,
  locations,
  onSuccess,
}: {
  businessId: string;
  locations: { id: string; name: string }[];
  onSuccess: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<string>("staff");
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>(
    locations[0] ? [locations[0].id] : []
  );

  const grantMutation = trpc.auth.grantLocationAccess.useMutation();
  const createMutation = trpc.auth.createUser.useMutation({
    onSuccess: async (newUser) => {
      // Grant additional locations beyond the primary
      const extras = selectedLocationIds.slice(1);
      for (const locId of extras) {
        await grantMutation.mutateAsync({
          userId: newUser.id,
          locationId: locId,
          role: role as any,
        });
      }
      setFirstName("");
      setLastName("");
      setEmail("");
      setPassword("");
      setPhone("");
      setRole("staff");
      setSelectedLocationIds(locations[0] ? [locations[0].id] : []);
      onSuccess();
    },
  });

  function toggleLocation(locId: string) {
    setSelectedLocationIds((prev) =>
      prev.includes(locId) ? prev.filter((id) => id !== locId) : [...prev, locId]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password || selectedLocationIds.length === 0) return;
    createMutation.mutate({
      email,
      password,
      role: role as any,
      locationId: selectedLocationIds[0],
      businessId,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      phone: stripPhone(phone) ?? undefined,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-[#E9B44C]/30 bg-[#16283F] p-5"
    >
      <h3 className="mb-4 font-semibold text-[#EAF0FF]">Invite New Staff</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-[#EAF0FF]/80">First Name</label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
            placeholder="John"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[#EAF0FF]/80">Last Name</label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
            placeholder="Doe"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[#EAF0FF]/80">
            Email <span className="text-red-400">*</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
            placeholder="john@example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[#EAF0FF]/80">
            Password <span className="text-red-400">*</span>
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
            placeholder="Min 8 characters"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[#EAF0FF]/80">Phone</label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
            className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
            placeholder="(555)555-5555"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[#EAF0FF]/80">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-[#EAF0FF]/80">
            Locations <span className="text-red-400">*</span>
          </label>
          <div className="mt-1 space-y-1 rounded-md border border-white/10 bg-[#0B1623] p-2">
            {locations.map((loc) => (
              <label
                key={loc.id}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-[#EAF0FF] hover:bg-white/5 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedLocationIds.includes(loc.id)}
                  onChange={() => toggleLocation(loc.id)}
                  className="rounded border-white/10 bg-[#0B1623]"
                />
                {loc.name}
                {selectedLocationIds[0] === loc.id && selectedLocationIds.includes(loc.id) && (
                  <span className="text-xs text-[#E9B44C]">Primary</span>
                )}
              </label>
            ))}
          </div>
          {selectedLocationIds.length === 0 && (
            <p className="mt-1 text-xs text-red-400">Select at least one location.</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
        >
          {createMutation.isPending ? "Creating..." : "Create Staff Member"}
        </button>
        {createMutation.error && (
          <p className="text-sm text-red-400">{createMutation.error.message}</p>
        )}
      </div>
    </form>
  );
}

// ── Location Access Section ───────────────────────────────────

function LocationAccessSection({
  userId,
  primaryLocationId,
  userLocations,
  allLocations,
  userRole,
  onUpdated,
}: {
  userId: string;
  primaryLocationId: string;
  userLocations: { locationId: string; role: string; location: { id: string; name: string } }[];
  allLocations: { id: string; name: string }[];
  userRole: string;
  onUpdated: () => void;
}) {
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [switchingPrimary, setSwitchingPrimary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grantMutation = trpc.auth.grantLocationAccess.useMutation();
  const revokeMutation = trpc.auth.revokeLocationAccess.useMutation();
  const switchPrimaryMutation = trpc.auth.switchPrimaryLocation.useMutation();

  const grantedIds = new Set(userLocations.map((ul) => ul.locationId));

  async function toggleLocation(locId: string) {
    if (pendingIds.has(locId)) return;
    setError(null);
    setPendingIds((prev) => new Set(prev).add(locId));
    try {
      if (grantedIds.has(locId)) {
        await revokeMutation.mutateAsync({ userId, locationId: locId });
      } else {
        await grantMutation.mutateAsync({ userId, locationId: locId, role: userRole as any });
      }
      onUpdated();
    } catch (e: any) {
      setError(e.message ?? "Failed to update location access");
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(locId);
        return next;
      });
    }
  }

  async function switchPrimary(newPrimaryId: string) {
    if (switchingPrimary || newPrimaryId === primaryLocationId) return;
    setError(null);
    setSwitchingPrimary(true);
    try {
      await switchPrimaryMutation.mutateAsync({ userId, newPrimaryId });
      onUpdated();
    } catch (e: any) {
      setError(e.message ?? "Failed to switch primary location");
    } finally {
      setSwitchingPrimary(false);
    }
  }

  return (
    <div className="mt-4">
      <h4 className="text-sm font-semibold text-[#EAF0FF]/80">Location Access</h4>
      <div className="mt-2 space-y-1 rounded-md border border-white/10 bg-[#0B1623] p-2">
        {allLocations.map((loc) => {
          const isPrimary = loc.id === primaryLocationId;
          const hasAccess = isPrimary || grantedIds.has(loc.id);
          const pending = pendingIds.has(loc.id);
          return (
            <div
              key={loc.id}
              className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm text-[#EAF0FF] ${
                isPrimary ? "" : "hover:bg-white/5"
              }`}
            >
              <label className="flex items-center gap-2 flex-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasAccess}
                  disabled={isPrimary || pending || switchingPrimary}
                  onChange={() => toggleLocation(loc.id)}
                  className="rounded border-white/10 bg-[#0B1623]"
                />
                {loc.name}
              </label>
              {isPrimary && (
                <span className="rounded-full bg-[#E9B44C]/15 px-2 py-0.5 text-xs text-[#E9B44C]">Primary</span>
              )}
              {!isPrimary && hasAccess && !pending && !switchingPrimary && (
                <button
                  type="button"
                  onClick={() => switchPrimary(loc.id)}
                  className="rounded px-1.5 py-0.5 text-xs text-[#EAF0FF]/40 hover:bg-white/5 hover:text-[#E9B44C]"
                >
                  Set primary
                </button>
              )}
              {pending && (
                <span className="text-xs text-[#EAF0FF]/40">...</span>
              )}
            </div>
          );
        })}
      </div>
      {switchingPrimary && <p className="mt-1 text-xs text-[#EAF0FF]/40">Switching primary...</p>}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

// ── Edit Staff Modal ──────────────────────────────────────────

function EditStaffModal({
  userId,
  allLocations,
  onClose,
  onUpdated,
}: {
  userId: string;
  allLocations: { id: string; name: string }[];
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { data: user, isLoading } = trpc.auth.getUserDetail.useQuery({ userId });
  const [firstName, setFirstName] = useState<string | undefined>();
  const [lastName, setLastName] = useState<string | undefined>();
  const [phone, setPhone] = useState<string | undefined>();
  const [role, setRole] = useState<string | undefined>();
  const [isActive, setIsActive] = useState<boolean | undefined>();

  const loaded = user && firstName === undefined;
  if (loaded) {
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
    setPhone(formatPhoneInput(user.phone ?? ""));
    setRole(user.role);
    setIsActive(user.isActive);
  }

  const updateMutation = trpc.auth.updateUser.useMutation({
    onSuccess: () => {
      onUpdated();
      onClose();
    },
  });

  function handleSave() {
    if (!user) return;
    updateMutation.mutate({
      userId: user.id,
      role: role as any,
      firstName: firstName || null,
      lastName: lastName || null,
      phone: stripPhone(phone),
      isActive,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-lg border border-white/10 bg-[#16283F] p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#EAF0FF]">Edit Staff Member</h2>
          <button onClick={onClose} className="text-[#EAF0FF]/40 hover:text-[#EAF0FF]">
            &#x2715;
          </button>
        </div>

        {isLoading || !user ? (
          <p className="text-[#EAF0FF]/60">Loading...</p>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-[#EAF0FF]/80">First Name</label>
                <input
                  type="text"
                  value={firstName ?? ""}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#EAF0FF]/80">Last Name</label>
                <input
                  type="text"
                  value={lastName ?? ""}
                  onChange={(e) => setLastName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#EAF0FF]/80">Email</label>
                <input
                  type="text"
                  value={user.email}
                  disabled
                  className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623]/50 px-3 py-2 text-sm text-[#EAF0FF]/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#EAF0FF]/80">Phone</label>
                <input
                  type="text"
                  value={phone ?? ""}
                  onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                  placeholder="(555)555-5555"
                  className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#EAF0FF]/80">Role</label>
                <select
                  value={role ?? "staff"}
                  onChange={(e) => setRole(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-[#EAF0FF]/80">
                  <input
                    type="checkbox"
                    checked={isActive ?? true}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded border-white/10 bg-[#0B1623]"
                  />
                  Active
                </label>
              </div>
            </div>

            <LocationAccessSection
              userId={user.id}
              primaryLocationId={user.locationId}
              userLocations={user.userLocations}
              allLocations={allLocations}
              userRole={role ?? user.role}
              onUpdated={onUpdated}
            />

            <div className="mt-4 flex items-center gap-3 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={handleSave}
                disabled={updateMutation.isPending}
                className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-4 py-2 text-sm text-[#EAF0FF]/60 hover:text-[#EAF0FF]"
              >
                Cancel
              </button>
              {updateMutation.error && (
                <p className="text-sm text-red-400">{updateMutation.error.message}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Staff Table ───────────────────────────────────────────────

function StaffTable({
  users,
  onEdit,
}: {
  users: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    role: string;
    isActive: boolean;
    location: { name: string };
    userLocations: { locationId: string; role: string; location: { name: string } }[];
  }[];
  onEdit: (userId: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
          <tr>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Locations</th>
            <th className="px-4 py-3">Phone</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {users.map((u) => (
            <tr key={u.id} className="hover:bg-[#0B1623]/40">
              <td className="px-4 py-3 text-[#EAF0FF]">
                {u.firstName || u.lastName
                  ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim()
                  : "—"}
              </td>
              <td className="px-4 py-3 text-[#EAF0FF]/80">{u.email}</td>
              <td className="px-4 py-3">
                <span className="rounded-full bg-[#E9B44C]/10 px-2 py-0.5 text-xs font-medium text-[#E9B44C]">
                  {formatRole(u.role)}
                </span>
              </td>
              <td className="px-4 py-3 text-[#EAF0FF]/70">
                <div className="flex flex-wrap gap-1">
                  <span className="rounded bg-white/5 px-1.5 py-0.5 text-xs">
                    {u.location.name}
                  </span>
                  {u.userLocations.map((ul) => (
                    <span key={ul.locationId} className="rounded bg-white/5 px-1.5 py-0.5 text-xs">
                      {ul.location.name}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3 text-[#EAF0FF]/70">{formatPhone(u.phone)}</td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    u.isActive
                      ? "bg-green-500/10 text-green-400"
                      : "bg-white/5 text-[#EAF0FF]/40"
                  }`}
                >
                  {u.isActive ? "Active" : "Inactive"}
                </span>
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => onEdit(u.id)}
                  className="text-xs font-medium text-[#E9B44C] hover:text-[#C8922E]"
                >
                  Edit
                </button>
              </td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-[#EAF0FF]/40">
                No staff members found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function StaffPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const businessId = user?.businessId;

  const [showInvite, setShowInvite] = useState(false);
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [editUserId, setEditUserId] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: users, isLoading } = trpc.auth.listUsers.useQuery(
    { search: search || undefined, activeOnly: activeOnly || undefined },
    { enabled: !!businessId }
  );

  const { data: locations } = trpc.locations.listByBusiness.useQuery(
    { businessId: businessId! },
    { enabled: !!businessId }
  );

  function invalidateAll() {
    utils.auth.listUsers.invalidate();
    utils.auth.getUserDetail.invalidate();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#EAF0FF]">Staff Management</h1>
        <button
          onClick={() => setShowInvite(!showInvite)}
          className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E]"
        >
          {showInvite ? "Cancel" : "+ Invite Staff"}
        </button>
      </div>

      {showInvite && locations && (
        <div className="mb-6">
          <InviteStaffForm
            businessId={businessId}
            locations={locations}
            onSuccess={() => {
              invalidateAll();
              setShowInvite(false);
            }}
          />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder-[#EAF0FF]/30"
        />
        <div className="flex rounded-md border border-white/10 overflow-hidden">
          <button
            onClick={() => setActiveOnly(true)}
            className={`px-3 py-1.5 text-xs font-medium ${
              activeOnly
                ? "bg-[#E9B44C]/20 text-[#E9B44C]"
                : "bg-[#0B1623] text-[#EAF0FF]/50 hover:text-[#EAF0FF]"
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setActiveOnly(false)}
            className={`px-3 py-1.5 text-xs font-medium ${
              !activeOnly
                ? "bg-[#E9B44C]/20 text-[#E9B44C]"
                : "bg-[#0B1623] text-[#EAF0FF]/50 hover:text-[#EAF0FF]"
            }`}
          >
            All
          </button>
        </div>
        {isLoading && <span className="text-xs text-[#EAF0FF]/40">Loading...</span>}
      </div>

      <StaffTable users={users ?? []} onEdit={(id) => setEditUserId(id)} />

      {editUserId && locations && (
        <EditStaffModal
          userId={editUserId}
          allLocations={locations}
          onClose={() => setEditUserId(null)}
          onUpdated={invalidateAll}
        />
      )}
    </div>
  );
}
