"use client";

import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";
import { useLocation } from "@/components/location-context";
import { useState, useMemo } from "react";
import { HelpLink } from "@/components/help-link";
import { MappingMode, UOM } from "@barstock/types";

const MODE_OPTIONS = [
  { value: MappingMode.packaged_unit, label: "Packaged Unit" },
  { value: MappingMode.draft_by_tap, label: "Draft by Tap" },
  { value: MappingMode.recipe, label: "Recipe" },
] as const;

const UOM_LABELS: Record<string, string> = {
  oz: "oz",
  ml: "mL",
  units: "units",
  grams: "g",
  L: "L",
};

type SuggestionOverride = {
  accepted: boolean;
  targetId?: string;
  targetType?: "inventoryItem" | "recipe";
  mode?: string;
};

function confidenceBadge(confidence: number) {
  if (confidence > 0.7) return { label: "High", className: "bg-green-500/20 text-green-400 border-green-500/30" };
  if (confidence > 0.4) return { label: "Medium", className: "bg-amber-500/20 text-amber-400 border-amber-500/30" };
  return { label: "Low", className: "bg-red-500/20 text-red-400 border-red-500/30" };
}

export default function UnmappedPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const { selectedLocationId: locationId } = useLocation();

  const [search, setSearch] = useState("");
  const [mappingItemKey, setMappingItemKey] = useState<string | null>(null);
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [mode, setMode] = useState<string>(MappingMode.packaged_unit);
  const [inventorySearch, setInventorySearch] = useState("");
  const [pourProfileId, setPourProfileId] = useState("");
  const [tapLineId, setTapLineId] = useState("");
  const [recipeId, setRecipeId] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Inline recipe creation state
  const [showCreateRecipe, setShowCreateRecipe] = useState(false);
  const [newRecipeName, setNewRecipeName] = useState("");
  const [newRecipeIngredients, setNewRecipeIngredients] = useState<
    { inventoryItemId: string; quantity: string; uom: string }[]
  >([{ inventoryItemId: "", quantity: "", uom: UOM.oz }]);
  const [newRecipeIngSearch, setNewRecipeIngSearch] = useState<Record<number, string>>({});

  // Bulk suggestion state
  const [suggestions, setSuggestions] = useState<any[] | null>(null);
  const [overrides, setOverrides] = useState<Record<string, SuggestionOverride>>({});
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: unmapped, isLoading } = trpc.pos.unmapped.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId }
  );

  const { data: inventoryItems } = trpc.inventory.list.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId && (!!mappingItemKey || showCreateRecipe) }
  );

  const isDraft = mode === MappingMode.draft_by_tap;
  const isRecipe = mode === MappingMode.recipe;

  const { data: recipes } = trpc.recipes.list.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId && isRecipe && !!mappingItemKey }
  );

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

  const createRecipeMut = trpc.recipes.create.useMutation({
    onSuccess: (data) => {
      setRecipeId(data.id);
      setShowCreateRecipe(false);
      setNewRecipeName("");
      setNewRecipeIngredients([{ inventoryItemId: "", quantity: "", uom: UOM.oz }]);
      setNewRecipeIngSearch({});
      utils.recipes.list.invalidate();
    },
    onError: (err) => setError(err.message),
  });

  const suggestMutation = trpc.mappings.suggestMappings.useMutation({
    onSuccess: (data) => {
      setSuggestions(data);
      // Pre-check high confidence items
      const initial: Record<string, SuggestionOverride> = {};
      for (const s of data) {
        if (s.suggestedTarget) {
          initial[s.posItemName] = {
            accepted: s.confidence > 0.7,
            targetId: s.suggestedTarget.id,
            targetType: s.suggestedTarget.type,
            mode: s.suggestedMode,
          };
        } else {
          initial[s.posItemName] = { accepted: false };
        }
      }
      setOverrides(initial);
      setBulkFeedback(null);
    },
  });

  const bulkCreateMutation = trpc.mappings.bulkCreate.useMutation({
    onSuccess: (result) => {
      setBulkFeedback(`Created ${result.created} mappings, ${result.skipped} skipped${result.errors?.length ? `, ${result.errors.length} errors` : ""}`);
      utils.pos.unmapped.invalidate();
      // Clear suggestions for items that were successfully created
      setSuggestions(null);
      setOverrides({});
    },
    onError: (err) => setBulkFeedback(`Error: ${err.message}`),
  });

  function resetForm() {
    setInventoryItemId("");
    setMode(MappingMode.packaged_unit);
    setPourProfileId("");
    setTapLineId("");
    setRecipeId("");
    setInventorySearch("");
    setError(null);
    setShowCreateRecipe(false);
    setNewRecipeName("");
    setNewRecipeIngredients([{ inventoryItemId: "", quantity: "", uom: UOM.oz }]);
    setNewRecipeIngSearch({});
  }

  function openMapping(key: string) {
    setMappingItemKey(key);
    resetForm();
  }

  function handleSave(item: { source_system: string; pos_item_id: string }) {
    if (isRecipe) {
      if (!recipeId) {
        setError("Select a recipe");
        return;
      }
    } else {
      if (!inventoryItemId) {
        setError("Select an inventory item");
        return;
      }
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
      mode: mode as any,
      ...(!isRecipe && { inventoryItemId }),
      ...(isRecipe && { recipeId }),
      ...(isDraft && { pourProfileId, tapLineId }),
      effectiveFromTs: new Date(),
    });
  }

  function handleSmartMapAll() {
    if (!unmapped || unmapped.length === 0) return;
    const names = unmapped.map((item) => item.pos_item_name);
    suggestMutation.mutate({ locationId: locationId!, posItemNames: names });
  }

  function handleBulkAccept() {
    if (!unmapped || !suggestions) return;
    const accepted = Object.entries(overrides).filter(([, v]) => v.accepted && v.targetId);
    if (accepted.length === 0) {
      setBulkFeedback("No suggestions selected.");
      return;
    }

    // Determine source system from the first unmapped item (they should all be the same in practice)
    const sourceSystem = unmapped[0]?.source_system ?? "other";

    const mappings = accepted
      .map(([posItemName, override]) => {
        const item = unmapped.find((u) => u.pos_item_name === posItemName);
        if (!item) return null;
        return {
          posItemId: item.pos_item_id,
          posItemName: item.pos_item_name,
          mode: (override.mode ?? MappingMode.packaged_unit) as any,
          ...(override.targetType === "recipe"
            ? { recipeId: override.targetId }
            : { inventoryItemId: override.targetId }),
        };
      })
      .filter(Boolean) as any[];

    if (mappings.length === 0) return;

    bulkCreateMutation.mutate({
      locationId: locationId!,
      sourceSystem: sourceSystem as any,
      mappings,
    });
  }

  function toggleSuggestionAccepted(posItemName: string) {
    setOverrides((prev) => ({
      ...prev,
      [posItemName]: {
        ...prev[posItemName],
        accepted: !prev[posItemName]?.accepted,
      },
    }));
  }

  function changeSuggestionTarget(posItemName: string, altId: string, altType: "inventoryItem" | "recipe", altName: string) {
    const suggestion = suggestions?.find((s) => s.posItemName === posItemName);
    if (!suggestion) return;
    // Determine mode from type
    const newMode = altType === "recipe" ? MappingMode.recipe : MappingMode.packaged_unit;
    setOverrides((prev) => ({
      ...prev,
      [posItemName]: {
        ...prev[posItemName],
        accepted: true,
        targetId: altId,
        targetType: altType,
        mode: newMode,
      },
    }));
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

  // Build a lookup from posItemName to suggestion
  const suggestionMap = useMemo(() => {
    if (!suggestions) return new Map<string, any>();
    const map = new Map<string, any>();
    for (const s of suggestions) {
      map.set(s.posItemName, s);
    }
    return map;
  }, [suggestions]);

  const acceptedCount = Object.values(overrides).filter((v) => v.accepted && v.targetId).length;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h1 className="text-2xl font-bold text-[#EAF0FF]">Unmapped POS Items</h1>
        <HelpLink section="pos-mapping" tooltip="Learn about POS mapping" />
      </div>
      <p className="mb-6 text-sm text-[#EAF0FF]/60">
        Items sold in the last 7 days that have no inventory mapping. Map them to start tracking depletion.
      </p>

      {isLoading ? (
        <p className="text-[#EAF0FF]/60">Loading...</p>
      ) : unmapped?.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-green-500/10 p-6 text-center text-green-400">
          All POS items are mapped. Nice work!
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Search unmapped items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full max-w-sm rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none focus:ring-1 focus:ring-[#E9B44C]"
            />
            {!suggestions && (
              <button
                onClick={handleSmartMapAll}
                disabled={suggestMutation.isPending}
                className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
              >
                {suggestMutation.isPending ? "Analyzing..." : "Smart Map All"}
              </button>
            )}
            {suggestions && (
              <>
                <button
                  onClick={handleBulkAccept}
                  disabled={bulkCreateMutation.isPending || acceptedCount === 0}
                  className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {bulkCreateMutation.isPending ? "Creating..." : `Accept Selected (${acceptedCount})`}
                </button>
                <button
                  onClick={() => { setSuggestions(null); setOverrides({}); setBulkFeedback(null); }}
                  className="rounded-md border border-white/10 px-4 py-2 text-sm text-[#EAF0FF]/70 hover:bg-white/5"
                >
                  Clear Suggestions
                </button>
              </>
            )}
          </div>

          {bulkFeedback && (
            <div className={`mb-4 rounded-lg border p-3 text-sm ${bulkFeedback.startsWith("Error") ? "border-red-500/30 bg-red-500/10 text-red-400" : "border-green-500/30 bg-green-500/10 text-green-400"}`}>
              {bulkFeedback}
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
                <tr>
                  {suggestions && <th className="w-10 px-3 py-3" />}
                  <th className="px-4 py-3">POS Item</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Qty Sold (7d)</th>
                  {suggestions ? (
                    <>
                      <th className="px-4 py-3">Suggested Target</th>
                      <th className="px-4 py-3">Mode</th>
                      <th className="px-4 py-3">Confidence</th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-3">First Seen</th>
                      <th className="px-4 py-3">Last Seen</th>
                    </>
                  )}
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredUnmapped.map((item) => {
                  const key = `${item.source_system}-${item.pos_item_id}`;
                  const isOpen = mappingItemKey === key;
                  const suggestion = suggestionMap.get(item.pos_item_name);
                  const override = overrides[item.pos_item_name];
                  const currentTarget = override?.targetId
                    ? (() => {
                        // Find the name from suggestion data
                        if (suggestion?.suggestedTarget?.id === override.targetId) {
                          return suggestion.suggestedTarget;
                        }
                        const alt = suggestion?.alternatives?.find((a: any) => a.id === override.targetId);
                        if (alt) return { id: alt.id, name: alt.name, type: alt.type };
                        return suggestion?.suggestedTarget;
                      })()
                    : suggestion?.suggestedTarget;

                  return (
                    <tr key={key} className="hover:bg-[#16283F]/60">
                      <td className="px-4 py-3" colSpan={isOpen ? (suggestions ? 8 : 7) : undefined}>
                        {isOpen ? (
                          <div>
                            <div className="mb-3 flex items-center gap-2">
                              <span className="font-medium">{item.pos_item_name}</span>
                              <span className="font-mono text-xs text-[#EAF0FF]/40">{item.pos_item_id}</span>
                              <span className="rounded bg-white/5 px-2 py-0.5 text-xs capitalize text-[#EAF0FF]/70">{item.source_system}</span>
                            </div>

                            <div className="flex flex-wrap items-end gap-3">
                              {!isRecipe && (
                                <div className="min-w-[240px] flex-1">
                                  <label className="mb-1 block text-xs font-medium text-[#EAF0FF]/70">Inventory Item</label>
                                  <input
                                    type="text"
                                    placeholder="Search inventory..."
                                    value={inventorySearch}
                                    onChange={(e) => setInventorySearch(e.target.value)}
                                    className="mb-1 w-full rounded-md border border-white/10 bg-[#0B1623] px-2 py-1.5 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none focus:ring-1 focus:ring-[#E9B44C]"
                                  />
                                  <select
                                    value={inventoryItemId}
                                    onChange={(e) => setInventoryItemId(e.target.value)}
                                    className="w-full rounded-md border border-white/10 bg-[#0B1623] px-2 py-1.5 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none focus:ring-1 focus:ring-[#E9B44C]"
                                  >
                                    <option value="">Select item...</option>
                                    {filteredInventory.map((inv) => (
                                      <option key={inv.id} value={inv.id}>
                                        {inv.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}

                              <div className="min-w-[160px]">
                                <label className="mb-1 block text-xs font-medium text-[#EAF0FF]/70">Mode</label>
                                <select
                                  value={mode}
                                  onChange={(e) => setMode(e.target.value)}
                                  className="w-full rounded-md border border-white/10 bg-[#0B1623] px-2 py-1.5 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none focus:ring-1 focus:ring-[#E9B44C]"
                                >
                                  {MODE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {isRecipe && !showCreateRecipe && (
                                <div className="min-w-[240px] flex-1">
                                  <label className="mb-1 block text-xs font-medium text-[#EAF0FF]/70">Recipe</label>
                                  <select
                                    value={recipeId}
                                    onChange={(e) => {
                                      if (e.target.value === "__create_new__") {
                                        setShowCreateRecipe(true);
                                        setRecipeId("");
                                        setNewRecipeName(item.pos_item_name);
                                      } else {
                                        setRecipeId(e.target.value);
                                      }
                                    }}
                                    className="w-full rounded-md border border-white/10 bg-[#0B1623] px-2 py-1.5 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none focus:ring-1 focus:ring-[#E9B44C]"
                                  >
                                    <option value="">Select recipe...</option>
                                    {recipes?.filter((r) => r.active).map((r) => (
                                      <option key={r.id} value={r.id}>
                                        {r.name} ({r.ingredients.length} ingredients)
                                      </option>
                                    ))}
                                    <option value="__create_new__">+ Create New Recipe</option>
                                  </select>
                                  {recipeId && (() => {
                                    const selected = recipes?.find((r) => r.id === recipeId);
                                    if (!selected) return null;
                                    return (
                                      <div className="mt-1.5 rounded-md border border-white/5 bg-[#0B1623]/50 px-2 py-1.5">
                                        <p className="mb-1 text-xs font-medium text-[#E9B44C]">{selected.name}</p>
                                        {selected.ingredients.map((ing: any) => (
                                          <div key={ing.id} className="flex gap-1.5 text-xs text-[#EAF0FF]/70">
                                            <span>{Number(ing.quantity)} {ing.uom}</span>
                                            <span className="text-[#EAF0FF]/50">-</span>
                                            <span>{ing.inventoryItem.name}</span>
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}

                              {isRecipe && showCreateRecipe && (
                                <div className="w-full rounded-md border border-[#E9B44C]/30 bg-[#0B1623]/60 p-3">
                                  <p className="mb-2 text-xs font-semibold text-[#E9B44C]">Create New Recipe</p>
                                  <div className="mb-2">
                                    <label className="mb-1 block text-xs font-medium text-[#EAF0FF]/70">Recipe Name</label>
                                    <input
                                      type="text"
                                      value={newRecipeName}
                                      onChange={(e) => setNewRecipeName(e.target.value)}
                                      className="w-full max-w-sm rounded-md border border-white/10 bg-[#0B1623] px-2 py-1.5 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none"
                                    />
                                  </div>
                                  <label className="mb-1 block text-xs font-medium text-[#EAF0FF]/70">Ingredients</label>
                                  <div className="space-y-2">
                                    {newRecipeIngredients.map((row, idx) => (
                                      <div key={idx} className="flex items-end gap-2">
                                        <div className="relative min-w-[200px] flex-1">
                                          <input
                                            type="text"
                                            placeholder={row.inventoryItemId ? (inventoryItems?.find((i) => i.id === row.inventoryItemId)?.name ?? "Selected") : "Search inventory..."}
                                            value={newRecipeIngSearch[idx] ?? ""}
                                            onChange={(e) => setNewRecipeIngSearch((prev) => ({ ...prev, [idx]: e.target.value }))}
                                            onFocus={() => {
                                              if (newRecipeIngSearch[idx] === undefined) setNewRecipeIngSearch((prev) => ({ ...prev, [idx]: "" }));
                                            }}
                                            className="w-full rounded-md border border-white/10 bg-[#0B1623] px-2 py-1.5 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none"
                                          />
                                          {row.inventoryItemId && newRecipeIngSearch[idx] === undefined && (
                                            <div className="mt-0.5 text-xs text-[#E9B44C]">{inventoryItems?.find((i) => i.id === row.inventoryItemId)?.name}</div>
                                          )}
                                          {newRecipeIngSearch[idx] !== undefined && (
                                            <div className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-md border border-white/10 bg-[#0B1623] shadow-lg">
                                              {(() => {
                                                const q = (newRecipeIngSearch[idx] ?? "").toLowerCase();
                                                const filtered = inventoryItems?.filter((i) => !q || i.name.toLowerCase().includes(q)).slice(0, 20) ?? [];
                                                if (filtered.length === 0) return <div className="px-2 py-1.5 text-xs text-[#EAF0FF]/40">No items found</div>;
                                                return filtered.map((itm) => (
                                                  <button
                                                    key={itm.id}
                                                    type="button"
                                                    onClick={() => {
                                                      setNewRecipeIngredients((prev) => prev.map((r, i) => i === idx ? { ...r, inventoryItemId: itm.id } : r));
                                                      setNewRecipeIngSearch((prev) => { const next = { ...prev }; delete next[idx]; return next; });
                                                    }}
                                                    className="w-full px-2 py-1.5 text-left text-sm text-[#EAF0FF] hover:bg-[#16283F]"
                                                  >
                                                    {itm.name}
                                                  </button>
                                                ));
                                              })()}
                                            </div>
                                          )}
                                        </div>
                                        <div className="w-24">
                                          <input
                                            type="number"
                                            step="0.25"
                                            min="0"
                                            placeholder="Qty"
                                            value={row.quantity}
                                            onChange={(e) => setNewRecipeIngredients((prev) => prev.map((r, i) => i === idx ? { ...r, quantity: e.target.value } : r))}
                                            className="w-full rounded-md border border-white/10 bg-[#0B1623] px-2 py-1.5 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none"
                                          />
                                        </div>
                                        <div className="w-20">
                                          <select
                                            value={row.uom}
                                            onChange={(e) => setNewRecipeIngredients((prev) => prev.map((r, i) => i === idx ? { ...r, uom: e.target.value } : r))}
                                            className="w-full rounded-md border border-white/10 bg-[#0B1623] px-2 py-1.5 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none"
                                          >
                                            {Object.entries(UOM_LABELS).map(([val, label]) => (
                                              <option key={val} value={val}>{label}</option>
                                            ))}
                                          </select>
                                        </div>
                                        {newRecipeIngredients.length > 1 && (
                                          <button
                                            onClick={() => setNewRecipeIngredients((prev) => prev.filter((_, i) => i !== idx))}
                                            className="rounded px-2 py-1.5 text-sm text-red-400/60 hover:text-red-400"
                                          >
                                            X
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                  <button
                                    onClick={() => setNewRecipeIngredients((prev) => [...prev, { inventoryItemId: "", quantity: "", uom: UOM.oz }])}
                                    className="mt-2 text-xs text-[#E9B44C] hover:underline"
                                  >
                                    + Add Ingredient
                                  </button>
                                  <div className="mt-3 flex gap-2">
                                    <button
                                      onClick={() => {
                                        if (!locationId || !newRecipeName.trim()) return;
                                        const valid = newRecipeIngredients.filter((i) => i.inventoryItemId && Number(i.quantity) > 0);
                                        if (valid.length === 0) { setError("Add at least one ingredient"); return; }
                                        createRecipeMut.mutate({
                                          locationId,
                                          name: newRecipeName.trim(),
                                          ingredients: valid.map((i) => ({
                                            inventoryItemId: i.inventoryItemId,
                                            quantity: Number(i.quantity),
                                            uom: i.uom as any,
                                          })),
                                        });
                                      }}
                                      disabled={createRecipeMut.isPending}
                                      className="rounded-md bg-[#E9B44C] px-3 py-1.5 text-xs font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
                                    >
                                      {createRecipeMut.isPending ? "Creating..." : "Create & Select"}
                                    </button>
                                    <button
                                      onClick={() => {
                                        setShowCreateRecipe(false);
                                        setNewRecipeName("");
                                        setNewRecipeIngredients([{ inventoryItemId: "", quantity: "", uom: UOM.oz }]);
                                        setNewRecipeIngSearch({});
                                      }}
                                      className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-[#EAF0FF]/70 hover:bg-white/5"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                  {createRecipeMut.isError && (
                                    <p className="mt-2 text-xs text-red-500">{createRecipeMut.error.message}</p>
                                  )}
                                </div>
                              )}

                              {isDraft && (
                                <>
                                  <div className="min-w-[160px]">
                                    <label className="mb-1 block text-xs font-medium text-[#EAF0FF]/70">Pour Profile</label>
                                    <select
                                      value={pourProfileId}
                                      onChange={(e) => setPourProfileId(e.target.value)}
                                      className="w-full rounded-md border border-white/10 bg-[#0B1623] px-2 py-1.5 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none focus:ring-1 focus:ring-[#E9B44C]"
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
                                    <label className="mb-1 block text-xs font-medium text-[#EAF0FF]/70">Tap Line</label>
                                    <select
                                      value={tapLineId}
                                      onChange={(e) => setTapLineId(e.target.value)}
                                      className="w-full rounded-md border border-white/10 bg-[#0B1623] px-2 py-1.5 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none focus:ring-1 focus:ring-[#E9B44C]"
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
                                  className="rounded-md bg-[#E9B44C] px-4 py-1.5 text-sm text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
                                >
                                  {createMapping.isPending ? "Saving..." : "Save"}
                                </button>
                                <button
                                  onClick={() => setMappingItemKey(null)}
                                  className="rounded-md border border-white/10 px-4 py-1.5 text-sm text-[#EAF0FF]/70 hover:bg-[#16283F]/60"
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
                            <div className="font-mono text-xs text-[#EAF0FF]/40">{item.pos_item_id}</div>
                          </div>
                        )}
                      </td>
                      {!isOpen && (
                        <>
                          {suggestions && (
                            <td className="px-3 py-3 text-center">
                              {suggestion?.suggestedTarget && (
                                <input
                                  type="checkbox"
                                  checked={override?.accepted ?? false}
                                  onChange={() => toggleSuggestionAccepted(item.pos_item_name)}
                                  className="h-4 w-4 rounded border-white/20 bg-[#0B1623] text-[#E9B44C] focus:ring-[#E9B44C]"
                                />
                              )}
                            </td>
                          )}
                          {/* POS Item name is already in the first td above */}
                          <td className="px-4 py-3 capitalize">{item.source_system}</td>
                          <td className="px-4 py-3 font-medium">{item.qty_sold_7d}</td>
                          {suggestions ? (
                            <>
                              <td className="px-4 py-3">
                                {currentTarget ? (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[#EAF0FF]">{currentTarget.name}</span>
                                    {suggestion?.alternatives?.length > 0 && (
                                      <select
                                        value={override?.targetId ?? suggestion?.suggestedTarget?.id ?? ""}
                                        onChange={(e) => {
                                          const alt = suggestion.alternatives.find((a: any) => a.id === e.target.value);
                                          if (alt) {
                                            changeSuggestionTarget(item.pos_item_name, alt.id, alt.type, alt.name);
                                          } else if (e.target.value === suggestion.suggestedTarget?.id) {
                                            changeSuggestionTarget(item.pos_item_name, suggestion.suggestedTarget.id, suggestion.suggestedTarget.type, suggestion.suggestedTarget.name);
                                          }
                                        }}
                                        className="rounded border border-white/10 bg-[#0B1623] px-1 py-0.5 text-xs text-[#EAF0FF]"
                                      >
                                        {suggestion.suggestedTarget && (
                                          <option value={suggestion.suggestedTarget.id}>
                                            {suggestion.suggestedTarget.name}
                                          </option>
                                        )}
                                        {suggestion.alternatives.map((alt: any) => (
                                          <option key={alt.id} value={alt.id}>
                                            {alt.name} ({(alt.score * 100).toFixed(0)}%)
                                          </option>
                                        ))}
                                      </select>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[#EAF0FF]/40">No match found</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span className="rounded bg-white/5 px-2 py-0.5 text-xs capitalize text-[#EAF0FF]/70">
                                  {override?.mode ?? suggestion?.suggestedMode ?? "—"}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {suggestion ? (() => {
                                  const badge = confidenceBadge(suggestion.confidence);
                                  return (
                                    <span className={`rounded border px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                                      {badge.label} ({(suggestion.confidence * 100).toFixed(0)}%)
                                    </span>
                                  );
                                })() : "—"}
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-3 text-xs">{new Date(item.first_seen).toLocaleDateString()}</td>
                              <td className="px-4 py-3 text-xs">{new Date(item.last_seen).toLocaleDateString()}</td>
                            </>
                          )}
                          <td className="px-4 py-3">
                            <button
                              onClick={() => openMapping(key)}
                              className="rounded-md bg-[#E9B44C] px-3 py-1 text-xs text-[#0B1623] hover:bg-[#C8922E]"
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
