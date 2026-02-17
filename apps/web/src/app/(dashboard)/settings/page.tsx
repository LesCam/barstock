"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";

const ADMIN_ROLES = ["platform_admin", "business_admin"];

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)})${digits.slice(3)}`;
  return `(${digits.slice(0, 3)})${digits.slice(3, 6)}-${digits.slice(6)}`;
}

const CAPABILITY_LABELS: Record<string, string> = {
  artSalesEnabled: "Art Sales Enabled",
  staffArtEntryMode: "Staff Art Entry Mode",
  curatorArtOnlyLockdown: "Curator Art-Only Lockdown",
  staffPaymentConfirm: "Staff Payment Confirm",
  discountApprovalRule: "Discount Approval Rule",
  directToArtistAllowed: "Direct-to-Artist Allowed",
  proofPhotoRequired: "Proof Photo Required",
};

export default function SettingsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const businessId = user?.businessId as string | undefined;
  const canEdit = ADMIN_ROLES.includes(user?.highestRole ?? "");

  if (!businessId) {
    return <div className="text-gray-500">No business selected.</div>;
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      <BusinessProfileSection businessId={businessId} canEdit={canEdit} />
      <CapabilityTogglesSection businessId={businessId} canEdit={canEdit} />
    </div>
  );
}

function BusinessProfileSection({ businessId, canEdit }: { businessId: string; canEdit: boolean }) {
  const { data: business } = trpc.businesses.getById.useQuery({ businessId });
  const utils = trpc.useUtils();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");

  useEffect(() => {
    if (business) {
      setName(business.name);
      setContactEmail(business.contactEmail ?? "");
      setContactPhone(business.contactPhone ?? "");
      const parts = (business.address ?? "").split(" | ");
      setStreet(parts[0] ?? "");
      setCity(parts[1] ?? "");
      setProvince(parts[2] ?? "");
      setPostalCode(parts[3] ?? "");
    }
  }, [business]);

  const updateMutation = trpc.businesses.update.useMutation({
    onSuccess: () => {
      utils.businesses.getById.invalidate({ businessId });
      setEditing(false);
    },
  });

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updateMutation.mutate({
      businessId,
      name: name.trim(),
      contactEmail: contactEmail.trim() || null,
      contactPhone: contactPhone.trim() || null,
      address: [street, city, province, postalCode].some((s) => s.trim())
        ? [street.trim(), city.trim(), province.trim(), postalCode.trim()].join(" | ")
        : null,
    });
  }

  if (!business) return <div className="text-gray-500">Loading business profile...</div>;

  return (
    <div className="rounded-lg border bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Business Profile</h2>
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
            <label className="block text-sm font-medium text-gray-700">Slug</label>
            <p className="mt-1 font-mono text-sm text-gray-500">{business.slug}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Contact Email</label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm sm:w-1/2"
              placeholder="contact@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Contact Phone</label>
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(formatPhone(e.target.value))}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm sm:w-1/2"
              placeholder="(555)555-5555"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Street Address</label>
            <input
              type="text"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm sm:w-1/2"
              placeholder="123 Main St"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Montreal"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Province / State</label>
              <input
                type="text"
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="QC"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Postal / ZIP Code</label>
              <input
                type="text"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="H2X 1Y4"
              />
            </div>
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
                setName(business.name);
                setContactEmail(business.contactEmail ?? "");
                setContactPhone(business.contactPhone ?? "");
                const parts = (business.address ?? "").split(" | ");
                setStreet(parts[0] ?? "");
                setCity(parts[1] ?? "");
                setProvince(parts[2] ?? "");
                setPostalCode(parts[3] ?? "");
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
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">Name</dt>
            <dd className="font-medium">{business.name}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Slug</dt>
            <dd className="font-mono">{business.slug}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Contact Email</dt>
            <dd className="font-medium">{business.contactEmail ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Contact Phone</dt>
            <dd className="font-medium">{business.contactPhone ? formatPhone(business.contactPhone) : "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-gray-500">Address</dt>
            {(() => {
              const parts = (business.address ?? "").split(" | ").filter(Boolean);
              if (!parts.length) return <dd className="font-medium">—</dd>;
              return (
                <dd className="font-medium">
                  {parts[0]}<br />
                  {[parts[1], parts[2]].filter(Boolean).join(", ")}{parts[3] ? `  ${parts[3]}` : ""}
                </dd>
              );
            })()}
          </div>
        </dl>
      )}
    </div>
  );
}

function CapabilityTogglesSection({ businessId, canEdit }: { businessId: string; canEdit: boolean }) {
  const { data: settings } = trpc.settings.get.useQuery({ businessId });
  const utils = trpc.useUtils();

  const [localCaps, setLocalCaps] = useState<Record<string, any> | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings?.capabilities) {
      setLocalCaps(settings.capabilities);
      setDirty(false);
    }
  }, [settings]);

  const updateMutation = trpc.settings.update.useMutation({
    onSuccess: () => {
      utils.settings.get.invalidate({ businessId });
      setDirty(false);
    },
  });

  function handleToggle(key: string, value: boolean) {
    setLocalCaps((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function handleNumberChange(key: string, value: number) {
    setLocalCaps((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function handleSave() {
    if (!localCaps) return;
    updateMutation.mutate({ businessId, capabilities: localCaps });
  }

  if (!localCaps) return <div className="text-gray-500">Loading capabilities...</div>;

  return (
    <div className="rounded-lg border bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Capability Settings</h2>
        {canEdit && dirty && (
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </button>
        )}
      </div>

      <div className="space-y-4">
        {Object.entries(CAPABILITY_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-sm text-gray-700">{label}</span>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => handleToggle(key, !localCaps[key])}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                localCaps[key] ? "bg-blue-600" : "bg-gray-200"
              } ${!canEdit ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  localCaps[key] ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        ))}

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700">Proof Photo Retention Days</span>
          <input
            type="number"
            min={1}
            max={365}
            value={localCaps.proofPhotoRetentionDays ?? 90}
            onChange={(e) => handleNumberChange("proofPhotoRetentionDays", Number(e.target.value))}
            disabled={!canEdit}
            className="w-20 rounded-md border px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
      </div>

      {updateMutation.error && (
        <p className="mt-3 text-sm text-red-600">{updateMutation.error.message}</p>
      )}
    </div>
  );
}
