"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const inputClass =
  "w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none focus:ring-1 focus:ring-[#E9B44C]";

export default function NewBusinessPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as any;

  // Business fields
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [address, setAddress] = useState("");

  // Location fields
  const [locationName, setLocationName] = useState("");
  const [timezone, setTimezone] = useState("America/Montreal");
  const [closeoutHour, setCloseoutHour] = useState(4);

  // Admin fields
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminFirstName, setAdminFirstName] = useState("");
  const [adminLastName, setAdminLastName] = useState("");

  const [error, setError] = useState("");

  const provisionMutation = trpc.businesses.provision.useMutation({
    onSuccess: () => router.push("/businesses"),
    onError: (err) => setError(err.message),
  });

  if (user && user.highestRole !== "platform_admin") {
    router.replace("/");
    return null;
  }

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) {
      setSlug(slugify(value));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    provisionMutation.mutate({
      name,
      slug,
      contactEmail: contactEmail || undefined,
      contactPhone: contactPhone || undefined,
      address: address || undefined,
      locationName,
      timezone,
      closeoutHour,
      adminEmail,
      adminPassword,
      adminFirstName: adminFirstName || undefined,
      adminLastName: adminLastName || undefined,
    });
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold text-[#EAF0FF]">
        Create Business
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── Business Details ── */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold uppercase tracking-wider text-[#E9B44C]">
            Business Details
          </legend>

          <div>
            <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">
              Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">
              Slug *
            </label>
            <input
              type="text"
              required
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-[#EAF0FF]/40">
              Lowercase, hyphens allowed. Auto-generated from name.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">
              Contact Email
            </label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">
              Contact Phone
            </label>
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">
              Address
            </label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              className={inputClass}
            />
          </div>
        </fieldset>

        {/* ── First Location ── */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold uppercase tracking-wider text-[#E9B44C]">
            First Location
          </legend>

          <div>
            <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">
              Location Name *
            </label>
            <input
              type="text"
              required
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              className={inputClass}
              placeholder="e.g. Main Bar"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">
                Timezone
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className={inputClass}
              >
                <option value="America/Montreal">America/Montreal (ET)</option>
                <option value="America/Toronto">America/Toronto (ET)</option>
                <option value="America/Chicago">America/Chicago (CT)</option>
                <option value="America/Denver">America/Denver (MT)</option>
                <option value="America/Vancouver">America/Vancouver (PT)</option>
                <option value="America/New_York">America/New_York (ET)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PT)</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">
                Closeout Hour
              </label>
              <input
                type="number"
                min={0}
                max={23}
                value={closeoutHour}
                onChange={(e) => setCloseoutHour(Number(e.target.value))}
                className={inputClass}
              />
              <p className="mt-1 text-xs text-[#EAF0FF]/40">
                0-23, default 4 (4 AM)
              </p>
            </div>
          </div>
        </fieldset>

        {/* ── First Admin ── */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold uppercase tracking-wider text-[#E9B44C]">
            First Admin User
          </legend>

          <div>
            <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">
              Email *
            </label>
            <input
              type="email"
              required
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">
              Temporary Password *
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-[#EAF0FF]/40">
              Minimum 8 characters
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">
                First Name
              </label>
              <input
                type="text"
                value={adminFirstName}
                onChange={(e) => setAdminFirstName(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">
                Last Name
              </label>
              <input
                type="text"
                value={adminLastName}
                onChange={(e) => setAdminLastName(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </fieldset>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={provisionMutation.isPending}
            className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
          >
            {provisionMutation.isPending ? "Provisioning..." : "Create Business"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/businesses")}
            className="rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-[#EAF0FF]/80 hover:bg-[#16283F]/60"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
