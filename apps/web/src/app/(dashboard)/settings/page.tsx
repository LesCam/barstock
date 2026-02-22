"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useLocation } from "@/components/location-context";
import { trpc } from "@/lib/trpc";
import Link from "next/link";
import { HelpLink } from "@/components/help-link";

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
  voiceCommandsEnabled: "Voice Commands",
};

export default function SettingsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const businessId = user?.businessId as string | undefined;
  const { selectedLocationId: locationId } = useLocation();
  const canEdit = ADMIN_ROLES.includes(user?.highestRole ?? "");

  if (!businessId) {
    return <div className="text-[#EAF0FF]/60">No business selected.</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold text-[#EAF0FF]">Settings</h1>
        <HelpLink section="settings-roles" tooltip="Learn about settings & roles" />
      </div>

      {/* Quick links */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/settings/categories"
          className="rounded-lg border border-white/10 bg-[#16283F] p-4 hover:border-[#E9B44C]/30 transition-colors"
        >
          <h3 className="font-medium text-[#EAF0FF]">Manage Categories</h3>
          <p className="mt-1 text-xs text-[#EAF0FF]/50">Item categories and counting methods</p>
        </Link>
        <Link
          href="/settings/vendors"
          className="rounded-lg border border-white/10 bg-[#16283F] p-4 hover:border-[#E9B44C]/30 transition-colors"
        >
          <h3 className="font-medium text-[#EAF0FF]">Manage Vendors</h3>
          <p className="mt-1 text-xs text-[#EAF0FF]/50">Suppliers and contact information</p>
        </Link>
      </div>

      <BusinessProfileSection businessId={businessId} canEdit={canEdit} />
      <EndOfDaySection businessId={businessId} canEdit={canEdit} />
      <CapabilityTogglesSection businessId={businessId} canEdit={canEdit} />
      <AutoLockPolicySection businessId={businessId} canEdit={canEdit} />
      <AlertRulesSection businessId={businessId} canEdit={canEdit} />
      {locationId && <ScaleProfilesSection locationId={locationId} canEdit={canEdit} />}
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
  const [uploading, setUploading] = useState(false);

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

  const uploadLogoMutation = trpc.businesses.uploadLogo.useMutation({
    onSuccess: () => {
      utils.businesses.getById.invalidate({ businessId });
      setUploading(false);
    },
    onError: () => setUploading(false),
  });

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    const MAX = 256;
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.min(MAX / img.width, MAX / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      const base64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
      const outName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
      uploadLogoMutation.mutate({ businessId, base64Data: base64, filename: outName });
    };
    img.src = URL.createObjectURL(file);
    e.target.value = "";
  }

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

  if (!business) return <div className="text-[#EAF0FF]/60">Loading business profile...</div>;

  return (
    <div className="rounded-lg border border-white/10 bg-[#16283F] p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Business Profile</h2>
        {canEdit && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="rounded-md bg-[#E9B44C] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#D4A43C]"
          >
            Edit
          </button>
        )}
      </div>

      {/* Logo */}
      <div className="mb-4 flex items-center gap-4">
        {business.logoUrl ? (
          <img
            src={business.logoUrl}
            alt={`${business.name} logo`}
            width={64}
            height={64}
            className="h-16 w-16 shrink-0 rounded-lg object-cover border border-white/10"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-[#E9B44C]/30 bg-[#E9B44C]/15 text-2xl font-bold text-[#E9B44C]">
            {business.name.charAt(0).toUpperCase()}
          </div>
        )}
        {canEdit && (
          <label className="cursor-pointer rounded-md border border-white/10 px-3 py-1.5 text-sm text-[#EAF0FF]/80 hover:bg-white/5">
            {uploading ? "Uploading..." : business.logoUrl ? "Change Logo" : "Upload Logo"}
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>
        )}
        {uploadLogoMutation.error && (
          <p className="text-sm text-red-600">{uploadLogoMutation.error.message}</p>
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
            <label className="block text-sm font-medium text-[#EAF0FF]/80">Slug</label>
            <p className="mt-1 font-mono text-sm text-[#EAF0FF]/60">{business.slug}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#EAF0FF]/80">Contact Email</label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] sm:w-1/2"
              placeholder="contact@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#EAF0FF]/80">Contact Phone</label>
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(formatPhone(e.target.value))}
              className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] sm:w-1/2"
              placeholder="(555)555-5555"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#EAF0FF]/80">Street Address</label>
            <input
              type="text"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] sm:w-1/2"
              placeholder="123 Main St"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
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
              <label className="block text-sm font-medium text-[#EAF0FF]/80">Postal / ZIP Code</label>
              <input
                type="text"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                className="mt-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
                placeholder="H2X 1Y4"
              />
            </div>
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
                setName(business.name);
                setContactEmail(business.contactEmail ?? "");
                setContactPhone(business.contactPhone ?? "");
                const parts = (business.address ?? "").split(" | ");
                setStreet(parts[0] ?? "");
                setCity(parts[1] ?? "");
                setProvince(parts[2] ?? "");
                setPostalCode(parts[3] ?? "");
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
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[#EAF0FF]/60">Name</dt>
            <dd className="font-medium">{business.name}</dd>
          </div>
          <div>
            <dt className="text-[#EAF0FF]/60">Slug</dt>
            <dd className="font-mono">{business.slug}</dd>
          </div>
          <div>
            <dt className="text-[#EAF0FF]/60">Contact Email</dt>
            <dd className="font-medium">{business.contactEmail ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[#EAF0FF]/60">Contact Phone</dt>
            <dd className="font-medium">{business.contactPhone ? formatPhone(business.contactPhone) : "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[#EAF0FF]/60">Address</dt>
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

function EndOfDaySection({ businessId, canEdit }: { businessId: string; canEdit: boolean }) {
  const { data: settings } = trpc.settings.get.useQuery({ businessId });
  const utils = trpc.useUtils();

  const [localTime, setLocalTime] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings?.endOfDayTime) {
      setLocalTime(settings.endOfDayTime);
      setDirty(false);
    }
  }, [settings]);

  const updateMutation = trpc.settings.update.useMutation({
    onSuccess: () => {
      utils.settings.get.invalidate({ businessId });
      utils.settings.endOfDayTime.invalidate({ businessId });
      setDirty(false);
    },
  });

  function handleSave() {
    if (!localTime || !/^\d{2}:\d{2}$/.test(localTime)) return;
    updateMutation.mutate({ businessId, endOfDayTime: localTime });
  }

  return (
    <div className="rounded-lg border border-white/10 bg-[#16283F] p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">End of Business Day</h2>
        {canEdit && dirty && (
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-white hover:bg-[#D4A43C] disabled:opacity-50"
          >
            {updateMutation.isPending ? "Saving..." : "Save"}
          </button>
        )}
      </div>

      <p className="mb-4 text-sm text-[#EAF0FF]/50">
        Set the time your business day ends. Reports will include data up to this time.
        For bars that close after midnight, set to your closing time (e.g. 04:00).
      </p>

      <div className="flex items-center gap-3">
        <label className="text-sm text-[#EAF0FF]/80">End of day time</label>
        <input
          type="time"
          value={localTime}
          onChange={(e) => { setLocalTime(e.target.value); setDirty(true); }}
          disabled={!canEdit}
          className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] [color-scheme:dark] disabled:cursor-not-allowed disabled:opacity-60"
        />
        {localTime && localTime <= "12:00" && localTime !== "00:00" && (
          <span className="text-xs text-[#EAF0FF]/40">
            (next day — e.g. &quot;Feb 21&quot; ends Feb 22 at {localTime})
          </span>
        )}
      </div>

      {updateMutation.error && (
        <p className="mt-3 text-sm text-red-600">{updateMutation.error.message}</p>
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

  if (!localCaps) return <div className="text-[#EAF0FF]/60">Loading capabilities...</div>;

  return (
    <div className="rounded-lg border border-white/10 bg-[#16283F] p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Capability Settings</h2>
        {canEdit && dirty && (
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-white hover:bg-[#D4A43C] disabled:opacity-50"
          >
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </button>
        )}
      </div>

      <div className="space-y-4">
        {Object.entries(CAPABILITY_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-sm text-[#EAF0FF]/80">{label}</span>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => handleToggle(key, !localCaps[key])}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                localCaps[key] ? "bg-[#E9B44C]" : "bg-white/10"
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
          <span className="text-sm text-[#EAF0FF]/80">Proof Photo Retention Days</span>
          <input
            type="number"
            min={1}
            max={365}
            value={localCaps.proofPhotoRetentionDays ?? 90}
            onChange={(e) => handleNumberChange("proofPhotoRetentionDays", Number(e.target.value))}
            disabled={!canEdit}
            className="w-20 rounded-md border border-white/10 bg-[#0B1623] px-2 py-1 text-sm text-[#EAF0FF] disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
      </div>

      {updateMutation.error && (
        <p className="mt-3 text-sm text-red-600">{updateMutation.error.message}</p>
      )}
    </div>
  );
}

const TIMEOUT_OPTIONS = [
  { value: 0, label: "Immediate" },
  { value: 15, label: "15 seconds" },
  { value: 30, label: "30 seconds" },
  { value: 60, label: "1 minute" },
  { value: 120, label: "2 minutes" },
  { value: 300, label: "5 minutes" },
];

function AutoLockPolicySection({ businessId, canEdit }: { businessId: string; canEdit: boolean }) {
  const { data: settings } = trpc.settings.get.useQuery({ businessId });
  const utils = trpc.useUtils();

  const [local, setLocal] = useState<{
    enabled: boolean;
    timeoutSeconds: number;
    allowPin: boolean;
    allowBiometric: boolean;
  } | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings?.autoLock) {
      setLocal(settings.autoLock);
      setDirty(false);
    }
  }, [settings]);

  const updateMutation = trpc.settings.update.useMutation({
    onSuccess: () => {
      utils.settings.get.invalidate({ businessId });
      setDirty(false);
    },
  });

  function update(patch: Partial<typeof local>) {
    setLocal((prev) => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
  }

  function handleSave() {
    if (!local) return;
    // Validation: at least one unlock method must be enabled when auto-lock is on
    if (local.enabled && !local.allowPin && !local.allowBiometric) return;
    updateMutation.mutate({ businessId, autoLock: local });
  }

  if (!local) return <div className="text-[#EAF0FF]/60">Loading auto-lock settings...</div>;

  const noUnlockMethod = local.enabled && !local.allowPin && !local.allowBiometric;

  return (
    <div className="rounded-lg border border-white/10 bg-[#16283F] p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Auto-Lock (Mobile)</h2>
        {canEdit && dirty && (
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending || noUnlockMethod}
            className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-white hover:bg-[#D4A43C] disabled:opacity-50"
          >
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </button>
        )}
      </div>

      <p className="mb-4 text-sm text-[#EAF0FF]/50">
        When enabled, the mobile app locks after being backgrounded. Staff must re-authenticate with PIN or Face ID to resume.
      </p>

      <div className="space-y-4">
        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-[#EAF0FF]/80">Enable Auto-Lock</span>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => update({ enabled: !local.enabled })}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
              local.enabled ? "bg-[#E9B44C]" : "bg-white/10"
            } ${!canEdit ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                local.enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {local.enabled && (
          <>
            {/* Timeout */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#EAF0FF]/80">Lock Timeout</span>
              <select
                value={local.timeoutSeconds}
                onChange={(e) => update({ timeoutSeconds: Number(e.target.value) })}
                disabled={!canEdit}
                className="rounded-md border border-white/10 bg-[#0B1623] px-2 py-1 text-sm text-[#EAF0FF] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {TIMEOUT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Allow PIN */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#EAF0FF]/80">Allow PIN Unlock</span>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => update({ allowPin: !local.allowPin })}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                  local.allowPin ? "bg-[#E9B44C]" : "bg-white/10"
                } ${!canEdit ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    local.allowPin ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Allow Biometric */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#EAF0FF]/80">Allow Biometric Unlock</span>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => update({ allowBiometric: !local.allowBiometric })}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                  local.allowBiometric ? "bg-[#E9B44C]" : "bg-white/10"
                } ${!canEdit ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    local.allowBiometric ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {noUnlockMethod && (
              <p className="text-sm text-red-400">At least one unlock method must be enabled.</p>
            )}
          </>
        )}
      </div>

      {updateMutation.error && (
        <p className="mt-3 text-sm text-red-600">{updateMutation.error.message}</p>
      )}
    </div>
  );
}

function ScaleProfilesSection({ locationId, canEdit }: { locationId: string; canEdit: boolean }) {
  const utils = trpc.useUtils();
  const { data: profiles } = trpc.scaleProfiles.list.useQuery(
    { locationId },
    { refetchInterval: 30_000 }
  );

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const createMutation = trpc.scaleProfiles.create.useMutation({
    onSuccess: () => {
      utils.scaleProfiles.list.invalidate({ locationId });
      setAdding(false);
      setNewName("");
    },
  });

  const updateMutation = trpc.scaleProfiles.update.useMutation({
    onSuccess: () => {
      utils.scaleProfiles.list.invalidate({ locationId });
      setEditingId(null);
      setEditName("");
    },
  });

  const deleteMutation = trpc.scaleProfiles.delete.useMutation({
    onSuccess: () => {
      utils.scaleProfiles.list.invalidate({ locationId });
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    createMutation.mutate({ locationId, name: newName.trim() });
  }

  function handleUpdate(e: React.FormEvent, profileId: string) {
    e.preventDefault();
    if (!editName.trim()) return;
    updateMutation.mutate({ profileId, name: editName.trim() });
  }

  function handleDelete(profileId: string, name: string) {
    if (!confirm(`Delete scale profile "${name}"?`)) return;
    deleteMutation.mutate({ profileId });
  }

  function formatLastSeen(date: Date | null): string {
    if (!date) return "Never";
    const secs = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (secs < 60) return "Just now";
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
  }

  function userName(user: { firstName?: string | null; lastName?: string | null; email: string } | null): string {
    if (!user) return "—";
    if (user.firstName || user.lastName) return [user.firstName, user.lastName].filter(Boolean).join(" ");
    return user.email;
  }

  return (
    <div className="rounded-lg border border-white/10 bg-[#16283F] p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Scale Profiles</h2>
        {canEdit && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="rounded-md bg-[#E9B44C] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#D4A43C]"
          >
            Add Profile
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={handleCreate} className="mb-4 flex items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Main Bar Scale"
            autoFocus
            className="flex-1 rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] sm:max-w-xs"
          />
          <button
            type="submit"
            disabled={createMutation.isPending || !newName.trim()}
            className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-white hover:bg-[#D4A43C] disabled:opacity-50"
          >
            {createMutation.isPending ? "Adding..." : "Add"}
          </button>
          <button
            type="button"
            onClick={() => { setAdding(false); setNewName(""); }}
            className="rounded-md border border-white/10 px-3 py-2 text-sm text-[#EAF0FF]/80 hover:bg-white/5"
          >
            Cancel
          </button>
        </form>
      )}
      {createMutation.error && (
        <p className="mb-3 text-sm text-red-600">{createMutation.error.message}</p>
      )}

      {!profiles ? (
        <div className="text-[#EAF0FF]/60 text-sm">Loading scale profiles...</div>
      ) : profiles.length === 0 ? (
        <div className="text-[#EAF0FF]/40 text-sm">No scale profiles yet. Add one to start tracking scale connections.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-[#EAF0FF]/60">
                <th className="pb-2 pr-4 font-medium">Name</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 pr-4 font-medium">Connected By</th>
                <th className="pb-2 pr-4 font-medium">Battery</th>
                <th className="pb-2 pr-4 font-medium">Last Seen</th>
                {canEdit && <th className="pb-2 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <tr key={profile.id} className="border-b border-white/5">
                  <td className="py-3 pr-4">
                    {editingId === profile.id ? (
                      <form onSubmit={(e) => handleUpdate(e, profile.id)} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          autoFocus
                          className="w-40 rounded-md border border-white/10 bg-[#0B1623] px-2 py-1 text-sm text-[#EAF0FF]"
                        />
                        <button type="submit" disabled={updateMutation.isPending} className="text-[#E9B44C] hover:text-[#D4A43C] text-xs font-medium">Save</button>
                        <button type="button" onClick={() => setEditingId(null)} className="text-[#EAF0FF]/60 hover:text-[#EAF0FF] text-xs">Cancel</button>
                      </form>
                    ) : (
                      <span className="font-medium text-[#EAF0FF]">{profile.name}</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <span className="flex items-center gap-2">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${profile.isConnected ? "bg-green-500" : "bg-gray-500"}`} />
                      <span className={profile.isConnected ? "text-green-400" : "text-[#EAF0FF]/40"}>
                        {profile.isConnected ? "Connected" : "Offline"}
                      </span>
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-[#EAF0FF]/80">{userName(profile.lastConnectedByUser)}</td>
                  <td className="py-3 pr-4">
                    {profile.batteryLevel != null ? (
                      <span className={profile.batteryLevel < 20 ? "text-red-400" : profile.batteryLevel < 40 ? "text-amber-400" : "text-[#EAF0FF]/80"}>
                        {profile.batteryLevel}%
                      </span>
                    ) : (
                      <span className="text-[#EAF0FF]/30">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-[#EAF0FF]/60">{formatLastSeen(profile.lastHeartbeatAt)}</td>
                  {canEdit && (
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => { setEditingId(profile.id); setEditName(profile.name); }}
                          className="text-[#EAF0FF]/60 hover:text-[#E9B44C] text-xs font-medium"
                        >
                          Rename
                        </button>
                        <button
                          onClick={() => handleDelete(profile.id, profile.name)}
                          className="text-[#EAF0FF]/60 hover:text-red-400 text-xs font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(updateMutation.error || deleteMutation.error) && (
        <p className="mt-3 text-sm text-red-600">{(updateMutation.error || deleteMutation.error)?.message}</p>
      )}
    </div>
  );
}

const ALERT_RULE_LABELS: Record<string, { label: string; unit: string; description: string }> = {
  variancePercent: {
    label: "Variance Threshold",
    unit: "%",
    description: "Alert when item variance exceeds this percentage",
  },
  lowStock: {
    label: "Low Stock",
    unit: "units",
    description: "Alert when on-hand quantity drops below this level",
  },
  staleCountDays: {
    label: "Stale Count",
    unit: "days",
    description: "Alert when items haven't been counted in this many days",
  },
  kegNearEmpty: {
    label: "Keg Near Empty",
    unit: "% remaining",
    description: "Alert when a tapped keg drops below this percentage",
  },
  loginFailures: {
    label: "Failed Logins",
    unit: "per hour",
    description: "Alert after this many failed login attempts in one hour",
  },
  largeAdjustment: {
    label: "Large Adjustment",
    unit: "% variance",
    description: "Alert when a session adjustment exceeds this variance",
  },
  shrinkagePattern: {
    label: "Shrinkage Patterns",
    unit: "sessions",
    description: "Alert when items show consistent negative variance across this many sessions",
  },
  parReorderAlert: {
    label: "Par Reorder Alert",
    unit: "days",
    description: "Alert when items are below min level or will stockout within this many days. Sent to assigned orderers (or all users with ordering permission if none assigned).",
  },
};

function formatTimeAgo(dateStr: string | undefined): string {
  if (!dateStr) return "Never";
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (secs < 60) return "Just now";
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} hour${Math.floor(secs / 3600) === 1 ? "" : "s"} ago`;
  return `${Math.floor(secs / 86400)} day${Math.floor(secs / 86400) === 1 ? "" : "s"} ago`;
}

function AlertRulesSection({ businessId, canEdit }: { businessId: string; canEdit: boolean }) {
  const { data: settings } = trpc.settings.get.useQuery({ businessId });
  const utils = trpc.useUtils();

  const [local, setLocal] = useState<Record<string, { enabled: boolean; threshold: number }> | null>(null);
  const [dirty, setDirty] = useState(false);

  const lastEvaluation = (settings as any)?.lastAlertEvaluation as string | undefined;

  useEffect(() => {
    if (settings?.alertRules) {
      setLocal(settings.alertRules as any);
      setDirty(false);
    }
  }, [settings]);

  const updateMutation = trpc.settings.update.useMutation({
    onSuccess: () => {
      utils.settings.get.invalidate({ businessId });
      setDirty(false);
    },
  });

  function handleToggle(key: string) {
    setLocal((prev) => {
      if (!prev) return prev;
      return { ...prev, [key]: { ...prev[key], enabled: !prev[key].enabled } };
    });
    setDirty(true);
  }

  function handleThresholdChange(key: string, value: number) {
    setLocal((prev) => {
      if (!prev) return prev;
      return { ...prev, [key]: { ...prev[key], threshold: value } };
    });
    setDirty(true);
  }

  function handleSave() {
    if (!local) return;
    updateMutation.mutate({ businessId, alertRules: local });
  }

  if (!local) return <div className="text-[#EAF0FF]/60">Loading alert settings...</div>;

  return (
    <div className="rounded-lg border border-white/10 bg-[#16283F] p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Alert Rules</h2>
        {canEdit && dirty && (
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-white hover:bg-[#D4A43C] disabled:opacity-50"
          >
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </button>
        )}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[#EAF0FF]/50">
          Configure thresholds for daily inventory alerts. Notifications are sent to business admins. Par reorder alerts are also sent to assigned vendor orderers (configure in Vendor settings).
        </p>
      </div>
      <p className="mb-4 text-xs text-[#EAF0FF]/30">
        Last evaluation: {formatTimeAgo(lastEvaluation)}
      </p>

      <div className="space-y-4">
        {Object.entries(ALERT_RULE_LABELS).map(([key, info]) => {
          const rule = local[key];
          if (!rule) return null;
          return (
            <div key={key} className="flex items-center gap-4">
              {/* Toggle */}
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => handleToggle(key)}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                  rule.enabled ? "bg-[#E9B44C]" : "bg-white/10"
                } ${!canEdit ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    rule.enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>

              {/* Label + description */}
              <div className="flex-1">
                <span className="text-sm text-[#EAF0FF]/80">{info.label}</span>
                <p className="text-xs text-[#EAF0FF]/40">{info.description}</p>
                <p className="text-xs text-[#EAF0FF]/25 mt-0.5">
                  Last triggered: {formatTimeAgo((rule as any).lastTriggeredAt)}
                </p>
              </div>

              {/* Threshold input */}
              <div className="flex w-40 shrink-0 items-center justify-end gap-1.5">
                <input
                  type="number"
                  min={0}
                  value={rule.threshold}
                  onChange={(e) => handleThresholdChange(key, Number(e.target.value))}
                  disabled={!canEdit || !rule.enabled}
                  className="w-20 rounded-md border border-white/10 bg-[#0B1623] px-2 py-1 text-right text-sm text-[#EAF0FF] disabled:cursor-not-allowed disabled:opacity-40"
                />
                <span className="w-16 text-xs text-[#EAF0FF]/40">{info.unit}</span>
              </div>
            </div>
          );
        })}
      </div>

      {updateMutation.error && (
        <p className="mt-3 text-sm text-red-600">{updateMutation.error.message}</p>
      )}
    </div>
  );
}
