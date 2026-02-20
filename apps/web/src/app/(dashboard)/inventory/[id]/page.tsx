"use client";

import { use, useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { UOM } from "@barstock/types";

const UOM_LABELS: Record<string, string> = {
  units: "Units",
  oz: "Oz",
  ml: "mL",
  grams: "Grams",
  L: "L",
};

function BottleWeightsCard({
  template: t,
  containerMl,
  containerOz,
  effectiveDensity,
  densitySource,
  onDensityUpdated,
}: {
  template: any;
  containerMl: number;
  containerOz: number;
  effectiveDensity: number;
  densitySource: string;
  onDensityUpdated: () => void;
}) {
  const [editingDensity, setEditingDensity] = useState(false);
  const [densityValue, setDensityValue] = useState("");

  const updateDensity = trpc.scale.updateTemplateDensity.useMutation({
    onSuccess: () => {
      setEditingDensity(false);
      onDensityUpdated();
    },
  });

  function startEditDensity() {
    setDensityValue(String(effectiveDensity));
    setEditingDensity(true);
  }

  function handleSaveDensity() {
    const val = parseFloat(densityValue);
    if (isNaN(val) || val < 0.5 || val > 2.0) return;
    updateDensity.mutate({ templateId: t.id, densityGPerMl: val });
  }

  return (
    <div className="mb-6 rounded-lg border border-white/10 bg-[#16283F] p-4">
      <h2 className="mb-3 text-sm font-semibold text-[#EAF0FF]">Bottle Weights</h2>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-[#EAF0FF]/60">Tare (Empty)</dt>
          <dd className="text-[#EAF0FF]">
            {t.emptyBottleWeightG != null
              ? `${Math.round(Number(t.emptyBottleWeightG))} g`
              : (() => {
                  const derived = Number(t.fullBottleWeightG) - containerMl * effectiveDensity;
                  return `~${Math.round(derived)} g (est.)`;
                })()}
          </dd>
        </div>
        <div>
          <dt className="text-[#EAF0FF]/60">Full</dt>
          <dd className="text-[#EAF0FF]">
            {t.fullBottleWeightG != null
              ? `${Math.round(Number(t.fullBottleWeightG))} g`
              : (() => {
                  const derived = Number(t.emptyBottleWeightG) + containerMl * effectiveDensity;
                  return `~${Math.round(derived)} g (est.)`;
                })()}
          </dd>
        </div>
        <div>
          <dt className="text-[#EAF0FF]/60">Container</dt>
          <dd className="text-[#EAF0FF]">
            {containerMl} mL
            <span className="ml-1 text-xs text-[#EAF0FF]/40">= {containerOz} oz</span>
          </dd>
        </div>
        <div>
          <dt className="text-[#EAF0FF]/60">Density</dt>
          <dd className="text-[#EAF0FF]">
            {editingDensity ? (
              <span className="inline-flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0.5"
                  max="2.0"
                  value={densityValue}
                  onChange={(e) => setDensityValue(e.target.value)}
                  className="w-20 rounded border border-white/20 bg-[#0B1623] px-2 py-1 text-sm text-[#EAF0FF]"
                  autoFocus
                />
                <button
                  onClick={handleSaveDensity}
                  disabled={updateDensity.isPending}
                  className="rounded bg-[#E9B44C] px-2 py-1 text-xs font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
                >
                  {updateDensity.isPending ? "..." : "Save"}
                </button>
                <button
                  onClick={() => setEditingDensity(false)}
                  className="text-xs text-[#EAF0FF]/60 hover:text-[#EAF0FF]"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <span
                className="cursor-pointer hover:text-[#E9B44C]"
                onClick={startEditDensity}
                title="Click to edit"
              >
                {effectiveDensity.toFixed(2)} g/mL
                <span className="ml-2 text-xs text-[#EAF0FF]/40">({densitySource})</span>
              </span>
            )}
            {updateDensity.error && (
              <span className="ml-2 text-xs text-red-400">{updateDensity.error.message}</span>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export default function InventoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: authSession } = useSession();
  const user = authSession?.user as any;
  const locationId = user?.locationIds?.[0];
  const utils = trpc.useUtils();

  // --- Data fetching ---
  const { data: item, isLoading } = trpc.inventory.getById.useQuery({ id });
  const businessId = user?.businessId;
  const { data: onHand } = trpc.inventory.onHand.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId }
  );
  const isKeg = item?.category?.countingMethod === "keg";
  const { data: kegSizes } = trpc.inventory.kegSizesForItem.useQuery(
    { inventoryItemId: id, businessId: businessId! },
    { enabled: !!businessId && isKeg === true }
  );
  const { data: categories } = trpc.itemCategories.list.useQuery(
    { businessId: businessId! },
    { enabled: !!businessId }
  );
  const { data: allVendors } = trpc.vendors.list.useQuery(
    { businessId: businessId!, activeOnly: true },
    { enabled: !!businessId }
  );

  // --- Edit state ---
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editBarcode, setEditBarcode] = useState("");
  const [editVendorSku, setEditVendorSku] = useState("");
  const [editPackSize, setEditPackSize] = useState("");
  const [editContainerSize, setEditContainerSize] = useState("");
  const [editContainerUom, setEditContainerUom] = useState("");

  // --- Vendor edit state ---
  type VendorRow = { vendorId: string; vendorSku: string; isPreferred: boolean };
  const [editVendors, setEditVendors] = useState<VendorRow[]>([]);
  const [addVendorId, setAddVendorId] = useState("");
  const [addVendorSku, setAddVendorSku] = useState("");

  // --- Add price state ---
  const [showAddPrice, setShowAddPrice] = useState(false);
  const [priceEntryMode, setPriceEntryMode] = useState<"per_unit" | "per_container">("per_unit");
  const [priceUnitCost, setPriceUnitCost] = useState("");
  const [priceContainerCost, setPriceContainerCost] = useState("");
  const [priceKegSizeId, setPriceKegSizeId] = useState("");
  const [priceEffectiveFrom, setPriceEffectiveFrom] = useState("");

  // --- Mutations ---
  const updateMut = trpc.inventory.update.useMutation({
    onSuccess: () => {
      utils.inventory.getById.invalidate({ id });
      utils.inventory.list.invalidate();
      setEditing(false);
    },
  });

  const setVendorsMut = trpc.inventory.setVendors.useMutation({
    onSuccess: () => {
      utils.inventory.getById.invalidate({ id });
      utils.inventory.list.invalidate();
    },
  });

  const addPriceMut = trpc.inventory.addPrice.useMutation({
    onSuccess: () => {
      utils.inventory.getById.invalidate({ id });
      setShowAddPrice(false);
      setPriceEntryMode("per_unit");
      setPriceUnitCost("");
      setPriceContainerCost("");
      setPriceKegSizeId("");
      setPriceEffectiveFrom("");
    },
  });

  function startEdit() {
    if (!item) return;
    setEditName(item.name);
    setEditCategoryId(item.categoryId ?? "");
    setEditBarcode(item.barcode ?? "");
    setEditVendorSku(item.vendorSku ?? "");
    setEditPackSize(item.packSize != null ? String(item.packSize) : "");
    setEditContainerSize(item.containerSize != null ? String(item.containerSize) : "");
    setEditContainerUom(item.containerUom ?? "");
    setEditVendors(
      (item.itemVendors ?? []).map((iv: any) => ({
        vendorId: iv.vendorId,
        vendorSku: iv.vendorSku ?? "",
        isPreferred: iv.isPreferred,
      }))
    );
    setAddVendorId("");
    setAddVendorSku("");
    setEditing(true);
  }

  function handleSave() {
    // Save vendors
    setVendorsMut.mutate({
      inventoryItemId: id,
      vendors: editVendors.map((v) => ({
        vendorId: v.vendorId,
        vendorSku: v.vendorSku || undefined,
        isPreferred: v.isPreferred,
      })),
    });
    // Save item fields
    updateMut.mutate({
      id,
      name: editName.trim(),
      categoryId: editCategoryId || undefined,
      baseUom: UOM.units as any,
      barcode: editBarcode.trim() || null,
      vendorSku: editVendorSku.trim() || null,
      packSize: editPackSize ? Number(editPackSize) : null,
      packUom: editPackSize ? (UOM.units as any) : null,
      containerSize: editContainerSize ? Number(editContainerSize) : null,
      containerUom: editContainerUom ? (editContainerUom as any) : null,
    });
  }

  function handleAddVendor() {
    if (!addVendorId || editVendors.some((v) => v.vendorId === addVendorId)) return;
    const isFirst = editVendors.length === 0;
    setEditVendors([...editVendors, { vendorId: addVendorId, vendorSku: addVendorSku, isPreferred: isFirst }]);
    setAddVendorId("");
    setAddVendorSku("");
  }

  function handleRemoveVendor(vendorId: string) {
    const updated = editVendors.filter((v) => v.vendorId !== vendorId);
    // If we removed the preferred vendor, auto-prefer the first
    if (updated.length > 0 && !updated.some((v) => v.isPreferred)) {
      updated[0].isPreferred = true;
    }
    setEditVendors(updated);
  }

  function handleSetPreferred(vendorId: string) {
    setEditVendors(editVendors.map((v) => ({ ...v, isPreferred: v.vendorId === vendorId })));
  }

  function handleToggleActive() {
    if (!item) return;
    updateMut.mutate({ id, active: !item.active });
  }

  // Derive container size in oz for the selected keg
  const selectedKegSize = kegSizes?.find((k) => k.id === priceKegSizeId);
  const containerSizeOz = selectedKegSize ? Number(selectedKegSize.totalOz) : undefined;
  const derivedUnitCost =
    priceEntryMode === "per_container" && priceContainerCost && containerSizeOz
      ? Number(priceContainerCost) / containerSizeOz
      : undefined;

  function handleAddPrice() {
    if (!priceEffectiveFrom) return;
    if (priceEntryMode === "per_container") {
      if (!priceContainerCost || !containerSizeOz) return;
      addPriceMut.mutate({
        inventoryItemId: id,
        entryMode: "per_container",
        containerCost: Number(priceContainerCost),
        containerSizeOz,
        currency: "CAD",
        effectiveFromTs: new Date(priceEffectiveFrom),
      });
    } else {
      if (!priceUnitCost) return;
      addPriceMut.mutate({
        inventoryItemId: id,
        entryMode: "per_unit",
        unitCost: Number(priceUnitCost),
        currency: "CAD",
        effectiveFromTs: new Date(priceEffectiveFrom),
      });
    }
  }

  // --- Derived ---
  const itemOnHand = onHand?.find((o) => o.inventoryItemId === id);

  if (isLoading) return <p className="text-[#EAF0FF]/60">Loading...</p>;
  if (!item) return <p className="text-[#EAF0FF]/60">Item not found.</p>;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/inventory"
          className="mb-2 inline-block text-sm text-[#EAF0FF]/60 hover:text-[#EAF0FF]"
        >
          &larr; Back to Inventory
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-[#EAF0FF]">{item.name}</h1>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              item.active
                ? "bg-green-500/10 text-green-400"
                : "bg-white/5 text-[#EAF0FF]/40"
            }`}
          >
            {item.active ? "Active" : "Inactive"}
          </span>
        </div>

        <p className="mt-1 text-sm text-[#EAF0FF]/60">
          {item.category?.name ?? "Uncategorized"} &middot; {UOM_LABELS[item.baseUom] ?? item.baseUom}
        </p>
      </div>

      {/* Item Details Card */}
      <div className="mb-6 rounded-lg border border-white/10 bg-[#16283F] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#EAF0FF]">Item Details</h2>
          <div className="flex gap-2">
            {!editing && (
              <button
                onClick={startEdit}
                className="rounded-md border border-white/10 px-3 py-1 text-xs text-[#EAF0FF] hover:bg-white/5"
              >
                Edit
              </button>
            )}
            <button
              onClick={handleToggleActive}
              disabled={updateMut.isPending}
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                item.active
                  ? "border border-red-500/30 text-red-400 hover:bg-red-500/10"
                  : "border border-green-500/30 text-green-400 hover:bg-green-500/10"
              }`}
            >
              {item.active ? "Deactivate" : "Reactivate"}
            </button>
          </div>
        </div>

        {editing ? (
          <div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs text-[#EAF0FF]/60">Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#EAF0FF]/60">Category</label>
                <select
                  value={editCategoryId}
                  onChange={(e) => setEditCategoryId(e.target.value)}
                  className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
                >
                  <option value="">Select category...</option>
                  {categories?.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#EAF0FF]/60">Barcode</label>
                <input
                  type="text"
                  value={editBarcode}
                  onChange={(e) => setEditBarcode(e.target.value)}
                  className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
                />
              </div>
              <div>
                <label className="mb-1 inline-flex items-center gap-1 text-xs text-[#EAF0FF]/60">
                  Pack Size
                  <span title="Number of items per case or pack. E.g. 12 for a case of 12 bottles." className="cursor-help rounded-full border border-[#EAF0FF]/20 px-1 text-[10px] leading-tight text-[#EAF0FF]/40 hover:text-[#EAF0FF]/70">?</span>
                </label>
                <input
                  type="number"
                  value={editPackSize}
                  onChange={(e) => setEditPackSize(e.target.value)}
                  className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
                />
              </div>
              <div>
                <label className="mb-1 inline-flex items-center gap-1 text-xs text-[#EAF0FF]/60">
                  Container Size
                  <span title="Volume or weight of a single container. E.g. 750 for a 750mL bottle." className="cursor-help rounded-full border border-[#EAF0FF]/20 px-1 text-[10px] leading-tight text-[#EAF0FF]/40 hover:text-[#EAF0FF]/70">?</span>
                </label>
                <input
                  type="number"
                  value={editContainerSize}
                  onChange={(e) => setEditContainerSize(e.target.value)}
                  className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
                />
              </div>
              <div>
                <label className="mb-1 inline-flex items-center gap-1 text-xs text-[#EAF0FF]/60">
                  Container UOM
                  <span title="Unit for the container size. E.g. 'mL' for a 750mL bottle, 'Oz' for a 12oz can." className="cursor-help rounded-full border border-[#EAF0FF]/20 px-1 text-[10px] leading-tight text-[#EAF0FF]/40 hover:text-[#EAF0FF]/70">?</span>
                </label>
                <select
                  value={editContainerUom}
                  onChange={(e) => setEditContainerUom(e.target.value)}
                  className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
                >
                  <option value="">None</option>
                  {Object.entries(UOM_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Multi-vendor editor */}
            <div className="mt-4 rounded-md border border-white/10 bg-[#0B1623]/50 p-3">
              <label className="mb-2 block text-xs font-medium text-[#EAF0FF]/60">Vendors</label>
              {editVendors.length > 0 && (
                <div className="mb-2 space-y-1">
                  {editVendors.map((ev) => {
                    const vendorName = allVendors?.find((v) => v.id === ev.vendorId)?.name ?? ev.vendorId;
                    return (
                      <div key={ev.vendorId} className="flex items-center gap-2 text-sm">
                        <button
                          type="button"
                          onClick={() => handleSetPreferred(ev.vendorId)}
                          className={`text-base ${ev.isPreferred ? "text-[#E9B44C]" : "text-[#EAF0FF]/20 hover:text-[#E9B44C]/60"}`}
                          title={ev.isPreferred ? "Preferred vendor" : "Set as preferred"}
                        >
                          &#9733;
                        </button>
                        <span className="text-[#EAF0FF]">{vendorName}</span>
                        {ev.vendorSku && <span className="text-[#EAF0FF]/40 text-xs">(SKU: {ev.vendorSku})</span>}
                        <button
                          type="button"
                          onClick={() => handleRemoveVendor(ev.vendorId)}
                          className="ml-auto text-xs text-red-400/60 hover:text-red-400"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <select
                    value={addVendorId}
                    onChange={(e) => setAddVendorId(e.target.value)}
                    className="w-full rounded-md border border-white/10 bg-[#0B1623] px-2 py-1.5 text-sm text-[#EAF0FF]"
                  >
                    <option value="">Select vendor...</option>
                    {allVendors
                      ?.filter((v) => !editVendors.some((ev) => ev.vendorId === v.id))
                      .map((v) => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                  </select>
                </div>
                <div>
                  <input
                    type="text"
                    value={addVendorSku}
                    onChange={(e) => setAddVendorSku(e.target.value)}
                    placeholder="SKU (optional)"
                    className="w-28 rounded-md border border-white/10 bg-[#0B1623] px-2 py-1.5 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddVendor}
                  disabled={!addVendorId}
                  className="rounded-md bg-[#E9B44C] px-3 py-1.5 text-xs font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={updateMut.isPending || setVendorsMut.isPending || !editName.trim()}
                className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
              >
                {updateMut.isPending || setVendorsMut.isPending ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="rounded-md border border-white/10 px-4 py-2 text-sm text-[#EAF0FF] hover:bg-white/5"
              >
                Cancel
              </button>
              {(updateMut.error || setVendorsMut.error) && (
                <p className="text-sm text-red-400">{(updateMut.error || setVendorsMut.error)?.message}</p>
              )}
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-4">
            <div>
              <dt className="text-[#EAF0FF]/60">Category</dt>
              <dd className="text-[#EAF0FF]">{item.category?.name ?? "Uncategorized"}</dd>
            </div>
            <div>
              <dt className="text-[#EAF0FF]/60">Barcode</dt>
              <dd className="text-[#EAF0FF]">{item.barcode || "—"}</dd>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <dt className="text-[#EAF0FF]/60">Vendors</dt>
              <dd className="text-[#EAF0FF]">
                {item.itemVendors && item.itemVendors.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {item.itemVendors.map((iv: any) => (
                      <span key={iv.vendorId} className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-0.5 text-xs">
                        {iv.isPreferred && <span className="text-[#E9B44C]" title="Preferred vendor">&#9733;</span>}
                        {iv.vendor.name}
                        {iv.vendorSku && <span className="text-[#EAF0FF]/40">(SKU: {iv.vendorSku})</span>}
                      </span>
                    ))}
                  </div>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[#EAF0FF]/60">Pack Size</dt>
              <dd className="text-[#EAF0FF]">{item.packSize != null ? String(item.packSize) : "—"}</dd>
            </div>
            <div>
              <dt className="text-[#EAF0FF]/60">Container Size</dt>
              <dd className="text-[#EAF0FF]">{item.containerSize != null ? String(item.containerSize) : "—"}</dd>
            </div>
            <div>
              <dt className="text-[#EAF0FF]/60">Container UOM</dt>
              <dd className="text-[#EAF0FF]">{item.containerUom ? (UOM_LABELS[item.containerUom] ?? item.containerUom) : "—"}</dd>
            </div>
            <div>
              <dt className="text-[#EAF0FF]/60">ID</dt>
              <dd className="font-mono text-xs text-[#EAF0FF]/40">{item.id}</dd>
            </div>
          </dl>
        )}
      </div>

      {/* Bottle Weights (with editable density when template exists) */}
      {item.bottleTemplates?.[0] && (() => {
        const t = item.bottleTemplates[0];
        const containerMl = Number(t.containerSizeMl);
        const containerOz = Math.round((containerMl / 29.5735) * 10) / 10;
        const templateDensity = t.densityGPerMl != null ? Number(t.densityGPerMl) : null;
        const categoryDensity = item.category?.defaultDensity != null ? Number(item.category.defaultDensity) : null;
        const effectiveDensity = templateDensity ?? categoryDensity ?? 0.95;
        const densitySource = templateDensity != null ? "from template" : categoryDensity != null ? "category default" : "system default";

        return (
          <BottleWeightsCard
            template={t}
            containerMl={containerMl}
            containerOz={containerOz}
            effectiveDensity={effectiveDensity}
            densitySource={densitySource}
            onDensityUpdated={() => utils.inventory.getById.invalidate({ id })}
          />
        );
      })()}

      {/* Density info for weighable items without template */}
      {item.category?.countingMethod === "weighable" && !item.bottleTemplates?.[0] && (
        <div className="mb-6 rounded-lg border border-white/10 bg-[#16283F] p-4">
          <h2 className="mb-3 text-sm font-semibold text-[#EAF0FF]">Density</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <dt className="text-[#EAF0FF]/60">Density</dt>
              <dd className="text-[#EAF0FF]">
                {item.category?.defaultDensity != null
                  ? `${Number(item.category.defaultDensity).toFixed(2)} g/mL`
                  : "0.95 g/mL"}
                <span className="ml-2 text-xs text-[#EAF0FF]/40">
                  ({item.category?.defaultDensity != null ? "category default" : "system default"})
                </span>
              </dd>
            </div>
          </dl>
        </div>
      )}

      {/* On-Hand Section */}
      <div className="mb-6 rounded-lg border border-white/10 bg-[#16283F] p-4">
        <h2 className="mb-3 text-sm font-semibold text-[#EAF0FF]">On-Hand</h2>
        {itemOnHand ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-[#EAF0FF]/60">Quantity</dt>
              <dd className="text-lg font-semibold text-[#EAF0FF]">
                {itemOnHand.quantity?.toFixed(1)} {UOM_LABELS[item.baseUom] ?? item.baseUom}
              </dd>
            </div>
            <div>
              <dt className="text-[#EAF0FF]/60">Unit Cost</dt>
              <dd className="text-[#EAF0FF]">
                {itemOnHand.unitCost != null
                  ? `$${Number(itemOnHand.unitCost).toFixed(isKeg ? 4 : 2)}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[#EAF0FF]/60">Total Value</dt>
              <dd className="text-lg font-semibold text-[#E9B44C]">
                {itemOnHand.totalValue != null
                  ? `$${itemOnHand.totalValue.toFixed(2)}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[#EAF0FF]/60">As Of</dt>
              <dd className="text-[#EAF0FF]">{new Date().toLocaleDateString()}</dd>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[#EAF0FF]/40">No on-hand data available.</p>
        )}
      </div>

      {/* Price History Section */}
      <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#EAF0FF]">Price History</h2>
          <button
            onClick={() => setShowAddPrice((v) => !v)}
            className="rounded-md border border-white/10 px-3 py-1 text-xs text-[#EAF0FF] hover:bg-white/5"
          >
            {showAddPrice ? "Cancel" : "Add Price"}
          </button>
        </div>

        {showAddPrice && (
          <div className="mb-3 rounded-md border border-white/10 bg-[#0B1623] p-3">
            {/* Entry mode toggle — only show for keg items */}
            {isKeg && (
              <div className="mb-3">
                <div className="inline-flex rounded-md border border-white/10">
                  <button
                    type="button"
                    onClick={() => setPriceEntryMode("per_unit")}
                    className={`px-3 py-1 text-xs font-medium ${
                      priceEntryMode === "per_unit"
                        ? "bg-[#E9B44C] text-[#0B1623]"
                        : "text-[#EAF0FF]/60 hover:text-[#EAF0FF]"
                    }`}
                  >
                    Per Unit
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriceEntryMode("per_container")}
                    className={`px-3 py-1 text-xs font-medium ${
                      priceEntryMode === "per_container"
                        ? "bg-[#E9B44C] text-[#0B1623]"
                        : "text-[#EAF0FF]/60 hover:text-[#EAF0FF]"
                    }`}
                  >
                    Per Keg
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-end gap-3">
              {priceEntryMode === "per_container" && isKeg ? (
                <>
                  {/* Keg size selector */}
                  <div>
                    <label className="mb-1 block text-xs text-[#EAF0FF]/60">Keg Size</label>
                    <select
                      value={priceKegSizeId}
                      onChange={(e) => setPriceKegSizeId(e.target.value)}
                      className="rounded-md border border-white/10 bg-[#16283F] px-3 py-2 text-sm text-[#EAF0FF]"
                    >
                      <option value="">Select keg size...</option>
                      {kegSizes?.map((ks) => (
                        <option key={ks.id} value={ks.id}>
                          {ks.name} ({Number(ks.totalOz)} oz)
                        </option>
                      ))}
                    </select>
                  </div>
                  {/* Container cost */}
                  <div>
                    <label className="mb-1 block text-xs text-[#EAF0FF]/60">Keg Cost ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={priceContainerCost}
                      onChange={(e) => setPriceContainerCost(e.target.value)}
                      className="w-32 rounded-md border border-white/10 bg-[#16283F] px-3 py-2 text-sm text-[#EAF0FF]"
                      placeholder="0.00"
                    />
                  </div>
                  {/* Live preview */}
                  {derivedUnitCost != null && (
                    <div className="self-center text-xs text-[#EAF0FF]/60">
                      = ${derivedUnitCost.toFixed(4)} per oz
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <label className="mb-1 block text-xs text-[#EAF0FF]/60">
                    Cost per {UOM_LABELS[item.baseUom] ?? item.baseUom} ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={priceUnitCost}
                    onChange={(e) => setPriceUnitCost(e.target.value)}
                    className="w-32 rounded-md border border-white/10 bg-[#16283F] px-3 py-2 text-sm text-[#EAF0FF]"
                    placeholder="0.00"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs text-[#EAF0FF]/60">Effective From</label>
                <input
                  type="date"
                  value={priceEffectiveFrom}
                  onChange={(e) => setPriceEffectiveFrom(e.target.value)}
                  className="rounded-md border border-white/10 bg-[#16283F] px-3 py-2 text-sm text-[#EAF0FF]"
                />
              </div>
              <button
                onClick={handleAddPrice}
                disabled={
                  !priceEffectiveFrom ||
                  (priceEntryMode === "per_container"
                    ? !priceContainerCost || !priceKegSizeId
                    : !priceUnitCost) ||
                  addPriceMut.isPending
                }
                className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
              >
                {addPriceMut.isPending ? "Adding..." : "Add"}
              </button>
              {addPriceMut.error && (
                <p className="text-sm text-red-400">{addPriceMut.error.message}</p>
              )}
            </div>

            {isKeg && priceEntryMode === "per_container" && (
              <p className="mt-2 text-xs text-[#EAF0FF]/40">
                Enter the full keg price. We'll calculate the per-oz cost automatically.
              </p>
            )}
          </div>
        )}

        {item.priceHistory.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase text-[#EAF0FF]/60">
                <tr>
                  <th className="px-4 py-2">Unit Cost</th>
                  {isKeg && <th className="px-4 py-2">Keg Cost</th>}
                  <th className="px-4 py-2">Currency</th>
                  <th className="px-4 py-2">Effective From</th>
                  <th className="px-4 py-2">Effective To</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-[#EAF0FF]">
                {item.priceHistory.map((price) => (
                  <tr key={price.id} className="hover:bg-white/5">
                    <td className="px-4 py-2">${Number(price.unitCost).toFixed(4)}</td>
                    {isKeg && (
                      <td className="px-4 py-2">
                        {(price as any).containerCost != null
                          ? `$${Number((price as any).containerCost).toFixed(2)}`
                          : "—"}
                      </td>
                    )}
                    <td className="px-4 py-2">{price.currency}</td>
                    <td className="px-4 py-2">
                      {new Date(price.effectiveFromTs).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2">
                      {price.effectiveToTs
                        ? new Date(price.effectiveToTs).toLocaleDateString()
                        : "Current"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[#EAF0FF]/40">No price history recorded.</p>
        )}
      </div>
    </div>
  );
}
