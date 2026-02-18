import { prisma } from "@barstock/database";
import { ProductGuideService } from "@barstock/api/src/services/product-guide.service";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

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
      <header className="border-b border-white/10 px-4 py-8 text-center">
        {guide.businessName && (
          <p className="text-sm font-medium uppercase tracking-widest text-[#E9B44C]">
            {guide.businessName}
          </p>
        )}
        <h1 className="mt-2 text-3xl font-bold text-[#EAF0FF]">
          {guide.locationName}
        </h1>
      </header>

      {/* Categories & Items */}
      <main className="mx-auto max-w-5xl px-4 py-8">
        {guide.categories.length === 0 ? (
          <p className="text-center text-[#5A6A7A]">No items available.</p>
        ) : (
          guide.categories.map((category) => (
            <section key={category.id} className="mb-10">
              <div className="mb-4 border-b border-white/10 pb-2">
                <h2 className="text-xl font-bold text-[#EAF0FF]">
                  {category.name}
                </h2>
                {category.description && (
                  <p className="mt-1 text-sm text-[#5A6A7A]">
                    {category.description}
                  </p>
                )}
              </div>

              {category.items.length === 0 ? (
                <p className="text-sm text-[#5A6A7A]">No items in this category.</p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {category.items.map((item) => {
                    const prices = Array.isArray(item.prices)
                      ? (item.prices as { label: string; price: number }[])
                      : [];
                    return (
                      <div
                        key={item.id}
                        className="overflow-hidden rounded-lg border border-white/10 bg-[#16283F]"
                      >
                        {item.imageUrl && (
                          <div className="aspect-square w-full overflow-hidden bg-[#0B1623]">
                            <img
                              src={item.imageUrl}
                              alt={item.inventoryItem.name}
                              className="h-full w-full object-contain"
                            />
                          </div>
                        )}
                        <div className="p-4">
                          <h3 className="text-base font-semibold text-[#EAF0FF]">
                            {item.inventoryItem.name}
                          </h3>

                          {/* Meta details */}
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[#5A6A7A]">
                            {item.producer && <span>{item.producer}</span>}
                            {item.region && <span>{item.region}</span>}
                            {item.varietal && <span>{item.varietal}</span>}
                            {item.vintage != null && <span>{item.vintage}</span>}
                            {item.abv != null && <span>{Number(item.abv)}%</span>}
                          </div>

                          {/* Description */}
                          {item.description && (
                            <p className="mt-2 line-clamp-3 text-sm text-[#EAF0FF]/70">
                              {item.description}
                            </p>
                          )}

                          {/* Prices */}
                          {prices.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-3">
                              {prices.map((p, i) => (
                                <div key={i} className="text-center">
                                  <span className="block text-xs text-[#5A6A7A]">
                                    {p.label}
                                  </span>
                                  <span className="text-sm font-bold text-[#E9B44C]">
                                    ${Number(p.price).toFixed(2)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ))
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-6 text-center text-xs text-[#5A6A7A]">
        Powered by Barstock
      </footer>
    </div>
  );
}
