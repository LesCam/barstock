"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { QRCodeSVG } from "qrcode.react";
import { trpc } from "@/lib/trpc";
import { HelpLink } from "@/components/help-link";

export default function ArtLabelsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const businessId = user?.businessId;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewing, setPreviewing] = useState(false);

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

  function buildLabelHtml(artwork: (typeof artworks)[number]) {
    const qrUrl = `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/artwork/${artwork.id}`;
    const price = (artwork.listPriceCents / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    const artist = (artwork as any).artist?.name ?? "";
    const medium = (artwork as any).medium ?? "";
    const dimensions = (artwork as any).dimensions ?? "";

    return `
      <div style="display:flex;align-items:center;gap:0.5cm;border:1px solid #ccc;padding:8px 10px 8px 1cm;width:3.2in;height:1.8in;break-inside:avoid;box-sizing:border-box;">
        <div style="flex-shrink:0;">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=70x70&data=${encodeURIComponent(qrUrl)}" width="70" height="70" />
        </div>
        <div style="flex:1;min-width:0;font-family:system-ui,sans-serif;">
          <p style="margin:0;font-size:14px;font-weight:700;color:#000;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${artwork.title}</p>
          ${artist ? `<p style="margin:1px 0 0;font-size:12px;color:#000;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${artist}</p>` : ""}
          ${medium ? `<p style="margin:1px 0 0;font-size:11px;color:#000;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${medium}</p>` : ""}
          ${dimensions ? `<p style="margin:1px 0 0;font-size:11px;color:#000;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${dimensions}</p>` : ""}
          <p style="margin:4px 0 0;font-size:16px;font-weight:700;color:#000;">${price}</p>
          ${businessName ? `<p style="margin:4px 0 0;font-size:10px;color:#000;">${businessName}</p>` : ""}
        </div>
      </div>`;
  }

  function handlePrint() {
    if (selectedArtworks.length === 0) return;

    const labelsHtml = selectedArtworks.map(buildLabelHtml).join("\n");
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Art Labels</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: white; }
    .labels { display: flex; flex-wrap: wrap; }
    @media print {
      body { margin: 0; }
    }
  </style>
</head>
<body>
  <div class="labels">${labelsHtml}</div>
  <script>
    // Wait for QR code images to load, then print
    const images = document.querySelectorAll('img');
    let loaded = 0;
    if (images.length === 0) { window.print(); }
    images.forEach(img => {
      if (img.complete) { loaded++; if (loaded === images.length) window.print(); }
      else {
        img.onload = img.onerror = () => { loaded++; if (loaded === images.length) window.print(); };
      }
    });
  </script>
</body>
</html>`;

    const printWindow = window.open("", "_blank", "width=800,height=600");
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
    }
  }

  // --- Preview mode ---
  if (previewing) {
    return (
      <div>
        {/* Preview toolbar */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#EAF0FF]">Label Preview</h1>
            <p className="mt-1 text-sm text-[#EAF0FF]/60">
              {selectedArtworks.length} label{selectedArtworks.length !== 1 ? "s" : ""} — review before printing
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPreviewing(false)}
              className="rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-[#EAF0FF]/60 hover:text-[#EAF0FF] hover:border-white/20"
            >
              Back to Selection
            </button>
            <button
              onClick={handlePrint}
              className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E]"
            >
              Print
            </button>
          </div>
        </div>

        {/* On-screen preview of labels */}
        <div className="flex flex-wrap gap-0">
          {selectedArtworks.map((artwork) => {
            const qrUrl = `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/artwork/${artwork.id}`;
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
                className="flex items-center border border-gray-300 bg-white py-2"
                style={{
                  gap: "0.5cm",
                  paddingLeft: "1cm",
                  paddingRight: "10px",
                  breakInside: "avoid",
                  height: "1.8in",
                  width: "3.2in",
                }}
              >
                <div className="shrink-0">
                  <QRCodeSVG value={qrUrl} size={70} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-black">
                    {artwork.title}
                  </p>
                  <p className="truncate text-xs text-black">
                    {(artwork as any).artist?.name}
                  </p>
                  {(artwork as any).medium && (
                    <p className="truncate text-[11px] text-black">
                      {(artwork as any).medium}
                    </p>
                  )}
                  {(artwork as any).dimensions && (
                    <p className="truncate text-[11px] text-black">
                      {(artwork as any).dimensions}
                    </p>
                  )}
                  <p className="mt-1 text-base font-bold text-black">{price}</p>
                  {businessName && (
                    <p className="mt-1 text-[10px] text-black">
                      {businessName}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // --- Selection mode ---
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[#EAF0FF]">Print Labels</h1>
            <HelpLink section="art-gallery" tooltip="Learn about QR labels" />
          </div>
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
            onClick={() => setPreviewing(true)}
            disabled={selected.size === 0}
            className="rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-[#EAF0FF]/60 hover:text-[#EAF0FF] hover:border-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Preview ({selected.size})
          </button>
          <button
            onClick={handlePrint}
            disabled={selected.size === 0}
            className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Print ({selected.size})
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
  );
}
