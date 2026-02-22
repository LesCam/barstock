"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useLocation } from "@/components/location-context";
import { trpc } from "@/lib/trpc";
import { HelpLink } from "@/components/help-link";
import { downloadCsv } from "@/lib/download-csv";

const ADMIN_ROLES = ["platform_admin", "business_admin", "manager"];

interface EditedPar {
  inventoryItemId: string;
  vendorId: string;
  parLevel: number;
  minLevel: number;
  reorderQty: number | null;
  parUom: "unit" | "package";
  leadTimeDays: number;
  safetyStockDays: number;
}

function statusDot(status: string) {
  if (status === "green") return "bg-green-500";
  if (status === "yellow") return "bg-yellow-500";
  if (status === "red") return "bg-red-500";
  return "bg-white/20";
}

function formatCurrency(value: number | null): string {
  if (value == null) return "—";
  return `$${value.toFixed(2)}`;
}

export default function ParLevelsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const { selectedLocationId: locationId } = useLocation();
  const canEdit = ADMIN_ROLES.includes(user?.highestRole ?? "");

  const [view, setView] = useState<"manage" | "order">("manage");
  const [search, setSearch] = useState("");
  const [filterVendor, setFilterVendor] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [belowParOnly, setBelowParOnly] = useState(false);
  const [editedPars, setEditedPars] = useState<Map<string, EditedPar>>(new Map());
  const [sortColumn, setSortColumn] = useState<string>("itemName");
  const [sortAsc, setSortAsc] = useState(true);
  const [showSuggest, setShowSuggest] = useState(false);

  const { data: items, isLoading } = trpc.parLevels.list.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId }
  );

  const { data: suggestions } = trpc.parLevels.suggestions.useQuery(
    { locationId: locationId!, vendorId: filterVendor || undefined },
    { enabled: !!locationId && view === "order" }
  );

  const utils = trpc.useUtils();

  const bulkUpsertMutation = trpc.parLevels.bulkUpsert.useMutation({
    onSuccess: () => {
      utils.parLevels.list.invalidate();
      setEditedPars(new Map());
    },
  });

  // Derive unique vendors and categories from items
  const vendors = useMemo(() => {
    if (!items) return [];
    const map = new Map<string, string>();
    for (const item of items) {
      if (item.vendorId && item.vendorName) {
        map.set(item.vendorId, item.vendorName);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const categories = useMemo(() => {
    if (!items) return [];
    const map = new Map<string, string>();
    for (const item of items) {
      if (item.categoryId && item.categoryName) {
        map.set(item.categoryId, item.categoryName);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  // Filter and sort items
  const filteredItems = useMemo(() => {
    if (!items) return [];
    let result = [...items];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) =>
          i.itemName.toLowerCase().includes(q) ||
          i.vendorName?.toLowerCase().includes(q) ||
          i.vendorSku?.toLowerCase().includes(q)
      );
    }
    if (filterVendor) {
      result = result.filter((i) => i.vendorId === filterVendor);
    }
    if (filterCategory) {
      result = result.filter((i) => i.categoryId === filterCategory);
    }
    if (belowParOnly) {
      result = result.filter((i) => i.needsReorder);
    }

    result.sort((a, b) => {
      let cmp = 0;
      const av = (a as any)[sortColumn];
      const bv = (b as any)[sortColumn];
      if (av == null && bv == null) cmp = 0;
      else if (av == null) cmp = 1;
      else if (bv == null) cmp = -1;
      else if (typeof av === "string") cmp = av.localeCompare(bv);
      else cmp = av - bv;
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [items, search, filterVendor, filterCategory, belowParOnly, sortColumn, sortAsc]);

  // Summary stats
  const summaryStats = useMemo(() => {
    if (!items) return { withPar: 0, belowMin: 0, withoutPar: 0, totalReorderValue: 0 };
    const withPar = items.filter((i) => i.parLevelId).length;
    const belowMin = items.filter((i) => i.needsReorder).length;
    const withoutPar = items.filter((i) => !i.parLevelId).length;
    const totalReorderValue = items
      .filter((i) => i.needsReorder && i.estimatedOrderCost)
      .reduce((sum, i) => sum + (i.estimatedOrderCost ?? 0), 0);
    return { withPar, belowMin, withoutPar, totalReorderValue };
  }, [items]);

  function handleSort(col: string) {
    if (sortColumn === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortColumn(col);
      setSortAsc(true);
    }
  }

  function sortArrow(col: string) {
    if (sortColumn !== col) return "";
    return sortAsc ? " \u25B2" : " \u25BC";
  }

  function getEdited(inventoryItemId: string, vendorId: string | null): EditedPar | undefined {
    return editedPars.get(`${inventoryItemId}:${vendorId}`);
  }

  function setEditedField(item: any, field: keyof EditedPar, value: any) {
    const key = `${item.inventoryItemId}:${item.vendorId}`;
    const existing = editedPars.get(key) ?? {
      inventoryItemId: item.inventoryItemId,
      vendorId: item.vendorId,
      parLevel: item.parLevel ?? 0,
      minLevel: item.minLevel ?? 0,
      reorderQty: item.reorderQty,
      parUom: item.parUom ?? "unit",
      leadTimeDays: item.leadTimeDays ?? 1,
      safetyStockDays: item.safetyStockDays ?? 0,
    };
    const updated = { ...existing, [field]: value };
    const next = new Map(editedPars);
    next.set(key, updated);
    setEditedPars(next);
  }

  function handleSave() {
    if (!locationId || editedPars.size === 0) return;
    const parItems = Array.from(editedPars.values())
      .filter((p) => p.vendorId)
      .map((p) => ({
        inventoryItemId: p.inventoryItemId,
        vendorId: p.vendorId,
        parLevel: p.parLevel,
        minLevel: p.minLevel,
        reorderQty: p.reorderQty,
        parUom: p.parUom,
        leadTimeDays: p.leadTimeDays,
        safetyStockDays: p.safetyStockDays,
      }));
    if (parItems.length === 0) return;
    bulkUpsertMutation.mutate({ locationId, items: parItems });
  }

  if (!locationId) {
    return <div className="text-[#EAF0FF]/60">No location selected.</div>;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-[#EAF0FF]">Par Levels</h1>
          <HelpLink section="par-levels" tooltip="Learn about par levels & reorder" />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView("manage")}
            className={`rounded-md px-4 py-2 text-sm font-medium ${
              view === "manage"
                ? "bg-[#E9B44C] text-white"
                : "border border-white/10 text-[#EAF0FF]/80 hover:bg-white/5"
            }`}
          >
            Manage Pars
          </button>
          <button
            onClick={() => setView("order")}
            className={`rounded-md px-4 py-2 text-sm font-medium ${
              view === "order"
                ? "bg-[#E9B44C] text-white"
                : "border border-white/10 text-[#EAF0FF]/80 hover:bg-white/5"
            }`}
          >
            Generate Order
          </button>
        </div>
      </div>

      {view === "manage" ? (
        <ManageView
          items={filteredItems}
          isLoading={isLoading}
          canEdit={canEdit}
          search={search}
          setSearch={setSearch}
          filterVendor={filterVendor}
          setFilterVendor={setFilterVendor}
          filterCategory={filterCategory}
          setFilterCategory={setFilterCategory}
          belowParOnly={belowParOnly}
          setBelowParOnly={setBelowParOnly}
          vendors={vendors}
          categories={categories}
          summaryStats={summaryStats}
          handleSort={handleSort}
          sortArrow={sortArrow}
          editedPars={editedPars}
          setEditedPars={setEditedPars}
          getEdited={getEdited}
          setEditedField={setEditedField}
          handleSave={handleSave}
          isSaving={bulkUpsertMutation.isPending}
          saveError={bulkUpsertMutation.error?.message}
          showSuggest={showSuggest}
          setShowSuggest={setShowSuggest}
          locationId={locationId}
        />
      ) : (
        <OrderView
          suggestions={suggestions ?? []}
          isLoading={isLoading}
          filterVendor={filterVendor}
          setFilterVendor={setFilterVendor}
          vendors={vendors}
          locationId={locationId}
        />
      )}
    </div>
  );
}

function ManageView({
  items,
  isLoading,
  canEdit,
  search,
  setSearch,
  filterVendor,
  setFilterVendor,
  filterCategory,
  setFilterCategory,
  belowParOnly,
  setBelowParOnly,
  vendors,
  categories,
  summaryStats,
  handleSort,
  sortArrow,
  editedPars,
  setEditedPars,
  getEdited,
  setEditedField,
  handleSave,
  isSaving,
  saveError,
  showSuggest,
  setShowSuggest,
  locationId,
}: any) {
  const [suggestLead, setSuggestLead] = useState(2);
  const [suggestSafety, setSuggestSafety] = useState(1);
  const [suggestBuffer, setSuggestBuffer] = useState(3);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());

  const { data: parSuggestions, isLoading: suggestLoading } = trpc.parLevels.suggestPars.useQuery(
    {
      locationId: locationId!,
      leadTimeDays: suggestLead,
      safetyStockDays: suggestSafety,
      bufferDays: suggestBuffer,
    },
    { enabled: !!locationId && showSuggest }
  );

  // Auto-select all suggestions with vendors when data loads
  const suggestionsWithVendor = useMemo(
    () => (parSuggestions ?? []).filter((s: any) => s.vendorId),
    [parSuggestions]
  );

  function toggleSuggestion(id: string) {
    const next = new Set(selectedSuggestions);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedSuggestions(next);
  }

  function selectAllSuggestions() {
    setSelectedSuggestions(new Set(suggestionsWithVendor.map((s: any) => s.inventoryItemId)));
  }

  function deselectAllSuggestions() {
    setSelectedSuggestions(new Set());
  }

  function applySuggestions() {
    const next = new Map(editedPars);
    for (const s of suggestionsWithVendor) {
      if (!selectedSuggestions.has(s.inventoryItemId)) continue;
      const key = `${s.inventoryItemId}:${s.vendorId}`;
      next.set(key, {
        inventoryItemId: s.inventoryItemId,
        vendorId: s.vendorId,
        parLevel: s.suggestedParLevel,
        minLevel: s.suggestedMinLevel,
        reorderQty: s.reorderQty,
        parUom: s.parUom ?? "unit",
        leadTimeDays: s.leadTimeDays,
        safetyStockDays: s.safetyStockDays,
      });
    }
    setEditedPars(next);
    setShowSuggest(false);
    setSelectedSuggestions(new Set());
  }

  const withoutPars = suggestionsWithVendor.filter((s: any) => s.existingParLevel == null).length;
  const withPars = suggestionsWithVendor.filter((s: any) => s.existingParLevel != null).length;

  return (
    <>
      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-xs text-[#EAF0FF]/50">Items with Par</p>
          <p className="mt-1 text-2xl font-bold text-[#EAF0FF]">{summaryStats.withPar}</p>
        </div>
        <div className="rounded-lg border border-red-500/30 bg-[#16283F] p-4">
          <p className="text-xs text-red-400">Below Min Level</p>
          <p className="mt-1 text-2xl font-bold text-red-400">{summaryStats.belowMin}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-xs text-[#EAF0FF]/50">Items without Par</p>
          <p className="mt-1 text-2xl font-bold text-[#EAF0FF]/60">{summaryStats.withoutPar}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-xs text-[#EAF0FF]/50">Est. Reorder Value</p>
          <p className="mt-1 text-2xl font-bold text-[#E9B44C]">{formatCurrency(summaryStats.totalReorderValue)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items..."
          className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30"
        />
        <select
          value={filterVendor}
          onChange={(e) => setFilterVendor(e.target.value)}
          className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
        >
          <option value="">All Vendors</option>
          {vendors.map((v: any) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
        >
          <option value="">All Categories</option>
          {categories.map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-[#EAF0FF]/70">
          <input
            type="checkbox"
            checked={belowParOnly}
            onChange={(e) => setBelowParOnly(e.target.checked)}
            className="rounded"
          />
          Below Par Only
        </label>
        {canEdit && (
          <button
            onClick={() => {
              setShowSuggest(!showSuggest);
              if (!showSuggest) selectAllSuggestions();
            }}
            className={`rounded-md px-4 py-2 text-sm font-medium ${
              showSuggest
                ? "bg-[#E9B44C] text-white"
                : "border border-[#E9B44C]/50 text-[#E9B44C] hover:bg-[#E9B44C]/10"
            }`}
          >
            Auto-Suggest Pars
          </button>
        )}

        {editedPars.size > 0 && canEdit && (
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="ml-auto rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-white hover:bg-[#D4A43C] disabled:opacity-50"
          >
            {isSaving ? "Saving..." : `Save Changes (${editedPars.size})`}
          </button>
        )}
      </div>
      {saveError && <p className="mb-4 text-sm text-red-400">{saveError}</p>}

      {/* Auto-Suggest Panel */}
      {showSuggest && (
        <div className="mb-4 rounded-lg border border-[#E9B44C]/30 bg-[#16283F] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#EAF0FF]">Suggested Par Levels</h3>
            <button
              onClick={() => { setShowSuggest(false); setSelectedSuggestions(new Set()); }}
              className="text-[#EAF0FF]/40 hover:text-[#EAF0FF]/80"
            >
              &times;
            </button>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs text-[#EAF0FF]/70">
              Lead Time (days)
              <input
                type="number"
                min={0}
                value={suggestLead}
                onChange={(e) => setSuggestLead(Number(e.target.value))}
                className="w-16 rounded border border-white/10 bg-[#0B1623] px-2 py-1 text-right text-xs text-[#EAF0FF]"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[#EAF0FF]/70">
              Safety Stock (days)
              <input
                type="number"
                min={0}
                value={suggestSafety}
                onChange={(e) => setSuggestSafety(Number(e.target.value))}
                className="w-16 rounded border border-white/10 bg-[#0B1623] px-2 py-1 text-right text-xs text-[#EAF0FF]"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[#EAF0FF]/70">
              Buffer (days)
              <input
                type="number"
                min={0}
                value={suggestBuffer}
                onChange={(e) => setSuggestBuffer(Number(e.target.value))}
                className="w-16 rounded border border-white/10 bg-[#0B1623] px-2 py-1 text-right text-xs text-[#EAF0FF]"
              />
            </label>
            <span className="text-xs text-[#EAF0FF]/40">
              {withoutPars > 0 && `${withoutPars} without pars`}
              {withoutPars > 0 && withPars > 0 && ", "}
              {withPars > 0 && `${withPars} with existing pars`}
            </span>
          </div>

          {suggestLoading ? (
            <p className="text-xs text-[#EAF0FF]/60">Calculating suggestions...</p>
          ) : suggestionsWithVendor.length === 0 ? (
            <p className="text-xs text-[#EAF0FF]/60">No items with usage data and a vendor found.</p>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-2">
                <button onClick={selectAllSuggestions} className="text-xs text-[#E9B44C] hover:underline">Select All</button>
                <span className="text-xs text-[#EAF0FF]/30">|</span>
                <button onClick={deselectAllSuggestions} className="text-xs text-[#E9B44C] hover:underline">Deselect All</button>
                <span className="ml-auto text-xs text-[#EAF0FF]/50">{selectedSuggestions.size} selected</span>
              </div>
              <div className="max-h-64 overflow-y-auto rounded border border-white/5">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 border-b border-white/10 bg-[#0B1623] text-[#EAF0FF]/50 uppercase">
                    <tr>
                      <th className="px-2 py-1.5 font-medium w-8" />
                      <th className="px-2 py-1.5 font-medium">Item</th>
                      <th className="px-2 py-1.5 font-medium">Vendor</th>
                      <th className="px-2 py-1.5 font-medium text-right">Avg/Day</th>
                      <th className="px-2 py-1.5 font-medium text-right">Current Par</th>
                      <th className="px-2 py-1.5 font-medium text-right">Suggested Par</th>
                      <th className="px-2 py-1.5 font-medium text-right">Current Min</th>
                      <th className="px-2 py-1.5 font-medium text-right">Suggested Min</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {suggestionsWithVendor.map((s: any) => (
                      <tr key={s.inventoryItemId} className="hover:bg-[#0B1623]/40">
                        <td className="px-2 py-1.5">
                          <input
                            type="checkbox"
                            checked={selectedSuggestions.has(s.inventoryItemId)}
                            onChange={() => toggleSuggestion(s.inventoryItemId)}
                            className="rounded"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-[#EAF0FF]">{s.itemName}</td>
                        <td className="px-2 py-1.5 text-[#EAF0FF]/60">{s.vendorName ?? "—"}</td>
                        <td className="px-2 py-1.5 text-right text-[#EAF0FF]/60">{s.avgDailyUsage.toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-right text-[#EAF0FF]/40">{s.existingParLevel ?? "—"}</td>
                        <td className="px-2 py-1.5 text-right font-medium text-[#E9B44C]">{s.suggestedParLevel}</td>
                        <td className="px-2 py-1.5 text-right text-[#EAF0FF]/40">{s.existingMinLevel ?? "—"}</td>
                        <td className="px-2 py-1.5 text-right font-medium text-[#E9B44C]">{s.suggestedMinLevel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  onClick={applySuggestions}
                  disabled={selectedSuggestions.size === 0}
                  className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-white hover:bg-[#D4A43C] disabled:opacity-50"
                >
                  Apply Selected ({selectedSuggestions.size})
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <p className="text-[#EAF0FF]/60">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-[#EAF0FF]/60">No items found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
              <tr>
                <th className="px-3 py-3 font-medium">
                  <span className="w-3 inline-block" />
                </th>
                <th className="cursor-pointer px-3 py-3 font-medium" onClick={() => handleSort("itemName")}>
                  Item{sortArrow("itemName")}
                </th>
                <th className="cursor-pointer px-3 py-3 font-medium" onClick={() => handleSort("categoryName")}>
                  Category{sortArrow("categoryName")}
                </th>
                <th className="cursor-pointer px-3 py-3 font-medium" onClick={() => handleSort("vendorName")}>
                  Vendor{sortArrow("vendorName")}
                </th>
                <th className="px-3 py-3 font-medium">UOM</th>
                <th className="px-3 py-3 font-medium">Par UOM</th>
                <th className="cursor-pointer px-3 py-3 font-medium text-right" onClick={() => handleSort("currentOnHand")}>
                  On-Hand{sortArrow("currentOnHand")}
                </th>
                <th className="cursor-pointer px-3 py-3 font-medium text-right" onClick={() => handleSort("avgDailyUsage")}>
                  Avg/Day{sortArrow("avgDailyUsage")}
                </th>
                <th className="px-3 py-3 font-medium text-right">Par</th>
                <th className="px-3 py-3 font-medium text-right">Min</th>
                <th className="px-3 py-3 font-medium text-right">Reorder Qty</th>
                <th className="px-3 py-3 font-medium text-right">Lead Time</th>
                <th className="cursor-pointer px-3 py-3 font-medium text-right" onClick={() => handleSort("daysToStockout")}>
                  Days Left{sortArrow("daysToStockout")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {items.map((item: any) => {
                const edited = getEdited(item.inventoryItemId, item.vendorId);
                const par = edited?.parLevel ?? item.parLevel;
                const min = edited?.minLevel ?? item.minLevel;
                const reorder = edited?.reorderQty ?? item.reorderQty;
                const parUom = edited?.parUom ?? item.parUom ?? "unit";
                const lead = edited?.leadTimeDays ?? item.leadTimeDays;
                const hasPackSize = item.packSize != null && item.packSize > 0;

                return (
                  <tr key={item.inventoryItemId} className="hover:bg-[#0B1623]/40">
                    <td className="px-3 py-2.5">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${statusDot(item.status)}`} />
                    </td>
                    <td className="px-3 py-2.5 font-medium text-[#EAF0FF]">{item.itemName}</td>
                    <td className="px-3 py-2.5 text-[#EAF0FF]/70">{item.categoryName ?? "—"}</td>
                    <td className="px-3 py-2.5 text-[#EAF0FF]/70">
                      {item.vendorName ?? <span className="text-[#EAF0FF]/30">(No vendor)</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[#EAF0FF]/60">{item.uom}</td>
                    <td className="px-3 py-2.5">
                      {canEdit && item.vendorId ? (
                        <select
                          value={parUom}
                          disabled={!hasPackSize}
                          onChange={(e) =>
                            setEditedField(item, "parUom", e.target.value as "unit" | "package")
                          }
                          className="rounded border border-white/10 bg-[#0B1623] px-2 py-1 text-sm text-[#EAF0FF] disabled:opacity-30"
                          title={!hasPackSize ? "Set pack size on item to enable" : ""}
                        >
                          <option value="unit">Units</option>
                          <option value="package">
                            Pkg ({item.packSize ?? "?"})
                          </option>
                        </select>
                      ) : (
                        <span className="text-[#EAF0FF]/60">
                          {parUom === "package" && hasPackSize ? `Pkg (${item.packSize})` : "Units"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[#EAF0FF]/80">
                      {item.currentOnHand.toFixed(1)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[#EAF0FF]/60">
                      {item.avgDailyUsage != null ? item.avgDailyUsage.toFixed(2) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {canEdit && item.vendorId ? (
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={par ?? ""}
                          onChange={(e) =>
                            setEditedField(item, "parLevel", e.target.value === "" ? 0 : Number(e.target.value))
                          }
                          className="w-20 rounded border border-white/10 bg-[#0B1623] px-2 py-1 text-right text-sm text-[#EAF0FF]"
                          placeholder="—"
                        />
                      ) : (
                        <span className="text-[#EAF0FF]/60">{par ?? "—"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {canEdit && item.vendorId ? (
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={min ?? ""}
                          onChange={(e) =>
                            setEditedField(item, "minLevel", e.target.value === "" ? 0 : Number(e.target.value))
                          }
                          className="w-20 rounded border border-white/10 bg-[#0B1623] px-2 py-1 text-right text-sm text-[#EAF0FF]"
                          placeholder="—"
                        />
                      ) : (
                        <span className="text-[#EAF0FF]/60">{min ?? "—"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {canEdit && item.vendorId ? (
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={reorder ?? ""}
                          onChange={(e) =>
                            setEditedField(
                              item,
                              "reorderQty",
                              e.target.value === "" ? null : Number(e.target.value)
                            )
                          }
                          className="w-20 rounded border border-white/10 bg-[#0B1623] px-2 py-1 text-right text-sm text-[#EAF0FF]"
                          placeholder="auto"
                        />
                      ) : (
                        <span className="text-[#EAF0FF]/60">{reorder ?? "auto"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {canEdit && item.vendorId ? (
                        <input
                          type="number"
                          min={0}
                          value={lead ?? 1}
                          onChange={(e) =>
                            setEditedField(item, "leadTimeDays", Number(e.target.value))
                          }
                          className="w-16 rounded border border-white/10 bg-[#0B1623] px-2 py-1 text-right text-sm text-[#EAF0FF]"
                        />
                      ) : (
                        <span className="text-[#EAF0FF]/60">{lead ?? "—"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {item.daysToStockout != null ? (
                        <span
                          className={
                            item.daysToStockout <= 3
                              ? "font-medium text-red-400"
                              : item.daysToStockout <= 7
                              ? "text-yellow-400"
                              : "text-[#EAF0FF]/60"
                          }
                        >
                          {item.daysToStockout}d
                        </span>
                      ) : (
                        <span className="text-[#EAF0FF]/30">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function OrderView({
  suggestions,
  isLoading,
  filterVendor,
  setFilterVendor,
  vendors,
  locationId,
}: any) {
  const [excludedItems, setExcludedItems] = useState<Set<string>>(new Set());
  const [editedQtys, setEditedQtys] = useState<Map<string, number>>(new Map());
  const [createdVendorIds, setCreatedVendorIds] = useState<Set<string>>(new Set());
  const [notesMap, setNotesMap] = useState<Map<string, string>>(new Map());
  const [showNotes, setShowNotes] = useState<Set<string>>(new Set());
  const utils = trpc.useUtils();

  const createPOMutation = trpc.purchaseOrders.create.useMutation({
    onSuccess: (_data, variables) => {
      setCreatedVendorIds((prev) => new Set(prev).add(variables.vendorId));
      utils.parLevels.suggestions.invalidate();
    },
  });

  function handleCreatePO(vendor: any) {
    if (!locationId) return;
    const lines = vendor.items
      .filter((i: any) => !excludedItems.has(i.inventoryItemId))
      .map((i: any) => ({
        inventoryItemId: i.inventoryItemId,
        orderedQty: getOrderQty(i.inventoryItemId, i.orderQty),
        orderedUom: i.parUom ?? "unit",
      }));
    if (lines.length === 0) return;
    createPOMutation.mutate({
      locationId,
      vendorId: vendor.vendorId,
      notes: notesMap.get(vendor.vendorId) || undefined,
      lines,
    });
  }

  function toggleExclude(itemId: string) {
    const next = new Set(excludedItems);
    if (next.has(itemId)) next.delete(itemId);
    else next.add(itemId);
    setExcludedItems(next);
  }

  function getOrderQty(itemId: string, defaultQty: number): number {
    return editedQtys.get(itemId) ?? defaultQty;
  }

  const [copiedVendorId, setCopiedVendorId] = useState<string | null>(null);

  function uomLabel(item: any, qty: number): string {
    if (item.parUom === "package" && item.packSize) {
      return `${qty} case${qty !== 1 ? "s" : ""}`;
    }
    return `${qty} unit${qty !== 1 ? "s" : ""}`;
  }

  function copyVendorText(vendor: any) {
    const date = new Date().toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
    const lines = vendor.items
      .filter((i: any) => !excludedItems.has(i.inventoryItemId))
      .map((i: any) => {
        const qty = getOrderQty(i.inventoryItemId, i.orderQty);
        const uom = i.parUom === "package" && i.packSize
          ? `cases (${i.packSize}/cs)`
          : "units";
        const sku = i.vendorSku ? ` (SKU: ${i.vendorSku})` : "";
        return `${i.itemName} - ${qty} ${uom}${sku}`;
      });

    const totalCost = vendor.items
      .filter((i: any) => !excludedItems.has(i.inventoryItemId))
      .reduce((sum: number, i: any) => {
        const qty = getOrderQty(i.inventoryItemId, i.orderQty);
        return sum + (i.unitCost != null ? qty * i.unitCost : 0);
      }, 0);

    const text = [
      `Order for ${vendor.vendorName}`,
      date,
      "",
      ...lines,
      "",
      `Est. total: $${totalCost.toFixed(2)}`,
    ].join("\n");

    navigator.clipboard.writeText(text).then(() => {
      setCopiedVendorId(vendor.vendorId);
      setTimeout(() => setCopiedVendorId(null), 2000);
    });
  }

  function exportVendorCsv(vendor: any) {
    const rows = vendor.items
      .filter((i: any) => !excludedItems.has(i.inventoryItemId))
      .map((i: any) => {
        const qty = getOrderQty(i.inventoryItemId, i.orderQty);
        const cost = i.unitCost != null ? qty * i.unitCost : null;
        return [
          vendor.vendorName,
          i.itemName,
          i.vendorSku ?? "",
          i.uom,
          i.currentOnHand.toFixed(1),
          i.parLevel.toFixed(1),
          qty.toFixed(1),
          i.unitCost != null ? i.unitCost.toFixed(2) : "",
          cost != null ? cost.toFixed(2) : "",
        ];
      });

    const headers = ["Vendor", "Item Name", "Vendor SKU", "UOM", "Current On-Hand", "Par Level", "Order Qty", "Unit Cost", "Estimated Cost"];
    downloadCsv(headers, rows, `order-${vendor.vendorName.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  function exportAllCsv() {
    const headers = ["Vendor", "Item Name", "Vendor SKU", "UOM", "Current On-Hand", "Par Level", "Order Qty", "Unit Cost", "Estimated Cost"];
    const rows: string[][] = [];
    for (const vendor of suggestions) {
      for (const i of vendor.items) {
        if (excludedItems.has(i.inventoryItemId)) continue;
        const qty = getOrderQty(i.inventoryItemId, i.orderQty);
        const cost = i.unitCost != null ? qty * i.unitCost : null;
        rows.push([
          vendor.vendorName,
          i.itemName,
          i.vendorSku ?? "",
          i.uom,
          i.currentOnHand.toFixed(1),
          i.parLevel.toFixed(1),
          qty.toFixed(1),
          i.unitCost != null ? i.unitCost.toFixed(2) : "",
          cost != null ? cost.toFixed(2) : "",
        ]);
      }
    }
    downloadCsv(headers, rows, `order-all-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  if (isLoading) return <p className="text-[#EAF0FF]/60">Loading...</p>;

  if (!suggestions || suggestions.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-[#16283F] p-8 text-center">
        <p className="text-[#EAF0FF]/60">No items need reordering right now.</p>
        <p className="mt-2 text-sm text-[#EAF0FF]/40">
          Items appear here when their on-hand level drops at or below the min level.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={filterVendor}
          onChange={(e) => setFilterVendor(e.target.value)}
          className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
        >
          <option value="">All Vendors</option>
          {vendors.map((v: any) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
        <button
          onClick={exportAllCsv}
          className="ml-auto rounded-md border border-white/10 px-4 py-2 text-sm text-[#EAF0FF]/80 hover:bg-white/5"
        >
          Export All (CSV)
        </button>
      </div>

      {createPOMutation.error && (
        <p className="mb-4 text-sm text-red-400">{createPOMutation.error.message}</p>
      )}

      <div className="space-y-6">
        {suggestions.map((vendor: any) => (
          <div key={vendor.vendorId} className="rounded-lg border border-white/10 bg-[#16283F]">
            {/* Vendor header */}
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <h3 className="text-lg font-semibold text-[#EAF0FF]">{vendor.vendorName}</h3>
                <div className="mt-1 flex gap-4 text-xs text-[#EAF0FF]/50">
                  {vendor.vendorEmail && <span>{vendor.vendorEmail}</span>}
                  {vendor.vendorPhone && <span>{vendor.vendorPhone}</span>}
                  <span>{vendor.itemCount} item(s)</span>
                  <span className="font-medium text-[#E9B44C]">
                    Est. total: {formatCurrency(vendor.totalEstimatedCost)}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => copyVendorText(vendor)}
                  className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-[#EAF0FF]/70 hover:bg-white/5"
                >
                  {copiedVendorId === vendor.vendorId ? "Copied!" : "Copy as Text"}
                </button>
                <button
                  onClick={() => exportVendorCsv(vendor)}
                  className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-[#EAF0FF]/70 hover:bg-white/5"
                >
                  Export CSV
                </button>
                <button
                  onClick={() => {
                    const next = new Set(showNotes);
                    if (next.has(vendor.vendorId)) next.delete(vendor.vendorId);
                    else next.add(vendor.vendorId);
                    setShowNotes(next);
                  }}
                  className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-[#EAF0FF]/70 hover:bg-white/5"
                >
                  Notes
                </button>
                {createdVendorIds.has(vendor.vendorId) ? (
                  <span className="flex items-center gap-1.5 rounded-md bg-green-500/10 border border-green-500/30 px-3 py-1.5 text-xs font-medium text-green-400">
                    PO Created <a href="/orders" className="underline hover:text-green-300">View</a>
                  </span>
                ) : (
                  <button
                    onClick={() => handleCreatePO(vendor)}
                    disabled={createPOMutation.isPending}
                    className="rounded-md bg-[#E9B44C] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#D4A43C] disabled:opacity-50"
                  >
                    {createPOMutation.isPending ? "Creating..." : "Create PO"}
                  </button>
                )}
              </div>
            </div>

            {/* Notes field (collapsible) */}
            {showNotes.has(vendor.vendorId) && (
              <div className="border-b border-white/10 px-4 py-2">
                <input
                  type="text"
                  value={notesMap.get(vendor.vendorId) ?? ""}
                  onChange={(e) => {
                    const next = new Map(notesMap);
                    next.set(vendor.vendorId, e.target.value);
                    setNotesMap(next);
                  }}
                  placeholder="Add notes for this order..."
                  className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-1.5 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30"
                />
              </div>
            )}

            {/* Vendor items table */}
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/5 text-xs uppercase text-[#EAF0FF]/50">
                <tr>
                  <th className="px-4 py-2 font-medium w-8" />
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 font-medium">SKU</th>
                  <th className="px-4 py-2 font-medium">UOM</th>
                  <th className="px-4 py-2 font-medium text-right">On-Hand</th>
                  <th className="px-4 py-2 font-medium text-right">Par</th>
                  <th className="px-4 py-2 font-medium text-right">Order Qty</th>
                  <th className="px-4 py-2 font-medium text-right">Unit Cost</th>
                  <th className="px-4 py-2 font-medium text-right">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {vendor.items.map((item: any) => {
                  const excluded = excludedItems.has(item.inventoryItemId);
                  const qty = getOrderQty(item.inventoryItemId, item.orderQty);
                  const lineCost = item.unitCost != null ? qty * item.unitCost : null;

                  return (
                    <tr
                      key={item.inventoryItemId}
                      className={excluded ? "opacity-40" : "hover:bg-[#0B1623]/40"}
                    >
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          checked={!excluded}
                          onChange={() => toggleExclude(item.inventoryItemId)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-2.5 font-medium text-[#EAF0FF]">{item.itemName}</td>
                      <td className="px-4 py-2.5 text-[#EAF0FF]/60">{item.vendorSku ?? "—"}</td>
                      <td className="px-4 py-2.5 text-[#EAF0FF]/60">
                        {item.parUom === "package" && item.packSize
                          ? `cases (${item.packSize}/cs)`
                          : item.uom}
                      </td>
                      <td className="px-4 py-2.5 text-right text-[#EAF0FF]/80">{item.currentOnHand.toFixed(1)}</td>
                      <td className="px-4 py-2.5 text-right text-[#EAF0FF]/60">{item.parLevel.toFixed(1)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={qty}
                          onChange={(e) => {
                            const next = new Map(editedQtys);
                            next.set(item.inventoryItemId, Number(e.target.value));
                            setEditedQtys(next);
                          }}
                          disabled={excluded}
                          className="w-20 rounded border border-white/10 bg-[#0B1623] px-2 py-1 text-right text-sm text-[#EAF0FF] disabled:opacity-40"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right text-[#EAF0FF]/60">
                        {formatCurrency(item.unitCost)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-[#E9B44C]">
                        {formatCurrency(lineCost)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </>
  );
}
