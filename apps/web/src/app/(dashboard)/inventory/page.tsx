"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";
import { UOM } from "@barstock/types";

type SortKey = "name" | "category";
type SortDir = "asc" | "desc";

const UOM_LABELS: Record<string, string> = {
  units: "Units",
  oz: "Oz",
  ml: "mL",
  grams: "Grams",
  L: "L",
};

export default function InventoryPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as any;
  const locationId = user?.locationIds?.[0];
  const businessId = user?.businessId;
  const utils = trpc.useUtils();

  const { data: items, isLoading } = trpc.inventory.list.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId }
  );

  const { data: onHand } = trpc.inventory.onHand.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId }
  );

  const { data: categories } = trpc.itemCategories.list.useQuery(
    { businessId: businessId! },
    { enabled: !!businessId }
  );

  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [newName, setNewName] = useState("");
  const [newCategoryId, setNewCategoryId] = useState<string>("");
  const [newBarcode, setNewBarcode] = useState("");
  const [newVendorSku, setNewVendorSku] = useState("");
  const [newPackSize, setNewPackSize] = useState("");
  const [newContainerSize, setNewContainerSize] = useState("");
  const [newContainerUom, setNewContainerUom] = useState<string>("");

  const createMut = trpc.inventory.create.useMutation({
    onSuccess: () => {
      utils.inventory.list.invalidate();
      utils.inventory.onHand.invalidate();
      setShowCreate(false);
      resetCreateForm();
    },
  });

  function resetCreateForm() {
    setNewName("");
    setNewCategoryId(categories?.[0]?.id ?? "");
    setNewBarcode("");
    setNewVendorSku("");
    setNewPackSize("");
    setNewContainerSize("");
    setNewContainerUom("");
  }

  function handleCreate() {
    if (!locationId || !newName.trim() || !newCategoryId) return;
    createMut.mutate({
      locationId,
      name: newName.trim(),
      categoryId: newCategoryId,
      baseUom: UOM.units as any,
      barcode: newBarcode.trim() || undefined,
      vendorSku: newVendorSku.trim() || undefined,
      packSize: newPackSize ? Number(newPackSize) : undefined,
      packUom: newPackSize ? (UOM.units as any) : undefined,
      containerSize: newContainerSize ? Number(newContainerSize) : undefined,
      containerUom: newContainerUom ? (newContainerUom as any) : undefined,
    });
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sortedItems = useMemo(() => {
    const filtered = items?.filter(
      (item) =>
        item.name.toLowerCase().includes(filter.toLowerCase()) ||
        (item.category?.name ?? "").toLowerCase().includes(filter.toLowerCase())
    );
    if (!filtered) return [];
    return [...filtered].sort((a, b) => {
      const aVal = sortKey === "category"
        ? (a.category?.name ?? "").toLowerCase()
        : a.name.toLowerCase();
      const bVal = sortKey === "category"
        ? (b.category?.name ?? "").toLowerCase()
        : b.name.toLowerCase();
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [items, filter, sortKey, sortDir]);

  const onHandMap = new Map(onHand?.map((o) => [o.inventoryItemId, o]) ?? []);

  function SortHeader({ label, field }: { label: string; field: SortKey }) {
    const active = sortKey === field;
    return (
      <th
        className="cursor-pointer select-none px-4 py-3 hover:text-[#EAF0FF]/80"
        onClick={() => toggleSort(field)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <span className={`text-xs ${active ? "text-[#E9B44C]" : "text-[#EAF0FF]/30"}`}>
            {active ? (sortDir === "asc" ? "▲" : "▼") : "▲"}
          </span>
        </span>
      </th>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#EAF0FF]">Inventory Catalog</h1>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E]"
        >
          {showCreate ? "Cancel" : "New Item"}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-4 rounded-lg border border-white/10 bg-[#16283F] p-4">
          <h2 className="mb-3 text-sm font-semibold text-[#EAF0FF]">New Inventory Item</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">Name *</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30"
                placeholder="Item name"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">Category</label>
              <select
                value={newCategoryId}
                onChange={(e) => setNewCategoryId(e.target.value)}
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
                value={newBarcode}
                onChange={(e) => setNewBarcode(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30"
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">Vendor SKU</label>
              <input
                type="text"
                value={newVendorSku}
                onChange={(e) => setNewVendorSku(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30"
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="mb-1 inline-flex items-center gap-1 text-xs text-[#EAF0FF]/60">
                Pack Size
                <span title="Number of items per case or pack. E.g. 12 for a case of 12 bottles." className="cursor-help rounded-full border border-[#EAF0FF]/20 px-1 text-[10px] leading-tight text-[#EAF0FF]/40 hover:text-[#EAF0FF]/70">?</span>
              </label>
              <input
                type="number"
                value={newPackSize}
                onChange={(e) => setNewPackSize(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30"
                placeholder="e.g. 12"
              />
            </div>
            <div>
              <label className="mb-1 inline-flex items-center gap-1 text-xs text-[#EAF0FF]/60">
                Container Size
                <span title="Volume or weight of a single container. E.g. 750 for a 750mL bottle." className="cursor-help rounded-full border border-[#EAF0FF]/20 px-1 text-[10px] leading-tight text-[#EAF0FF]/40 hover:text-[#EAF0FF]/70">?</span>
              </label>
              <input
                type="number"
                value={newContainerSize}
                onChange={(e) => setNewContainerSize(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30"
                placeholder="e.g. 750"
              />
            </div>
            <div>
              <label className="mb-1 inline-flex items-center gap-1 text-xs text-[#EAF0FF]/60">
                Container UOM
                <span title="Unit for the container size. E.g. 'mL' for a 750mL bottle, 'Oz' for a 12oz can." className="cursor-help rounded-full border border-[#EAF0FF]/20 px-1 text-[10px] leading-tight text-[#EAF0FF]/40 hover:text-[#EAF0FF]/70">?</span>
              </label>
              <select
                value={newContainerUom}
                onChange={(e) => setNewContainerUom(e.target.value)}
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
              onClick={handleCreate}
              disabled={!newName.trim() || !newCategoryId || createMut.isPending}
              className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
            >
              {createMut.isPending ? "Creating..." : "Create Item"}
            </button>
            {createMut.error && (
              <p className="text-sm text-red-400">{createMut.error.message}</p>
            )}
          </div>
        </div>
      )}

      <input
        type="text"
        placeholder="Search items..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="mb-4 w-full max-w-sm rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
      />

      {isLoading ? (
        <p className="text-[#EAF0FF]/60">Loading...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
              <tr>
                <SortHeader label="Name" field="name" />
                <SortHeader label="Category" field="category" />
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3">On Hand</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedItems.map((item) => {
                const oh = onHandMap.get(item.id);
                return (
                  <tr
                    key={item.id}
                    onClick={() => router.push(`/inventory/${item.id}`)}
                    className="cursor-pointer hover:bg-[#0B1623]/60"
                  >
                    <td className="px-4 py-3 font-medium">{item.name}</td>
                    <td className="px-4 py-3">{item.category?.name ?? "—"}</td>
                    <td className="px-4 py-3 max-w-[120px] truncate text-[#EAF0FF]/70">{(item as any).vendor?.name ?? "—"}</td>
                    <td className="px-4 py-3">{oh?.quantity?.toFixed(1) ?? "—"}</td>
                    <td className="px-4 py-3">
                      {oh?.totalValue != null ? `$${oh.totalValue.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          item.active ? "bg-green-500/10 text-green-400" : "bg-white/5 text-[#EAF0FF]/40"
                        }`}
                      >
                        {item.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
