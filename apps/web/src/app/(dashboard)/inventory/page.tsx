"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";
import { InventoryItemType, UOM } from "@barstock/types";

type SortKey = "name" | "type";
type SortDir = "asc" | "desc";

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

export default function InventoryPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as any;
  const locationId = user?.locationIds?.[0];
  const utils = trpc.useUtils();

  const { data: items, isLoading } = trpc.inventory.list.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId }
  );

  const { data: onHand } = trpc.inventory.onHand.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId }
  );

  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<string>(InventoryItemType.packaged_beer);
  const [newBaseUom, setNewBaseUom] = useState<string>(UOM.units);
  const [newBarcode, setNewBarcode] = useState("");
  const [newVendorSku, setNewVendorSku] = useState("");
  const [newPackSize, setNewPackSize] = useState("");
  const [newPackUom, setNewPackUom] = useState<string>("");

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
    setNewType(InventoryItemType.packaged_beer);
    setNewBaseUom(UOM.units);
    setNewBarcode("");
    setNewVendorSku("");
    setNewPackSize("");
    setNewPackUom("");
  }

  function handleCreate() {
    if (!locationId || !newName.trim()) return;
    createMut.mutate({
      locationId,
      name: newName.trim(),
      type: newType as any,
      baseUom: newBaseUom as any,
      barcode: newBarcode.trim() || undefined,
      vendorSku: newVendorSku.trim() || undefined,
      packSize: newPackSize ? Number(newPackSize) : undefined,
      packUom: newPackUom ? (newPackUom as any) : undefined,
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
        item.type.toLowerCase().includes(filter.toLowerCase())
    );
    if (!filtered) return [];
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey].toLowerCase();
      const bVal = b[sortKey].toLowerCase();
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
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">Type</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
              >
                {Object.entries(TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">Base UOM</label>
              <select
                value={newBaseUom}
                onChange={(e) => setNewBaseUom(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
              >
                {Object.entries(UOM_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
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
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">Pack Size</label>
              <input
                type="number"
                value={newPackSize}
                onChange={(e) => setNewPackSize(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30"
                placeholder="e.g. 24"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">Pack UOM</label>
              <select
                value={newPackUom}
                onChange={(e) => setNewPackUom(e.target.value)}
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
              disabled={!newName.trim() || createMut.isPending}
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
                <SortHeader label="Type" field="type" />
                <th className="px-4 py-3">UOM</th>
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
                    <td className="px-4 py-3">{item.type.replace("_", " ")}</td>
                    <td className="px-4 py-3">{item.baseUom}</td>
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
