"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { QRCodeSVG } from "qrcode.react";
import { trpc } from "@/lib/trpc";

export default function ArtLabelsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const businessId = user?.businessId;

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading } = trpc.artworks.list.useQuery(
    { businessId: businessId!, status: "on_wall" },
    { enabled: !!businessId }
  );

  const artworks = data?.items ?? [];
  const businessName = (session?.user as any)?.businessName ?? "";

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(artworks.map((a) => a.id)));
  }

  function deselectAll() {
    setSelected(new Set());
  }

  const selectedArtworks = artworks.filter((a) => selected.has(a.id));

  return (
    <div>
      {/* Screen UI — hidden when printing */}
      <div className="print:hidden">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#EAF0FF]">Print Labels</h1>
            <p className="mt-1 text-sm text-[#EAF0FF]/60">
              Select artworks to generate printable wall labels with QR codes
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/art"
              className="rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-[#EAF0FF]/60 hover:text-[#EAF0FF] hover:border-white/20"
            >
              Back
            </a>
            <button
              onClick={() => window.print()}
              disabled={selected.size === 0}
              className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Print Labels ({selected.size})
            </button>
          </div>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={selectAll}
            className="text-sm text-[#E9B44C] hover:underline"
          >
            Select All
          </button>
          <button
            onClick={deselectAll}
            className="text-sm text-[#EAF0FF]/60 hover:underline"
          >
            Deselect All
          </button>
          <span className="text-sm text-[#EAF0FF]/40">
            {selected.size} of {artworks.length} selected
          </span>
        </div>

        {isLoading ? (
          <p className="text-[#EAF0FF]/60">Loading artworks...</p>
        ) : artworks.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-[#16283F] p-8 text-center text-[#EAF0FF]/60">
            No artworks currently on the wall.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {artworks.map((artwork) => {
              const photo = (artwork as any).photos?.[0];
              const isSelected = selected.has(artwork.id);
              return (
                <button
                  key={artwork.id}
                  onClick={() => toggle(artwork.id)}
                  className={`rounded-lg border p-2 text-left transition ${
                    isSelected
                      ? "border-[#E9B44C] bg-[#E9B44C]/10"
                      : "border-white/10 bg-[#16283F] hover:border-white/20"
                  }`}
                >
                  <div className="relative aspect-square overflow-hidden rounded bg-[#0B1623]">
                    {photo ? (
                      <img
                        src={photo.thumbnailUrl || photo.url}
                        alt={artwork.title}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-4xl">
                        🖼️
                      </div>
                    )}
                    {isSelected && (
                      <div className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#E9B44C] text-sm font-bold text-[#0B1623]">
                        ✓
                      </div>
                    )}
                  </div>
                  <div className="mt-2">
                    <p className="truncate text-sm font-medium text-[#EAF0FF]">
                      {artwork.title}
                    </p>
                    <p className="truncate text-xs text-[#EAF0FF]/60">
                      {(artwork as any).artist?.name}
                    </p>
                    <p className="text-xs font-medium text-[#E9B44C]">
                      ${(artwork.listPriceCents / 100).toLocaleString()}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Print layout — hidden on screen, visible when printing */}
      <div className="hidden print:block">
        <div className="grid grid-cols-2 gap-0">
          {selectedArtworks.map((artwork) => {
            const qrUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/artwork/${artwork.id}`;
            const price = (artwork.listPriceCents / 100).toLocaleString(
              "en-US",
              {
                style: "currency",
                currency: "USD",
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              }
            );

            return (
              <div
                key={artwork.id}
                className="flex items-center gap-4 border border-gray-300 p-4"
                style={{
                  breakInside: "avoid",
                  height: "2.75in",
                  width: "3.75in",
                }}
              >
                <div className="shrink-0">
                  <QRCodeSVG value={qrUrl} size={90} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold text-black">
                    {artwork.title}
                  </p>
                  <p className="truncate text-sm text-gray-700">
                    {(artwork as any).artist?.name}
                  </p>
                  {(artwork as any).medium && (
                    <p className="truncate text-xs text-gray-500">
                      {(artwork as any).medium}
                    </p>
                  )}
                  {(artwork as any).dimensions && (
                    <p className="truncate text-xs text-gray-500">
                      {(artwork as any).dimensions}
                    </p>
                  )}
                  <p className="mt-1 text-lg font-bold text-black">{price}</p>
                  {businessName && (
                    <p className="mt-2 text-xs text-gray-400">
                      {businessName} Art Gallery
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
