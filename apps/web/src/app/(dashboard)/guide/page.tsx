"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";

export default function ProductGuidePage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const locationId = user?.locationIds?.[0];

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");

  const [showItemForm, setShowItemForm] = useState(false);
  const [itemInventoryId, setItemInventoryId] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [inventorySearch, setInventorySearch] = useState("");
  const [itemPrices, setItemPrices] = useState<{ label: string; price: string }[]>([{ label: "", price: "" }]);
  const [itemAbv, setItemAbv] = useState("");
  const [itemProducer, setItemProducer] = useState("");
  const [itemRegion, setItemRegion] = useState("");
  const [itemVintage, setItemVintage] = useState("");
  const [itemVarietal, setItemVarietal] = useState("");

  const utils = trpc.useUtils();

  const { data: categories, isLoading: loadingCats } =
    trpc.productGuide.listCategories.useQuery(
      { locationId: locationId!, activeOnly: false },
      { enabled: !!locationId }
    );

  const { data: items, isLoading: loadingItems } =
    trpc.productGuide.listItems.useQuery(
      {
        locationId: locationId!,
        categoryId: selectedCategoryId ?? undefined,
        activeOnly: false,
      },
      { enabled: !!locationId }
    );

  const { data: inventoryItems } = trpc.inventory.list.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId }
  );

  const createCategory = trpc.productGuide.createCategory.useMutation({
    onSuccess: () => {
      utils.productGuide.listCategories.invalidate();
      setShowCategoryForm(false);
      setCategoryName("");
      setCategoryDescription("");
    },
  });

  const updateCategory = trpc.productGuide.updateCategory.useMutation({
    onSuccess: () => {
      utils.productGuide.listCategories.invalidate();
      setEditingCategory(null);
      setCategoryName("");
      setCategoryDescription("");
    },
  });

  const createItem = trpc.productGuide.createItem.useMutation({
    onSuccess: () => {
      utils.productGuide.listItems.invalidate();
      setShowItemForm(false);
      setItemInventoryId("");
      setItemDescription("");
      setInventorySearch("");
      setItemPrices([{ label: "", price: "" }]);
      setItemAbv("");
      setItemProducer("");
      setItemRegion("");
      setItemVintage("");
      setItemVarietal("");
    },
  });

  const filteredInventory = inventoryItems?.filter(
    (i: any) =>
      i.name.toLowerCase().includes(inventorySearch.toLowerCase()) ||
      (i.category?.name ?? "").toLowerCase().includes(inventorySearch.toLowerCase())
  );

  function startEditCategory(cat: any) {
    setEditingCategory(cat.id);
    setCategoryName(cat.name);
    setCategoryDescription(cat.description ?? "");
  }

  function handleSaveCategory() {
    if (editingCategory) {
      updateCategory.mutate({
        id: editingCategory,
        locationId: locationId!,
        name: categoryName || undefined,
        description: categoryDescription || null,
      });
    } else {
      createCategory.mutate({
        locationId: locationId!,
        name: categoryName,
        description: categoryDescription || undefined,
      });
    }
  }

  function handleToggleCategory(cat: any) {
    updateCategory.mutate({
      id: cat.id,
      locationId: locationId!,
      active: !cat.active,
    });
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#EAF0FF]">Product Guide</h1>
      </div>

      {/* Categories */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase text-[#EAF0FF]/60">
            Categories
          </h2>
          <button
            onClick={() => {
              setShowCategoryForm(true);
              setEditingCategory(null);
              setCategoryName("");
              setCategoryDescription("");
            }}
            className="rounded-md bg-[#E9B44C] px-3 py-1.5 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E]"
          >
            + Category
          </button>
        </div>

        {(showCategoryForm || editingCategory) && (
          <div className="mb-4 rounded-lg border border-white/10 bg-[#16283F] p-4">
            <div className="mb-3">
              <input
                type="text"
                placeholder="Category name"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder-[#5A6A7A]"
              />
            </div>
            <div className="mb-3">
              <input
                type="text"
                placeholder="Description (optional)"
                value={categoryDescription}
                onChange={(e) => setCategoryDescription(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder-[#5A6A7A]"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveCategory}
                disabled={!categoryName || createCategory.isPending || updateCategory.isPending}
                className="rounded-md bg-[#E9B44C] px-3 py-1.5 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
              >
                {editingCategory ? "Update" : "Create"}
              </button>
              <button
                onClick={() => {
                  setShowCategoryForm(false);
                  setEditingCategory(null);
                }}
                className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-[#EAF0FF]/60 hover:bg-[#16283F]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategoryId(null)}
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              selectedCategoryId === null
                ? "bg-[#E9B44C] text-[#0B1623]"
                : "bg-white/5 text-[#EAF0FF]/80 hover:bg-[#16283F]"
            }`}
          >
            All
          </button>
          {loadingCats ? (
            <span className="text-sm text-[#EAF0FF]/40">Loading...</span>
          ) : (
            categories?.map((cat: any) => (
              <div key={cat.id} className="group relative flex items-center gap-1">
                <button
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={`rounded-full px-3 py-1 text-sm font-medium ${
                    selectedCategoryId === cat.id
                      ? "bg-[#E9B44C] text-[#0B1623]"
                      : cat.active
                        ? "bg-white/5 text-[#EAF0FF]/80 hover:bg-[#16283F]"
                        : "bg-white/5 text-[#EAF0FF]/30 hover:bg-[#16283F]"
                  }`}
                >
                  {cat.name}
                  <span className="ml-1 text-xs opacity-60">({cat._count.items})</span>
                </button>
                <button
                  onClick={() => startEditCategory(cat)}
                  className="hidden text-xs text-[#EAF0FF]/40 hover:text-[#E9B44C] group-hover:inline"
                  title="Edit"
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleToggleCategory(cat)}
                  className="hidden text-xs text-[#EAF0FF]/40 hover:text-[#E9B44C] group-hover:inline"
                  title={cat.active ? "Deactivate" : "Activate"}
                >
                  {cat.active ? "👁️" : "👁️‍🗨️"}
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add Item */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase text-[#EAF0FF]/60">
          Items {selectedCategoryId && categories ? `— ${categories.find((c: any) => c.id === selectedCategoryId)?.name}` : ""}
        </h2>
        {categories && categories.length > 0 && (
          <button
            onClick={() => setShowItemForm(true)}
            className="rounded-md bg-[#E9B44C] px-3 py-1.5 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E]"
          >
            + Item
          </button>
        )}
      </div>

      {showItemForm && (
        <div className="mb-4 rounded-lg border border-white/10 bg-[#16283F] p-4">
          <div className="mb-3">
            <label className="mb-1 block text-xs text-[#EAF0FF]/60">Category</label>
            <select
              value={selectedCategoryId ?? ""}
              onChange={(e) => setSelectedCategoryId(e.target.value || null)}
              className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
            >
              <option value="">Select category...</option>
              {categories
                ?.filter((c: any) => c.active)
                .map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="mb-3">
            <label className="mb-1 block text-xs text-[#EAF0FF]/60">Inventory Item</label>
            <input
              type="text"
              placeholder="Search inventory..."
              value={inventorySearch}
              onChange={(e) => setInventorySearch(e.target.value)}
              className="mb-2 w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder-[#5A6A7A]"
            />
            {inventorySearch && (
              <div className="max-h-40 overflow-y-auto rounded-md border border-white/10 bg-[#0B1623]">
                {filteredInventory?.slice(0, 10).map((inv: any) => (
                  <button
                    key={inv.id}
                    onClick={() => {
                      setItemInventoryId(inv.id);
                      setInventorySearch(inv.name);
                    }}
                    className={`block w-full px-3 py-2 text-left text-sm hover:bg-[#16283F] ${
                      itemInventoryId === inv.id
                        ? "text-[#E9B44C]"
                        : "text-[#EAF0FF]"
                    }`}
                  >
                    {inv.name}{" "}
                    <span className="text-xs text-[#5A6A7A]">
                      {inv.category?.name ?? ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="mb-3">
            <label className="mb-1 block text-xs text-[#EAF0FF]/60">Description (optional)</label>
            <textarea
              placeholder="Tasting notes, details..."
              value={itemDescription}
              onChange={(e) => setItemDescription(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder-[#5A6A7A]"
            />
          </div>
          <div className="mb-3">
            <label className="mb-1 block text-xs text-[#EAF0FF]/60">Prices</label>
            {itemPrices.map((p, i) => (
              <div key={i} className="mb-2 flex gap-2">
                <input
                  type="text"
                  value={p.label}
                  onChange={(e) => {
                    const next = [...itemPrices];
                    next[i] = { ...next[i], label: e.target.value };
                    setItemPrices(next);
                  }}
                  placeholder="Glass, Bottle, Pint..."
                  className="flex-1 rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder-[#5A6A7A]"
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={p.price}
                  onChange={(e) => {
                    const next = [...itemPrices];
                    next[i] = { ...next[i], price: e.target.value };
                    setItemPrices(next);
                  }}
                  placeholder="0.00"
                  className="w-28 rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder-[#5A6A7A]"
                />
                {itemPrices.length > 1 && (
                  <button
                    onClick={() => setItemPrices(itemPrices.filter((_, j) => j !== i))}
                    className="px-2 text-sm text-red-400 hover:text-red-300"
                    type="button"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => setItemPrices([...itemPrices, { label: "", price: "" }])}
              className="text-xs text-[#E9B44C] hover:underline"
              type="button"
            >
              + Add price
            </button>
          </div>
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">ABV (%)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={itemAbv}
                onChange={(e) => setItemAbv(e.target.value)}
                placeholder="13.5"
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder-[#5A6A7A]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">Producer</label>
              <input
                type="text"
                value={itemProducer}
                onChange={(e) => setItemProducer(e.target.value)}
                placeholder="Chateau Margaux"
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder-[#5A6A7A]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">Region</label>
              <input
                type="text"
                value={itemRegion}
                onChange={(e) => setItemRegion(e.target.value)}
                placeholder="Bordeaux, France"
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder-[#5A6A7A]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">Vintage</label>
              <input
                type="number"
                min="1900"
                max="2100"
                value={itemVintage}
                onChange={(e) => setItemVintage(e.target.value)}
                placeholder="2019"
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder-[#5A6A7A]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">Varietal</label>
              <input
                type="text"
                value={itemVarietal}
                onChange={(e) => setItemVarietal(e.target.value)}
                placeholder="Cabernet Sauvignon"
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder-[#5A6A7A]"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (!selectedCategoryId || !itemInventoryId) return;
                createItem.mutate({
                  locationId: locationId!,
                  categoryId: selectedCategoryId,
                  inventoryItemId: itemInventoryId,
                  description: itemDescription || undefined,
                  prices: itemPrices.some(p => p.label && p.price)
                    ? itemPrices.filter(p => p.label && p.price).map(p => ({ label: p.label, price: parseFloat(p.price) }))
                    : undefined,
                  abv: itemAbv ? parseFloat(itemAbv) : undefined,
                  producer: itemProducer || undefined,
                  region: itemRegion || undefined,
                  vintage: itemVintage ? parseInt(itemVintage, 10) : undefined,
                  varietal: itemVarietal || undefined,
                });
              }}
              disabled={!selectedCategoryId || !itemInventoryId || createItem.isPending}
              className="rounded-md bg-[#E9B44C] px-3 py-1.5 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
            >
              {createItem.isPending ? "Adding..." : "Add Item"}
            </button>
            <button
              onClick={() => {
                setShowItemForm(false);
                setItemInventoryId("");
                setItemDescription("");
                setInventorySearch("");
                setItemPrices([{ label: "", price: "" }]);
                setItemAbv("");
                setItemProducer("");
                setItemRegion("");
                setItemVintage("");
                setItemVarietal("");
              }}
              className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-[#EAF0FF]/60 hover:bg-[#16283F]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Items Grid */}
      {loadingItems ? (
        <p className="text-[#EAF0FF]/60">Loading...</p>
      ) : items?.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-8 text-center text-[#EAF0FF]/60">
          No guide items found.{" "}
          {categories && categories.length === 0
            ? "Create a category first."
            : "Add items to get started."}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items?.map((item: any) => (
            <Link
              key={item.id}
              href={`/guide/${item.id}`}
              className={`group rounded-lg border border-white/10 bg-[#16283F] shadow-sm transition-shadow hover:shadow-md ${
                !item.active ? "opacity-50" : ""
              }`}
            >
              <div className="aspect-square w-full overflow-hidden rounded-t-lg bg-[#16283F]/60">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.inventoryItem.name}
                    className="h-full w-full object-contain transition-transform group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-4xl text-[#EAF0FF]/30">
                    🍷
                  </div>
                )}
              </div>
              <div className="p-3">
                <h3 className="truncate text-sm font-semibold text-[#EAF0FF]">
                  {item.inventoryItem.name}
                </h3>
                <p className="truncate text-xs text-[#EAF0FF]/60">
                  {item.category.name}
                </p>
                <p className="mt-1 text-xs capitalize text-[#5A6A7A]">
                  {item.inventoryItem.category?.name ?? ""}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
