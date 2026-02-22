"use client";

import { useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useLocation } from "@/components/location-context";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { MappingMode } from "@barstock/types";

// ─── Types ──────────────────────────────────────────────────

interface MappingSuggestion {
  posItemName: string;
  suggestedMode: string;
  suggestedTarget: {
    id: string;
    name: string;
    type: "inventoryItem" | "recipe";
  } | null;
  confidence: number;
  alternatives: {
    id: string;
    name: string;
    type: "inventoryItem" | "recipe";
    score: number;
  }[];
}

interface MappingRow {
  posItemName: string;
  posItemId: string;
  mode: string;
  targetId: string;
  targetName: string;
  targetType: "inventoryItem" | "recipe" | "";
  confidence: number;
  included: boolean;
  alternatives: MappingSuggestion["alternatives"];
}

type WizardStep = 1 | 2 | 3;

const SOURCE_SYSTEMS = [
  { value: "toast", label: "Toast" },
  { value: "square", label: "Square" },
  { value: "lightspeed", label: "Lightspeed" },
  { value: "clover", label: "Clover" },
  { value: "other", label: "Other / Generic" },
  { value: "manual", label: "Manual" },
];

const MODE_LABELS: Record<string, string> = {
  packaged_unit: "Packaged Unit",
  draft_by_tap: "Draft by Tap",
  draft_by_product: "Draft by Product",
  recipe: "Recipe",
};

type FilterMode = "all" | "matched" | "review";

// ─── Component ──────────────────────────────────────────────

export default function BulkMapPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const { selectedLocationId: locationId } = useLocation();

  const [step, setStep] = useState<WizardStep>(1);
  const [inputMode, setInputMode] = useState<"paste" | "csv">("paste");
  const [pasteText, setPasteText] = useState("");
  const [sourceSystem, setSourceSystem] = useState("toast");
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Mapping rows
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [filter, setFilter] = useState<FilterMode>("all");

  // Search state for target selection
  const [searchTerms, setSearchTerms] = useState<Record<number, string>>({});

  // Results
  const [result, setResult] = useState<{
    created: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  // Fetch inventory + recipes for manual target selection
  const { data: inventoryItems } = trpc.inventory.list.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId },
  );
  const { data: recipes } = trpc.recipes.list.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId },
  );

  const suggestMut = trpc.mappings.suggestMappings.useMutation();
  const bulkCreateMut = trpc.mappings.bulkCreate.useMutation();

  // ─── Step 1: Input ─────────────────────────────────────

  function handleFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      // Extract POS item names from CSV (first column, skip header)
      const lines = text.trim().split(/\r?\n/);
      const names = lines
        .slice(1)
        .map((l) => l.split(",")[0]?.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      setPasteText(names.join("\n"));
    };
    reader.readAsText(file);
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, []);

  function getPosItemNames(): string[] {
    return pasteText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  }

  async function handleSuggest() {
    if (!locationId) return;
    const names = getPosItemNames();
    if (names.length === 0) return;

    const suggestions = await suggestMut.mutateAsync({
      locationId,
      posItemNames: names,
    });

    // Convert suggestions to editable rows
    const newRows: MappingRow[] = suggestions.map((s) => ({
      posItemName: s.posItemName,
      posItemId: s.posItemName.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      mode: s.suggestedMode,
      targetId: s.suggestedTarget?.id ?? "",
      targetName: s.suggestedTarget?.name ?? "",
      targetType: s.suggestedTarget?.type ?? "",
      confidence: s.confidence,
      included: s.confidence >= 0.5,
      alternatives: s.alternatives,
    }));

    setRows(newRows);
    setStep(2);
  }

  // ─── Step 2: Review & Map ──────────────────────────────

  function updateRow(index: number, update: Partial<MappingRow>) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...update } : row)),
    );
  }

  function getFilteredRows(): { row: MappingRow; originalIndex: number }[] {
    return rows
      .map((row, i) => ({ row, originalIndex: i }))
      .filter(({ row }) => {
        if (filter === "matched") return row.confidence >= 0.5;
        if (filter === "review") return row.confidence < 0.5;
        return true;
      });
  }

  function getConfidenceColor(score: number) {
    if (score >= 0.8) return "bg-green-500/10 text-green-400";
    if (score >= 0.5) return "bg-yellow-500/10 text-yellow-400";
    return "bg-red-500/10 text-red-400";
  }

  type Candidate = { id: string; name: string; type: "inventoryItem" | "recipe" };

  function getAllCandidates(): Candidate[] {
    const items: Candidate[] = (inventoryItems ?? []).map((i) => ({
      id: i.id,
      name: i.name,
      type: "inventoryItem" as const,
    }));
    const recipeList: Candidate[] = (recipes ?? [])
      .filter((r) => r.active)
      .map((r) => ({
        id: r.id,
        name: r.name,
        type: "recipe" as const,
      }));
    return [...items, ...recipeList];
  }

  function getFilteredCandidates(index: number, mode: string): Candidate[] {
    const term = (searchTerms[index] ?? "").toLowerCase();
    let candidates = getAllCandidates();

    // Filter by mode: recipe mode shows recipes, others show inventory
    if (mode === "recipe") {
      candidates = candidates.filter((c) => c.type === "recipe");
    } else {
      candidates = candidates.filter((c) => c.type === "inventoryItem");
    }

    if (term) {
      candidates = candidates.filter((c) => c.name.toLowerCase().includes(term));
    }

    return candidates.slice(0, 15);
  }

  function selectAllVisible(included: boolean) {
    const visibleIndices = new Set(getFilteredRows().map((r) => r.originalIndex));
    setRows((prev) =>
      prev.map((row, i) =>
        visibleIndices.has(i) ? { ...row, included } : row,
      ),
    );
  }

  // ─── Step 3: Import ────────────────────────────────────

  async function handleBulkCreate() {
    if (!locationId) return;

    const includedRows = rows.filter((r) => r.included && r.targetId);
    const mappings = includedRows.map((r) => ({
      posItemId: r.posItemId,
      posItemName: r.posItemName,
      mode: r.mode as any,
      ...(r.targetType === "recipe"
        ? { recipeId: r.targetId }
        : { inventoryItemId: r.targetId }),
    }));

    if (mappings.length === 0) return;

    const res = await bulkCreateMut.mutateAsync({
      locationId,
      sourceSystem: sourceSystem as any,
      mappings,
    });

    setResult(res);
    setStep(3);
  }

  // ─── Render ────────────────────────────────────────────

  const steps = [
    { num: 1, label: "Input" },
    { num: 2, label: "Review & Map" },
    { num: 3, label: "Results" },
  ];

  const includedCount = rows.filter((r) => r.included).length;
  const mappableCount = rows.filter((r) => r.included && r.targetId).length;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#EAF0FF]">
            Bulk Map POS Buttons
          </h1>
          <p className="mt-1 text-sm text-[#EAF0FF]/60">
            Auto-suggest and create mappings for POS items in bulk.
          </p>
        </div>
        <Link
          href="/pos"
          className="rounded-md border border-white/10 px-4 py-2 text-sm text-[#EAF0FF]/70 hover:bg-[#16283F]"
        >
          Back to POS
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

      {/* Step 1: Input */}
      {step === 1 && (
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-6">
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-[#EAF0FF]">
              Source System
            </label>
            <select
              value={sourceSystem}
              onChange={(e) => setSourceSystem(e.target.value)}
              className="w-48 rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none"
            >
              {SOURCE_SYSTEMS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4 flex gap-2">
            <button
              onClick={() => setInputMode("paste")}
              className={`rounded-md px-3 py-1.5 text-sm ${
                inputMode === "paste"
                  ? "bg-[#E9B44C] text-[#0B1623]"
                  : "border border-white/10 text-[#EAF0FF]/60 hover:bg-[#16283F]/60"
              }`}
            >
              Paste Names
            </button>
            <button
              onClick={() => setInputMode("csv")}
              className={`rounded-md px-3 py-1.5 text-sm ${
                inputMode === "csv"
                  ? "bg-[#E9B44C] text-[#0B1623]"
                  : "border border-white/10 text-[#EAF0FF]/60 hover:bg-[#16283F]/60"
              }`}
            >
              Upload CSV
            </button>
          </div>

          {inputMode === "paste" && (
            <div>
              <label className="mb-1 block text-sm text-[#EAF0FF]/70">
                One POS button name per line:
              </label>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={12}
                placeholder="Rail Vodka&#10;Rail Gin&#10;Margarita&#10;Bud Light Draft&#10;Heineken Bottle&#10;..."
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 font-mono text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/20 focus:border-[#E9B44C] focus:outline-none"
              />
              <p className="mt-1 text-xs text-[#EAF0FF]/40">
                {getPosItemNames().length} item{getPosItemNames().length !== 1 ? "s" : ""}
              </p>
            </div>
          )}

          {inputMode === "csv" && (
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
                {fileName || "Drop a CSV file here, or click to browse"}
              </p>
              <p className="mt-1 text-xs text-[#EAF0FF]/30">
                First column should contain POS button names
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
          )}

          {inputMode === "csv" && pasteText && (
            <div className="mt-3">
              <p className="mb-1 text-xs text-[#EAF0FF]/50">
                Parsed {getPosItemNames().length} names from CSV
              </p>
            </div>
          )}

          <div className="mt-4">
            <button
              onClick={handleSuggest}
              disabled={getPosItemNames().length === 0 || suggestMut.isPending}
              className="rounded-md bg-[#E9B44C] px-6 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
            >
              {suggestMut.isPending
                ? "Analyzing..."
                : `Suggest Mappings (${getPosItemNames().length} items)`}
            </button>
            {suggestMut.error && (
              <p className="mt-2 text-sm text-red-400">
                {suggestMut.error.message}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Review & Map */}
      {step === 2 && (
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#EAF0FF]">
              Review Mappings
            </h2>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[#EAF0FF]/50">
                {mappableCount} of {rows.length} ready to map
              </span>
            </div>
          </div>

          {/* Filters */}
          <div className="mb-4 flex items-center gap-2">
            {(
              [
                { key: "all", label: `All (${rows.length})` },
                {
                  key: "matched",
                  label: `Auto-matched (${rows.filter((r) => r.confidence >= 0.5).length})`,
                },
                {
                  key: "review",
                  label: `Needs Review (${rows.filter((r) => r.confidence < 0.5).length})`,
                },
              ] as { key: FilterMode; label: string }[]
            ).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-full px-3 py-1 text-xs ${
                  filter === key
                    ? "bg-[#E9B44C] text-[#0B1623]"
                    : "border border-white/10 text-[#EAF0FF]/60 hover:border-[#E9B44C]/50"
                }`}
              >
                {label}
              </button>
            ))}
            <div className="flex-1" />
            <button
              onClick={() => selectAllVisible(true)}
              className="text-xs text-[#E9B44C] hover:text-[#C8922E]"
            >
              Select All
            </button>
            <button
              onClick={() => selectAllVisible(false)}
              className="text-xs text-[#EAF0FF]/40 hover:text-[#EAF0FF]"
            >
              Deselect All
            </button>
          </div>

          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={getFilteredRows().every((r) => r.row.included)}
                      onChange={(e) => selectAllVisible(e.target.checked)}
                      className="accent-[#E9B44C]"
                    />
                  </th>
                  <th className="px-3 py-2">POS Name</th>
                  <th className="px-3 py-2">Confidence</th>
                  <th className="px-3 py-2">Mode</th>
                  <th className="px-3 py-2">Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {getFilteredRows().map(({ row, originalIndex }) => (
                  <tr
                    key={originalIndex}
                    className={row.included ? "" : "opacity-40"}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={row.included}
                        onChange={(e) =>
                          updateRow(originalIndex, { included: e.target.checked })
                        }
                        className="accent-[#E9B44C]"
                      />
                    </td>
                    <td className="px-3 py-2 font-medium text-[#EAF0FF]">
                      {row.posItemName}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${getConfidenceColor(
                          row.confidence,
                        )}`}
                      >
                        {row.confidence > 0
                          ? `${Math.round(row.confidence * 100)}%`
                          : "None"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={row.mode}
                        onChange={(e) => {
                          const newMode = e.target.value;
                          updateRow(originalIndex, {
                            mode: newMode,
                            // Clear target if switching between recipe and non-recipe
                            ...(newMode === "recipe" !== (row.mode === "recipe")
                              ? { targetId: "", targetName: "", targetType: "" as any }
                              : {}),
                          });
                        }}
                        className="rounded-md border border-white/10 bg-[#0B1623] px-2 py-1 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none"
                      >
                        {Object.entries(MODE_LABELS).map(([val, label]) => (
                          <option key={val} value={val}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <div className="relative min-w-[220px]">
                        <input
                          type="text"
                          placeholder={row.targetName || "Search..."}
                          value={searchTerms[originalIndex] ?? ""}
                          onChange={(e) =>
                            setSearchTerms((prev) => ({
                              ...prev,
                              [originalIndex]: e.target.value,
                            }))
                          }
                          onFocus={() => {
                            if (searchTerms[originalIndex] === undefined)
                              setSearchTerms((prev) => ({
                                ...prev,
                                [originalIndex]: "",
                              }));
                          }}
                          className="w-full rounded-md border border-white/10 bg-[#0B1623] px-2 py-1 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none"
                        />
                        {row.targetName && searchTerms[originalIndex] === undefined && (
                          <div className="mt-0.5 text-xs text-[#E9B44C]">
                            {row.targetName}
                            {row.targetType === "recipe" && (
                              <span className="ml-1 text-[#EAF0FF]/30">(recipe)</span>
                            )}
                          </div>
                        )}
                        {searchTerms[originalIndex] !== undefined && (
                          <div className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-md border border-white/10 bg-[#0B1623] shadow-lg">
                            {/* Show fuzzy alternatives first if no search term */}
                            {!searchTerms[originalIndex] &&
                              row.alternatives.length > 0 && (
                                <>
                                  <div className="px-2 py-1 text-xs text-[#EAF0FF]/40">
                                    Suggestions
                                  </div>
                                  {row.alternatives.map((alt) => (
                                    <button
                                      key={alt.id}
                                      type="button"
                                      onClick={() => {
                                        updateRow(originalIndex, {
                                          targetId: alt.id,
                                          targetName: alt.name,
                                          targetType: alt.type,
                                          mode:
                                            alt.type === "recipe"
                                              ? MappingMode.recipe
                                              : row.mode === "recipe"
                                                ? MappingMode.packaged_unit
                                                : row.mode,
                                        });
                                        setSearchTerms((prev) => {
                                          const next = { ...prev };
                                          delete next[originalIndex];
                                          return next;
                                        });
                                      }}
                                      className="flex w-full items-center justify-between px-2 py-1.5 text-left text-sm text-[#EAF0FF] hover:bg-[#16283F]"
                                    >
                                      <span>
                                        {alt.name}
                                        {alt.type === "recipe" && (
                                          <span className="ml-1 text-xs text-[#EAF0FF]/30">
                                            (recipe)
                                          </span>
                                        )}
                                      </span>
                                      <span className="text-xs text-[#EAF0FF]/40">
                                        {Math.round(alt.score * 100)}%
                                      </span>
                                    </button>
                                  ))}
                                  <div className="border-t border-white/5" />
                                </>
                              )}
                            {getFilteredCandidates(originalIndex, row.mode).map(
                              (c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => {
                                    updateRow(originalIndex, {
                                      targetId: c.id,
                                      targetName: c.name,
                                      targetType: c.type,
                                      mode:
                                        c.type === "recipe"
                                          ? MappingMode.recipe
                                          : row.mode === "recipe"
                                            ? MappingMode.packaged_unit
                                            : row.mode,
                                    });
                                    setSearchTerms((prev) => {
                                      const next = { ...prev };
                                      delete next[originalIndex];
                                      return next;
                                    });
                                  }}
                                  className="w-full px-2 py-1.5 text-left text-sm text-[#EAF0FF] hover:bg-[#16283F]"
                                >
                                  {c.name}
                                  {c.type === "recipe" && (
                                    <span className="ml-1 text-xs text-[#EAF0FF]/30">
                                      (recipe)
                                    </span>
                                  )}
                                </button>
                              ),
                            )}
                            {getFilteredCandidates(originalIndex, row.mode)
                              .length === 0 && (
                              <div className="px-2 py-1.5 text-xs text-[#EAF0FF]/40">
                                No items found
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
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
              onClick={handleBulkCreate}
              disabled={mappableCount === 0 || bulkCreateMut.isPending}
              className="rounded-md bg-[#E9B44C] px-6 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
            >
              {bulkCreateMut.isPending
                ? "Creating..."
                : `Create ${mappableCount} Mapping${mappableCount !== 1 ? "s" : ""}`}
            </button>
            {bulkCreateMut.error && (
              <p className="text-sm text-red-400">
                {bulkCreateMut.error.message}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Results */}
      {step === 3 && result && (
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-6">
          <h2 className="mb-4 text-lg font-semibold text-[#EAF0FF]">
            Mapping Complete
          </h2>

          <div className="mb-6 grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-[#0B1623] p-4 text-center">
              <div className="text-2xl font-bold text-green-400">
                {result.created}
              </div>
              <div className="text-xs text-[#EAF0FF]/50">Mappings Created</div>
            </div>
            <div className="rounded-lg bg-[#0B1623] p-4 text-center">
              <div className="text-2xl font-bold text-[#EAF0FF]/40">
                {result.skipped}
              </div>
              <div className="text-xs text-[#EAF0FF]/50">Already Mapped</div>
            </div>
            <div className="rounded-lg bg-[#0B1623] p-4 text-center">
              <div className="text-2xl font-bold text-red-400">
                {result.errors.length}
              </div>
              <div className="text-xs text-[#EAF0FF]/50">Errors</div>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="mb-4 rounded-md border border-red-500/20 bg-red-500/5 p-3">
              <h3 className="mb-1 text-sm font-medium text-red-400">Errors</h3>
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-400/80">
                  {e}
                </p>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <Link
              href="/pos"
              className="rounded-md bg-[#E9B44C] px-6 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E]"
            >
              View POS Mappings
            </Link>
            <Link
              href="/pos/unmapped"
              className="rounded-md border border-white/10 px-4 py-2 text-sm text-[#EAF0FF]/70 hover:bg-[#16283F]/60"
            >
              View Unmapped Items
            </Link>
            <button
              onClick={() => {
                setStep(1);
                setPasteText("");
                setFileName("");
                setRows([]);
                setResult(null);
              }}
              className="rounded-md border border-white/10 px-4 py-2 text-sm text-[#EAF0FF]/70 hover:bg-[#16283F]/60"
            >
              Map More
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
