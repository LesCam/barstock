"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";
import { useLocation } from "@/components/location-context";
import { HelpLink } from "@/components/help-link";
import { UOM, CountingMethod } from "@barstock/types";
import { QRCodeSVG } from "qrcode.react";

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
  const { selectedLocationId: locationId } = useLocation();
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
  const [showTareNudge, setShowTareNudge] = useState(false);

  // Create form state
  const [newName, setNewName] = useState("");
  const [newCategoryId, setNewCategoryId] = useState<string>("");
  const [newBarcode, setNewBarcode] = useState("");
  const [newVendorSku, setNewVendorSku] = useState("");
  const [newPackSize, setNewPackSize] = useState("");
  const [newContainerSize, setNewContainerSize] = useState("");
  const [newContainerUom, setNewContainerUom] = useState<string>("");

  // Inline category creation
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatMethod, setNewCatMethod] = useState<string>(CountingMethod.unit_count);
  const createCatMut = trpc.itemCategories.create.useMutation({
    onSuccess: (created) => {
      utils.itemCategories.list.invalidate();
      setNewCategoryId(created.id);
      setShowNewCategory(false);
      setNewCatName("");
      setNewCatMethod(CountingMethod.unit_count);
    },
  });

  const barcodeRef = useRef<HTMLInputElement>(null);

  // Phone-to-web scan bridge (stable ID for page lifetime)
  const [scanSessionId] = useState(() => crypto.randomUUID());
  const eventSourceRef = useRef<EventSource | null>(null);

  // Barcode lookup state
  const [lookupStatus, setLookupStatus] = useState<
    | null
    | { type: "loading" }
    | { type: "exists"; name: string; itemId: string }
    | { type: "found"; source: string; brand?: string | null }
    | { type: "not_found" }
  >(null);
  const [createdFromLookup, setCreatedFromLookup] = useState(false);

  const contributeMut = trpc.masterProducts.contribute.useMutation();

  const updateMut = trpc.inventory.update.useMutation({
    onSuccess: () => {
      utils.inventory.list.invalidate();
      utils.inventory.onHand.invalidate();
      resetCreateForm();
      barcodeRef.current?.focus();
    },
  });

  const createMut = trpc.inventory.create.useMutation({
    onSuccess: (_data, variables) => {
      // Contribute back to master products if item was created from a lookup
      if (createdFromLookup && variables.barcode) {
        contributeMut.mutate({
          barcode: variables.barcode,
          name: variables.name,
          containerSizeMl: variables.containerSize && variables.containerUom === "ml"
            ? variables.containerSize
            : undefined,
        });
      }
      // Check if the created item's category is weighable
      const createdCategory = categories?.find((c) => c.id === variables.categoryId);
      if (createdCategory?.countingMethod === "weighable") {
        setShowTareNudge(true);
      }
      utils.inventory.list.invalidate();
      utils.inventory.onHand.invalidate();
      resetCreateForm();
      if (!scanSessionId) {
        setShowCreate(false);
      }
    },
  });

  function resetCreateForm() {
    setNewName("");
    setNewCategoryId("");
    setNewBarcode("");
    setNewVendorSku("");
    setNewPackSize("");
    setNewContainerSize("");
    setNewContainerUom("");
    setLookupStatus(null);
    setCreatedFromLookup(false);
    setValidationFailed(false);
  }

  const doLookup = useCallback(async (barcode: string) => {
    if (!barcode || !locationId) return;
    setNewBarcode(barcode);
    setLookupStatus({ type: "loading" });
    try {
      const result = await utils.masterProducts.chainedLookup.fetch({ barcode, locationId });
      if (result.source === "local" && result.localItem) {
        const li = result.localItem;
        setNewName(li.name);
        if (li.categoryId) setNewCategoryId(li.categoryId);
        if (li.vendorSku) setNewVendorSku(li.vendorSku);
        if (li.containerSize) setNewContainerSize(String(Number(li.containerSize)));
        if (li.containerUom) setNewContainerUom(li.containerUom);
        if (li.packSize) setNewPackSize(String(Number(li.packSize)));
        setLookupStatus({ type: "exists", name: li.name, itemId: li.id });
      } else if (
        (result.source === "master" || result.source === "openfoodfacts") &&
        result.suggestion
      ) {
        const s = result.suggestion;
        if (s.name) {
          setNewName(s.brand ? `${s.brand} ${s.name}` : s.name);
        }
        if (s.containerSizeMl) {
          setNewContainerSize(String(s.containerSizeMl));
        }
        setNewContainerUom("ml");
        if (s.categoryHint && categories?.length) {
          const hint = s.categoryHint.toLowerCase();
          const match = categories.find(
            (c) =>
              c.name.toLowerCase().includes(hint) ||
              hint.includes(c.name.toLowerCase())
          );
          if (match) setNewCategoryId(match.id);
        }
        setCreatedFromLookup(true);
        setLookupStatus({ type: "found", source: result.source, brand: s.brand });
      } else {
        setLookupStatus({ type: "not_found" });
      }
    } catch {
      setLookupStatus({ type: "not_found" });
    }
  }, [locationId, categories, utils]);

  // Global barcode scanner detection: captures rapid keystrokes ending with Enter
  useEffect(() => {
    if (!showCreate) return;
    let buffer = "";
    let lastKeyTime = 0;
    const SCAN_THRESHOLD_MS = 80; // max ms between keystrokes for scanner input
    const MIN_BARCODE_LENGTH = 6;

    function handleKeyDown(e: KeyboardEvent) {
      // Ignore if user is typing in another input (not the barcode field)
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" &&
        target !== barcodeRef.current
      ) return;
      if (target.tagName === "SELECT" || target.tagName === "TEXTAREA") return;

      const now = Date.now();
      if (e.key === "Enter") {
        if (buffer.length >= MIN_BARCODE_LENGTH) {
          e.preventDefault();
          doLookup(buffer);
        }
        buffer = "";
        return;
      }
      // Only buffer printable single characters
      if (e.key.length === 1) {
        if (now - lastKeyTime > SCAN_THRESHOLD_MS) {
          buffer = ""; // too slow, reset — likely manual typing
        }
        buffer += e.key;
        lastKeyTime = now;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showCreate, doLookup]);

  // Phone-to-web scan bridge: open SSE when create form opens
  useEffect(() => {
    if (!showCreate) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }
    const es = new EventSource(`/api/scan-import/${scanSessionId}/stream`);
    eventSourceRef.current = es;
    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.type === "barcode_scanned" && data.payload?.barcode) {
          doLookup(data.payload.barcode);
        }
      } catch {
        // ignore parse errors
      }
    };
    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [showCreate, doLookup]);

  function handleLookup() {
    doLookup(newBarcode.trim());
  }

  const [validationFailed, setValidationFailed] = useState(false);

  function handleCreate() {
    if (!locationId || !newName.trim() || !newCategoryId) {
      setValidationFailed(true);
      return;
    }
    setValidationFailed(false);
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

  function handleUpdate() {
    if (lookupStatus?.type !== "exists" || !newName.trim() || !newCategoryId) {
      setValidationFailed(true);
      return;
    }
    setValidationFailed(false);
    updateMut.mutate({
      id: lookupStatus.itemId,
      name: newName.trim(),
      categoryId: newCategoryId,
      barcode: newBarcode.trim() || undefined,
      vendorSku: newVendorSku.trim() || undefined,
      packSize: newPackSize ? Number(newPackSize) : undefined,
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
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-[#EAF0FF]">Inventory Catalog</h1>
          <HelpLink section="counting-methods" tooltip="Learn about counting methods" />
        </div>
        <button
          onClick={() => { setShowCreate((v) => { if (v) resetCreateForm(); return !v; }); }}
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
              <label className={`mb-1 block text-xs ${validationFailed && !newName.trim() ? "text-red-400" : "text-[#EAF0FF]/60"}`}>Name *</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => { setNewName(e.target.value); setValidationFailed(false); }}
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30"
                placeholder="Item name"
              />
            </div>
            <div>
              <label className={`mb-1 block text-xs ${validationFailed && !newCategoryId ? "text-red-400" : "text-[#EAF0FF]/60"}`}>Category {!newCategoryId && validationFailed ? "*" : ""}</label>
              {showNewCategory ? (
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30"
                    placeholder="Category name"
                    autoFocus
                  />
                  <select
                    value={newCatMethod}
                    onChange={(e) => setNewCatMethod(e.target.value)}
                    className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
                  >
                    <option value="unit_count">Unit Count</option>
                    <option value="weighable">Weighable</option>
                    <option value="keg">Keg</option>
                  </select>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setShowNewCategory(false); setNewCatName(""); }}
                      className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-[#EAF0FF]/60 hover:text-[#EAF0FF]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!newCatName.trim() || !businessId || createCatMut.isPending}
                      onClick={() => createCatMut.mutate({ businessId, name: newCatName.trim(), countingMethod: newCatMethod as any })}
                      className="rounded-md bg-[#E9B44C] px-3 py-1.5 text-xs font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
                    >
                      {createCatMut.isPending ? "Adding..." : "Add"}
                    </button>
                  </div>
                  {createCatMut.error && (
                    <p className="text-xs text-red-400">{createCatMut.error.message}</p>
                  )}
                </div>
              ) : (
                <div className="flex gap-2">
                  <select
                    value={newCategoryId}
                    onChange={(e) => { setNewCategoryId(e.target.value); setValidationFailed(false); }}
                    className="flex-1 rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
                  >
                    <option value="">Select category...</option>
                    {categories?.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowNewCategory(true)}
                    className="shrink-0 rounded-md border border-white/10 px-2 py-2 text-sm text-[#EAF0FF]/60 hover:border-[#E9B44C] hover:text-[#E9B44C]"
                    title="Add new category"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">Barcode</label>
              <div className="flex gap-2">
                <input
                  ref={barcodeRef}
                  autoFocus
                  type="text"
                  value={newBarcode}
                  onChange={(e) => { setNewBarcode(e.target.value); setLookupStatus(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleLookup(); } }}
                  className="flex-1 rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30"
                  placeholder="Scan or type UPC..."
                />
                <button
                  type="button"
                  onClick={handleLookup}
                  disabled={!newBarcode.trim() || lookupStatus?.type === "loading"}
                  className="shrink-0 rounded-md border border-[#E9B44C] px-3 py-2 text-sm font-medium text-[#E9B44C] hover:bg-[#E9B44C] hover:text-[#0B1623] disabled:opacity-40"
                >
                  {lookupStatus?.type === "loading" ? (
                    <span className="inline-flex items-center gap-1">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    </span>
                  ) : "Lookup"}
                </button>
              </div>
              {lookupStatus?.type === "exists" && (
                <p className="mt-1 text-xs text-amber-400">Already in inventory: {lookupStatus.name}</p>
              )}
              {lookupStatus?.type === "found" && (
                <p className="mt-1 text-xs text-green-400">Found via {lookupStatus.source === "master" ? "master catalog" : "Open Food Facts"}</p>
              )}
              {lookupStatus?.type === "not_found" && (
                <p className="mt-1 text-xs text-amber-400">Not found online — please enter details manually</p>
              )}
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
          {/* Phone scan pairing */}
          {scanSessionId && (
            <div className="mt-3 flex items-center gap-4 rounded-md border border-white/10 bg-[#0B1623] p-3">
              <QRCodeSVG
                value={`barstock://scan-import/${scanSessionId}`}
                size={80}
                bgColor="#0B1623"
                fgColor="#EAF0FF"
              />
              <div className="text-xs text-[#EAF0FF]/60">
                <p className="mb-1 font-medium text-[#EAF0FF]/80">Scan from phone</p>
                <p>Open <span className="font-medium text-[#E9B44C]">Scan Import</span> on your phone, scan this QR to pair, then scan any barcode.</p>
                <p className="mt-1 font-mono text-[10px] text-[#EAF0FF]/30">{scanSessionId.slice(0, 6).toUpperCase()}</p>
              </div>
            </div>
          )}
          <div className="mt-3 flex items-center gap-3">
            {lookupStatus?.type === "exists" ? (
              <button
                onClick={handleUpdate}
                disabled={updateMut.isPending}
                className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-semibold text-[#0B1623] shadow-sm hover:bg-[#C8922E] disabled:opacity-50"
              >
                {updateMut.isPending ? "Saving..." : "Save Changes"}
              </button>
            ) : newName.trim() || newBarcode.trim() ? (
              <button
                onClick={handleCreate}
                disabled={createMut.isPending}
                className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-semibold text-[#0B1623] shadow-sm hover:bg-[#C8922E] disabled:opacity-50"
              >
                {createMut.isPending ? "Creating..." : "Create Item"}
              </button>
            ) : null}
            {scanSessionId && (
              <button
                type="button"
                onClick={() => { resetCreateForm(); barcodeRef.current?.focus(); }}
                className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-semibold text-[#0B1623] shadow-sm hover:bg-[#C8922E]"
              >
                Scan Next
              </button>
            )}
            {validationFailed && (!newName.trim() || !newCategoryId) && (
              <p className="text-sm text-red-400">Please fill in required fields above</p>
            )}
            {createMut.error && (
              <p className="text-sm text-red-400">{createMut.error.message}</p>
            )}
            {updateMut.error && (
              <p className="text-sm text-red-400">{updateMut.error.message}</p>
            )}
          </div>
        </div>
      )}

      {showTareNudge && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-[#FBBF24]/25 bg-[#92400E]/20 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-[#FBBF24]">Set up tare weight</p>
            <p className="text-xs text-[#FDE68A]">This weighable item needs an empty bottle weight for accurate counting. Set it up on the mobile app under Tare Weights.</p>
          </div>
          <button
            onClick={() => setShowTareNudge(false)}
            className="shrink-0 rounded-md px-2 py-1.5 text-xs text-[#FDE68A] hover:text-white"
          >
            Dismiss
          </button>
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
