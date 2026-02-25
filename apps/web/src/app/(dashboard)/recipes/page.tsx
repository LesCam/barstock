"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";
import { useLocation } from "@/components/location-context";
import Link from "next/link";
import { HelpLink } from "@/components/help-link";
import { UOM } from "@barstock/types";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, Legend,
} from "recharts";

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

type RecipeSortKey = "recipeName" | "recipeCategory" | "totalServings" | "totalCost" | "avgCostPerServing" | "pctOfTotalCost";
type SortDir = "asc" | "desc";

const PIE_COLORS = ["#E9B44C", "#4CAF50", "#2196F3", "#FF5722", "#9C27B0", "#00BCD4", "#FF9800", "#607D8B"];
const AREA_COLORS = ["#E9B44C", "#4CAF50", "#2196F3", "#FF5722", "#9C27B0", "#00BCD4", "#FF9800", "#607D8B", "#E91E63", "#8BC34A", "#795548"];

function toEndOfDay(dateStr: string, eodTime: string): Date {
  const [hh, mm] = eodTime.split(":").map(Number);
  const [y, m, day] = dateStr.split("-").map(Number);
  const d = new Date(y, m - 1, day);
  if (eodTime <= "12:00" && eodTime !== "00:00") {
    d.setDate(d.getDate() + 1);
  }
  d.setHours(hh, mm, 59, 999);
  return d;
}

function RecipeAutoLearning({ recipeId }: { recipeId: string }) {
  const { data: trend, isLoading } = trpc.recipes.recipeTrend.useQuery(
    { recipeId },
    { enabled: !!recipeId }
  );

  if (isLoading) {
    return (
      <div className="mt-4 border-t border-white/10 pt-4">
        <div className="h-6 w-32 animate-pulse rounded bg-white/10" />
      </div>
    );
  }

  if (!trend || trend.snapshotCount === 0) {
    return (
      <div className="mt-4 border-t border-white/10 pt-4">
        <h4 className="mb-1 text-sm font-semibold text-[#EAF0FF]/80">Auto-Learning</h4>
        <p className="text-xs text-[#EAF0FF]/40">
          No learning data yet. Close counting sessions with recipe-mapped POS items to start tracking pour accuracy.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      <h4 className="mb-3 text-sm font-semibold text-[#EAF0FF]/80">
        Auto-Learning ({trend.snapshotCount} snapshot{trend.snapshotCount !== 1 ? "s" : ""})
      </h4>
      <div className="space-y-4">
        {trend.ingredients.map((ing) => {
          const badge =
            ing.weightedAvgRatio >= 0.95 && ing.weightedAvgRatio <= 1.05
              ? { label: "Accurate", color: "text-green-400 bg-green-500/10" }
              : ing.weightedAvgRatio > 1.05
                ? { label: "Over-pouring", color: "text-red-400 bg-red-500/10" }
                : { label: "Under-pouring", color: "text-amber-400 bg-amber-500/10" };

          const pctDiff = Math.abs((ing.weightedAvgRatio - 1) * 100);
          const suggestion =
            ing.weightedAvgRatio > 1.05
              ? `Staff pour ~${pctDiff.toFixed(0)}% more ${ing.itemName} than recipe specifies`
              : ing.weightedAvgRatio < 0.95
                ? `Staff pour ~${pctDiff.toFixed(0)}% less ${ing.itemName} than recipe specifies`
                : null;

          const chartData = [...ing.history].reverse().map((h) => ({
            date: new Date(h.sessionDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            }),
            ratio: Number(h.ratio.toFixed(3)),
          }));

          return (
            <div key={ing.inventoryItemId} className="rounded-lg border border-white/10 bg-[#0B1623] p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-medium text-[#EAF0FF]">{ing.itemName}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.color}`}>
                  {badge.label}
                </span>
                <span className={`text-xs ${
                  ing.trend === "improving" ? "text-green-400" : ing.trend === "worsening" ? "text-red-400" : "text-[#EAF0FF]/40"
                }`}>
                  {ing.trend === "improving" ? "\u2191 improving" : ing.trend === "worsening" ? "\u2193 worsening" : "\u2192 stable"}
                </span>
              </div>
              <div className="mb-2 flex items-center gap-4 text-xs text-[#EAF0FF]/60">
                <span>Recipe: {ing.recipeQuantity} per serving</span>
                <span>Avg ratio: <span className="font-medium text-[#EAF0FF]">{ing.weightedAvgRatio.toFixed(3)}</span></span>
              </div>
              {suggestion && (
                <p className="mb-2 text-xs text-[#EAF0FF]/50">{suggestion}</p>
              )}
              {chartData.length >= 2 && (
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={chartData}>
                    <XAxis dataKey="date" tick={{ fill: "#EAF0FF99", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis
                      domain={[0.5, 1.5]}
                      tick={{ fill: "#EAF0FF99", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      width={30}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0B1623", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#EAF0FF" }}
                      formatter={(value) => [typeof value === "number" ? value.toFixed(3) : value, "Ratio"]}
                    />
                    <ReferenceLine y={1} stroke="#4CAF5080" strokeDasharray="5 5" />
                    <Line
                      type="monotone"
                      dataKey="ratio"
                      stroke="#E9B44C"
                      strokeWidth={2}
                      dot={{ fill: "#E9B44C", r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function RecipesPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const { selectedLocationId: locationId } = useLocation();
  const businessId = user?.businessId as string | undefined;
  const utils = trpc.useUtils();

  // Tab state
  const [activeTab, setActiveTab] = useState<"recipes" | "analytics">("recipes");

  // EOD time for date calculations
  const { data: eodTime } = trpc.settings.endOfDayTime.useQuery(
    { businessId: businessId! },
    { enabled: !!businessId }
  );
  const effectiveEod = eodTime ?? "23:59";

  // Analytics state
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    to: new Date().toISOString().split("T")[0],
  });
  const [analyticsFilter, setAnalyticsFilter] = useState("");
  const [recipeSortKey, setRecipeSortKey] = useState<RecipeSortKey>("totalCost");
  const [recipeSortDir, setRecipeSortDir] = useState<SortDir>("desc");
  const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null);
  const [recipeGranularity, setRecipeGranularity] = useState<"day" | "week" | "month">("day");
  const [recipeGranularityOverride, setRecipeGranularityOverride] = useState(false);

  const smartGranularity = useMemo(() => {
    const from = new Date(dateRange.from);
    const to = new Date(dateRange.to);
    const days = Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
    if (days <= 14) return "day" as const;
    if (days <= 90) return "week" as const;
    return "month" as const;
  }, [dateRange.from, dateRange.to]);

  const effectiveRecipeGranularity = recipeGranularityOverride ? recipeGranularity : smartGranularity;

  // Analytics queries
  const { data: recipeAnalytics } = trpc.reports.recipeAnalytics.useQuery(
    {
      locationId: locationId!,
      fromDate: new Date(dateRange.from),
      toDate: toEndOfDay(dateRange.to, effectiveEod),
      granularity: effectiveRecipeGranularity,
    },
    { enabled: !!locationId && activeTab === "analytics" }
  );

  const { data: recipeDetail } = trpc.reports.recipeDetail.useQuery(
    {
      locationId: locationId!,
      recipeId: expandedRecipeId!,
      fromDate: new Date(dateRange.from),
      toDate: toEndOfDay(dateRange.to, effectiveEod),
    },
    { enabled: !!locationId && !!expandedRecipeId && activeTab === "analytics" }
  );

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

  function startDuplicate(recipe: any) {
    setShowCreate(true);
    setName(`${recipe.name} (Copy)`);
    setCategory(recipe.category ?? "");
    setAddingNewCategory(false);
    setIngredients(
      recipe.ingredients.map((ing: any) => ({
        inventoryItemId: ing.inventoryItemId,
        quantity: String(Number(ing.quantity)),
        uom: ing.uom,
      }))
    );
    setIngredientSearch({});
    setExpandedId(null);
    // Scroll to top to show the create form
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  // Analytics data transformations
  function toggleRecipeSort(key: RecipeSortKey) {
    if (recipeSortKey === key) {
      setRecipeSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setRecipeSortKey(key);
      setRecipeSortDir("desc");
    }
  }

  const sortedAnalyticsRecipes = useMemo(() => {
    if (!recipeAnalytics?.recipes) return [];
    const lc = analyticsFilter.toLowerCase();
    const filtered = recipeAnalytics.recipes.filter(
      (r) =>
        r.recipeName.toLowerCase().includes(lc) ||
        (r.recipeCategory ?? "").toLowerCase().includes(lc)
    );
    return [...filtered].sort((a, b) => {
      const aVal = a[recipeSortKey];
      const bVal = b[recipeSortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        const cmp = aVal.toLowerCase().localeCompare(bVal.toLowerCase());
        return recipeSortDir === "asc" ? cmp : -cmp;
      }
      const aNum = (aVal as number) ?? 0;
      const bNum = (bVal as number) ?? 0;
      return recipeSortDir === "asc" ? aNum - bNum : bNum - aNum;
    });
  }, [recipeAnalytics, analyticsFilter, recipeSortKey, recipeSortDir]);

  function AnalyticsSortHeader({ label, field, className }: { label: string; field: RecipeSortKey; className?: string }) {
    const active = recipeSortKey === field;
    return (
      <th
        className={`cursor-pointer select-none px-4 py-3 hover:text-[#EAF0FF]/80 ${className ?? ""}`}
        onClick={() => toggleRecipeSort(field)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <span className={`text-xs ${active ? "text-[#E9B44C]" : "text-[#EAF0FF]/30"}`}>
            {active ? (recipeSortDir === "asc" ? "\u25B2" : "\u25BC") : "\u25B2"}
          </span>
        </span>
      </th>
    );
  }

  const recipeCostChartData = useMemo(() => {
    if (!recipeAnalytics?.trendBuckets) return [];
    return recipeAnalytics.trendBuckets.map((b) => {
      const d = new Date(b.period);
      let label: string;
      if (effectiveRecipeGranularity === "day") {
        label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      } else if (effectiveRecipeGranularity === "week") {
        label = `Wk ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
      } else {
        label = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      }
      return { ...b, label };
    });
  }, [recipeAnalytics, effectiveRecipeGranularity]);

  const recipeAreaChartData = useMemo(() => {
    if (!recipeAnalytics?.trendBuckets || !recipeAnalytics?.recipeSeries) return [];
    return recipeAnalytics.trendBuckets.map((b, i) => {
      const d = new Date(b.period);
      let label: string;
      if (effectiveRecipeGranularity === "day") {
        label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      } else if (effectiveRecipeGranularity === "week") {
        label = `Wk ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
      } else {
        label = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      }
      const point: Record<string, string | number> = { label };
      for (const series of recipeAnalytics.recipeSeries) {
        point[series.recipeName] = series.dataPoints[i]?.cost ?? 0;
      }
      return point;
    });
  }, [recipeAnalytics, effectiveRecipeGranularity]);

  const topRecipesByBarChart = useMemo(() => {
    if (!recipeAnalytics?.recipes) return [];
    return recipeAnalytics.recipes.slice(0, 10).map((r) => ({
      name: r.recipeName.length > 20 ? r.recipeName.slice(0, 18) + "..." : r.recipeName,
      servings: r.totalServings,
    }));
  }, [recipeAnalytics]);

  const topIngredientsPieData = useMemo(() => {
    if (!recipeAnalytics?.topIngredients) return [];
    return recipeAnalytics.topIngredients.map((ing) => ({
      name: ing.ingredientName.length > 20 ? ing.ingredientName.slice(0, 18) + "..." : ing.ingredientName,
      value: ing.totalCost,
    }));
  }, [recipeAnalytics]);

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
        {activeTab === "recipes" && (
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
        )}
      </div>

      {/* Tab switcher */}
      <div className="mb-6 flex items-center gap-1 rounded-lg bg-[#0B1623] p-0.5 w-fit">
        {(["recipes", "analytics"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-[#16283F] text-[#E9B44C]"
                : "text-[#EAF0FF]/60 hover:text-[#EAF0FF]/80"
            }`}
          >
            {tab === "recipes" ? "Recipes" : "Analytics"}
          </button>
        ))}
      </div>

      {activeTab === "recipes" && showCreate && (
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

      {activeTab === "recipes" && (isLoading ? (
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
                                  onClick={() => startDuplicate(recipe)}
                                  className="text-xs text-blue-400/60 hover:text-blue-400"
                                >
                                  Duplicate
                                </button>
                                <button
                                  onClick={() => setExpandedId(null)}
                                  className="text-xs text-[#EAF0FF]/40 hover:text-[#EAF0FF]"
                                >
                                  Collapse
                                </button>
                              </div>
                              {/* Auto-Learning Section */}
                              <RecipeAutoLearning recipeId={recipe.id} />
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
      ))}

      {/* ── Analytics tab ── */}
      {activeTab === "analytics" && (
        <section>
          {/* Date range picker */}
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => { setDateRange((d) => ({ ...d, from: e.target.value })); setRecipeGranularityOverride(false); }}
              className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] [color-scheme:dark]"
            />
            <span className="text-[#EAF0FF]/40">to</span>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) => { setDateRange((d) => ({ ...d, to: e.target.value })); setRecipeGranularityOverride(false); }}
              className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] [color-scheme:dark]"
            />
            <div className="flex items-center gap-1 rounded-lg bg-[#0B1623] p-0.5">
              {(["day", "week", "month"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => { setRecipeGranularity(g); setRecipeGranularityOverride(true); }}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    effectiveRecipeGranularity === g
                      ? "bg-[#16283F] text-[#E9B44C]"
                      : "text-[#EAF0FF]/60 hover:text-[#EAF0FF]/80"
                  }`}
                >
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Summary cards */}
          <div className="mb-6 grid gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
              <p className="text-sm text-[#EAF0FF]/60">Recipes Used</p>
              <p className="text-2xl font-bold">{recipeAnalytics?.totalRecipesUsed ?? 0}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
              <p className="text-sm text-[#EAF0FF]/60">Total Servings</p>
              <p className="text-2xl font-bold">{recipeAnalytics?.totalServings ?? 0}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
              <p className="text-sm text-[#EAF0FF]/60">Total Recipe Cost</p>
              <p className="text-2xl font-bold">${(recipeAnalytics?.totalRecipeCost ?? 0).toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-[#E9B44C]/30 bg-[#16283F] p-4">
              <p className="text-sm text-[#E9B44C]">Avg Cost/Serving</p>
              <p className="text-2xl font-bold text-[#E9B44C]">${(recipeAnalytics?.avgCostPerServing ?? 0).toFixed(2)}</p>
            </div>
          </div>

          {/* Usage trend — stacked AreaChart */}
          {recipeAreaChartData.length > 0 && recipeAnalytics?.recipeSeries && recipeAnalytics.recipeSeries.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-2 text-base font-semibold">Usage Trend</h3>
              <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={recipeAreaChartData}>
                    <XAxis dataKey="label" tick={{ fill: "#EAF0FF", fontSize: 12 }} axisLine={{ stroke: "#ffffff1a" }} tickLine={false} />
                    <YAxis tick={{ fill: "#EAF0FF99", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0B1623", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#EAF0FF" }}
                      formatter={(value, name) => [`$${Number(value ?? 0).toFixed(2)}`, name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#EAF0FF" }} />
                    {recipeAnalytics.recipeSeries.map((series, i) => (
                      <Area
                        key={series.recipeId}
                        type="monotone"
                        dataKey={series.recipeName}
                        stackId="1"
                        fill={AREA_COLORS[i % AREA_COLORS.length]}
                        stroke={AREA_COLORS[i % AREA_COLORS.length]}
                        fillOpacity={0.6}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Side-by-side: Top Recipes Bar + Top Ingredients Pie */}
          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            {/* Horizontal Bar — Top 10 recipes by servings */}
            <div>
              <h4 className="mb-2 text-sm font-semibold text-[#EAF0FF]/80">Top Recipes by Servings</h4>
              <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
                {topRecipesByBarChart.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={topRecipesByBarChart} layout="vertical">
                      <XAxis type="number" tick={{ fill: "#EAF0FF99", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={140} tick={{ fill: "#EAF0FF", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#0B1623", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#EAF0FF" }}
                        formatter={(value) => [Number(value ?? 0).toLocaleString(), "Servings"]}
                      />
                      <Bar dataKey="servings" fill="#E9B44C" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="py-8 text-center text-sm text-[#EAF0FF]/40">No recipe data for this period.</p>
                )}
              </div>
            </div>

            {/* Pie — Top ingredients by cost */}
            <div>
              <h4 className="mb-2 text-sm font-semibold text-[#EAF0FF]/80">Top Ingredients by Cost</h4>
              <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
                {topIngredientsPieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={topIngredientsPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                      >
                        {topIngredientsPieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: "#0B1623", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#EAF0FF" }}
                        formatter={(value) => [`$${Number(value ?? 0).toFixed(2)}`, "Cost"]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="py-8 text-center text-sm text-[#EAF0FF]/40">No ingredient data for this period.</p>
                )}
              </div>
            </div>
          </div>

          {/* Search filter */}
          <input
            type="text"
            placeholder="Search recipes..."
            value={analyticsFilter}
            onChange={(e) => setAnalyticsFilter(e.target.value)}
            className="mb-4 w-full max-w-sm rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
          />

          {/* Sortable recipe table with expandable rows */}
          <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
                <tr>
                  <th className="w-8 px-2 py-3" />
                  <AnalyticsSortHeader label="Recipe" field="recipeName" />
                  <AnalyticsSortHeader label="Category" field="recipeCategory" />
                  <AnalyticsSortHeader label="Servings" field="totalServings" />
                  <AnalyticsSortHeader label="Total Cost" field="totalCost" />
                  <AnalyticsSortHeader label="Avg Cost/Serving" field="avgCostPerServing" />
                  <AnalyticsSortHeader label="% of Total" field="pctOfTotalCost" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sortedAnalyticsRecipes.map((recipe) => (
                  <>
                    <tr
                      key={recipe.recipeId}
                      className="cursor-pointer hover:bg-[#0B1623]/60"
                      onClick={() => setExpandedRecipeId(expandedRecipeId === recipe.recipeId ? null : recipe.recipeId)}
                    >
                      <td className="px-2 py-3 text-center text-[#EAF0FF]/40">
                        {expandedRecipeId === recipe.recipeId ? "\u25BC" : "\u25B6"}
                      </td>
                      <td className="px-4 py-3 font-medium">{recipe.recipeName}</td>
                      <td className="px-4 py-3">{recipe.recipeCategory ?? "\u2014"}</td>
                      <td className="px-4 py-3">{recipe.totalServings}</td>
                      <td className="px-4 py-3">${recipe.totalCost.toFixed(2)}</td>
                      <td className="px-4 py-3">${recipe.avgCostPerServing.toFixed(2)}</td>
                      <td className="px-4 py-3">{recipe.pctOfTotalCost.toFixed(1)}%</td>
                    </tr>
                    {expandedRecipeId === recipe.recipeId && (
                      <tr key={`${recipe.recipeId}-detail`}>
                        <td colSpan={7} className="bg-[#0B1623]/40 px-6 py-3">
                          {recipeDetail ? (
                            recipeDetail.ingredients.length > 0 ? (
                              <table className="w-full text-left text-xs">
                                <thead className="text-[#EAF0FF]/50">
                                  <tr>
                                    <th className="px-3 py-2">Ingredient</th>
                                    <th className="px-3 py-2">Qty/Serving</th>
                                    <th className="px-3 py-2">UOM</th>
                                    <th className="px-3 py-2">Total Qty</th>
                                    <th className="px-3 py-2">Unit Cost</th>
                                    <th className="px-3 py-2">Total Cost</th>
                                    <th className="px-3 py-2">% of Recipe</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                  {recipeDetail.ingredients.map((ing) => (
                                    <tr key={ing.inventoryItemId} className="text-[#EAF0FF]/80">
                                      <td className="px-3 py-2 font-medium">{ing.ingredientName}</td>
                                      <td className="px-3 py-2">{ing.quantityPerServing != null ? ing.quantityPerServing.toFixed(2) : "\u2014"}</td>
                                      <td className="px-3 py-2">{ing.uom}</td>
                                      <td className="px-3 py-2">{ing.totalQty.toFixed(2)}</td>
                                      <td className="px-3 py-2">${ing.unitCost.toFixed(2)}</td>
                                      <td className="px-3 py-2">${ing.totalCost.toFixed(2)}</td>
                                      <td className="px-3 py-2">{ing.pctOfRecipeCost.toFixed(1)}%</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <p className="py-3 text-center text-xs text-[#EAF0FF]/40">No ingredient data for this recipe in the selected period.</p>
                            )
                          ) : (
                            <p className="py-3 text-center text-xs text-[#EAF0FF]/40">Loading ingredient breakdown...</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {sortedAnalyticsRecipes.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-[#EAF0FF]/40">
                      {analyticsFilter ? "No recipes match your search." : "No recipe depletion data for this period."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
