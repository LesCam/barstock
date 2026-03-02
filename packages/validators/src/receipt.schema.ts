import { z } from "zod";

export const receiptCaptureSchema = z.object({
  locationId: z.string().uuid(),
  base64Data: z.string().optional(),
  images: z.array(z.object({
    base64Data: z.string(),
    filename: z.string(),
  })).optional(),
  filename: z.string().optional(),
});

export const receiptConfirmLineSchema = z.object({
  receiptLineId: z.string().uuid(),
  inventoryItemId: z.string().uuid().nullable(),
  quantity: z.number().positive(),
  unitPrice: z.number().nullable().optional(),
  skipped: z.boolean().default(false),
  matchSource: z.string().nullable().optional(),
});

export const receiptConfirmSchema = z.object({
  receiptCaptureId: z.string().uuid(),
  vendorId: z.string().uuid().nullable().optional(),
  invoiceDate: z.string().nullable().optional(),
  invoiceNumber: z.string().nullable().optional(),
  lines: z.array(receiptConfirmLineSchema),
});

export const receiptListSchema = z.object({
  locationId: z.string().uuid(),
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const receiptGetByIdSchema = z.object({
  id: z.string().uuid(),
});

export const receiptListSkippedSchema = z.object({
  locationId: z.string().uuid(),
});

export const createFromSkippedSchema = z.object({
  receiptLineId: z.string().uuid(),
  categoryId: z.string().uuid(),
  locationId: z.string().uuid(),
  name: z.string().min(1).optional(),
});

export const requestItemCreationSchema = z.object({
  receiptLineId: z.string().uuid(),
});

export type ReceiptCaptureInput = z.infer<typeof receiptCaptureSchema>;
export type ReceiptConfirmLineInput = z.infer<typeof receiptConfirmLineSchema>;
export type ReceiptConfirmInput = z.infer<typeof receiptConfirmSchema>;
export type ReceiptListInput = z.infer<typeof receiptListSchema>;
export type ReceiptGetByIdInput = z.infer<typeof receiptGetByIdSchema>;
export type CreateFromSkippedInput = z.infer<typeof createFromSkippedSchema>;
export type RequestItemCreationInput = z.infer<typeof requestItemCreationSchema>;
export type ReceiptListSkippedInput = z.infer<typeof receiptListSkippedSchema>;

export const receiptSearchSchema = z.object({
  locationId: z.string().uuid(),
  vendorId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  status: z.enum(["pending", "extracted", "confirmed", "processed", "failed"]).optional(),
  search: z.string().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
export type ReceiptSearchInput = z.infer<typeof receiptSearchSchema>;
