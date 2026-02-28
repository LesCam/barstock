"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useLocation } from "@/components/location-context";
import { trpc } from "@/lib/trpc";
import Papa from "papaparse";
import { UOM } from "@barstock/types";
import { QRCodeSVG } from "qrcode.react";
import { HelpLink } from "@/components/help-link";

// ─── Column Mapping ──────────────────────────────────────

const HEADER_ALIASES: Record<string, string[]> = {
  name: ["name", "item name", "product", "product name", "item"],
  category: ["category", "type", "group", "item type", "item category"],
  barcode: ["barcode", "upc", "sku", "upc code", "barcode number"],
  baseUom: ["uom", "unit", "base unit", "base uom", "unit of measure"],
  packSize: ["pack size", "case size", "pack", "case qty", "units per case"],
  containerSize: ["container size", "bottle size", "size", "container"],
};

function autoMapColumn(header: string): string | null {
  const normalized = header.toLowerCase().trim();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(normalized)) return field;
  }
  return null;
}

const UOM_VALUES = Object.values(UOM);
const UOM_ALIASES: Record<string, string> = {
  ounce: "oz",
  ounces: "oz",
  milliliter: "ml",
  milliliters: "ml",
  millilitres: "ml",
  gram: "grams",
  liter: "L",
  litre: "L",
  liters: "L",
  litres: "L",
  unit: "units",
  each: "units",
  ea: "units",
};

function parseUom(value: string): string | null {
  const v = value.toLowerCase().trim();
  if (UOM_VALUES.includes(v as any)) return v;
  return UOM_ALIASES[v] ?? null;
}

// ─── Types ───────────────────────────────────────────────

interface StagedItem {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  barcode: string;
  baseUom: string;
  packSize: string;
  containerSize: string;
  error?: string;
}

interface CsvPreviewRow {
  raw: Record<string, string>;
  mapped: {
    name: string;
    category: string;
    barcode: string;
    baseUom: string;
    packSize: string;
    containerSize: string;
  };
  errors: string[];
}

type Tab = "csv" | "quick-add" | "phone-scan";

interface PhoneStagedItem {
  barcode: string;
  name: string;
  categoryId: string;
  categoryName: string;
  baseUom: string;
  containerSizeMl?: number;
  emptyBottleWeightG?: number;
  fullBottleWeightG?: number;
  densityGPerMl?: number;
}

// ─── Component ───────────────────────────────────────────

export default function InventoryImportPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const { selectedLocationId: locationId } = useLocation();

  const [activeTab, setActiveTab] = useState<Tab>("csv");

  // Shared
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: number;
    skipped: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Categories query
  const businessId = user?.businessId;
  const { data: categories } = trpc.itemCategories.list.useQuery(
    { businessId: businessId!, activeOnly: true },
    { enabled: !!businessId }
  );

  const bulkCreateMutation = trpc.inventory.bulkCreate.useMutation();

  // ─── CSV Upload State ──────────────────────────────────

  const [file, setFile] = useState<File | null>(null);
  const [csvRows, setCsvRows] = useState<CsvPreviewRow[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [csvStep, setCsvStep] = useState<"upload" | "map" | "preview">(
    "upload"
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Quick Add State ───────────────────────────────────

  const [stagedItems, setStagedItems] = useState<StagedItem[]>([]);
  const [qaName, setQaName] = useState("");
  const [qaCategoryId, setQaCategoryId] = useState("");
  const [qaBarcode, setQaBarcode] = useState("");
  const [qaBaseUom, setQaBaseUom] = useState("oz");
  const [qaPackSize, setQaPackSize] = useState("");
  const [qaContainerSize, setQaContainerSize] = useState("");

  // ─── Phone Scan State ────────────────────────────────────

  const [scanSessionId, setScanSessionId] = useState<string | null>(null);
  const [phoneStagedItems, setPhoneStagedItems] = useState<PhoneStagedItem[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Generate scan session ID when tab is selected
  useEffect(() => {
    if (activeTab === "phone-scan" && !scanSessionId) {
      setScanSessionId(crypto.randomUUID());
    }
  }, [activeTab, scanSessionId]);

  // SSE subscription
  useEffect(() => {
    if (activeTab !== "phone-scan" || !scanSessionId) return;

    const es = new EventSource(`/api/scan-import/${scanSessionId}/stream`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "item_added" && data.payload) {
          setPhoneStagedItems((prev) => {
            // Dedup by barcode
            if (prev.some((i) => i.barcode === data.payload.barcode)) return prev;
            return [...prev, data.payload as PhoneStagedItem];
          });
        } else if (data.type === "item_removed" && data.payload?.barcode) {
          setPhoneStagedItems((prev) =>
            prev.filter((i) => i.barcode !== data.payload.barcode)
          );
        }
      } catch {
        // Ignore parse errors
      }
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [activeTab, scanSessionId]);

  const handlePhoneScanImport = async () => {
    if (!locationId || phoneStagedItems.length === 0) return;
    setImporting(true);
    setError(null);

    const items = phoneStagedItems.map((item) => ({
      name: item.name,
      categoryId: item.categoryId,
      baseUom: item.baseUom as any,
      barcode: item.barcode || undefined,
      containerSizeMl: item.containerSizeMl,
      emptyBottleWeightG: item.emptyBottleWeightG,
      fullBottleWeightG: item.fullBottleWeightG,
      densityGPerMl: item.densityGPerMl,
    }));

    try {
      const result = await bulkCreateMutation.mutateAsync({
        locationId,
        items,
      });
      setImportResult(result);
    } catch (err: any) {
      setError(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleRemovePhoneItem = (barcode: string) => {
    setPhoneStagedItems((prev) => prev.filter((i) => i.barcode !== barcode));
  };

  // ─── CSV Handlers ──────────────────────────────────────

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.name.endsWith(".csv")) {
      setFile(droppedFile);
      setError(null);
    } else {
      setError("Please drop a .csv file");
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setError(null);
    }
  };

  const handleParseFile = async () => {
    if (!file) return;
    setError(null);

    const text = await file.text();
    const result = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim(),
    });

    if (result.errors.length > 0 && result.data.length === 0) {
      setError(`CSV parse error: ${result.errors[0].message}`);
      return;
    }

    const headers = result.meta.fields || [];
    setCsvHeaders(headers);

    // Auto-map columns
    const autoMap: Record<string, string> = {};
    for (const header of headers) {
      const mapped = autoMapColumn(header);
      if (mapped) autoMap[header] = mapped;
    }
    setColumnMap(autoMap);
    setCsvStep("map");
  };

  const handleApplyMapping = () => {
    if (!file) return;
    setError(null);

    // Validate required mappings
    const mappedFields = new Set(Object.values(columnMap));
    if (!mappedFields.has("name")) {
      setError('Required column "Name" is not mapped');
      return;
    }
    if (!mappedFields.has("category")) {
      setError('Required column "Category" is not mapped');
      return;
    }
    if (!mappedFields.has("baseUom")) {
      setError('Required column "Base UOM" is not mapped');
      return;
    }

    // Re-parse with mapping applied
    const text = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      const csvText = e.target?.result as string;
      const result = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h: string) => h.trim(),
      });

      // Build reverse map: fieldName -> csvHeader
      const reverseMap: Record<string, string> = {};
      for (const [csvHeader, field] of Object.entries(columnMap)) {
        if (field) reverseMap[field] = csvHeader;
      }

      const categoryMap = new Map(
        (categories || []).map((c) => [c.name.toLowerCase(), c])
      );

      const rows: CsvPreviewRow[] = (
        result.data as Record<string, string>[]
      ).map((raw) => {
        const errors: string[] = [];
        const name = raw[reverseMap.name] || "";
        const category = raw[reverseMap.category] || "";
        const barcode = raw[reverseMap.barcode] || "";
        const baseUomRaw = raw[reverseMap.baseUom] || "";
        const packSize = raw[reverseMap.packSize] || "";
        const containerSize = raw[reverseMap.containerSize] || "";

        if (!name) errors.push("Name is required");
        if (!category) errors.push("Category is required");
        else if (!categoryMap.has(category.toLowerCase()))
          errors.push(`Unknown category: "${category}"`);
        if (!baseUomRaw) errors.push("Base UOM is required");
        else if (!parseUom(baseUomRaw))
          errors.push(`Invalid UOM: "${baseUomRaw}"`);
        if (packSize && isNaN(Number(packSize)))
          errors.push("Pack size must be a number");
        if (containerSize && isNaN(Number(containerSize)))
          errors.push("Container size must be a number");

        return {
          raw,
          mapped: {
            name,
            category,
            barcode,
            baseUom: baseUomRaw,
            packSize,
            containerSize,
          },
          errors,
        };
      });

      setCsvRows(rows);
      setCsvStep("preview");
    };
    reader.readAsText(text);
  };

  const handleCsvImport = async () => {
    if (!locationId || !categories) return;
    setImporting(true);
    setError(null);

    const categoryMap = new Map(
      categories.map((c) => [c.name.toLowerCase(), c])
    );

    const validItems = csvRows
      .filter((r) => r.errors.length === 0)
      .map((r) => {
        const cat = categoryMap.get(r.mapped.category.toLowerCase());
        const uom = parseUom(r.mapped.baseUom);
        return {
          name: r.mapped.name.trim(),
          categoryId: cat!.id,
          barcode: r.mapped.barcode.trim() || undefined,
          baseUom: uom as any,
          packSize: r.mapped.packSize
            ? Number(r.mapped.packSize)
            : undefined,
          containerSize: r.mapped.containerSize
            ? Number(r.mapped.containerSize)
            : undefined,
          containerUom: r.mapped.containerSize
            ? (uom as any)
            : undefined,
        };
      });

    if (validItems.length === 0) {
      setError("No valid items to import");
      setImporting(false);
      return;
    }

    try {
      const result = await bulkCreateMutation.mutateAsync({
        locationId,
        items: validItems,
      });
      setImportResult(result);
    } catch (err: any) {
      setError(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = () => {
    const csv = [
      "Name,Category,Barcode,Base UOM,Pack Size,Container Size",
      "Absolut Vodka,Liquor,7312040017003,oz,12,750",
      "Bud Light (Can),Packaged Beer,01204000175,units,24,",
      "House Red Wine,Wine,,oz,6,750",
      "Chicken Breast,Food,,units,,",
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "barstock-inventory-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Quick Add Handlers ────────────────────────────────

  const handleAddRow = () => {
    if (!qaName.trim()) return;
    const cat = categories?.find((c) => c.id === qaCategoryId);
    if (!cat) return;

    setStagedItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: qaName.trim(),
        categoryId: qaCategoryId,
        categoryName: cat.name,
        barcode: qaBarcode.trim(),
        baseUom: qaBaseUom,
        packSize: qaPackSize,
        containerSize: qaContainerSize,
      },
    ]);

    // Reset form
    setQaName("");
    setQaBarcode("");
    setQaPackSize("");
    setQaContainerSize("");
  };

  const handleRemoveRow = (id: string) => {
    setStagedItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleQuickAddImport = async () => {
    if (!locationId || stagedItems.length === 0) return;
    setImporting(true);
    setError(null);

    const items = stagedItems.map((item) => ({
      name: item.name,
      categoryId: item.categoryId,
      baseUom: item.baseUom as any,
      barcode: item.barcode || undefined,
      packSize: item.packSize ? Number(item.packSize) : undefined,
      containerSize: item.containerSize
        ? Number(item.containerSize)
        : undefined,
      containerUom: item.containerSize
        ? (item.baseUom as any)
        : undefined,
    }));

    try {
      const result = await bulkCreateMutation.mutateAsync({
        locationId,
        items,
      });
      setImportResult(result);
    } catch (err: any) {
      setError(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  // ─── Reset ─────────────────────────────────────────────

  const handleReset = () => {
    setFile(null);
    setCsvRows([]);
    setCsvHeaders([]);
    setColumnMap({});
    setCsvStep("upload");
    setStagedItems([]);
    setPhoneStagedItems([]);
    setScanSessionId(null);
    setImportResult(null);
    setError(null);
  };

  // ─── Permission Check ─────────────────────────────────

  if (!locationId) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-4 text-2xl font-bold text-[#EAF0FF]">
          Import Inventory
        </h1>
        <p className="text-[#EAF0FF]/60">
          Please select a location from the sidebar first.
        </p>
      </div>
    );
  }

  // ─── Result Screen ────────────────────────────────────

  if (importResult) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-6 text-2xl font-bold text-[#EAF0FF]">
          Import Inventory
        </h1>
        <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-6">
          <h2 className="mb-4 text-lg font-semibold text-green-400">
            Import Complete
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard label="Created" value={importResult.created} color="green" />
            <StatCard
              label="Skipped (Duplicates)"
              value={importResult.skipped}
              color={importResult.skipped > 0 ? "yellow" : undefined}
            />
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            onClick={handleReset}
            className="rounded-md bg-[#E9B44C] px-6 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#E9B44C]/90"
          >
            Import More
          </button>
          <a
            href="/inventory"
            className="rounded-md border border-white/10 px-4 py-2 text-sm text-[#EAF0FF]/60 hover:bg-[#16283F]"
          >
            View Inventory
          </a>
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────

  const validCsvCount = csvRows.filter((r) => r.errors.length === 0).length;
  const errorCsvCount = csvRows.filter((r) => r.errors.length > 0).length;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-[#EAF0FF]">Import Inventory</h1>
          <HelpLink section="getting-started" tooltip="Learn about getting started" />
        </div>
        <button
          onClick={handleDownloadTemplate}
          className="text-sm text-[#E9B44C] hover:text-[#E9B44C]/80"
        >
          Download CSV Template
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-[#0B1623] p-1">
        <button
          onClick={() => {
            setActiveTab("csv");
            setError(null);
          }}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "csv"
              ? "bg-[#16283F] text-[#E9B44C]"
              : "text-[#EAF0FF]/60 hover:text-[#EAF0FF]"
          }`}
        >
          Upload CSV
        </button>
        <button
          onClick={() => {
            setActiveTab("quick-add");
            setError(null);
          }}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "quick-add"
              ? "bg-[#16283F] text-[#E9B44C]"
              : "text-[#EAF0FF]/60 hover:text-[#EAF0FF]"
          }`}
        >
          Quick Add
        </button>
        <button
          onClick={() => {
            setActiveTab("phone-scan");
            setError(null);
          }}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "phone-scan"
              ? "bg-[#16283F] text-[#E9B44C]"
              : "text-[#EAF0FF]/60 hover:text-[#EAF0FF]"
          }`}
        >
          Scan from Phone
        </button>
      </div>

      {/* ─── CSV Tab ──────────────────────────────────────── */}
      {activeTab === "csv" && (
        <div className="space-y-6">
          {csvStep === "upload" && (
            <>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                  file
                    ? "border-green-500/40 bg-green-500/5"
                    : "border-white/20 bg-[#16283F]/50 hover:border-[#E9B44C]/40"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {file ? (
                  <div>
                    <p className="text-lg font-medium text-green-400">
                      {file.name}
                    </p>
                    <p className="mt-1 text-sm text-[#EAF0FF]/60">
                      {(file.size / 1024).toFixed(1)} KB — Click or drop to
                      replace
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-lg text-[#EAF0FF]/60">
                      Drop a CSV file here or click to browse
                    </p>
                    <p className="mt-1 text-sm text-[#EAF0FF]/40">
                      Use the template above for best results
                    </p>
                  </div>
                )}
              </div>

              <button
                onClick={handleParseFile}
                disabled={!file}
                className="rounded-md bg-[#E9B44C] px-6 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#E9B44C]/90 disabled:opacity-50"
              >
                Parse & Map Columns
              </button>
            </>
          )}

          {csvStep === "map" && (
            <>
              <p className="text-sm text-[#EAF0FF]/60">
                Map each CSV column to its corresponding field. Auto-detected
                mappings are pre-filled.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                {csvHeaders.map((header) => (
                  <div
                    key={header}
                    className="flex items-center gap-3 rounded-md border border-white/10 bg-[#16283F] px-3 py-2"
                  >
                    <span className="min-w-[120px] truncate font-mono text-sm text-[#EAF0FF]/80">
                      {header}
                    </span>
                    <span className="text-[#EAF0FF]/30">{"\u2192"}</span>
                    <select
                      value={columnMap[header] || ""}
                      onChange={(e) =>
                        setColumnMap((prev) => ({
                          ...prev,
                          [header]: e.target.value,
                        }))
                      }
                      className="flex-1 rounded border border-white/10 bg-[#0B1623] px-2 py-1 text-sm text-[#EAF0FF]"
                    >
                      <option value="">— Skip —</option>
                      <option value="name">Name *</option>
                      <option value="category">Category *</option>
                      <option value="barcode">Barcode</option>
                      <option value="baseUom">Base UOM *</option>
                      <option value="packSize">Pack Size</option>
                      <option value="containerSize">Container Size</option>
                    </select>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setCsvStep("upload");
                    setError(null);
                  }}
                  className="rounded-md border border-white/10 px-4 py-2 text-sm text-[#EAF0FF]/60 hover:bg-[#16283F]"
                >
                  Back
                </button>
                <button
                  onClick={handleApplyMapping}
                  className="rounded-md bg-[#E9B44C] px-6 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#E9B44C]/90"
                >
                  Preview Import
                </button>
              </div>
            </>
          )}

          {csvStep === "preview" && (
            <>
              {/* Summary stats */}
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard label="Total Rows" value={csvRows.length} />
                <StatCard label="Valid" value={validCsvCount} color="green" />
                <StatCard
                  label="Errors"
                  value={errorCsvCount}
                  color={errorCsvCount > 0 ? "red" : undefined}
                />
              </div>

              {/* Preview table */}
              <div className="overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0B1623] text-[#EAF0FF]/60">
                    <tr>
                      <th className="px-3 py-2 w-8"></th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">Barcode</th>
                      <th className="px-3 py-2">UOM</th>
                      <th className="px-3 py-2">Pack</th>
                      <th className="px-3 py-2">Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.slice(0, 100).map((row, i) => (
                      <tr
                        key={i}
                        className={`border-t border-white/5 ${
                          row.errors.length > 0 ? "bg-red-500/5" : ""
                        }`}
                      >
                        <td className="px-3 py-2">
                          {row.errors.length > 0 ? (
                            <span
                              className="cursor-help text-red-400"
                              title={row.errors.join(", ")}
                            >
                              ✗
                            </span>
                          ) : (
                            <span className="text-green-400">✓</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-[#EAF0FF]">
                          {row.mapped.name}
                        </td>
                        <td className="px-3 py-2 text-[#EAF0FF]/80">
                          {row.mapped.category}
                        </td>
                        <td className="px-3 py-2 font-mono text-[#EAF0FF]/60">
                          {row.mapped.barcode}
                        </td>
                        <td className="px-3 py-2 text-[#EAF0FF]/80">
                          {row.mapped.baseUom}
                        </td>
                        <td className="px-3 py-2 text-[#EAF0FF]/80">
                          {row.mapped.packSize}
                        </td>
                        <td className="px-3 py-2 text-[#EAF0FF]/80">
                          {row.mapped.containerSize}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {csvRows.length > 100 && (
                  <p className="border-t border-white/5 px-3 py-2 text-xs text-[#EAF0FF]/40">
                    Showing 100 of {csvRows.length} rows
                  </p>
                )}
              </div>

              {/* Error details */}
              {errorCsvCount > 0 && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                  <h3 className="mb-2 text-sm font-medium text-red-400">
                    Rows with Errors ({errorCsvCount})
                  </h3>
                  <div className="max-h-40 space-y-1 overflow-y-auto text-xs text-red-300/80">
                    {csvRows
                      .map((r, i) => ({ ...r, rowNum: i + 1 }))
                      .filter((r) => r.errors.length > 0)
                      .slice(0, 50)
                      .map((r) => (
                        <p key={r.rowNum}>
                          Row {r.rowNum}: {r.errors.join("; ")}
                        </p>
                      ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setCsvStep("map");
                    setError(null);
                  }}
                  className="rounded-md border border-white/10 px-4 py-2 text-sm text-[#EAF0FF]/60 hover:bg-[#16283F]"
                >
                  Back to Mapping
                </button>
                <button
                  onClick={handleCsvImport}
                  disabled={importing || validCsvCount === 0}
                  className="rounded-md bg-[#E9B44C] px-6 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#E9B44C]/90 disabled:opacity-50"
                >
                  {importing
                    ? "Importing..."
                    : `Import ${validCsvCount} Items`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── Quick Add Tab ────────────────────────────────── */}
      {activeTab === "quick-add" && (
        <div className="space-y-6">
          {/* Input form */}
          <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
            <div className="grid gap-3 sm:grid-cols-6">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-[#EAF0FF]/60">
                  Name *
                </label>
                <input
                  type="text"
                  value={qaName}
                  onChange={(e) => setQaName(e.target.value)}
                  placeholder="e.g. Absolut Vodka"
                  className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddRow();
                  }}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#EAF0FF]/60">
                  Category *
                </label>
                <select
                  value={qaCategoryId}
                  onChange={(e) => setQaCategoryId(e.target.value)}
                  className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
                >
                  <option value="">Select...</option>
                  {(categories || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#EAF0FF]/60">
                  UOM *
                </label>
                <select
                  value={qaBaseUom}
                  onChange={(e) => setQaBaseUom(e.target.value)}
                  className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
                >
                  {UOM_VALUES.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#EAF0FF]/60">
                  Barcode
                </label>
                <input
                  type="text"
                  value={qaBarcode}
                  onChange={(e) => setQaBarcode(e.target.value)}
                  placeholder="Optional"
                  className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30"
                />
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-[#EAF0FF]/60">
                    Pack
                  </label>
                  <input
                    type="number"
                    value={qaPackSize}
                    onChange={(e) => setQaPackSize(e.target.value)}
                    placeholder="#"
                    className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30"
                  />
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="w-24">
                <label className="mb-1 block text-xs font-medium text-[#EAF0FF]/60">
                  Size
                </label>
                <input
                  type="number"
                  value={qaContainerSize}
                  onChange={(e) => setQaContainerSize(e.target.value)}
                  placeholder="#"
                  className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30"
                />
              </div>
              <button
                onClick={handleAddRow}
                disabled={!qaName.trim() || !qaCategoryId}
                className="mt-4 rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#E9B44C]/90 disabled:opacity-50"
              >
                Add Row
              </button>
            </div>
          </div>

          {/* Staged items table */}
          {stagedItems.length > 0 && (
            <>
              <div className="overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0B1623] text-[#EAF0FF]/60">
                    <tr>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">UOM</th>
                      <th className="px-3 py-2">Barcode</th>
                      <th className="px-3 py-2">Pack</th>
                      <th className="px-3 py-2">Size</th>
                      <th className="px-3 py-2 w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {stagedItems.map((item) => (
                      <tr key={item.id} className="border-t border-white/5">
                        <td className="px-3 py-2 text-[#EAF0FF]">
                          {item.name}
                        </td>
                        <td className="px-3 py-2 text-[#EAF0FF]/80">
                          {item.categoryName}
                        </td>
                        <td className="px-3 py-2 text-[#EAF0FF]/80">
                          {item.baseUom}
                        </td>
                        <td className="px-3 py-2 font-mono text-[#EAF0FF]/60">
                          {item.barcode || "—"}
                        </td>
                        <td className="px-3 py-2 text-[#EAF0FF]/80">
                          {item.packSize || "—"}
                        </td>
                        <td className="px-3 py-2 text-[#EAF0FF]/80">
                          {item.containerSize || "—"}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => handleRemoveRow(item.id)}
                            className="text-red-400 hover:text-red-300"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleQuickAddImport}
                  disabled={importing}
                  className="rounded-md bg-[#E9B44C] px-6 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#E9B44C]/90 disabled:opacity-50"
                >
                  {importing
                    ? "Importing..."
                    : `Import ${stagedItems.length} Items`}
                </button>
                <span className="text-sm text-[#EAF0FF]/40">
                  {stagedItems.length} item{stagedItems.length !== 1 ? "s" : ""}{" "}
                  staged
                </span>
              </div>
            </>
          )}

          {stagedItems.length === 0 && (
            <p className="text-center text-sm text-[#EAF0FF]/40">
              Add items using the form above. They&apos;ll appear here for
              review before importing.
            </p>
          )}
        </div>
      )}

      {/* ─── Phone Scan Tab ───────────────────────────────── */}
      {activeTab === "phone-scan" && (
        <div className="space-y-6">
          {/* Pairing section */}
          <div className="rounded-lg border border-white/10 bg-[#16283F] p-6">
            <h3 className="mb-4 text-base font-semibold text-[#EAF0FF]">
              Pair with your phone
            </h3>
            <p className="mb-4 text-sm text-[#EAF0FF]/50">
              Open the Scan Import screen on your phone, tap &quot;Pair with Web&quot;, and scan this QR code
              or enter the pairing code. Scanned items will appear here in real-time.
            </p>

            <div className="flex items-start gap-8">
              {/* QR Code */}
              {scanSessionId && (
                <div className="rounded-lg bg-white p-4">
                  <QRCodeSVG
                    value={`barstock://scan-import/${scanSessionId}`}
                    size={180}
                    level="H"
                  />
                </div>
              )}

              {/* Pairing code */}
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-xs text-[#EAF0FF]/40 mb-1">Pairing Code</p>
                  <p className="font-mono text-3xl font-bold tracking-widest text-[#E9B44C]">
                    {scanSessionId?.slice(0, 6).toUpperCase() ?? "------"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs text-green-400">
                    Listening for scans...
                  </span>
                </div>
                <button
                  onClick={() => {
                    setScanSessionId(crypto.randomUUID());
                    setPhoneStagedItems([]);
                  }}
                  className="mt-2 text-xs text-[#EAF0FF]/40 hover:text-[#EAF0FF]/60 text-left"
                >
                  Generate new code
                </button>
              </div>
            </div>
          </div>

          {/* Items received from phone */}
          {phoneStagedItems.length > 0 && (
            <>
              <div className="overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0B1623] text-[#EAF0FF]/60">
                    <tr>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">Barcode</th>
                      <th className="px-3 py-2">UOM</th>
                      <th className="px-3 py-2">Container (ml)</th>
                      <th className="px-3 py-2 w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {phoneStagedItems.map((item) => (
                      <tr key={item.barcode} className="border-t border-white/5">
                        <td className="px-3 py-2 text-[#EAF0FF]">{item.name}</td>
                        <td className="px-3 py-2 text-[#EAF0FF]/80">{item.categoryName}</td>
                        <td className="px-3 py-2 font-mono text-[#EAF0FF]/60">{item.barcode}</td>
                        <td className="px-3 py-2 text-[#EAF0FF]/80">{item.baseUom}</td>
                        <td className="px-3 py-2 text-[#EAF0FF]/80">
                          {item.containerSizeMl ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => handleRemovePhoneItem(item.barcode)}
                            className="text-red-400 hover:text-red-300"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handlePhoneScanImport}
                  disabled={importing}
                  className="rounded-md bg-[#E9B44C] px-6 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#E9B44C]/90 disabled:opacity-50"
                >
                  {importing
                    ? "Importing..."
                    : `Import ${phoneStagedItems.length} Items`}
                </button>
                <span className="text-sm text-[#EAF0FF]/40">
                  {phoneStagedItems.length} item{phoneStagedItems.length !== 1 ? "s" : ""}{" "}
                  received from phone
                </span>
              </div>
            </>
          )}

          {phoneStagedItems.length === 0 && (
            <p className="text-center text-sm text-[#EAF0FF]/40">
              Scan barcodes on your phone. Items will appear here in real-time.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stat Card ───────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: "green" | "red" | "yellow";
}) {
  const colorClasses = {
    green: "text-green-400",
    red: "text-red-400",
    yellow: "text-yellow-400",
  };

  return (
    <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
      <p className="text-sm text-[#EAF0FF]/60">{label}</p>
      <p
        className={`text-2xl font-bold ${
          color ? colorClasses[color] : "text-[#EAF0FF]"
        }`}
      >
        {value.toLocaleString()}
      </p>
    </div>
  );
}
