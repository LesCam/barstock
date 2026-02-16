"use client";

import { useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { StatusBadge } from "@/components/art/StatusBadge";

const VALID_TRANSITIONS: Record<string, { status: string; label: string }[]> = {
  on_wall: [
    { status: "reserved_pending_payment", label: "Reserve (Pending Payment)" },
    { status: "reserved", label: "Reserve" },
    { status: "sold", label: "Mark Sold" },
    { status: "removed", label: "Remove" },
    { status: "removed_not_sold", label: "Remove (Not Sold)" },
  ],
  reserved_pending_payment: [
    { status: "on_wall", label: "Back to Wall" },
    { status: "reserved", label: "Confirm Reserved" },
    { status: "sold", label: "Mark Sold" },
    { status: "pending_payment_issue", label: "Payment Issue" },
  ],
  reserved: [
    { status: "on_wall", label: "Back to Wall" },
    { status: "sold", label: "Mark Sold" },
    { status: "removed", label: "Remove" },
  ],
  pending_payment_issue: [
    { status: "on_wall", label: "Back to Wall" },
    { status: "reserved_pending_payment", label: "Re-reserve" },
    { status: "sold", label: "Mark Sold" },
    { status: "removed", label: "Remove" },
  ],
  removed: [{ status: "on_wall", label: "Re-hang" }],
  removed_not_sold: [{ status: "on_wall", label: "Re-hang" }],
  sold: [],
};

function formatPrice(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString();
}

export default function ArtworkDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as any;
  const businessId = user?.businessId;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const id = params.id as string;

  const { data: artwork, isLoading, refetch } = trpc.artworks.getById.useQuery(
    { id, businessId: businessId! },
    { enabled: !!businessId && !!id }
  );

  const updateStatus = trpc.artworks.updateStatus.useMutation({
    onSuccess: () => refetch(),
  });

  const addPhoto = trpc.artworks.addPhoto.useMutation({
    onSuccess: () => refetch(),
  });

  const removePhoto = trpc.artworks.removePhoto.useMutation({
    onSuccess: () => refetch(),
  });

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !businessId) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      addPhoto.mutate({
        businessId,
        artworkId: id,
        base64Data: base64,
        filename: file.name,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  if (isLoading) return <p className="text-gray-500">Loading...</p>;
  if (!artwork) return <p className="text-gray-500">Artwork not found.</p>;

  const transitions = VALID_TRANSITIONS[artwork.status] ?? [];
  const photoCount = artwork.photos?.length ?? 0;

  return (
    <div>
      <div className="mb-4">
        <Link href="/art" className="text-sm text-blue-600 hover:underline">
          ← Back to Gallery
        </Link>
      </div>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{artwork.title}</h1>
          {artwork.artist && (
            <Link
              href={`/art/artists/${artwork.artist.id}`}
              className="text-sm text-blue-600 hover:underline"
            >
              {artwork.artist.name}
            </Link>
          )}
        </div>
        <Link
          href={`/art/${id}/edit`}
          className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Edit
        </Link>
      </div>

      {/* Photos */}
      <div className="mb-6">
        <div className="flex gap-3 overflow-x-auto pb-2">
          {artwork.photos?.map((photo: any) => (
            <div key={photo.id} className="relative flex-shrink-0">
              <img
                src={photo.url}
                alt={artwork.title}
                className="h-48 w-48 rounded-lg object-cover"
              />
              <button
                onClick={() => removePhoto.mutate({ businessId: businessId!, photoId: photo.id })}
                className="absolute right-1 top-1 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white hover:bg-black/70"
                disabled={removePhoto.isPending}
              >
                ✕
              </button>
            </div>
          ))}
          {photoCount < 3 && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex h-48 w-48 flex-shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-500"
              disabled={addPhoto.isPending}
            >
              {addPhoto.isPending ? "Uploading..." : "+ Photo"}
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handlePhotoUpload}
          className="hidden"
        />
        <p className="mt-1 text-xs text-gray-400">{photoCount}/3 photos</p>
      </div>

      {/* Details */}
      <div className="mb-6 rounded-lg border bg-white p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-gray-500">Status</p>
            <StatusBadge status={artwork.status} />
          </div>
          <div>
            <p className="text-xs text-gray-500">Price</p>
            <p className="font-medium">{formatPrice(artwork.listPriceCents)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Medium</p>
            <p>{artwork.medium ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Dimensions</p>
            <p>{artwork.dimensions ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Location in Pub</p>
            <p>{artwork.locationInPub ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Agreement</p>
            <p className="capitalize">{artwork.agreementType}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Sale Mode</p>
            <p>{artwork.saleMode.replace(/_/g, " ")}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Commission %</p>
            <p>{artwork.commissionPubPercent != null ? `${artwork.commissionPubPercent}%` : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Date Hung</p>
            <p>{formatDate(artwork.dateHung)}</p>
          </div>
          {artwork.notes && (
            <div className="sm:col-span-2">
              <p className="text-xs text-gray-500">Notes</p>
              <p className="whitespace-pre-wrap">{artwork.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Status Transitions */}
      {transitions.length > 0 && (
        <div className="rounded-lg border bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Change Status</h2>
          <div className="flex flex-wrap gap-2">
            {transitions.map((t) => (
              <button
                key={t.status}
                onClick={() =>
                  updateStatus.mutate({ id, businessId: businessId!, status: t.status as any })
                }
                disabled={updateStatus.isPending}
                className="rounded-md border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {t.label}
              </button>
            ))}
          </div>
          {updateStatus.error && (
            <p className="mt-2 text-sm text-red-600">{updateStatus.error.message}</p>
          )}
        </div>
      )}
    </div>
  );
}
