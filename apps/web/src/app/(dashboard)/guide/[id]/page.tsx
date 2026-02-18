"use client";

import { useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";

export default function GuideItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as any;
  const locationId = user?.locationIds?.[0];
  const fileInputRef = useRef<HTMLInputElement>(null);

  const id = params.id as string;

  const [isEditing, setIsEditing] = useState(false);
  const [editDescription, setEditDescription] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editPrices, setEditPrices] = useState<{ label: string; price: string }[]>([]);
  const [editAbv, setEditAbv] = useState("");
  const [editProducer, setEditProducer] = useState("");
  const [editRegion, setEditRegion] = useState("");
  const [editVintage, setEditVintage] = useState("");
  const [editVarietal, setEditVarietal] = useState("");

  const utils = trpc.useUtils();

  const { data: item, isLoading } = trpc.productGuide.getItem.useQuery(
    { id, locationId: locationId! },
    { enabled: !!locationId && !!id }
  );

  const { data: categories } = trpc.productGuide.listCategories.useQuery(
    { locationId: locationId!, activeOnly: true },
    { enabled: !!locationId }
  );

  const updateItem = trpc.productGuide.updateItem.useMutation({
    onSuccess: () => {
      utils.productGuide.getItem.invalidate({ id, locationId: locationId! });
      setIsEditing(false);
    },
  });

  const uploadImage = trpc.productGuide.uploadItemImage.useMutation({
    onSuccess: () => {
      utils.productGuide.getItem.invalidate({ id, locationId: locationId! });
    },
  });

  const removeImage = trpc.productGuide.removeItemImage.useMutation({
    onSuccess: () => {
      utils.productGuide.getItem.invalidate({ id, locationId: locationId! });
    },
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !locationId) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadImage.mutate({
        id,
        locationId,
        base64Data: base64,
        filename: file.name,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  function startEditing() {
    if (!item) return;
    setEditDescription(item.description ?? "");
    setEditCategoryId(item.category.id);
    const prices = Array.isArray(item.prices) ? item.prices as { label: string; price: number }[] : [];
    setEditPrices(prices.length > 0 ? prices.map(p => ({ label: p.label, price: String(p.price) })) : [{ label: "", price: "" }]);
    setEditAbv(item.abv != null ? String(item.abv) : "");
    setEditProducer(item.producer ?? "");
    setEditRegion(item.region ?? "");
    setEditVintage(item.vintage != null ? String(item.vintage) : "");
    setEditVarietal(item.varietal ?? "");
    setIsEditing(true);
  }

  function handleSave() {
    updateItem.mutate({
      id,
      locationId: locationId!,
      description: editDescription || null,
      categoryId: editCategoryId || undefined,
      prices: editPrices.some(p => p.label && p.price)
        ? editPrices.filter(p => p.label && p.price).map(p => ({ label: p.label, price: parseFloat(p.price) }))
        : null,
      abv: editAbv ? parseFloat(editAbv) : null,
      producer: editProducer || null,
      region: editRegion || null,
      vintage: editVintage ? parseInt(editVintage, 10) : null,
      varietal: editVarietal || null,
    });
  }

  function handleToggleActive() {
    if (!item) return;
    updateItem.mutate({
      id,
      locationId: locationId!,
      active: !item.active,
    });
  }

  if (isLoading) return <p className="text-[#EAF0FF]/60">Loading...</p>;
  if (!item) return <p className="text-[#EAF0FF]/60">Item not found.</p>;

  return (
    <div>
      <div className="mb-4">
        <Link href="/guide" className="text-sm text-[#E9B44C] hover:underline">
          &larr; Back to Product Guide
        </Link>
      </div>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#EAF0FF]">
            {item.inventoryItem.name}
          </h1>
          <p className="text-sm text-[#EAF0FF]/60">
            {item.category.name} &middot;{" "}
            <span className="capitalize">
              {item.inventoryItem.type.replace("_", " ")}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleToggleActive}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
              item.active
                ? "border-red-500/30 text-red-400 hover:bg-red-500/10"
                : "border-green-500/30 text-green-400 hover:bg-green-500/10"
            }`}
          >
            {item.active ? "Deactivate" : "Activate"}
          </button>
          {!isEditing && (
            <button
              onClick={startEditing}
              className="rounded-md border border-white/10 px-4 py-1.5 text-sm font-medium text-[#EAF0FF]/80 hover:bg-[#16283F]/60"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Image */}
      <div className="mb-6">
        <div className="flex gap-3">
          {item.imageUrl ? (
            <div className="relative inline-block max-h-96 max-w-sm rounded-lg bg-[#16283F]">
              <img
                src={item.imageUrl}
                alt={item.inventoryItem.name}
                className="max-h-96 max-w-sm rounded-lg object-contain"
              />
              <button
                onClick={() =>
                  removeImage.mutate({ id, locationId: locationId! })
                }
                className="absolute right-1 top-1 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white hover:bg-black/70"
                disabled={removeImage.isPending}
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex h-64 w-64 items-center justify-center rounded-lg border-2 border-dashed border-white/20 text-[#EAF0FF]/40 hover:border-white/30 hover:text-[#EAF0FF]/60"
              disabled={uploadImage.isPending}
            >
              {uploadImage.isPending ? "Uploading..." : "+ Image"}
            </button>
          )}
          {item.imageUrl && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex h-64 w-64 items-center justify-center rounded-lg border-2 border-dashed border-white/20 text-[#EAF0FF]/40 hover:border-white/30 hover:text-[#EAF0FF]/60"
              disabled={uploadImage.isPending}
            >
              {uploadImage.isPending ? "Uploading..." : "Replace Image"}
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="hidden"
        />
      </div>

      {/* Details */}
      <div className="rounded-lg border border-white/10 bg-[#16283F] p-5">
        {isEditing ? (
          <div>
            <div className="mb-4">
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">
                Category
              </label>
              <select
                value={editCategoryId}
                onChange={(e) => setEditCategoryId(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
              >
                {categories?.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-4">
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">
                Description
              </label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={5}
                placeholder="Tasting notes, details..."
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder-[#5A6A7A]"
              />
            </div>
            <div className="mb-4">
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">Prices</label>
              {editPrices.map((p, i) => (
                <div key={i} className="mb-2 flex gap-2">
                  <input
                    type="text"
                    value={p.label}
                    onChange={(e) => {
                      const next = [...editPrices];
                      next[i] = { ...next[i], label: e.target.value };
                      setEditPrices(next);
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
                      const next = [...editPrices];
                      next[i] = { ...next[i], price: e.target.value };
                      setEditPrices(next);
                    }}
                    placeholder="0.00"
                    className="w-28 rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder-[#5A6A7A]"
                  />
                  <button
                    onClick={() => setEditPrices(editPrices.filter((_, j) => j !== i))}
                    className="px-2 text-sm text-red-400 hover:text-red-300"
                    type="button"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={() => setEditPrices([...editPrices, { label: "", price: "" }])}
                className="text-xs text-[#E9B44C] hover:underline"
                type="button"
              >
                + Add price
              </button>
            </div>
            <div className="mb-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-[#EAF0FF]/60">ABV (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={editAbv}
                  onChange={(e) => setEditAbv(e.target.value)}
                  placeholder="13.5"
                  className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder-[#5A6A7A]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#EAF0FF]/60">Producer</label>
                <input
                  type="text"
                  value={editProducer}
                  onChange={(e) => setEditProducer(e.target.value)}
                  placeholder="Chateau Margaux"
                  className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder-[#5A6A7A]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#EAF0FF]/60">Region</label>
                <input
                  type="text"
                  value={editRegion}
                  onChange={(e) => setEditRegion(e.target.value)}
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
                  value={editVintage}
                  onChange={(e) => setEditVintage(e.target.value)}
                  placeholder="2019"
                  className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder-[#5A6A7A]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#EAF0FF]/60">Varietal</label>
                <input
                  type="text"
                  value={editVarietal}
                  onChange={(e) => setEditVarietal(e.target.value)}
                  placeholder="Cabernet Sauvignon"
                  className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder-[#5A6A7A]"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={updateItem.isPending}
                className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
              >
                {updateItem.isPending ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="rounded-md border border-white/10 px-4 py-2 text-sm text-[#EAF0FF]/60 hover:bg-[#16283F]"
              >
                Cancel
              </button>
            </div>
            {updateItem.error && (
              <p className="mt-2 text-sm text-red-400">
                {updateItem.error.message}
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-[#EAF0FF]/60">Category</p>
              <p className="font-medium text-[#EAF0FF]">{item.category.name}</p>
            </div>
            <div>
              <p className="text-xs text-[#EAF0FF]/60">Type</p>
              <p className="capitalize text-[#EAF0FF]">
                {item.inventoryItem.type.replace("_", " ")}
              </p>
            </div>
            {item.inventoryItem.barcode && (
              <div>
                <p className="text-xs text-[#EAF0FF]/60">Barcode</p>
                <p className="text-[#EAF0FF]">{item.inventoryItem.barcode}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-[#EAF0FF]/60">Status</p>
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                  item.active
                    ? "bg-green-500/10 text-green-400"
                    : "bg-red-500/10 text-red-400"
                }`}
              >
                {item.active ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-[#EAF0FF]/60">Description</p>
              <p className="whitespace-pre-wrap text-[#EAF0FF]">
                {item.description || "No description yet."}
              </p>
            </div>
            {Array.isArray(item.prices) && (item.prices as { label: string; price: number }[]).length > 0 && (
              <div className="sm:col-span-2">
                <p className="text-xs text-[#EAF0FF]/60">Prices</p>
                <div className="mt-1 flex flex-wrap gap-3">
                  {(item.prices as { label: string; price: number }[]).map((p, i) => (
                    <span key={i} className="text-[#EAF0FF]">
                      <span className="text-[#EAF0FF]/60">{p.label}:</span> ${Number(p.price).toFixed(2)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {item.abv != null && (
              <div>
                <p className="text-xs text-[#EAF0FF]/60">ABV</p>
                <p className="text-[#EAF0FF]">{Number(item.abv)}%</p>
              </div>
            )}
            {item.producer && (
              <div>
                <p className="text-xs text-[#EAF0FF]/60">Producer</p>
                <p className="text-[#EAF0FF]">{item.producer}</p>
              </div>
            )}
            {item.region && (
              <div>
                <p className="text-xs text-[#EAF0FF]/60">Region</p>
                <p className="text-[#EAF0FF]">{item.region}</p>
              </div>
            )}
            {item.vintage != null && (
              <div>
                <p className="text-xs text-[#EAF0FF]/60">Vintage</p>
                <p className="text-[#EAF0FF]">{item.vintage}</p>
              </div>
            )}
            {item.varietal && (
              <div>
                <p className="text-xs text-[#EAF0FF]/60">Varietal</p>
                <p className="text-[#EAF0FF]">{item.varietal}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
