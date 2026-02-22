"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";
import { useLocation } from "@/components/location-context";
import Link from "next/link";
import { HelpLink } from "@/components/help-link";
import { UOM } from "@barstock/types";

const UOM_LABELS: Record<string, string> = {
  oz: "oz",
  ml: "mL",
  units: "units",
  grams: "g",
  L: "L",
};

interface IngredientRow {
  inventoryItemId: string;
  quantity: string;
  uom: string;
}

const emptyIngredient = (): IngredientRow => ({
  inventoryItemId: "",
  quantity: "",
  uom: UOM.oz,
});

export default function RecipesPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const { selectedLocationId: locationId } = useLocation();
  const utils = trpc.useUtils();

  const { data: recipes, isLoading } = trpc.recipes.listWithCosts.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId }
  );

  const { data: inventoryItems } = trpc.inventory.list.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId }
  );

  // Category filter
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  const { data: existingCategories } = trpc.recipes.listCategories.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId }
  );

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [addingNewCategory, setAddingNewCategory] = useState(false);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([
    emptyIngredient(),
  ]);
  const [ingredientSearch, setIngredientSearch] = useState<
    Record<number, string>
  >({});

  // Edit form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editAddingNewCategory, setEditAddingNewCategory] = useState(false);
  const [editIngredients, setEditIngredients] = useState<IngredientRow[]>([]);
  const [editIngredientSearch, setEditIngredientSearch] = useState<
    Record<number, string>
  >({});

  // Expanded rows
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Help tooltips
  const [showTooltip, setShowTooltip] = useState<string | null>(null);

  const CATEGORY_HELP: Record<string, string> = {
    "Tier Tracking":
      "Split-ratio recipes for ambiguous POS buttons. When a generic button like \"Yellow Mixed\" is pressed, depletion is spread evenly across all items in that pricing tier. Quantities represent each item's share of one pour.",
  };

  const createMut = trpc.recipes.create.useMutation({
    onSuccess: () => {
      utils.recipes.listWithCosts.invalidate();
      utils.recipes.listCategories.invalidate();
      resetCreateForm();
    },
  });

  const updateMut = trpc.recipes.update.useMutation({
    onSuccess: () => {
      utils.recipes.listWithCosts.invalidate();
      utils.recipes.listCategories.invalidate();
      setEditingId(null);
    },
  });

  const deleteMut = trpc.recipes.delete.useMutation({
    onSuccess: () => utils.recipes.listWithCosts.invalidate(),
  });

  function resetCreateForm() {
    setShowCreate(false);
    setName("");
    setCategory("");
    setAddingNewCategory(false);
    setIngredients([emptyIngredient()]);
    setIngredientSearch({});
  }

  function handleCreate() {
    if (!locationId || !name.trim()) return;
    const validIngredients = ingredients.filter(
      (i) => i.inventoryItemId && Number(i.quantity) > 0
    );
    if (validIngredients.length === 0) return;
    createMut.mutate({
      locationId,
      name: name.trim(),
      ...(category.trim() && { category: category.trim() }),
      ingredients: validIngredients.map((i) => ({
        inventoryItemId: i.inventoryItemId,
        quantity: Number(i.quantity),
        uom: i.uom as any,
      })),
    });
  }

  function startEdit(recipe: any) {
    setEditingId(recipe.id);
    setEditName(recipe.name);
    setEditCategory(recipe.category ?? "");
    setEditAddingNewCategory(false);
    setEditIngredients(
      recipe.ingredients.map((ing: any) => ({
        inventoryItemId: ing.inventoryItemId,
        quantity: String(Number(ing.quantity)),
        uom: ing.uom,
      }))
    );
    setEditIngredientSearch({});
    setExpandedId(recipe.id);
  }

  function handleUpdate() {
    if (!editingId || !editName.trim()) return;
    const validIngredients = editIngredients.filter(
      (i) => i.inventoryItemId && Number(i.quantity) > 0
    );
    if (validIngredients.length === 0) return;
    updateMut.mutate({
      id: editingId,
      name: editName.trim(),
      category: editCategory.trim() || null,
      ingredients: validIngredients.map((i) => ({
        inventoryItemId: i.inventoryItemId,
        quantity: Number(i.quantity),
        uom: i.uom as any,
      })),
    });
  }

  function addIngredientRow(
    setter: React.Dispatch<React.SetStateAction<IngredientRow[]>>
  ) {
    setter((prev) => [...prev, emptyIngredient()]);
  }

  function removeIngredientRow(
    setter: React.Dispatch<React.SetStateAction<IngredientRow[]>>,
    index: number
  ) {
    setter((prev) => prev.filter((_, i) => i !== index));
  }

  function updateIngredient(
    setter: React.Dispatch<React.SetStateAction<IngredientRow[]>>,
    index: number,
    field: keyof IngredientRow,
    value: string
  ) {
    setter((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  function getItemName(itemId: string) {
    return inventoryItems?.find((i) => i.id === itemId)?.name ?? "Unknown";
  }

  function filteredItems(searchMap: Record<number, string>, index: number) {
    const q = (searchMap[index] ?? "").toLowerCase();
    if (!inventoryItems) return [];
    if (!q) return inventoryItems;
    return inventoryItems.filter((i) => i.name.toLowerCase().includes(q));
  }

  const activeRecipes = useMemo(
    () => {
      let list = recipes?.filter((r) => r.active) ?? [];
      if (categoryFilter) list = list.filter((r) => r.category === categoryFilter);
      return list;
    },
    [recipes, categoryFilter]
  );
  const inactiveRecipes = useMemo(
    () => {
      let list = recipes?.filter((r) => !r.active) ?? [];
      if (categoryFilter) list = list.filter((r) => r.category === categoryFilter);
      return list;
    },
    [recipes, categoryFilter]
  );

  function renderIngredientForm(
    rows: IngredientRow[],
    setter: React.Dispatch<React.SetStateAction<IngredientRow[]>>,
    searchMap: Record<number, string>,
    searchSetter: React.Dispatch<React.SetStateAction<Record<number, string>>>
  ) {
    return (
      <div className="space-y-2">
        <label className="block text-xs font-medium text-[#EAF0FF]/70">
          Ingredients
        </label>
        {rows.map((row, idx) => (
          <div key={idx} className="flex items-end gap-2">
            <div className="relative min-w-[200px] flex-1">
              <input
                type="text"
                placeholder={row.inventoryItemId ? getItemName(row.inventoryItemId) : "Search inventory..."}
                value={searchMap[idx] ?? ""}
                onChange={(e) =>
                  searchSetter((prev) => ({ ...prev, [idx]: e.target.value }))
                }
                onFocus={() => {
                  if (!searchMap[idx]) searchSetter((prev) => ({ ...prev, [idx]: "" }));
                }}
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-2 py-1.5 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none"
              />
              {row.inventoryItemId && !searchMap[idx] && (
                <div className="mt-0.5 text-xs text-[#E9B44C]">{getItemName(row.inventoryItemId)}</div>
              )}
              {(searchMap[idx] !== undefined) && (
                <div className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-md border border-white/10 bg-[#0B1623] shadow-lg">
                  {filteredItems(searchMap, idx).length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-[#EAF0FF]/40">No items found</div>
                  ) : (
                    filteredItems(searchMap, idx).slice(0, 20).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          updateIngredient(setter, idx, "inventoryItemId", item.id);
                          searchSetter((prev) => {
                            const next = { ...prev };
                            delete next[idx];
                            return next;
                          });
                        }}
                        className="w-full px-2 py-1.5 text-left text-sm text-[#EAF0FF] hover:bg-[#16283F]"
                      >
                        {item.name}
                      </button>
                    ))
                  )}
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
                onChange={(e) =>
                  updateIngredient(setter, idx, "quantity", e.target.value)
                }
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-2 py-1.5 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none"
              />
            </div>
            <div className="w-20">
              <select
                value={row.uom}
                onChange={(e) =>
                  updateIngredient(setter, idx, "uom", e.target.value)
                }
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-2 py-1.5 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none"
              >
                {Object.entries(UOM_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            {rows.length > 1 && (
              <button
                onClick={() => removeIngredientRow(setter, idx)}
                className="rounded px-2 py-1.5 text-sm text-red-400/60 hover:text-red-400"
              >
                X
              </button>
            )}
          </div>
        ))}
        <button
          onClick={() => addIngredientRow(setter)}
          className="text-xs text-[#E9B44C] hover:text-[#C8922E]"
        >
          + Add Ingredient
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[#EAF0FF]">Recipes</h1>
            <HelpLink section="recipes" tooltip="Learn about recipes & split ratios" />
          </div>
          <p className="mt-1 text-sm text-[#EAF0FF]/60">
            Define cocktail and drink recipes for multi-ingredient POS depletion.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/recipes/import"
            className="rounded-md border border-[#E9B44C] px-4 py-2 text-sm font-medium text-[#E9B44C] hover:bg-[#E9B44C]/10"
          >
            Import CSV
          </Link>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E]"
          >
            {showCreate ? "Cancel" : "New Recipe"}
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="mb-6 rounded-lg border border-white/10 bg-[#16283F] p-4">
          <h2 className="mb-3 text-sm font-semibold text-[#EAF0FF]">
            New Recipe
          </h2>
          <div className="mb-3 flex gap-3">
            <div className="flex-1 max-w-sm">
              <label className="mb-1 block text-xs font-medium text-[#EAF0FF]/70">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Margarita"
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30 focus:border-[#E9B44C] focus:outline-none"
              />
            </div>
            <div className="w-52">
              <label className="mb-1 block text-xs font-medium text-[#EAF0FF]/70">
                Category
              </label>
              {addingNewCategory ? (
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="New category name"
                    autoFocus
                    className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30 focus:border-[#E9B44C] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => { setAddingNewCategory(false); setCategory(""); }}
                    className="shrink-0 rounded px-2 text-xs text-[#EAF0FF]/40 hover:text-[#EAF0FF]"
                    title="Cancel"
                  >
                    X
                  </button>
                </div>
              ) : (
                <select
                  value={category}
                  onChange={(e) => {
                    if (e.target.value === "__add_new__") {
                      setAddingNewCategory(true);
                      setCategory("");
                    } else {
                      setCategory(e.target.value);
                    }
                  }}
                  className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none"
                >
                  <option value="">No category</option>
                  {(existingCategories ?? []).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value="__add_new__">+ Add New...</option>
                </select>
              )}
            </div>
          </div>
          {renderIngredientForm(
            ingredients,
            setIngredients,
            ingredientSearch,
            setIngredientSearch
          )}
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleCreate}
              disabled={
                !name.trim() ||
                ingredients.every((i) => !i.inventoryItemId) ||
                createMut.isPending
              }
              className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
            >
              {createMut.isPending ? "Creating..." : "Create Recipe"}
            </button>
            {createMut.error && (
              <p className="text-sm text-red-400">{createMut.error.message}</p>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-[#EAF0FF]/60">Loading...</p>
      ) : activeRecipes.length === 0 && inactiveRecipes.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-6 text-center text-[#EAF0FF]/60">
          No recipes yet. Create one to map cocktails to inventory depletion.
        </div>
      ) : (
        <>
        {existingCategories && existingCategories.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-[#EAF0FF]/50">Filter:</span>
            <button
              onClick={() => setCategoryFilter("")}
              className={`rounded-full px-3 py-1 text-xs ${
                !categoryFilter
                  ? "bg-[#E9B44C] text-[#0B1623]"
                  : "border border-white/10 text-[#EAF0FF]/60 hover:border-[#E9B44C]/50"
              }`}
            >
              All
            </button>
            {existingCategories.map((c) => (
              <div key={c} className="relative inline-flex">
                <button
                  onClick={() => setCategoryFilter(categoryFilter === c ? "" : c)}
                  className={`rounded-full px-3 py-1 text-xs ${
                    categoryFilter === c
                      ? "bg-[#E9B44C] text-[#0B1623]"
                      : "border border-white/10 text-[#EAF0FF]/60 hover:border-[#E9B44C]/50"
                  }`}
                >
                  {c}
                </button>
                {CATEGORY_HELP[c] && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowTooltip(showTooltip === c ? null : c); }}
                    className="ml-0.5 -mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-[#EAF0FF]/30 hover:text-[#E9B44C]"
                    title="More info"
                  >
                    i
                  </button>
                )}
                {showTooltip === c && CATEGORY_HELP[c] && (
                  <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-md border border-white/10 bg-[#0B1623] p-3 text-xs text-[#EAF0FF]/70 shadow-lg">
                    {CATEGORY_HELP[c]}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Ingredients</th>
                <th className="px-4 py-3">Cost</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {[...activeRecipes, ...inactiveRecipes].map((recipe) => {
                const isExpanded = expandedId === recipe.id;
                const isEditing = editingId === recipe.id;
                return (
                  <tr
                    key={recipe.id}
                    className={!recipe.active ? "opacity-50" : ""}
                  >
                    <td className="px-4 py-3" colSpan={isExpanded ? 6 : undefined}>
                      {isExpanded ? (
                        <div>
                          {isEditing ? (
                            <div>
                              <div className="mb-3 flex gap-3">
                                <div className="flex-1 max-w-sm">
                                  <label className="mb-1 block text-xs font-medium text-[#EAF0FF]/70">
                                    Name
                                  </label>
                                  <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none"
                                  />
                                </div>
                                <div className="w-52">
                                  <label className="mb-1 block text-xs font-medium text-[#EAF0FF]/70">
                                    Category
                                  </label>
                                  {editAddingNewCategory ? (
                                    <div className="flex gap-1">
                                      <input
                                        type="text"
                                        value={editCategory}
                                        onChange={(e) => setEditCategory(e.target.value)}
                                        placeholder="New category name"
                                        autoFocus
                                        className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30 focus:border-[#E9B44C] focus:outline-none"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => { setEditAddingNewCategory(false); setEditCategory(""); }}
                                        className="shrink-0 rounded px-2 text-xs text-[#EAF0FF]/40 hover:text-[#EAF0FF]"
                                        title="Cancel"
                                      >
                                        X
                                      </button>
                                    </div>
                                  ) : (
                                    <select
                                      value={(existingCategories ?? []).includes(editCategory) ? editCategory : editCategory ? "__custom__" : ""}
                                      onChange={(e) => {
                                        if (e.target.value === "__add_new__") {
                                          setEditAddingNewCategory(true);
                                          setEditCategory("");
                                        } else {
                                          setEditCategory(e.target.value);
                                        }
                                      }}
                                      className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none"
                                    >
                                      <option value="">No category</option>
                                      {(existingCategories ?? []).map((c) => (
                                        <option key={c} value={c}>{c}</option>
                                      ))}
                                      <option value="__add_new__">+ Add New...</option>
                                    </select>
                                  )}
                                </div>
                              </div>
                              {renderIngredientForm(
                                editIngredients,
                                setEditIngredients,
                                editIngredientSearch,
                                setEditIngredientSearch
                              )}
                              {(recipe as any)._count?.posMappings > 0 && (
                                <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                                  This recipe is mapped to {(recipe as any)._count.posMappings} active POS item{(recipe as any)._count.posMappings !== 1 ? "s" : ""} — changes will affect depletion.
                                </div>
                              )}
                              <div className="mt-3 flex gap-2">
                                <button
                                  onClick={handleUpdate}
                                  disabled={updateMut.isPending}
                                  className="rounded-md bg-[#E9B44C] px-4 py-1.5 text-sm text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
                                >
                                  {updateMut.isPending
                                    ? "Saving..."
                                    : "Save Changes"}
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingId(null);
                                    setExpandedId(null);
                                  }}
                                  className="rounded-md border border-white/10 px-4 py-1.5 text-sm text-[#EAF0FF]/70 hover:bg-[#16283F]/60"
                                >
                                  Cancel
                                </button>
                              </div>
                              {updateMut.error && (
                                <p className="mt-2 text-sm text-red-400">
                                  {updateMut.error.message}
                                </p>
                              )}
                            </div>
                          ) : (
                            <div>
                              <div className="mb-2 flex items-center gap-2">
                                <span className="text-base font-medium text-[#EAF0FF]">
                                  {recipe.name}
                                </span>
                                {recipe.category && (
                                  <span className="rounded-full bg-[#E9B44C]/10 px-2 py-0.5 text-xs text-[#E9B44C]">
                                    {recipe.category}
                                  </span>
                                )}
                                <span
                                  className={`rounded-full px-2 py-0.5 text-xs ${
                                    recipe.active
                                      ? "bg-green-500/10 text-green-400"
                                      : "bg-white/5 text-[#EAF0FF]/40"
                                  }`}
                                >
                                  {recipe.active ? "Active" : "Inactive"}
                                </span>
                                {(recipe as any)._count?.posMappings > 0 && (
                                  <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-400">
                                    {(recipe as any)._count.posMappings} POS mapping{(recipe as any)._count.posMappings !== 1 ? "s" : ""}
                                  </span>
                                )}
                                {(recipe as any).totalCost != null && (
                                  <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-400">
                                    ${((recipe as any).totalCost as number).toFixed(2)}
                                  </span>
                                )}
                              </div>
                              <div className="mb-3 space-y-1">
                                {recipe.ingredients.map((ing: any, idx: number) => {
                                  const costInfo = (recipe as any).ingredientCosts?.[idx];
                                  return (
                                    <div
                                      key={ing.id}
                                      className="flex items-center gap-2 text-sm text-[#EAF0FF]/80"
                                    >
                                      <span className="text-[#EAF0FF]/40">-</span>
                                      <span>{Number(ing.quantity)}</span>
                                      <span className="text-[#EAF0FF]/60">
                                        {UOM_LABELS[ing.uom] ?? ing.uom}
                                      </span>
                                      <span>{ing.inventoryItem.name}</span>
                                      {ing.inventoryItem.category?.name && (
                                        <span className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-[#EAF0FF]/40">
                                          {ing.inventoryItem.category.name}
                                        </span>
                                      )}
                                      {costInfo?.unitCost != null && (
                                        <span className="text-xs text-[#EAF0FF]/40">
                                          @ ${costInfo.unitCost.toFixed(2)}/unit = ${costInfo.lineCost?.toFixed(2) ?? "—"}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => startEdit(recipe)}
                                  className="text-xs text-[#E9B44C] hover:text-[#C8922E]"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() =>
                                    deleteMut.mutate({ id: recipe.id })
                                  }
                                  disabled={!recipe.active || deleteMut.isPending}
                                  className="text-xs text-red-400/60 hover:text-red-400 disabled:opacity-30"
                                >
                                  Deactivate
                                </button>
                                {!recipe.active && (
                                  <button
                                    onClick={() =>
                                      updateMut.mutate({
                                        id: recipe.id,
                                        active: true,
                                      })
                                    }
                                    disabled={updateMut.isPending}
                                    className="text-xs text-green-400/60 hover:text-green-400"
                                  >
                                    Reactivate
                                  </button>
                                )}
                                <button
                                  onClick={() => setExpandedId(null)}
                                  className="text-xs text-[#EAF0FF]/40 hover:text-[#EAF0FF]"
                                >
                                  Collapse
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="font-medium text-[#EAF0FF]">
                          {recipe.name}
                        </span>
                      )}
                    </td>
                    {!isExpanded && (
                      <>
                        <td className="px-4 py-3 text-[#EAF0FF]/60">
                          {recipe.category ? (
                            <span className="rounded-full bg-[#E9B44C]/10 px-2 py-0.5 text-xs text-[#E9B44C]">
                              {recipe.category}
                            </span>
                          ) : (
                            <span className="text-[#EAF0FF]/30">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[#EAF0FF]/60">
                          {recipe.ingredients.length} ingredient
                          {recipe.ingredients.length !== 1 ? "s" : ""}
                        </td>
                        <td className="px-4 py-3 text-[#EAF0FF]/60">
                          {(recipe as any).totalCost != null ? (
                            <span className="font-medium text-green-400">${((recipe as any).totalCost as number).toFixed(2)}</span>
                          ) : (
                            <span className="text-[#EAF0FF]/30">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs ${
                              recipe.active
                                ? "bg-green-500/10 text-green-400"
                                : "bg-white/5 text-[#EAF0FF]/40"
                            }`}
                          >
                            {recipe.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setExpandedId(recipe.id)}
                            className="text-xs text-[#E9B44C] hover:text-[#C8922E]"
                          >
                            View
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
