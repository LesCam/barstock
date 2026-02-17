"use client";

import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";
import { useState, useMemo } from "react";
import { MappingMode } from "@barstock/types";

const MODE_OPTIONS = [
  { value: MappingMode.packaged_unit, label: "Packaged Unit" },
  { value: MappingMode.draft_by_tap, label: "Draft by Tap" },
] as const;

export default function UnmappedPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const locationId = user?.locationIds?.[0];

  const [search, setSearch] = useState("");
  const [mappingItemKey, setMappingItemKey] = useState<string | null>(null);
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [mode, setMode] = useState<string>(MappingMode.packaged_unit);
  const [inventorySearch, setInventorySearch] = useState("");
  const [pourProfileId, setPourProfileId] = useState("");
  const [tapLineId, setTapLineId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: unmapped, isLoading } = trpc.pos.unmapped.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId }
  );

  const { data: inventoryItems } = trpc.inventory.list.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId && !!mappingItemKey }
  );

  const isDraft = mode === MappingMode.draft_by_tap;

  const { data: pourProfiles } = trpc.draft.listPourProfiles.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId && isDraft && !!mappingItemKey }
  );

  const { data: tapLines } = trpc.draft.listTapLines.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId && isDraft && !!mappingItemKey }
  );

  const createMapping = trpc.mappings.create.useMutation({
    onSuccess: () => {
      utils.pos.unmapped.invalidate();
      setMappingItemKey(null);
      resetForm();
    },
    onError: (err) => setError(err.message),
  });

  function resetForm() {
    setInventoryItemId("");
    setMode(MappingMode.packaged_unit);
    setPourProfileId("");
    setTapLineId("");
    setInventorySearch("");
    setError(null);
  }

  function openMapping(key: string) {
    setMappingItemKey(key);
    resetForm();
  }

  function handleSave(item: { source_system: string; pos_item_id: string }) {
    if (!inventoryItemId) {
      setError("Select an inventory item");
      return;
    }
    if (isDraft && !pourProfileId) {
      setError("Select a pour profile for draft mode");
      return;
    }
    if (isDraft && !tapLineId) {
      setError("Select a tap line for draft mode");
      return;
    }
    setError(null);
    createMapping.mutate({
      locationId: locationId!,
      sourceSystem: item.source_system as any,
      posItemId: item.pos_item_id,
      inventoryItemId,
      mode: mode as any,
      ...(isDraft && { pourProfileId, tapLineId }),
      effectiveFromTs: new Date(),
    });
  }

  const filteredUnmapped = useMemo(() => {
    if (!unmapped) return [];
    if (!search.trim()) return unmapped;
    const q = search.toLowerCase();
    return unmapped.filter(
      (item) =>
        item.pos_item_name.toLowerCase().includes(q) ||
        item.pos_item_id.toLowerCase().includes(q)
    );
  }, [unmapped, search]);

  const filteredInventory = useMemo(() => {
    if (!inventoryItems) return [];
    if (!inventorySearch.trim()) return inventoryItems;
    const q = inventorySearch.toLowerCase();
    return inventoryItems.filter((item) =>
      item.name.toLowerCase().includes(q)
    );
  }, [inventoryItems, inventorySearch]);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Unmapped POS Items</h1>
      <p className="mb-6 text-sm text-gray-500">
        Items sold in the last 7 days that have no inventory mapping. Map them to start tracking depletion.
      </p>

      {isLoading ? (
        <p className="text-gray-500">Loading...</p>
      ) : unmapped?.length === 0 ? (
        <div className="rounded-lg border bg-green-50 p-6 text-center text-green-700">
          All POS items are mapped. Nice work!
        </div>
      ) : (
        <>
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search unmapped items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full max-w-sm rounded-md border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">POS Item</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Qty Sold (7d)</th>
                  <th className="px-4 py-3">First Seen</th>
                  <th className="px-4 py-3">Last Seen</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredUnmapped.map((item) => {
                  const key = `${item.source_system}-${item.pos_item_id}`;
                  const isOpen = mappingItemKey === key;
                  return (
                    <tr key={key} className="hover:bg-gray-50">
                      <td className="px-4 py-3" colSpan={isOpen ? 6 : undefined}>
                        {isOpen ? (
                          <div>
                            <div className="mb-3 flex items-center gap-2">
                              <span className="font-medium">{item.pos_item_name}</span>
                              <span className="font-mono text-xs text-gray-400">{item.pos_item_id}</span>
                              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-600">{item.source_system}</span>
                            </div>

                            <div className="flex flex-wrap items-end gap-3">
                              <div className="min-w-[240px] flex-1">
                                <label className="mb-1 block text-xs font-medium text-gray-600">Inventory Item</label>
                                <input
                                  type="text"
                                  placeholder="Search inventory..."
                                  value={inventorySearch}
                                  onChange={(e) => setInventorySearch(e.target.value)}
                                  className="mb-1 w-full rounded-md border px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <select
                                  value={inventoryItemId}
                                  onChange={(e) => setInventoryItemId(e.target.value)}
                                  className="w-full rounded-md border px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                  <option value="">Select item...</option>
                                  {filteredInventory.map((inv) => (
                                    <option key={inv.id} value={inv.id}>
                                      {inv.name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="min-w-[160px]">
                                <label className="mb-1 block text-xs font-medium text-gray-600">Mode</label>
                                <select
                                  value={mode}
                                  onChange={(e) => setMode(e.target.value)}
                                  className="w-full rounded-md border px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                  {MODE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {isDraft && (
                                <>
                                  <div className="min-w-[160px]">
                                    <label className="mb-1 block text-xs font-medium text-gray-600">Pour Profile</label>
                                    <select
                                      value={pourProfileId}
                                      onChange={(e) => setPourProfileId(e.target.value)}
                                      className="w-full rounded-md border px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    >
                                      <option value="">Select profile...</option>
                                      {pourProfiles?.map((p) => (
                                        <option key={p.id} value={p.id}>
                                          {p.name} ({String(p.oz)}oz)
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <div className="min-w-[160px]">
                                    <label className="mb-1 block text-xs font-medium text-gray-600">Tap Line</label>
                                    <select
                                      value={tapLineId}
                                      onChange={(e) => setTapLineId(e.target.value)}
                                      className="w-full rounded-md border px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    >
                                      <option value="">Select tap...</option>
                                      {tapLines?.map((t) => {
                                        const assignment = t.tapAssignments?.[0];
                                        const kegLabel = assignment?.kegInstance?.inventoryItem?.name;
                                        return (
                                          <option key={t.id} value={t.id}>
                                            {t.name}{kegLabel ? ` (${kegLabel})` : ""}
                                          </option>
                                        );
                                      })}
                                    </select>
                                  </div>
                                </>
                              )}

                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleSave(item)}
                                  disabled={createMapping.isPending}
                                  className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                  {createMapping.isPending ? "Saving..." : "Save"}
                                </button>
                                <button
                                  onClick={() => setMappingItemKey(null)}
                                  className="rounded-md border px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>

                            {error && (
                              <p className="mt-2 text-sm text-red-600">{error}</p>
                            )}
                          </div>
                        ) : (
                          <div>
                            <div className="font-medium">{item.pos_item_name}</div>
                            <div className="font-mono text-xs text-gray-400">{item.pos_item_id}</div>
                          </div>
                        )}
                      </td>
                      {!isOpen && (
                        <>
                          <td className="px-4 py-3 capitalize">{item.source_system}</td>
                          <td className="px-4 py-3 font-medium">{item.qty_sold_7d}</td>
                          <td className="px-4 py-3 text-xs">{new Date(item.first_seen).toLocaleDateString()}</td>
                          <td className="px-4 py-3 text-xs">{new Date(item.last_seen).toLocaleDateString()}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => openMapping(key)}
                              className="rounded-md bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
                            >
                              Map
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
