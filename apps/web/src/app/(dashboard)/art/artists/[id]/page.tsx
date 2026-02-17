"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { ArtworkCard } from "@/components/art/ArtworkCard";

const STATUS_FILTERS = [
  { value: undefined, label: "All" },
  { value: "on_wall" as const, label: "On Wall" },
  { value: "reserved" as const, label: "Reserved" },
  { value: "sold" as const, label: "Sold" },
  { value: "removed" as const, label: "Removed" },
];

export default function EditArtistPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as any;
  const businessId = user?.businessId;
  const id = params.id as string;

  const { data: artist, isLoading, refetch } = trpc.artists.getById.useQuery(
    { id, businessId: businessId! },
    { enabled: !!businessId && !!id }
  );

  const update = trpc.artists.update.useMutation({
    onSuccess: () => {
      refetch();
      router.push("/art/artists");
    },
  });

  const deactivate = trpc.artists.deactivate.useMutation({
    onSuccess: () => router.push("/art/artists"),
  });

  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const { data: artworksData } = trpc.artworks.list.useQuery(
    { businessId: businessId!, artistId: id, status: statusFilter as any },
    { enabled: !!businessId && !!id }
  );

  const [form, setForm] = useState({
    name: "",
    contactEmail: "",
    contactPhone: "",
    payoutMethod: "",
    defaultCommissionPubPercent: "50",
    bio: "",
    notes: "",
  });

  useEffect(() => {
    if (artist) {
      setForm({
        name: artist.name,
        contactEmail: artist.contactEmail ?? "",
        contactPhone: artist.contactPhone ?? "",
        payoutMethod: artist.payoutMethod ?? "",
        defaultCommissionPubPercent: artist.defaultCommissionPubPercent?.toString() ?? "50",
        bio: artist.bio ?? "",
        notes: artist.notes ?? "",
      });
    }
  }, [artist]);

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;

    update.mutate({
      id,
      businessId,
      name: form.name,
      contactEmail: form.contactEmail || null,
      contactPhone: form.contactPhone || null,
      payoutMethod: (form.payoutMethod || null) as any,
      defaultCommissionPubPercent: parseFloat(form.defaultCommissionPubPercent),
      bio: form.bio || null,
      notes: form.notes || null,
    });
  };

  if (isLoading) return <p className="text-[#EAF0FF]/60">Loading...</p>;
  if (!artist) return <p className="text-[#EAF0FF]/60">Artist not found.</p>;

  return (
    <div>
      <div className="mb-4">
        <Link href="/art/artists" className="text-sm text-[#E9B44C] hover:underline">
          ← Back to Artists
        </Link>
      </div>

      <div className="mb-6 flex items-start justify-between">
        <h1 className="text-2xl font-bold text-[#EAF0FF]">Edit Artist</h1>
        {artist.active && (
          <button
            onClick={() => {
              if (confirm("Deactivate this artist? Their artworks will remain.")) {
                deactivate.mutate({ id, businessId: businessId! });
              }
            }}
            className="rounded-md border border-red-500/30 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/10"
          >
            Deactivate
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            required
            className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">Email</label>
            <input
              type="email"
              value={form.contactEmail}
              onChange={(e) => set("contactEmail", e.target.value)}
              className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">Phone</label>
            <input
              type="tel"
              value={form.contactPhone}
              onChange={(e) => set("contactPhone", e.target.value)}
              className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">Payout Method</label>
            <select
              value={form.payoutMethod}
              onChange={(e) => set("payoutMethod", e.target.value)}
              className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
            >
              <option value="">Select...</option>
              <option value="etransfer">E-Transfer</option>
              <option value="cheque">Cheque</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">Commission %</label>
            <input
              type="number"
              min="0"
              max="100"
              value={form.defaultCommissionPubPercent}
              onChange={(e) => set("defaultCommissionPubPercent", e.target.value)}
              className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">Bio</label>
          <textarea
            value={form.bio}
            onChange={(e) => set("bio", e.target.value)}
            rows={3}
            className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={3}
            className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
          />
        </div>

        {update.error && (
          <p className="text-sm text-red-600">{update.error.message}</p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={update.isPending}
            className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
          >
            {update.isPending ? "Saving..." : "Save Changes"}
          </button>
          <Link
            href="/art/artists"
            className="rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-[#EAF0FF]/80 hover:bg-[#16283F]/60"
          >
            Cancel
          </Link>
        </div>
      </form>

      {/* Artist's Artworks */}
      <div className="mt-10 border-t border-white/10 pt-6">
        <h2 className="mb-4 text-lg font-bold text-[#EAF0FF]">
          Artworks by {artist.name}
        </h2>

        <div className="mb-4 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                statusFilter === f.value
                  ? "bg-[#E9B44C] text-[#0B1623]"
                  : "bg-white/5 text-[#EAF0FF]/80 hover:bg-[#16283F]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {artworksData?.items.length === 0 ? (
          <p className="text-sm text-[#EAF0FF]/60">No artworks yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {artworksData?.items.map((artwork) => (
              <ArtworkCard key={artwork.id} artwork={artwork as any} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
