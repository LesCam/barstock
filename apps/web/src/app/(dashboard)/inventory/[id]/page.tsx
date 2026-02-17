"use client";

import { use, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { InventoryItemType, UOM } from "@barstock/types";

const TYPE_LABELS: Record<string, string> = {
  packaged_beer: "Packaged Beer",
  keg_beer: "Keg Beer",
  liquor: "Liquor",
  wine: "Wine",
  food: "Food",
  misc: "Misc",
};

const UOM_LABELS: Record<string, string> = {
  units: "Units",
  oz: "Oz",
  ml: "mL",
  grams: "Grams",
};

function baseUomForType(type: string): string {
  return type === InventoryItemType.keg_beer ? UOM.oz : UOM.units;
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
  const { data: onHand } = trpc.inventory.onHand.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId }
  );

  // --- Edit state ---
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("");
  const [editBarcode, setEditBarcode] = useState("");
  const [editVendorSku, setEditVendorSku] = useState("");
  const [editPackSize, setEditPackSize] = useState("");
  const [editContainerSize, setEditContainerSize] = useState("");
  const [editContainerUom, setEditContainerUom] = useState("");

  // --- Add price state ---
  const [showAddPrice, setShowAddPrice] = useState(false);
  const [priceUnitCost, setPriceUnitCost] = useState("");
  const [priceEffectiveFrom, setPriceEffectiveFrom] = useState("");

  // --- Mutations ---
  const updateMut = trpc.inventory.update.useMutation({
    onSuccess: () => {
      utils.inventory.getById.invalidate({ id });
      utils.inventory.list.invalidate();
      setEditing(false);
    },
  });

  const addPriceMut = trpc.inventory.addPrice.useMutation({
    onSuccess: () => {
      utils.inventory.getById.invalidate({ id });
      setShowAddPrice(false);
      setPriceUnitCost("");
      setPriceEffectiveFrom("");
    },
  });

  function startEdit() {
    if (!item) return;
    setEditName(item.name);
    setEditType(item.type);
    setEditBarcode(item.barcode ?? "");
    setEditVendorSku(item.vendorSku ?? "");
    setEditPackSize(item.packSize != null ? String(item.packSize) : "");
    setEditContainerSize(item.containerSize != null ? String(item.containerSize) : "");
    setEditContainerUom(item.containerUom ?? "");
    setEditing(true);
  }

  function handleSave() {
    updateMut.mutate({
      id,
      name: editName.trim(),
      type: editType as any,
      baseUom: baseUomForType(editType) as any,
      barcode: editBarcode.trim() || null,
      vendorSku: editVendorSku.trim() || null,
      packSize: editPackSize ? Number(editPackSize) : null,
      packUom: editPackSize ? (UOM.units as any) : null,
      containerSize: editContainerSize ? Number(editContainerSize) : null,
      containerUom: editContainerUom ? (editContainerUom as any) : null,
    });
  }

  function handleToggleActive() {
    if (!item) return;
    updateMut.mutate({ id, active: !item.active });
  }

  function handleAddPrice() {
    if (!priceUnitCost || !priceEffectiveFrom) return;
    addPriceMut.mutate({
      inventoryItemId: id,
      unitCost: Number(priceUnitCost),
      currency: "CAD",
      effectiveFromTs: new Date(priceEffectiveFrom),
    });
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
          {TYPE_LABELS[item.type] ?? item.type} &middot; {UOM_LABELS[item.baseUom] ?? item.baseUom}
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
                <label className="mb-1 block text-xs text-[#EAF0FF]/60">Type</label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                  className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
                >
                  {Object.entries(TYPE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
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
                <label className="mb-1 block text-xs text-[#EAF0FF]/60">Vendor SKU</label>
                <input
                  type="text"
                  value={editVendorSku}
                  onChange={(e) => setEditVendorSku(e.target.value)}
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
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={updateMut.isPending || !editName.trim()}
                className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
              >
                {updateMut.isPending ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="rounded-md border border-white/10 px-4 py-2 text-sm text-[#EAF0FF] hover:bg-white/5"
              >
                Cancel
              </button>
              {updateMut.error && (
                <p className="text-sm text-red-400">{updateMut.error.message}</p>
              )}
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-4">
            <div>
              <dt className="text-[#EAF0FF]/60">Type</dt>
              <dd className="text-[#EAF0FF]">{TYPE_LABELS[item.type] ?? item.type}</dd>
            </div>
            <div>
              <dt className="text-[#EAF0FF]/60">Barcode</dt>
              <dd className="text-[#EAF0FF]">{item.barcode || "—"}</dd>
            </div>
            <div>
              <dt className="text-[#EAF0FF]/60">Vendor SKU</dt>
              <dd className="text-[#EAF0FF]">{item.vendorSku || "—"}</dd>
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
                  ? `$${Number(itemOnHand.unitCost).toFixed(2)}`
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
          <div className="mb-3 flex flex-wrap items-end gap-3 rounded-md border border-white/10 bg-[#0B1623] p-3">
            <div>
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">Unit Cost ($)</label>
              <input
                type="number"
                step="0.01"
                value={priceUnitCost}
                onChange={(e) => setPriceUnitCost(e.target.value)}
                className="w-32 rounded-md border border-white/10 bg-[#16283F] px-3 py-2 text-sm text-[#EAF0FF]"
                placeholder="0.00"
              />
            </div>
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
              disabled={!priceUnitCost || !priceEffectiveFrom || addPriceMut.isPending}
              className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
            >
              {addPriceMut.isPending ? "Adding..." : "Add"}
            </button>
            {addPriceMut.error && (
              <p className="text-sm text-red-400">{addPriceMut.error.message}</p>
            )}
          </div>
        )}

        {item.priceHistory.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase text-[#EAF0FF]/60">
                <tr>
                  <th className="px-4 py-2">Unit Cost</th>
                  <th className="px-4 py-2">Currency</th>
                  <th className="px-4 py-2">Effective From</th>
                  <th className="px-4 py-2">Effective To</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-[#EAF0FF]">
                {item.priceHistory.map((price) => (
                  <tr key={price.id} className="hover:bg-white/5">
                    <td className="px-4 py-2">${Number(price.unitCost).toFixed(2)}</td>
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
