/**
 * CSV Import Templates
 *
 * Hardcoded templates defining column header → canonical field mappings
 * for known POS CSV export formats.
 */

export interface CSVColumnMapping {
  /** CSV column header (case-insensitive match) */
  csvHeaders: string[];
  /** Canonical SalesLine field name */
  canonicalField: string;
  /** Transform function to apply to the raw string value */
  transform?: (value: string) => unknown;
}

export interface CSVTemplate {
  id: string;
  name: string;
  sourceSystem: string;
  description: string;
  columnMappings: CSVColumnMapping[];
  /** If true, this is a summary report — rows are aggregated totals, not individual transactions */
  isSummary?: boolean;
  /** Column that identifies subtotal/header rows to skip (when value is empty) */
  skipWhenEmpty?: string;
  /** Fields auto-generated for summary reports (not expected in CSV) */
  autoGenerate?: string[];
}

const parseDate = (v: string): Date => new Date(v);
const parseNumber = (v: string): number => parseFloat(v) || 0;
const parseBool = (v: string): boolean =>
  v.toLowerCase() === "true" || v === "1" || v.toLowerCase() === "yes";

export const CSV_TEMPLATES: CSVTemplate[] = [
  {
    id: "toast-sales-by-item",
    name: "Toast — Sales by Item",
    sourceSystem: "toast",
    description:
      "Toast POS 'Sales by Item' CSV export. Download from Toast Web → Reports → Sales → Sales by Item.",
    columnMappings: [
      {
        csvHeaders: ["Business Date", "business_date", "businessDate"],
        canonicalField: "businessDate",
        transform: parseDate,
      },
      {
        csvHeaders: ["Date", "Sold At", "sold_at", "soldAt"],
        canonicalField: "soldAt",
        transform: parseDate,
      },
      {
        csvHeaders: ["Receipt #", "Receipt", "receipt_id", "receiptId", "Check #"],
        canonicalField: "receiptId",
      },
      {
        csvHeaders: ["Line #", "Line", "line_id", "lineId"],
        canonicalField: "lineId",
      },
      {
        csvHeaders: [
          "Menu Item ID",
          "Item ID",
          "pos_item_id",
          "posItemId",
          "GUID",
        ],
        canonicalField: "posItemId",
      },
      {
        csvHeaders: [
          "Menu Item",
          "Item Name",
          "Item",
          "pos_item_name",
          "posItemName",
        ],
        canonicalField: "posItemName",
      },
      {
        csvHeaders: ["Qty", "Quantity", "quantity"],
        canonicalField: "quantity",
        transform: parseNumber,
      },
      {
        csvHeaders: ["Voided", "Void", "is_voided", "isVoided"],
        canonicalField: "isVoided",
        transform: parseBool,
      },
      {
        csvHeaders: ["Size", "Size Modifier", "size_modifier_id", "sizeModifierId"],
        canonicalField: "sizeModifierId",
      },
    ],
  },
  {
    id: "toast-item-selection-details",
    name: "Toast — Item Selection Details",
    sourceSystem: "toast",
    description:
      "Toast nightly SFTP export 'ItemSelectionDetails.csv'. Per-transaction item rows with timestamps. Available via automated data export.",
    columnMappings: [
      {
        csvHeaders: ["Order Date", "Sent Date"],
        canonicalField: "businessDate",
        transform: parseDate,
      },
      {
        csvHeaders: ["Order Date", "Sent Date"],
        canonicalField: "soldAt",
        transform: parseDate,
      },
      {
        csvHeaders: ["Order Id", "Order #"],
        canonicalField: "receiptId",
      },
      {
        csvHeaders: ["Item Id", "Master Id"],
        canonicalField: "posItemId",
      },
      {
        csvHeaders: ["Menu Item", "Item"],
        canonicalField: "posItemName",
      },
      {
        csvHeaders: ["Qty", "Quantity"],
        canonicalField: "quantity",
        transform: parseNumber,
      },
      {
        csvHeaders: ["Voided"],
        canonicalField: "isVoided",
        transform: parseBool,
      },
      {
        csvHeaders: ["Check Id"],
        canonicalField: "lineId",
      },
    ],
  },
  {
    id: "toast-sales-breakdown",
    name: "Toast — Sales Breakdown",
    sourceSystem: "toast",
    description:
      "Toast POS 'Sales Breakdown' / 'Order Details' export. Aggregated totals per menu item. Requires a business date to be provided.",
    isSummary: true,
    skipWhenEmpty: "posItemName",
    autoGenerate: ["businessDate", "receiptId", "lineId", "posItemId"],
    columnMappings: [
      {
        csvHeaders: ["Sales Category", "Menu Group", "Category"],
        canonicalField: "salesCategory",
      },
      {
        csvHeaders: ["Item Name", "Menu Item", "Item"],
        canonicalField: "posItemName",
      },
      {
        csvHeaders: ["Item Qty", "Qty", "Quantity"],
        canonicalField: "quantity",
        transform: parseNumber,
      },
      {
        csvHeaders: ["Net Sales", "Net Amount"],
        canonicalField: "netSales",
      },
      {
        csvHeaders: ["Gross Sales", "Gross Amount"],
        canonicalField: "grossSales",
      },
    ],
  },
];

/**
 * Find a template by ID
 */
export function getCSVTemplate(templateId: string): CSVTemplate | undefined {
  return CSV_TEMPLATES.find((t) => t.id === templateId);
}

/**
 * Given CSV headers and a template, build a header→canonical field map.
 * Returns null for headers that don't match any mapping.
 */
export function buildColumnMap(
  csvHeaders: string[],
  template: CSVTemplate
): Record<string, { canonicalField: string; transform?: (v: string) => unknown }> {
  const map: Record<
    string,
    { canonicalField: string; transform?: (v: string) => unknown }
  > = {};

  for (const csvHeader of csvHeaders) {
    const normalised = csvHeader.trim().toLowerCase();
    for (const mapping of template.columnMappings) {
      if (mapping.csvHeaders.some((h) => h.toLowerCase() === normalised)) {
        map[csvHeader] = {
          canonicalField: mapping.canonicalField,
          transform: mapping.transform,
        };
        break;
      }
    }
  }

  return map;
}

/**
 * Build a column map from a user-supplied custom mapping.
 * customMapping: { csvHeader: canonicalField }
 */
export function buildCustomColumnMap(
  customMapping: Record<string, string>
): Record<string, { canonicalField: string; transform?: (v: string) => unknown }> {
  const TRANSFORMS: Record<string, (v: string) => unknown> = {
    businessDate: parseDate,
    soldAt: parseDate,
    quantity: parseNumber,
    isVoided: parseBool,
    isRefunded: parseBool,
  };

  const map: Record<
    string,
    { canonicalField: string; transform?: (v: string) => unknown }
  > = {};

  for (const [csvHeader, canonicalField] of Object.entries(customMapping)) {
    map[csvHeader] = {
      canonicalField,
      transform: TRANSFORMS[canonicalField],
    };
  }

  return map;
}

/** Canonical fields that are required for a valid SalesLine */
export const REQUIRED_CANONICAL_FIELDS = [
  "businessDate",
  "receiptId",
  "lineId",
  "posItemId",
  "posItemName",
  "quantity",
];

/** All mappable canonical fields */
export const ALL_CANONICAL_FIELDS = [
  { field: "businessDate", label: "Business Date", required: true },
  { field: "soldAt", label: "Sold At", required: false },
  { field: "receiptId", label: "Receipt ID", required: true },
  { field: "lineId", label: "Line ID", required: true },
  { field: "posItemId", label: "POS Item ID", required: true },
  { field: "posItemName", label: "POS Item Name", required: true },
  { field: "quantity", label: "Quantity", required: true },
  { field: "isVoided", label: "Is Voided", required: false },
  { field: "isRefunded", label: "Is Refunded", required: false },
  { field: "sizeModifierId", label: "Size Modifier ID", required: false },
  { field: "sizeModifierName", label: "Size Modifier Name", required: false },
];
