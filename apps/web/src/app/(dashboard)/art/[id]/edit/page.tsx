"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";

export default function EditArtworkPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as any;
  const businessId = user?.businessId;
  const id = params.id as string;

  const { data: artwork, isLoading } = trpc.artworks.getById.useQuery(
    { id, businessId: businessId! },
    { enabled: !!businessId && !!id }
  );

  const { data: artistsData } = trpc.artists.list.useQuery(
    { businessId: businessId! },
    { enabled: !!businessId }
  );

  const update = trpc.artworks.update.useMutation({
    onSuccess: () => router.push(`/art/${id}`),
  });

  const [form, setForm] = useState({
    artistId: "",
    title: "",
    medium: "",
    dimensions: "",
    price: "",
    locationInPub: "",
    agreementType: "consignment",
    saleMode: "platform_sale",
    commissionPubPercent: "",
    dateHung: "",
    notes: "",
  });

  useEffect(() => {
    if (artwork) {
      setForm({
        artistId: artwork.artistId,
        title: artwork.title,
        medium: artwork.medium ?? "",
        dimensions: artwork.dimensions ?? "",
        price: (artwork.listPriceCents / 100).toString(),
        locationInPub: artwork.locationInPub ?? "",
        agreementType: artwork.agreementType,
        saleMode: artwork.saleMode,
        commissionPubPercent: artwork.commissionPubPercent != null ? artwork.commissionPubPercent.toString() : "",
        dateHung: artwork.dateHung ? new Date(artwork.dateHung).toISOString().split("T")[0] : "",
        notes: artwork.notes ?? "",
      });
    }
  }, [artwork]);

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;

    update.mutate({
      id,
      businessId,
      artistId: form.artistId,
      title: form.title,
      medium: form.medium || null,
      dimensions: form.dimensions || null,
      listPriceCents: Math.round(parseFloat(form.price) * 100),
      locationInPub: form.locationInPub || null,
      agreementType: form.agreementType as "consignment" | "owned",
      saleMode: form.saleMode as "platform_sale" | "direct_artist_sale" | "either",
      commissionPubPercent: form.commissionPubPercent ? parseFloat(form.commissionPubPercent) : undefined,
      dateHung: form.dateHung || null,
      notes: form.notes || null,
    });
  };

  if (isLoading) return <p className="text-[#EAF0FF]/60">Loading...</p>;
  if (!artwork) return <p className="text-[#EAF0FF]/60">Artwork not found.</p>;

  return (
    <div>
      <div className="mb-4">
        <Link href={`/art/${id}`} className="text-sm text-[#E9B44C] hover:underline">
          ← Back to Artwork
        </Link>
      </div>

      <h1 className="mb-6 text-2xl font-bold text-[#EAF0FF]">Edit Artwork</h1>

      <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">Artist *</label>
          <select
            value={form.artistId}
            onChange={(e) => set("artistId", e.target.value)}
            required
            className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
          >
            <option value="">Select artist...</option>
            {artistsData?.items.map((a: any) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">Title *</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            required
            className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">Medium</label>
            <input
              type="text"
              value={form.medium}
              onChange={(e) => set("medium", e.target.value)}
              className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">Dimensions</label>
            <input
              type="text"
              value={form.dimensions}
              onChange={(e) => set("dimensions", e.target.value)}
              className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">Price ($) *</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={form.price}
            onChange={(e) => set("price", e.target.value)}
            required
            className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">Location in Pub</label>
          <input
            type="text"
            value={form.locationInPub}
            onChange={(e) => set("locationInPub", e.target.value)}
            className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">Agreement</label>
            <select
              value={form.agreementType}
              onChange={(e) => set("agreementType", e.target.value)}
              className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
            >
              <option value="consignment">Consignment</option>
              <option value="owned">Owned</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">Sale Mode</label>
            <select
              value={form.saleMode}
              onChange={(e) => set("saleMode", e.target.value)}
              className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
            >
              <option value="platform_sale">Platform Sale</option>
              <option value="direct_artist_sale">Direct Artist Sale</option>
              <option value="either">Either</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">Commission %</label>
            <input
              type="number"
              min="0"
              max="100"
              value={form.commissionPubPercent}
              onChange={(e) => set("commissionPubPercent", e.target.value)}
              className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">Date Hung</label>
            <input
              type="date"
              value={form.dateHung}
              onChange={(e) => set("dateHung", e.target.value)}
              className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
            />
          </div>
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
            href={`/art/${id}`}
            className="rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-[#EAF0FF]/80 hover:bg-[#16283F]/60"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
