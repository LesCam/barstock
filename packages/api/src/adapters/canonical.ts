/**
 * Canonical SalesLine shape used across all POS adapters.
 * Each adapter transforms its native format into this canonical structure.
 */
export interface CanonicalSalesLine {
  sourceSystem: string;
  sourceLocationId: string;
  businessDate: Date;
  soldAt: Date;
  receiptId: string;
  lineId: string;
  posItemId: string;
  posItemName: string;
  quantity: number;
  isVoided: boolean;
  isRefunded: boolean;
  sizeModifierId?: string;
  sizeModifierName?: string;
  unitSalePrice?: number;
  rawPayloadJson?: Record<string, unknown>;
}
