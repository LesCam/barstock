"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";

export default function CreateArtistPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as any;
  const businessId = user?.businessId;

  const create = trpc.artists.create.useMutation({
    onSuccess: () => router.push("/art/artists"),
  });

  const [form, setForm] = useState({
    name: "",
    contactEmail: "",
    contactPhone: "",
    payoutMethod: "",
    defaultCommissionPubPercent: "50",
    bio: "",
    notes: "",
  });

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;

    create.mutate({
      businessId,
      name: form.name,
      contactEmail: form.contactEmail || undefined,
      contactPhone: form.contactPhone || undefined,
      payoutMethod: (form.payoutMethod || undefined) as any,
      defaultCommissionPubPercent: parseFloat(form.defaultCommissionPubPercent),
      bio: form.bio || undefined,
      notes: form.notes || undefined,
    });
  };

  return (
    <div>
      <div className="mb-4">
        <Link href="/art/artists" className="text-sm text-[#E9B44C] hover:underline">
          ← Back to Artists
        </Link>
      </div>

      <h1 className="mb-6 text-2xl font-bold text-[#EAF0FF]">Add Artist</h1>

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

        {create.error && (
          <p className="text-sm text-red-600">{create.error.message}</p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
          >
            {create.isPending ? "Saving..." : "Save Artist"}
          </button>
          <Link
            href="/art/artists"
            className="rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-[#EAF0FF]/80 hover:bg-[#16283F]/60"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
