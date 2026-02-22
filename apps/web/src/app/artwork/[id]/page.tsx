import { prisma } from "@barstock/database";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HIDDEN_STATUSES = ["sold", "removed", "removed_not_sold"] as const;

const PUBLIC_STATUSES: Record<string, string> = {
  on_wall: "Available",
  reserved: "Reserved",
  reserved_pending_payment: "Reserved",
  pending_payment_issue: "Reserved",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getArtwork(id: string) {
  if (!UUID_RE.test(id)) return null;

  const artwork = await (prisma as any).artwork.findUnique({
    where: { id },
    include: {
      artist: { select: { name: true, bio: true } },
      business: { select: { name: true } },
      photos: { orderBy: { sortOrder: "asc" }, take: 5 },
    },
  });

  if (!artwork) return null;
  if (HIDDEN_STATUSES.includes(artwork.status)) return null;

  return artwork;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const artwork = await getArtwork(id);

  if (!artwork) return { title: "Artwork Not Found" };

  const photo = artwork.photos[0]?.url;

  return {
    title: `${artwork.title} by ${artwork.artist.name}`,
    description: [
      artwork.medium,
      artwork.dimensions,
      artwork.artist.name,
    ]
      .filter(Boolean)
      .join(" — "),
    openGraph: {
      title: `${artwork.title} by ${artwork.artist.name}`,
      description: artwork.medium || undefined,
      ...(photo ? { images: [{ url: photo }] } : {}),
    },
  };
}

export default async function PublicArtworkPage({ params }: PageProps) {
  const { id } = await params;
  const artwork = await getArtwork(id);

  if (!artwork) notFound();

  const photo = artwork.photos[0];
  const price = (artwork.listPriceCents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  const statusLabel = PUBLIC_STATUSES[artwork.status] ?? "Available";

  return (
    <div className="min-h-screen bg-[#0B1623]">
      {/* Header */}
      <header className="border-b border-white/10 px-4 py-6 text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-[#E9B44C]">
          {artwork.business.name}
        </p>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        {/* Hero photo */}
        {photo ? (
          <div className="mb-8 overflow-hidden rounded-lg">
            <img
              src={photo.url}
              alt={artwork.title}
              className="w-full object-contain"
            />
          </div>
        ) : (
          <div className="mb-8 flex aspect-square items-center justify-center rounded-lg bg-[#16283F] text-6xl">
            🖼️
          </div>
        )}

        {/* Title & Artist */}
        <h1 className="text-2xl font-bold text-[#EAF0FF]">{artwork.title}</h1>
        <p className="mt-1 text-lg text-[#E9B44C]">{artwork.artist.name}</p>

        {/* Details */}
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#EAF0FF]/70">
          {artwork.medium && <span>{artwork.medium}</span>}
          {artwork.dimensions && <span>{artwork.dimensions}</span>}
        </div>

        {/* Price & Status */}
        <div className="mt-6 flex items-baseline gap-4">
          <span className="text-3xl font-bold text-[#EAF0FF]">{price}</span>
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              statusLabel === "Available"
                ? "bg-green-500/20 text-green-400"
                : "bg-yellow-500/20 text-yellow-400"
            }`}
          >
            {statusLabel}
          </span>
        </div>

        {/* Artist Bio */}
        {artwork.artist.bio && (
          <div className="mt-8 border-t border-white/10 pt-6">
            <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-[#EAF0FF]/50">
              About the Artist
            </h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-[#EAF0FF]/70">
              {artwork.artist.bio}
            </p>
          </div>
        )}

        {/* Additional photos */}
        {artwork.photos.length > 1 && (
          <div className="mt-8 grid grid-cols-2 gap-3">
            {artwork.photos.slice(1).map((p: any) => (
              <div key={p.id} className="overflow-hidden rounded-lg">
                <img
                  src={p.url}
                  alt={artwork.title}
                  className="w-full object-contain"
                />
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-6 text-center text-xs text-[#5A6A7A]">
        Powered by Barstock
      </footer>
    </div>
  );
}
