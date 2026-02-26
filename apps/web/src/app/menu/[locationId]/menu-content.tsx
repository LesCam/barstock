"use client";

import { useState } from "react";

interface MenuItem {
  id: string;
  description: string | null;
  imageUrl: string | null;
  prices: unknown;
  abv: unknown;
  producer: string | null;
  region: string | null;
  vintage: number | null;
  varietal: string | null;
  inventoryItem: { name: string; category: { name: string } | null };
}

interface Category {
  id: string;
  name: string;
  description: string | null;
  items: MenuItem[];
}

interface MenuContentProps {
  categories: Category[];
}

export default function MenuContent({ categories }: MenuContentProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null
  );

  const visibleCategories = selectedCategoryId
    ? categories.filter((c) => c.id === selectedCategoryId)
    : categories;

  return (
    <>
      {/* Category filter — sticks on scroll */}
      {categories.length > 1 && (
        <nav className="sticky top-0 z-10 border-b border-white/10 bg-[#0B1623]/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-5xl gap-2 overflow-x-auto px-4 py-3" style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" }}>
            <button
              onClick={() => setSelectedCategoryId(null)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                selectedCategoryId === null
                  ? "bg-[#E9B44C] text-[#0B1623]"
                  : "bg-white/5 text-[#EAF0FF] hover:bg-white/10"
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  selectedCategoryId === cat.id
                    ? "bg-[#E9B44C] text-[#0B1623]"
                    : "bg-white/5 text-[#EAF0FF] hover:bg-white/10"
                }`}
              >
                {cat.name}
                <span className="ml-1.5 text-xs opacity-60">
                  {cat.items.length}
                </span>
              </button>
            ))}
          </div>
        </nav>
      )}

      {/* Items */}
      <main className="mx-auto max-w-5xl px-4 py-6">
        {visibleCategories.length === 0 ? (
          <p className="text-center text-[#5A6A7A]">No items available.</p>
        ) : (
          visibleCategories.map((category) => (
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
                <p className="text-sm text-[#5A6A7A]">
                  No items in this category.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {category.items.map((item) => {
                    const prices = Array.isArray(item.prices)
                      ? (item.prices as { label: string; price: number }[])
                      : [];
                    return (
                      <div
                        key={item.id}
                        className="group flex overflow-hidden rounded-xl border border-white/10 bg-[#16283F] transition hover:border-[#E9B44C]/30"
                      >
                        {/* Thumbnail */}
                        {item.imageUrl ? (
                          <div className="h-24 w-24 shrink-0 overflow-hidden bg-[#0B1623]">
                            <img
                              src={item.imageUrl}
                              alt={item.inventoryItem.name}
                              className="h-full w-full object-contain"
                            />
                          </div>
                        ) : (
                          <div className="flex h-24 w-24 shrink-0 items-center justify-center bg-[#0B1623]/50">
                            <span className="text-2xl opacity-20">🍷</span>
                          </div>
                        )}

                        {/* Info */}
                        <div className="flex min-w-0 flex-1 flex-col justify-center px-3 py-2">
                          <h3 className="truncate text-sm font-semibold text-white">
                            {item.inventoryItem.name}
                          </h3>

                          {(item.producer ||
                            item.region ||
                            item.varietal ||
                            item.abv != null) && (
                            <p className="mt-0.5 truncate text-[11px]" style={{ color: "#C8D8E8" }}>
                              {[
                                item.producer,
                                item.region,
                                item.varietal,
                                item.vintage != null ? String(item.vintage) : null,
                                item.abv != null ? `${Number(item.abv)}%` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}

                          {item.description && (
                            <p className="mt-1 line-clamp-1 text-xs" style={{ color: "#D0DFEE" }}>
                              {item.description}
                            </p>
                          )}

                          {prices.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-3">
                              {prices.map((p, i) => (
                                <span key={i} className="text-xs">
                                  <span style={{ color: "#C8D8E8" }}>
                                    {p.label}{" "}
                                  </span>
                                  <span className="font-bold text-[#E9B44C]">
                                    ${Number(p.price).toFixed(2)}
                                  </span>
                                </span>
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
    </>
  );
}
