"use client";

import { useState } from "react";
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
  { value: "removed_not_sold" as const, label: "Not Sold" },
  { value: "reserved_pending_payment" as const, label: "Pending Payment" },
  { value: "pending_payment_issue" as const, label: "Payment Issue" },
];

export default function ArtGalleryPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const businessId = user?.businessId;

  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const { data, isLoading } = trpc.artworks.list.useQuery(
    { businessId: businessId!, status: statusFilter as any },
    { enabled: !!businessId }
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#EAF0FF]">Art Gallery</h1>
        <div className="flex gap-2">
          <Link
            href="/art/new"
            className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E]"
          >
            + Artwork
          </Link>
          <Link
            href="/art/artists"
            className="rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-[#EAF0FF]/80 hover:bg-[#16283F]/60"
          >
            Artists
          </Link>
        </div>
      </div>

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

      {isLoading ? (
        <p className="text-[#EAF0FF]/60">Loading...</p>
      ) : data?.items.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-8 text-center text-[#EAF0FF]/60">
          No artworks found.{" "}
          <Link href="/art/new" className="text-[#E9B44C] hover:underline">
            Add one
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {data?.items.map((artwork) => (
            <ArtworkCard key={artwork.id} artwork={artwork as any} />
          ))}
        </div>
      )}
    </div>
  );
}
