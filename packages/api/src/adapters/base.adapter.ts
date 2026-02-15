import type { CanonicalSalesLine } from "./canonical";

/**
 * Base POS adapter interface.
 * All POS integrations (Toast, Square, etc.) implement this contract.
 */
export interface POSAdapter {
  readonly sourceSystem: string;

  /** Fetch sales lines for a date range and transform to canonical format */
  fetchSalesLines(
    sourceLocationId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<CanonicalSalesLine[]>;

  /** Test connectivity / credentials */
  testConnection(): Promise<{ ok: boolean; error?: string }>;
}
