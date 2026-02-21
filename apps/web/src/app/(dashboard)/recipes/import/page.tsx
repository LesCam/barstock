"use client";

import { useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { UOM } from "@barstock/types";

// ─── Types ──────────────────────────────────────────────────

interface ParsedRecipe {
  name: string;
  category?: string;
  ingredients: { csvName: string; quantity: number; uom: string }[];
}

interface IngredientSuggestion {
  csvName: string;
  bestMatch: { inventoryItemId: string; name: string; score: number } | null;
  alternatives: { inventoryItemId: string; name: string; score: number }[];
}

interface IngredientResolution {
  csvName: string;
  action: "match" | "create" | "skip";
  inventoryItemId?: string;
  selectedName?: string;
  newItemName?: string;
  newItemCategoryId?: string;
  newItemBaseUom?: string;
}

type WizardStep = 1 | 2 | 3 | 4;

const UOM_LABELS: Record<string, string> = {
  oz: "oz",
  ml: "mL",
  units: "units",
  grams: "g",
  L: "L",
};

const CSV_TEMPLATE = `Recipe Name,Category,Ingredient Name,Quantity,UOM
Margarita,Cocktails,Tequila Silver,1.5,oz
Margarita,Cocktails,Triple Sec,0.75,oz
Margarita,Cocktails,Lime Juice,0.75,oz
Old Fashioned,Cocktails,Bourbon,2,oz
Old Fashioned,Cocktails,Simple Syrup,0.25,oz`;

// ─── Component ──────────────────────────────────────────────

export default function RecipeImportPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const locationId = user?.locationIds?.[0];

  const [step, setStep] = useState<WizardStep>(1);
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Parse result
  const [recipes, setRecipes] = useState<ParsedRecipe[]>([]);
  const [suggestions, setSuggestions] = useState<IngredientSuggestion[]>([]);
  const [parseErrors, setParseErrors] = useState<{ row: number; message: string }[]>([]);

  // User resolutions for ingredient matching
  const [resolutions, setResolutions] = useState<Record<string, IngredientResolution>>({});

  // Ingredient search state
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});

  // Import result
  const [importResult, setImportResult] = useState<{
    recipesCreated: number;
    recipesSkipped: number;
    itemsCreated: number;
    ingredientsSkipped: number;
    errors: string[];
  } | null>(null);

  // Inventory items for manual search
  const { data: inventoryItems } = trpc.inventory.list.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId },
  );

  // Item categories for "create new" option
  const { data: itemCategories } = trpc.itemCategories.list.useQuery(
    { businessId: user?.businessId },
    { enabled: !!user?.businessId },
  );

  const parseMut = trpc.recipes.parseCSV.useMutation();
  const bulkCreateMut = trpc.recipes.bulkCreate.useMutation();

  // ─── Step 1: Upload ────────────────────────────────────

  function handleFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      setCsvText(e.target?.result as string);
    };
    reader.readAsText(file);
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, []);

  async function handleParse() {
    if (!locationId || !csvText.trim()) return;
    const result = await parseMut.mutateAsync({ locationId, csvText });
    setRecipes(result.recipes);
    setSuggestions(result.ingredientSuggestions);
    setParseErrors(result.errors);

    // Initialize resolutions from suggestions
    const initial: Record<string, IngredientResolution> = {};
    for (const s of result.ingredientSuggestions) {
      const key = s.csvName.toLowerCase();
      if (s.bestMatch && s.bestMatch.score >= 0.6) {
        initial[key] = {
          csvName: s.csvName,
          action: "match",
          inventoryItemId: s.bestMatch.inventoryItemId,
          selectedName: s.bestMatch.name,
        };
      } else {
        initial[key] = {
          csvName: s.csvName,
          action: s.bestMatch ? "match" : "skip",
          inventoryItemId: s.bestMatch?.inventoryItemId,
          selectedName: s.bestMatch?.name,
        };
      }
    }
    setResolutions(initial);
    setStep(2);
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "recipe-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Step 2: Match Ingredients ─────────────────────────

  function updateResolution(csvName: string, update: Partial<IngredientResolution>) {
    const key = csvName.toLowerCase();
    setResolutions((prev) => ({
      ...prev,
      [key]: { ...prev[key], csvName, ...update },
    }));
  }

  function getConfidenceColor(score: number | undefined) {
    if (!score) return "bg-red-500/10 text-red-400";
    if (score >= 0.8) return "bg-green-500/10 text-green-400";
    if (score >= 0.5) return "bg-yellow-500/10 text-yellow-400";
    return "bg-red-500/10 text-red-400";
  }

  function getFilteredItems(csvName: string) {
    const term = (searchTerms[csvName.toLowerCase()] ?? "").toLowerCase();
    if (!inventoryItems) return [];
    if (!term) return inventoryItems;
    return inventoryItems.filter((i) => i.name.toLowerCase().includes(term));
  }

  // ─── Step 3: Review ────────────────────────────────────

  function getResolvedIngredientName(csvName: string): string {
    const res = resolutions[csvName.toLowerCase()];
    if (!res) return csvName;
    if (res.action === "skip") return `${csvName} (skipped)`;
    if (res.action === "create") return res.newItemName ?? csvName;
    return res.selectedName ?? csvName;
  }

  function canProceedToReview(): boolean {
    return suggestions.every((s) => {
      const res = resolutions[s.csvName.toLowerCase()];
      if (!res) return false;
      if (res.action === "skip") return true;
      if (res.action === "match") return !!res.inventoryItemId;
      if (res.action === "create") return !!res.newItemName;
      return false;
    });
  }

  // ─── Step 4: Import ────────────────────────────────────

  async function handleImport() {
    if (!locationId) return;

    const ingredientMatches = suggestions.map((s) => {
      const res = resolutions[s.csvName.toLowerCase()];
      return {
        csvName: s.csvName,
        action: res?.action ?? ("skip" as const),
        inventoryItemId: res?.inventoryItemId,
        newItemName: res?.action === "create" ? (res.newItemName ?? s.csvName) : undefined,
        newItemCategoryId: res?.action === "create" ? res.newItemCategoryId : undefined,
        newItemBaseUom: res?.action === "create" ? (res.newItemBaseUom as any) : undefined,
      };
    });

    const result = await bulkCreateMut.mutateAsync({
      locationId,
      recipes: recipes as any,
      ingredientMatches,
    });

    setImportResult(result);
    setStep(4);
  }

  // ─── Step indicator ────────────────────────────────────

  const steps = [
    { num: 1, label: "Upload" },
    { num: 2, label: "Match Ingredients" },
    { num: 3, label: "Review" },
    { num: 4, label: "Results" },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#EAF0FF]">Import Recipes</h1>
          <p className="mt-1 text-sm text-[#EAF0FF]/60">
            Bulk import recipes from a CSV file.
          </p>
        </div>
        <Link
          href="/recipes"
          className="rounded-md border border-white/10 px-4 py-2 text-sm text-[#EAF0FF]/70 hover:bg-[#16283F]"
        >
          Back to Recipes
        </Link>
      </div>

      {/* Step indicator */}
      <div className="mb-6 flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.num} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                step === s.num
                  ? "bg-[#E9B44C] text-[#0B1623]"
                  : step > s.num
                    ? "bg-green-500/20 text-green-400"
                    : "bg-white/5 text-[#EAF0FF]/40"
              }`}
            >
              {step > s.num ? "\u2713" : s.num}
            </div>
            <span
              className={`text-sm ${
                step === s.num ? "text-[#EAF0FF]" : "text-[#EAF0FF]/40"
              }`}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <div className="mx-2 h-px w-8 bg-white/10" />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#EAF0FF]">Upload CSV</h2>
            <button
              onClick={downloadTemplate}
              className="text-sm text-[#E9B44C] hover:text-[#C8922E]"
            >
              Download Template
            </button>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition ${
              dragOver
                ? "border-[#E9B44C] bg-[#E9B44C]/5"
                : "border-white/10 hover:border-[#E9B44C]/50"
            }`}
          >
            <div className="mb-2 text-3xl text-[#EAF0FF]/30">&#128196;</div>
            <p className="text-sm text-[#EAF0FF]/60">
              {fileName
                ? fileName
                : "Drop a CSV file here, or click to browse"}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>

          {csvText && (
            <div className="mt-4">
              <p className="mb-2 text-xs text-[#EAF0FF]/50">
                Preview (first 5 lines):
              </p>
              <pre className="max-h-40 overflow-auto rounded-md bg-[#0B1623] p-3 text-xs text-[#EAF0FF]/70">
                {csvText.split("\n").slice(0, 6).join("\n")}
              </pre>
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleParse}
              disabled={!csvText.trim() || parseMut.isPending}
              className="rounded-md bg-[#E9B44C] px-6 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
            >
              {parseMut.isPending ? "Parsing..." : "Parse & Match"}
            </button>
            {parseMut.error && (
              <p className="text-sm text-red-400">{parseMut.error.message}</p>
            )}
          </div>

          <div className="mt-6 rounded-md bg-[#0B1623] p-4">
            <h3 className="mb-2 text-sm font-medium text-[#EAF0FF]/70">Expected CSV format</h3>
            <p className="text-xs text-[#EAF0FF]/50">
              One row per ingredient. Recipes with multiple ingredients span multiple rows.
            </p>
            <p className="mt-1 text-xs text-[#EAF0FF]/50">
              <strong>Columns:</strong> Recipe Name, Category (optional), Ingredient Name, Quantity, UOM (oz/ml/grams/units/L)
            </p>
          </div>
        </div>
      )}

      {/* Step 2: Match Ingredients */}
      {step === 2 && (
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-6">
          <h2 className="mb-1 text-lg font-semibold text-[#EAF0FF]">
            Match Ingredients
          </h2>
          <p className="mb-4 text-sm text-[#EAF0FF]/60">
            Found {recipes.length} recipe{recipes.length !== 1 ? "s" : ""} with{" "}
            {suggestions.length} unique ingredient{suggestions.length !== 1 ? "s" : ""}.
            {parseErrors.length > 0 && (
              <span className="text-yellow-400"> ({parseErrors.length} parse warning{parseErrors.length !== 1 ? "s" : ""})</span>
            )}
          </p>

          {parseErrors.length > 0 && (
            <div className="mb-4 max-h-32 overflow-auto rounded-md border border-yellow-500/20 bg-yellow-500/5 p-3">
              {parseErrors.map((e, i) => (
                <p key={i} className="text-xs text-yellow-400">
                  Row {e.row}: {e.message}
                </p>
              ))}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase text-[#EAF0FF]/60">
                <tr>
                  <th className="px-3 py-2">CSV Name</th>
                  <th className="px-3 py-2">Confidence</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Match / Create</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {suggestions.map((s) => {
                  const key = s.csvName.toLowerCase();
                  const res = resolutions[key];
                  return (
                    <tr key={key}>
                      <td className="px-3 py-3 font-medium text-[#EAF0FF]">
                        {s.csvName}
                      </td>
                      <td className="px-3 py-3">
                        {s.bestMatch ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs ${getConfidenceColor(
                              s.bestMatch.score,
                            )}`}
                          >
                            {Math.round(s.bestMatch.score * 100)}%
                          </span>
                        ) : (
                          <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
                            No match
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={res?.action ?? "skip"}
                          onChange={(e) =>
                            updateResolution(s.csvName, {
                              action: e.target.value as any,
                              // Reset fields when switching action
                              ...(e.target.value === "create" && {
                                newItemName: s.csvName,
                                newItemBaseUom: "oz",
                              }),
                            })
                          }
                          className="rounded-md border border-white/10 bg-[#0B1623] px-2 py-1 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none"
                        >
                          <option value="match">Match Existing</option>
                          <option value="create">Create New</option>
                          <option value="skip">Skip</option>
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        {res?.action === "match" && (
                          <div className="relative min-w-[250px]">
                            <input
                              type="text"
                              placeholder={res.selectedName ?? "Search inventory..."}
                              value={searchTerms[key] ?? ""}
                              onChange={(e) =>
                                setSearchTerms((prev) => ({
                                  ...prev,
                                  [key]: e.target.value,
                                }))
                              }
                              onFocus={() => {
                                if (!searchTerms[key])
                                  setSearchTerms((prev) => ({ ...prev, [key]: "" }));
                              }}
                              className="w-full rounded-md border border-white/10 bg-[#0B1623] px-2 py-1 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none"
                            />
                            {res.selectedName && searchTerms[key] === undefined && (
                              <div className="mt-0.5 text-xs text-[#E9B44C]">
                                {res.selectedName}
                              </div>
                            )}
                            {searchTerms[key] !== undefined && (
                              <div className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-md border border-white/10 bg-[#0B1623] shadow-lg">
                                {/* Show fuzzy alternatives first */}
                                {s.alternatives.length > 0 && !searchTerms[key] && (
                                  <>
                                    <div className="px-2 py-1 text-xs text-[#EAF0FF]/40">
                                      Suggestions
                                    </div>
                                    {s.alternatives.map((alt) => (
                                      <button
                                        key={alt.inventoryItemId}
                                        type="button"
                                        onClick={() => {
                                          updateResolution(s.csvName, {
                                            inventoryItemId: alt.inventoryItemId,
                                            selectedName: alt.name,
                                          });
                                          setSearchTerms((prev) => {
                                            const next = { ...prev };
                                            delete next[key];
                                            return next;
                                          });
                                        }}
                                        className="flex w-full items-center justify-between px-2 py-1.5 text-left text-sm text-[#EAF0FF] hover:bg-[#16283F]"
                                      >
                                        <span>{alt.name}</span>
                                        <span className="text-xs text-[#EAF0FF]/40">
                                          {Math.round(alt.score * 100)}%
                                        </span>
                                      </button>
                                    ))}
                                    <div className="border-t border-white/5" />
                                  </>
                                )}
                                {getFilteredItems(s.csvName)
                                  .slice(0, 15)
                                  .map((item) => (
                                    <button
                                      key={item.id}
                                      type="button"
                                      onClick={() => {
                                        updateResolution(s.csvName, {
                                          inventoryItemId: item.id,
                                          selectedName: item.name,
                                        });
                                        setSearchTerms((prev) => {
                                          const next = { ...prev };
                                          delete next[key];
                                          return next;
                                        });
                                      }}
                                      className="w-full px-2 py-1.5 text-left text-sm text-[#EAF0FF] hover:bg-[#16283F]"
                                    >
                                      {item.name}
                                    </button>
                                  ))}
                                {getFilteredItems(s.csvName).length === 0 && (
                                  <div className="px-2 py-1.5 text-xs text-[#EAF0FF]/40">
                                    No items found
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        {res?.action === "create" && (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={res.newItemName ?? s.csvName}
                              onChange={(e) =>
                                updateResolution(s.csvName, {
                                  newItemName: e.target.value,
                                })
                              }
                              placeholder="Item name"
                              className="w-40 rounded-md border border-white/10 bg-[#0B1623] px-2 py-1 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none"
                            />
                            <select
                              value={res.newItemCategoryId ?? ""}
                              onChange={(e) =>
                                updateResolution(s.csvName, {
                                  newItemCategoryId: e.target.value || undefined,
                                })
                              }
                              className="w-32 rounded-md border border-white/10 bg-[#0B1623] px-2 py-1 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none"
                            >
                              <option value="">Category...</option>
                              {(itemCategories ?? []).map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                            <select
                              value={res.newItemBaseUom ?? "oz"}
                              onChange={(e) =>
                                updateResolution(s.csvName, {
                                  newItemBaseUom: e.target.value,
                                })
                              }
                              className="w-20 rounded-md border border-white/10 bg-[#0B1623] px-2 py-1 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none"
                            >
                              {Object.entries(UOM_LABELS).map(([val, label]) => (
                                <option key={val} value={val}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        {res?.action === "skip" && (
                          <span className="text-xs text-[#EAF0FF]/40">
                            Ingredient will be excluded from recipes
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => setStep(1)}
              className="rounded-md border border-white/10 px-4 py-2 text-sm text-[#EAF0FF]/70 hover:bg-[#16283F]/60"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!canProceedToReview()}
              className="rounded-md bg-[#E9B44C] px-6 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
            >
              Review Import
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-6">
          <h2 className="mb-1 text-lg font-semibold text-[#EAF0FF]">
            Review Import
          </h2>
          <p className="mb-4 text-sm text-[#EAF0FF]/60">
            {recipes.length} recipe{recipes.length !== 1 ? "s" : ""} will be imported.
          </p>

          <div className="max-h-96 space-y-3 overflow-auto">
            {recipes.map((r, idx) => {
              const allSkipped = r.ingredients.every(
                (ing) =>
                  resolutions[ing.csvName.toLowerCase()]?.action === "skip",
              );
              return (
                <div
                  key={idx}
                  className={`rounded-md border p-3 ${
                    allSkipped
                      ? "border-white/5 opacity-50"
                      : "border-white/10"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[#EAF0FF]">{r.name}</span>
                    {r.category && (
                      <span className="rounded-full bg-[#E9B44C]/10 px-2 py-0.5 text-xs text-[#E9B44C]">
                        {r.category}
                      </span>
                    )}
                    {allSkipped && (
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-[#EAF0FF]/40">
                        All ingredients skipped
                      </span>
                    )}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {r.ingredients.map((ing, iIdx) => {
                      const res = resolutions[ing.csvName.toLowerCase()];
                      const isSkipped = res?.action === "skip";
                      return (
                        <div
                          key={iIdx}
                          className={`flex items-center gap-2 text-xs ${
                            isSkipped
                              ? "text-[#EAF0FF]/30 line-through"
                              : "text-[#EAF0FF]/70"
                          }`}
                        >
                          <span className="text-[#EAF0FF]/30">-</span>
                          <span>{ing.quantity}</span>
                          <span className="text-[#EAF0FF]/50">
                            {UOM_LABELS[ing.uom] ?? ing.uom}
                          </span>
                          <span>{getResolvedIngredientName(ing.csvName)}</span>
                          {res?.action === "create" && (
                            <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-xs text-blue-400">
                              new
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary */}
          <div className="mt-4 flex gap-4 rounded-md bg-[#0B1623] p-3 text-sm">
            <div>
              <span className="text-[#EAF0FF]/50">Recipes: </span>
              <span className="text-[#EAF0FF]">{recipes.length}</span>
            </div>
            <div>
              <span className="text-[#EAF0FF]/50">Matched: </span>
              <span className="text-green-400">
                {suggestions.filter(
                  (s) =>
                    resolutions[s.csvName.toLowerCase()]?.action === "match",
                ).length}
              </span>
            </div>
            <div>
              <span className="text-[#EAF0FF]/50">New items: </span>
              <span className="text-blue-400">
                {suggestions.filter(
                  (s) =>
                    resolutions[s.csvName.toLowerCase()]?.action === "create",
                ).length}
              </span>
            </div>
            <div>
              <span className="text-[#EAF0FF]/50">Skipped: </span>
              <span className="text-[#EAF0FF]/40">
                {suggestions.filter(
                  (s) =>
                    resolutions[s.csvName.toLowerCase()]?.action === "skip",
                ).length}
              </span>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => setStep(2)}
              className="rounded-md border border-white/10 px-4 py-2 text-sm text-[#EAF0FF]/70 hover:bg-[#16283F]/60"
            >
              Back
            </button>
            <button
              onClick={handleImport}
              disabled={bulkCreateMut.isPending}
              className="rounded-md bg-[#E9B44C] px-6 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
            >
              {bulkCreateMut.isPending ? "Importing..." : "Confirm Import"}
            </button>
            {bulkCreateMut.error && (
              <p className="text-sm text-red-400">
                {bulkCreateMut.error.message}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Step 4: Results */}
      {step === 4 && importResult && (
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-6">
          <h2 className="mb-4 text-lg font-semibold text-[#EAF0FF]">
            Import Complete
          </h2>

          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg bg-[#0B1623] p-4 text-center">
              <div className="text-2xl font-bold text-green-400">
                {importResult.recipesCreated}
              </div>
              <div className="text-xs text-[#EAF0FF]/50">Recipes Created</div>
            </div>
            <div className="rounded-lg bg-[#0B1623] p-4 text-center">
              <div className="text-2xl font-bold text-[#EAF0FF]/40">
                {importResult.recipesSkipped}
              </div>
              <div className="text-xs text-[#EAF0FF]/50">Duplicates Skipped</div>
            </div>
            <div className="rounded-lg bg-[#0B1623] p-4 text-center">
              <div className="text-2xl font-bold text-blue-400">
                {importResult.itemsCreated}
              </div>
              <div className="text-xs text-[#EAF0FF]/50">New Items Created</div>
            </div>
            <div className="rounded-lg bg-[#0B1623] p-4 text-center">
              <div className="text-2xl font-bold text-[#EAF0FF]/40">
                {importResult.ingredientsSkipped}
              </div>
              <div className="text-xs text-[#EAF0FF]/50">Ingredients Skipped</div>
            </div>
          </div>

          {importResult.errors.length > 0 && (
            <div className="mb-4 rounded-md border border-red-500/20 bg-red-500/5 p-3">
              <h3 className="mb-1 text-sm font-medium text-red-400">Errors</h3>
              {importResult.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-400/80">
                  {e}
                </p>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <Link
              href="/recipes"
              className="rounded-md bg-[#E9B44C] px-6 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E]"
            >
              View Recipes
            </Link>
            <button
              onClick={() => {
                setStep(1);
                setCsvText("");
                setFileName("");
                setRecipes([]);
                setSuggestions([]);
                setParseErrors([]);
                setResolutions({});
                setImportResult(null);
              }}
              className="rounded-md border border-white/10 px-4 py-2 text-sm text-[#EAF0FF]/70 hover:bg-[#16283F]/60"
            >
              Import More
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
