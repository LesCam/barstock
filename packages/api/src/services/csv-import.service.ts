/**
 * CSV Import Service
 *
 * Handles parsing CSV files into canonical SalesLines and bulk importing
 * them into the database with dedup via skipDuplicates.
 */

import Papa from "papaparse";
import type { SourceSystemT } from "@prisma/client";
import type { ExtendedPrismaClient } from "@barstock/database";
import type { CanonicalSalesLine } from "../adapters/canonical";
import {
  getCSVTemplate,
  buildColumnMap,
  buildCustomColumnMap,
  REQUIRED_CANONICAL_FIELDS,
} from "../adapters/csv-templates";
import { DepletionEngine, type DepletionStats } from "./depletion.service";

export interface ParseError {
  row: number;
  field?: string;
  message: string;
}

export interface ParseResult {
  rows: CanonicalSalesLine[];
  errors: ParseError[];
  headers: string[];
  totalRows: number;
}

export interface ImportResult {
  importId: string;
  rowCount: number;
  insertedCount: number;
  skippedCount: number;
  errorCount: number;
  businessDateMin: string | null;
  businessDateMax: string | null;
  depletionStats: DepletionStats | null;
  unmappedCount: number;
}

const BATCH_SIZE = 500;

export class CSVImportService {
  constructor(private prisma: ExtendedPrismaClient) {}

  /**
   * Parse a CSV string into canonical SalesLines.
   * @param businessDate — required for summary reports that don't include a date column
   */
  parseCSV(
    csvText: string,
    sourceSystem: string,
    sourceLocationId: string,
    locationId: string,
    templateId?: string,
    customMapping?: Record<string, string>,
    businessDate?: Date
  ): ParseResult {
    // Strip BOM if present
    const cleaned = csvText.replace(/^\uFEFF/, "");

    const parsed = Papa.parse<Record<string, string>>(cleaned, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });

    const headers = parsed.meta.fields ?? [];
    const errors: ParseError[] = [];

    const template = templateId ? getCSVTemplate(templateId) : undefined;

    // Build column map from template or custom mapping
    let columnMap: Record<
      string,
      { canonicalField: string; transform?: (v: string) => unknown }
    >;

    if (template) {
      columnMap = buildColumnMap(headers, template);
    } else if (customMapping) {
      columnMap = buildCustomColumnMap(customMapping);
    } else {
      return { rows: [], errors: [{ row: 0, message: "Either templateId or customMapping is required" }], headers, totalRows: 0 };
    }

    const isSummary = template?.isSummary ?? false;
    const autoGenFields = new Set(template?.autoGenerate ?? []);

    // Check required fields are mapped (skip auto-generated ones for summary reports)
    const mappedFields = new Set(Object.values(columnMap).map((m) => m.canonicalField));
    for (const req of REQUIRED_CANONICAL_FIELDS) {
      if (!mappedFields.has(req) && !autoGenFields.has(req)) {
        errors.push({ row: 0, field: req, message: `Required field "${req}" is not mapped to any CSV column` });
      }
    }

    // Summary reports require a businessDate parameter
    if (isSummary && autoGenFields.has("businessDate") && !businessDate) {
      errors.push({ row: 0, field: "businessDate", message: "Business date is required for summary reports" });
    }

    if (errors.length > 0) {
      return { rows: [], errors, headers, totalRows: parsed.data.length };
    }

    // Parse rows
    const rows: CanonicalSalesLine[] = [];
    let lineCounter = 0;
    const summaryDate = businessDate ?? new Date();

    for (let i = 0; i < parsed.data.length; i++) {
      const rawRow = parsed.data[i];
      const rowNum = i + 2; // 1-indexed + header row

      try {
        const mapped: Record<string, unknown> = {};
        for (const [csvHeader, mapping] of Object.entries(columnMap)) {
          const rawValue = rawRow[csvHeader] ?? "";
          mapped[mapping.canonicalField] = mapping.transform
            ? mapping.transform(rawValue)
            : rawValue;
        }

        // For summary reports: skip subtotal/category rows (empty item name)
        if (isSummary && template?.skipWhenEmpty) {
          const checkVal = mapped[template.skipWhenEmpty];
          if (!checkVal || String(checkVal).trim() === "") {
            continue; // skip category subtotal row
          }
        }

        lineCounter++;

        // Auto-generate fields for summary reports
        const posItemName = String(mapped.posItemName ?? "");
        if (autoGenFields.has("businessDate")) {
          mapped.businessDate = summaryDate;
        }
        if (autoGenFields.has("posItemId")) {
          mapped.posItemId = posItemName; // Use item name as ID
        }
        if (autoGenFields.has("receiptId")) {
          // Synthetic receipt: date-based so re-uploads dedup correctly
          const dateStr = summaryDate.toISOString().split("T")[0];
          mapped.receiptId = `summary-${dateStr}`;
        }
        if (autoGenFields.has("lineId")) {
          mapped.lineId = `${posItemName}-${lineCounter}`;
        }

        // Validate required fields have values
        const missingFields: string[] = [];
        for (const req of REQUIRED_CANONICAL_FIELDS) {
          const val = mapped[req];
          if (val === undefined || val === null || val === "") {
            missingFields.push(req);
          }
        }
        if (missingFields.length > 0) {
          errors.push({
            row: rowNum,
            message: `Missing required fields: ${missingFields.join(", ")}`,
          });
          continue;
        }

        // Validate businessDate is a valid date
        const rowDate = mapped.businessDate as Date;
        if (isNaN(rowDate.getTime())) {
          errors.push({ row: rowNum, field: "businessDate", message: "Invalid date" });
          continue;
        }

        const soldAt = (mapped.soldAt as Date) ?? rowDate;

        rows.push({
          sourceSystem,
          sourceLocationId,
          businessDate: rowDate,
          soldAt: isNaN(soldAt.getTime()) ? rowDate : soldAt,
          receiptId: String(mapped.receiptId),
          lineId: mapped.lineId ? String(mapped.lineId) : String(lineCounter),
          posItemId: String(mapped.posItemId),
          posItemName,
          quantity: Number(mapped.quantity) || 0,
          isVoided: Boolean(mapped.isVoided),
          isRefunded: Boolean(mapped.isRefunded),
          sizeModifierId: mapped.sizeModifierId
            ? String(mapped.sizeModifierId)
            : undefined,
          sizeModifierName: mapped.sizeModifierName
            ? String(mapped.sizeModifierName)
            : undefined,
          rawPayloadJson: rawRow,
        });
      } catch (err: any) {
        errors.push({ row: rowNum, message: err.message || "Parse error" });
      }
    }

    return { rows, errors, headers, totalRows: parsed.data.length };
  }

  /**
   * Bulk import parsed SalesLines into the database.
   * Uses createMany with skipDuplicates for idempotency.
   */
  async importSalesLines(
    locationId: string,
    sourceSystem: string,
    lines: CanonicalSalesLine[],
    fileName: string,
    runDepletion: boolean,
    uploadedBy: string,
    templateName?: string
  ): Promise<ImportResult> {
    let insertedCount = 0;

    // Insert in batches
    for (let i = 0; i < lines.length; i += BATCH_SIZE) {
      const batch = lines.slice(i, i + BATCH_SIZE);
      const result = await this.prisma.salesLine.createMany({
        data: batch.map((line) => ({
          sourceSystem: line.sourceSystem as SourceSystemT,
          sourceLocationId: line.sourceLocationId,
          locationId,
          businessDate: line.businessDate,
          soldAt: line.soldAt,
          receiptId: line.receiptId,
          lineId: line.lineId,
          posItemId: line.posItemId,
          posItemName: line.posItemName,
          quantity: line.quantity,
          isVoided: line.isVoided,
          isRefunded: line.isRefunded,
          sizeModifierId: line.sizeModifierId ?? null,
          sizeModifierName: line.sizeModifierName ?? null,
          rawPayloadJson: line.rawPayloadJson ?? undefined,
        })),
        skipDuplicates: true,
      });
      insertedCount += result.count;
    }

    const skippedCount = lines.length - insertedCount;

    // Compute date range
    const dates = lines
      .map((l) => l.businessDate.getTime())
      .filter((d) => !isNaN(d));
    const businessDateMin = dates.length > 0 ? new Date(Math.min(...dates)) : null;
    const businessDateMax = dates.length > 0 ? new Date(Math.max(...dates)) : null;

    // Run depletion if requested
    let depletionStats: DepletionStats | null = null;
    if (runDepletion && insertedCount > 0 && businessDateMin && businessDateMax) {
      const engine = new DepletionEngine(this.prisma);
      // Extend range by 1 day on each side to cover timezone edge cases
      const fromTs = new Date(businessDateMin);
      fromTs.setDate(fromTs.getDate() - 1);
      const toTs = new Date(businessDateMax);
      toTs.setDate(toTs.getDate() + 2);
      depletionStats = await engine.processSalesLines(locationId, fromTs, toTs);
    }

    // Create import record
    const csvImport = await this.prisma.cSVImport.create({
      data: {
        locationId,
        sourceSystem: sourceSystem as SourceSystemT,
        templateName,
        fileName,
        rowCount: lines.length,
        insertedCount,
        skippedCount,
        errorCount: 0,
        businessDateMin,
        businessDateMax,
        depletionStats: depletionStats ? (depletionStats as any) : undefined,
        uploadedBy,
      },
    });

    // Count unmapped items
    const unmappedCount = depletionStats?.unmapped ?? 0;

    return {
      importId: csvImport.id,
      rowCount: lines.length,
      insertedCount,
      skippedCount,
      errorCount: 0,
      businessDateMin: businessDateMin?.toISOString() ?? null,
      businessDateMax: businessDateMax?.toISOString() ?? null,
      depletionStats,
      unmappedCount,
    };
  }

  /**
   * List past CSV imports for a location.
   */
  async listImports(locationId: string, limit = 20) {
    return this.prisma.cSVImport.findMany({
      where: { locationId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        uploader: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }
}
