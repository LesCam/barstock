"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";

function formatRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function BusinessDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as any;
  const utils = trpc.useUtils();

  if (user && user.highestRole !== "platform_admin") {
    router.replace("/");
    return null;
  }

  const { data: business, isLoading } = trpc.businesses.getById.useQuery(
    { businessId: id },
    { enabled: !!user && !!id }
  );

  if (isLoading) return <p className="text-gray-500">Loading...</p>;
  if (!business) return <p className="text-gray-500">Business not found.</p>;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/businesses")}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Back
        </button>
        <h1 className="text-2xl font-bold text-gray-900">{business.name}</h1>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            business.active !== false
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {business.active !== false ? "Active" : "Archived"}
        </span>
      </div>

      <EditBusinessSection business={business} />
      <LocationsSection locations={business.locations ?? []} />
      <UsersSection
        businessId={id}
        locations={business.locations ?? []}
      />
    </div>
  );
}

// ─── Section 1: Edit Business Info ────────────────────────────

function EditBusinessSection({ business }: { business: any }) {
  const utils = trpc.useUtils();
  const [name, setName] = useState(business.name);
  const [slug, setSlug] = useState(business.slug);
  const [contactEmail, setContactEmail] = useState(business.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(business.contactPhone ?? "");
  const [address, setAddress] = useState(business.address ?? "");
  const [saved, setSaved] = useState(false);

  const updateMutation = trpc.businesses.update.useMutation({
    onSuccess: () => {
      utils.businesses.getById.invalidate({ businessId: business.id });
      utils.businesses.list.invalidate();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const toggleMutation = trpc.businesses.update.useMutation({
    onSuccess: () => {
      utils.businesses.getById.invalidate({ businessId: business.id });
      utils.businesses.list.invalidate();
    },
  });

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updateMutation.mutate({
      businessId: business.id,
      name,
      slug,
      contactEmail: contactEmail || null,
      contactPhone: contactPhone || null,
      address: address || null,
    });
  }

  return (
    <section className="rounded-lg border bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">
        Business Info
      </h2>
      <form onSubmit={handleSave} className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Slug
          </label>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Contact Email
          </label>
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Contact Phone
          </label>
          <input
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Address
          </label>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={2}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
        <div className="col-span-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </button>
          {saved && (
            <span className="text-sm text-green-600">Saved!</span>
          )}
          <div className="ml-auto">
            <button
              type="button"
              onClick={() =>
                toggleMutation.mutate({
                  businessId: business.id,
                  active: business.active === false,
                })
              }
              disabled={toggleMutation.isPending}
              className={`rounded-md px-4 py-2 text-sm font-medium ${
                business.active !== false
                  ? "border border-red-300 text-red-700 hover:bg-red-50"
                  : "border border-green-300 text-green-700 hover:bg-green-50"
              }`}
            >
              {business.active !== false ? "Archive" : "Activate"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

// ─── Section 2: Locations ─────────────────────────────────────

function LocationsSection({ locations }: { locations: any[] }) {
  return (
    <section className="rounded-lg border bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Locations</h2>
      {locations.length === 0 ? (
        <p className="text-sm text-gray-500">No locations yet.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs font-medium uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Timezone</th>
              <th className="px-4 py-2">Closeout Hour</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {locations.map((loc: any) => (
              <tr key={loc.id} className="hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link
                    href={`/locations/${loc.id}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {loc.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-gray-500">{loc.timezone}</td>
                <td className="px-4 py-2 text-gray-500">
                  {loc.closeoutHour}:00
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ─── Section 3: Users ─────────────────────────────────────────

function UsersSection({
  businessId,
  locations,
}: {
  businessId: string;
  locations: any[];
}) {
  const utils = trpc.useUtils();
  const [activeOnly, setActiveOnly] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  const { data: users, isLoading } = trpc.users.listByBusiness.useQuery({
    businessId,
    activeOnly,
  });

  const deactivateMutation = trpc.users.deactivate.useMutation({
    onSuccess: () => utils.users.listByBusiness.invalidate({ businessId }),
  });

  return (
    <section className="rounded-lg border bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Users</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveOnly(!activeOnly)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              activeOnly
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            {activeOnly ? "Active Only" : "All"}
          </button>
          {locations.length > 0 && (
            <button
              onClick={() => setShowInvite(!showInvite)}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              {showInvite ? "Cancel" : "Invite User"}
            </button>
          )}
        </div>
      </div>

      {showInvite && locations.length > 0 && (
        <InviteUserForm
          businessId={businessId}
          locations={locations}
          onDone={() => {
            setShowInvite(false);
            utils.users.listByBusiness.invalidate({ businessId });
          }}
        />
      )}

      {locations.length === 0 && (
        <p className="mb-4 text-sm text-amber-600">
          Add a location first before inviting users.
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading users...</p>
      ) : !users?.length ? (
        <p className="text-sm text-gray-500">No users found.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs font-medium uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Location</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((u: any) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2">
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                    {formatRole(u.role)}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-500">
                  {u.location?.name ?? "—"}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      u.isActive
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {u.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {u.isActive && (
                    <button
                      onClick={() =>
                        deactivateMutation.mutate({ userId: u.id })
                      }
                      disabled={deactivateMutation.isPending}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Deactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ─── Invite User Form ────────────────────────────────────────

const ASSIGNABLE_ROLES = [
  "business_admin",
  "manager",
  "curator",
  "staff",
  "accounting",
] as const;

function InviteUserForm({
  businessId,
  locations,
  onDone,
}: {
  businessId: string;
  locations: any[];
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("staff");
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [error, setError] = useState("");

  const createMutation = trpc.users.create.useMutation({
    onSuccess: () => onDone(),
    onError: (err) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    createMutation.mutate({
      email,
      password,
      role: role as any,
      businessId,
      locationId,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 rounded-md border bg-gray-50 p-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Temp Password (min 8)
          </label>
          <input
            type="text"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Role
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded-md border px-3 py-1.5 text-sm"
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {formatRole(r)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Primary Location
          </label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="w-full rounded-md border px-3 py-1.5 text-sm"
          >
            {locations.map((loc: any) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3">
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {createMutation.isPending ? "Creating..." : "Create User"}
        </button>
      </div>
    </form>
  );
}
