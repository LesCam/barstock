import { prisma } from "@barstock/database";
import { ProductGuideService } from "@barstock/api/src/services/product-guide.service";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import MenuContent from "./menu-content";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ locationId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locationId } = await params;
  if (!UUID_RE.test(locationId)) return { title: "Menu" };

  const service = new ProductGuideService(prisma as any);
  const guide = await service.getPublicGuide(locationId);

  return {
    title: guide.businessName
      ? `${guide.businessName} — Menu`
      : "Menu",
    description: `Menu for ${guide.locationName || "this location"}`,
  };
}

export default async function PublicMenuPage({ params }: PageProps) {
  const { locationId } = await params;

  if (!UUID_RE.test(locationId)) notFound();

  const service = new ProductGuideService(prisma as any);
  const guide = await service.getPublicGuide(locationId);

  if (!guide.locationName) notFound();

  return (
    <div className="min-h-screen bg-[#0B1623]">
      {/* Header */}
      <header className="border-b border-white/10 px-4 py-6 text-center">
        {guide.businessName && (
          <p className="text-sm font-medium uppercase tracking-widest text-[#E9B44C]">
            {guide.businessName}
          </p>
        )}
        {guide.locationName !== guide.businessName && (
          <h1 className="mt-2 text-3xl font-bold text-[#EAF0FF]">
            {guide.locationName}
          </h1>
        )}
      </header>

      <MenuContent
        categories={guide.categories.map((cat) => ({
          ...cat,
          items: cat.items.map((item) => ({
            ...item,
            abv: item.abv != null ? Number(item.abv) : null,
            prices: Array.isArray(item.prices)
              ? (item.prices as { label: string; price: number }[]).map((p) => ({
                  label: p.label,
                  price: Number(p.price),
                }))
              : [],
          })),
        }))}
      />

      {/* Footer */}
      <footer className="border-t border-white/10 py-4 text-center text-xs text-[#5A6A7A]">
        Powered by Barstock
      </footer>
    </div>
  );
}
