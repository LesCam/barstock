"use client";

import { useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";

// ─── Types ──────────────────────────────────────────────────

interface ParseError {
  row: number;
  field?: string;
  message: string;
}

interface ParsedRow {
  sourceSystem: string;
  sourceLocationId: string;
  businessDate: string;
  soldAt: string;
  receiptId: string;
  lineId: string;
  posItemId: string;
  posItemName: string;
  quantity: number;
  isVoided: boolean;
  isRefunded: boolean;
  sizeModifierId?: string;
  sizeModifierName?: string;
  rawPayloadJson?: Record<string, unknown>;
}

interface UploadResponse {
  headers: string[];
  totalRows: number;
  parsedCount: number;
  errorCount: number;
  errors: ParseError[];
  rows: ParsedRow[];
}

interface ImportResult {
  importId: string;
  rowCount: number;
  insertedCount: number;
  skippedCount: number;
  errorCount: number;
  businessDateMin: string | null;
  businessDateMax: string | null;
  depletionStats: {
    processed: number;
    created: number;
    unmapped: number;
    skipped: number;
  } | null;
  unmappedCount: number;
}

// ─── Constants ──────────────────────────────────────────────

const SOURCE_SYSTEMS = [
  { value: "toast", label: "Toast" },
  { value: "square", label: "Square" },
  { value: "lightspeed", label: "Lightspeed" },
  { value: "clover", label: "Clover" },
  { value: "other", label: "Other / Generic" },
];

const TEMPLATES: Record<
  string,
  { value: string; label: string; isSummary?: boolean }[]
> = {
  toast: [
    { value: "toast-sales-breakdown", label: "Sales Breakdown", isSummary: true },
    { value: "toast-item-selection-details", label: "Item Selection Details (SFTP)" },
    { value: "toast-sales-by-item", label: "Sales by Item (SFTP)" },
  ],
};

/** Templates that are summary reports (aggregated, no receipt/date in CSV) */
const SUMMARY_TEMPLATES = new Set(["toast-sales-breakdown"]);

const CANONICAL_FIELDS = [
  { field: "", label: "— Skip —" },
  { field: "businessDate", label: "Business Date", required: true },
  { field: "soldAt", label: "Sold At" },
  { field: "receiptId", label: "Receipt ID", required: true },
  { field: "lineId", label: "Line ID", required: true },
  { field: "posItemId", label: "POS Item ID", required: true },
  { field: "posItemName", label: "POS Item Name", required: true },
  { field: "quantity", label: "Quantity", required: true },
  { field: "isVoided", label: "Is Voided" },
  { field: "isRefunded", label: "Is Refunded" },
  { field: "sizeModifierId", label: "Size Modifier ID" },
  { field: "sizeModifierName", label: "Size Modifier Name" },
];

// ─── Component ──────────────────────────────────────────────

type WizardStep = 1 | 2 | 3 | 4;

export default function UploadCSVPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const locationId = user?.locationIds?.[0];

  // Step state
  const [step, setStep] = useState<WizardStep>(1);

  // Step 1 state
  const [sourceSystem, setSourceSystem] = useState("toast");
  const [templateId, setTemplateId] = useState("toast-sales-breakdown");
  const [useCustomMapping, setUseCustomMapping] = useState(false);
  const [businessDate, setBusinessDate] = useState(
    new Date().toISOString().split("T")[0] // default to today
  );
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2 state (custom mapping)
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [customMapping, setCustomMapping] = useState<Record<string, string>>({});
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [rawCsvText, setRawCsvText] = useState<string>("");

  // Step 3 state
  const [parsedData, setParsedData] = useState<UploadResponse | null>(null);
  const [runDepletion, setRunDepletion] = useState(true);
  const [importing, setImporting] = useState(false);

  // Step 4 state
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const importMutation = trpc.pos.importSalesLines.useMutation();

  // ─── Handlers ───────────────────────────────────────────

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.name.endsWith(".csv")) {
      setFile(droppedFile);
      setUploadError(null);
    } else {
      setUploadError("Please drop a .csv file");
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setUploadError(null);
    }
  };

  const handleSourceChange = (value: string) => {
    setSourceSystem(value);
    const templates = TEMPLATES[value];
    if (templates?.length) {
      setTemplateId(templates[0].value);
      setUseCustomMapping(false);
    } else {
      setTemplateId("");
      setUseCustomMapping(true);
    }
  };

  const handleUpload = async () => {
    if (!file || !locationId) return;
    setUploading(true);
    setUploadError(null);

    try {
      if (useCustomMapping && !templateId) {
        // For custom mapping, read the file and show column mapping UI
        const text = await file.text();
        setRawCsvText(text);
        const lines = text.replace(/^\uFEFF/, "").split("\n");
        const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
        setCsvHeaders(headers);

        // Parse first 3 data rows for preview
        const preview: Record<string, string>[] = [];
        for (let i = 1; i <= Math.min(3, lines.length - 1); i++) {
          if (!lines[i]?.trim()) continue;
          const vals = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
          const row: Record<string, string> = {};
          headers.forEach((h, idx) => (row[h] = vals[idx] || ""));
          preview.push(row);
        }
        setPreviewRows(preview);
        setStep(2);
      } else {
        // Known template — upload directly for parsing
        const formData = new FormData();
        formData.append("file", file);
        formData.append("sourceSystem", sourceSystem);
        formData.append("locationId", locationId);
        if (templateId) formData.append("templateId", templateId);
        if (SUMMARY_TEMPLATES.has(templateId)) {
          formData.append("businessDate", businessDate);
        }

        const res = await fetch("/api/pos/upload-csv", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Upload failed");
        }

        const data: UploadResponse = await res.json();
        setParsedData(data);
        setStep(3);
      }
    } catch (err: any) {
      setUploadError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleCustomMappingSubmit = async () => {
    if (!file || !locationId) return;

    // Validate required fields are mapped
    const mappedFields = new Set(Object.values(customMapping));
    const missing = CANONICAL_FIELDS.filter(
      (f) => (f as any).required && f.field && !mappedFields.has(f.field)
    );
    if (missing.length > 0) {
      setUploadError(
        `Required fields not mapped: ${missing.map((f) => f.label).join(", ")}`
      );
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sourceSystem", sourceSystem);
      formData.append("locationId", locationId);
      formData.append(
        "customMapping",
        JSON.stringify(customMapping)
      );

      const res = await fetch("/api/pos/upload-csv", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Parse failed");
      }

      const data: UploadResponse = await res.json();
      setParsedData(data);
      setStep(3);
    } catch (err: any) {
      setUploadError(err.message || "Parse failed");
    } finally {
      setUploading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!parsedData || !locationId) return;
    setImporting(true);

    try {
      const result = await importMutation.mutateAsync({
        locationId,
        sourceSystem,
        fileName: file?.name || "upload.csv",
        templateName: templateId || "custom",
        runDepletion,
        lines: parsedData.rows.map((r) => ({
          ...r,
          businessDate: new Date(r.businessDate),
          soldAt: new Date(r.soldAt),
        })),
      });
      setImportResult(result);
      setStep(4);
    } catch (err: any) {
      setUploadError(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setFile(null);
    setParsedData(null);
    setImportResult(null);
    setUploadError(null);
    setCsvHeaders([]);
    setCustomMapping({});
    setPreviewRows([]);
    setRawCsvText("");
    setBusinessDate(new Date().toISOString().split("T")[0]);
  };

  // ─── Step Indicator ───────────────────────────────────────

  const steps = [
    { num: 1, label: "Upload" },
    { num: 2, label: "Map Columns" },
    { num: 3, label: "Preview" },
    { num: 4, label: "Results" },
  ];

  // ─── Render ─────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#EAF0FF]">Upload Sales CSV</h1>
        <Link
          href="/pos"
          className="text-sm text-[#EAF0FF]/60 hover:text-[#EAF0FF]"
        >
          Back to POS
        </Link>
      </div>

      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-2">
        {steps.map((s, i) => {
          const isActive = s.num === step;
          const isDone = s.num < step;
          // Skip step 2 indicator when not using custom mapping
          if (s.num === 2 && !useCustomMapping && step !== 2) return null;
          return (
            <div key={s.num} className="flex items-center gap-2">
              {i > 0 && (
                <div
                  className={`h-px w-8 ${isDone ? "bg-green-500" : "bg-white/10"}`}
                />
              )}
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                  isActive
                    ? "bg-[#E9B44C] text-[#0B1623]"
                    : isDone
                      ? "bg-green-500/20 text-green-400"
                      : "bg-white/10 text-[#EAF0FF]/40"
                }`}
              >
                {isDone ? "\u2713" : s.num}
              </div>
              <span
                className={`text-sm ${isActive ? "text-[#EAF0FF]" : "text-[#EAF0FF]/40"}`}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      {uploadError && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {uploadError}
        </div>
      )}

      {/* ─── Step 1: Source & Upload ────────────────────────── */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">
                POS System
              </label>
              <select
                value={sourceSystem}
                onChange={(e) => handleSourceChange(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#16283F] px-3 py-2 text-sm text-[#EAF0FF]"
              >
                {SOURCE_SYSTEMS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">
                Template
              </label>
              {TEMPLATES[sourceSystem]?.length ? (
                <select
                  value={templateId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTemplateId(val);
                    setUseCustomMapping(val === "custom");
                  }}
                  className="w-full rounded-md border border-white/10 bg-[#16283F] px-3 py-2 text-sm text-[#EAF0FF]"
                >
                  {TEMPLATES[sourceSystem].map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                  <option value="custom">Custom Column Mapping</option>
                </select>
              ) : (
                <div className="rounded-md border border-white/10 bg-[#16283F] px-3 py-2 text-sm text-[#EAF0FF]/60">
                  Custom column mapping (no templates for {sourceSystem})
                </div>
              )}
            </div>
          </div>

          {/* Business date picker for summary reports */}
          {SUMMARY_TEMPLATES.has(templateId) && (
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">
                Business Date
              </label>
              <input
                type="date"
                value={businessDate}
                onChange={(e) => setBusinessDate(e.target.value)}
                className="w-full max-w-xs rounded-md border border-white/10 bg-[#16283F] px-3 py-2 text-sm text-[#EAF0FF]"
              />
              <p className="mt-1 text-xs text-[#EAF0FF]/40">
                The date this sales data is for (summary reports don't include dates)
              </p>
            </div>
          )}

          {/* Drag & Drop zone */}
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
                <p className="text-lg font-medium text-green-400">{file.name}</p>
                <p className="mt-1 text-sm text-[#EAF0FF]/60">
                  {(file.size / 1024).toFixed(1)} KB — Click or drop to replace
                </p>
              </div>
            ) : (
              <div>
                <p className="text-lg text-[#EAF0FF]/60">
                  Drop a CSV file here or click to browse
                </p>
                <p className="mt-1 text-sm text-[#EAF0FF]/40">
                  Max 5MB. Must be a .csv file.
                </p>
              </div>
            )}
          </div>

          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="rounded-md bg-[#E9B44C] px-6 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#E9B44C]/90 disabled:opacity-50"
          >
            {uploading ? "Processing..." : "Upload & Preview"}
          </button>
        </div>
      )}

      {/* ─── Step 2: Custom Column Mapping ──────────────────── */}
      {step === 2 && (
        <div className="space-y-6">
          <p className="text-sm text-[#EAF0FF]/60">
            Map each CSV column to its corresponding field. Required fields are
            marked with *.
          </p>

          {/* Preview table */}
          {previewRows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0B1623] text-[#EAF0FF]/60">
                  <tr>
                    {csvHeaders.map((h) => (
                      <th key={h} className="px-3 py-2 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} className="border-t border-white/5">
                      {csvHeaders.map((h) => (
                        <td
                          key={h}
                          className="max-w-[200px] truncate px-3 py-2 text-[#EAF0FF]/80"
                        >
                          {row[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Mapping dropdowns */}
          <div className="grid gap-3 sm:grid-cols-2">
            {csvHeaders.map((header) => (
              <div
                key={header}
                className="flex items-center gap-3 rounded-md border border-white/10 bg-[#16283F] px-3 py-2"
              >
                <span className="min-w-[120px] truncate text-sm font-mono text-[#EAF0FF]/80">
                  {header}
                </span>
                <span className="text-[#EAF0FF]/30">\u2192</span>
                <select
                  value={customMapping[header] || ""}
                  onChange={(e) =>
                    setCustomMapping((prev) => ({
                      ...prev,
                      [header]: e.target.value,
                    }))
                  }
                  className="flex-1 rounded border border-white/10 bg-[#0B1623] px-2 py-1 text-sm text-[#EAF0FF]"
                >
                  {CANONICAL_FIELDS.map((f) => (
                    <option key={f.field} value={f.field}>
                      {f.label}
                      {(f as any).required ? " *" : ""}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="rounded-md border border-white/10 px-4 py-2 text-sm text-[#EAF0FF]/60 hover:bg-[#16283F]"
            >
              Back
            </button>
            <button
              onClick={handleCustomMappingSubmit}
              disabled={uploading}
              className="rounded-md bg-[#E9B44C] px-6 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#E9B44C]/90 disabled:opacity-50"
            >
              {uploading ? "Parsing..." : "Parse & Preview"}
            </button>
          </div>
        </div>
      )}

      {/* ─── Step 3: Preview & Confirm ──────────────────────── */}
      {step === 3 && parsedData && (
        <div className="space-y-6">
          {/* Summary stats */}
          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard label="Total Rows" value={parsedData.totalRows} />
            <StatCard
              label="Parsed OK"
              value={parsedData.parsedCount}
              color="green"
            />
            <StatCard
              label="Errors"
              value={parsedData.errorCount}
              color={parsedData.errorCount > 0 ? "red" : undefined}
            />
            <StatCard
              label="Unique POS Items"
              value={
                new Set(parsedData.rows.map((r) => r.posItemId)).size
              }
            />
          </div>

          {/* Date range */}
          {parsedData.rows.length > 0 && (
            <p className="text-sm text-[#EAF0FF]/60">
              Date range:{" "}
              <span className="text-[#EAF0FF]">
                {new Date(
                  Math.min(
                    ...parsedData.rows.map((r) =>
                      new Date(r.businessDate).getTime()
                    )
                  )
                ).toLocaleDateString()}{" "}
                —{" "}
                {new Date(
                  Math.max(
                    ...parsedData.rows.map((r) =>
                      new Date(r.businessDate).getTime()
                    )
                  )
                ).toLocaleDateString()}
              </span>
            </p>
          )}

          {/* Errors list */}
          {parsedData.errors.length > 0 && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
              <h3 className="mb-2 text-sm font-medium text-red-400">
                Parse Errors ({parsedData.errorCount})
              </h3>
              <div className="max-h-40 space-y-1 overflow-y-auto text-xs text-red-300/80">
                {parsedData.errors.map((e, i) => (
                  <p key={i}>
                    Row {e.row}: {e.message}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Preview table */}
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0B1623] text-[#EAF0FF]/60">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Receipt</th>
                  <th className="px-3 py-2">POS Item</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2">Voided</th>
                </tr>
              </thead>
              <tbody>
                {parsedData.rows.slice(0, 100).map((row, i) => (
                  <tr key={i} className="border-t border-white/5">
                    <td className="px-3 py-2 text-[#EAF0FF]/40">{i + 1}</td>
                    <td className="px-3 py-2 text-[#EAF0FF]/80">
                      {new Date(row.businessDate).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 font-mono text-[#EAF0FF]/60">
                      {row.receiptId}
                    </td>
                    <td className="px-3 py-2 font-mono text-[#EAF0FF]/60">
                      {row.posItemId}
                    </td>
                    <td className="px-3 py-2 text-[#EAF0FF]">
                      {row.posItemName}
                    </td>
                    <td className="px-3 py-2">{row.quantity}</td>
                    <td className="px-3 py-2">
                      {row.isVoided && (
                        <span className="text-red-400">Yes</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsedData.rows.length > 100 && (
              <p className="border-t border-white/5 px-3 py-2 text-xs text-[#EAF0FF]/40">
                Showing 100 of {parsedData.rows.length} rows
              </p>
            )}
          </div>

          {/* Depletion toggle */}
          <label className="flex items-center gap-3 text-sm text-[#EAF0FF]/80">
            <input
              type="checkbox"
              checked={runDepletion}
              onChange={(e) => setRunDepletion(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-[#16283F]"
            />
            Run depletion after import (creates consumption events for mapped items)
          </label>

          <div className="flex gap-3">
            <button
              onClick={() => setStep(useCustomMapping ? 2 : 1)}
              className="rounded-md border border-white/10 px-4 py-2 text-sm text-[#EAF0FF]/60 hover:bg-[#16283F]"
            >
              Back
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={importing || parsedData.parsedCount === 0}
              className="rounded-md bg-[#E9B44C] px-6 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#E9B44C]/90 disabled:opacity-50"
            >
              {importing
                ? "Importing..."
                : `Confirm Import (${parsedData.parsedCount} rows)`}
            </button>
          </div>
        </div>
      )}

      {/* ─── Step 4: Results ────────────────────────────────── */}
      {step === 4 && importResult && (
        <div className="space-y-6">
          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-6">
            <h2 className="mb-4 text-lg font-semibold text-green-400">
              Import Complete
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                label="Inserted"
                value={importResult.insertedCount}
                color="green"
              />
              <StatCard
                label="Skipped (Duplicates)"
                value={importResult.skippedCount}
                color={importResult.skippedCount > 0 ? "yellow" : undefined}
              />
              <StatCard
                label="Errors"
                value={importResult.errorCount}
                color={importResult.errorCount > 0 ? "red" : undefined}
              />
            </div>
          </div>

          {importResult.depletionStats && (
            <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
              <h3 className="mb-3 text-sm font-medium text-[#EAF0FF]/80">
                Depletion Results
              </h3>
              <div className="grid gap-3 sm:grid-cols-4">
                <StatCard
                  label="Processed"
                  value={importResult.depletionStats.processed}
                  small
                />
                <StatCard
                  label="Events Created"
                  value={importResult.depletionStats.created}
                  color="green"
                  small
                />
                <StatCard
                  label="Unmapped"
                  value={importResult.depletionStats.unmapped}
                  color={
                    importResult.depletionStats.unmapped > 0
                      ? "yellow"
                      : undefined
                  }
                  small
                />
                <StatCard
                  label="Already Depleted"
                  value={importResult.depletionStats.skipped}
                  small
                />
              </div>
            </div>
          )}

          {importResult.businessDateMin && (
            <p className="text-sm text-[#EAF0FF]/60">
              Date range:{" "}
              {new Date(importResult.businessDateMin).toLocaleDateString()} —{" "}
              {new Date(importResult.businessDateMax!).toLocaleDateString()}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            {importResult.unmappedCount > 0 && (
              <Link
                href="/pos/unmapped"
                className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
              >
                Map {importResult.unmappedCount} Unmapped Items
              </Link>
            )}
            <button
              onClick={handleReset}
              className="rounded-md border border-white/10 px-4 py-2 text-sm text-[#EAF0FF]/60 hover:bg-[#16283F]"
            >
              Upload Another
            </button>
            <Link
              href="/pos"
              className="rounded-md border border-white/10 px-4 py-2 text-sm text-[#EAF0FF]/60 hover:bg-[#16283F]"
            >
              Back to POS
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
  small,
}: {
  label: string;
  value: number;
  color?: "green" | "red" | "yellow";
  small?: boolean;
}) {
  const colorClasses = {
    green: "text-green-400",
    red: "text-red-400",
    yellow: "text-yellow-400",
  };

  return (
    <div
      className={`rounded-lg border border-white/10 bg-[#16283F] ${small ? "p-2" : "p-4"}`}
    >
      <p
        className={`${small ? "text-xs" : "text-sm"} text-[#EAF0FF]/60`}
      >
        {label}
      </p>
      <p
        className={`${small ? "text-lg" : "text-2xl"} font-bold ${
          color ? colorClasses[color] : "text-[#EAF0FF]"
        }`}
      >
        {value.toLocaleString()}
      </p>
    </div>
  );
}
