"use client";

import Link from "next/link";
import { StatusBadge } from "./StatusBadge";

interface ArtworkCardProps {
  artwork: {
    id: string;
    title: string;
    listPriceCents: number;
    status: string;
    artist: { name: string } | null;
    photos: { url: string; thumbnailUrl?: string | null }[];
  };
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function ArtworkCard({ artwork }: ArtworkCardProps) {
  const photo = artwork.photos[0];

  return (
    <Link
      href={`/art/${artwork.id}`}
      className="group rounded-lg border bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="aspect-square w-full overflow-hidden rounded-t-lg bg-gray-100">
        {photo ? (
          <img
            src={photo.thumbnailUrl ?? photo.url}
            alt={artwork.title}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl text-gray-300">
            🖼️
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="truncate text-sm font-semibold text-gray-900">{artwork.title}</h3>
        {artwork.artist && (
          <p className="truncate text-xs text-gray-500">{artwork.artist.name}</p>
        )}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-900">
            {formatPrice(artwork.listPriceCents)}
          </span>
          <StatusBadge status={artwork.status} />
        </div>
      </div>
    </Link>
  );
}
