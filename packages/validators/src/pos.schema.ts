import { z } from "zod";
import { SourceSystem, MappingMode } from "@barstock/types";

export const posConnectionCreateSchema = z.object({
  locationId: z.string().uuid(),
  sourceSystem: z.nativeEnum(SourceSystem),
  method: z.enum(["api", "sftp_export", "webhook", "manual_upload"]),
  status: z.string().default("active"),
});

export const posConnectionUpdateSchema = z.object({
  status: z.string().optional(),
  lastError: z.string().nullable().optional(),
});

export const salesLineCreateSchema = z.object({
  locationId: z.string().uuid(),
  sourceSystem: z.nativeEnum(SourceSystem),
  sourceLocationId: z.string().min(1),
  businessDate: z.coerce.date(),
  soldAt: z.coerce.date(),
  receiptId: z.string().min(1),
  lineId: z.string().min(1),
  posItemId: z.string().min(1),
  posItemName: z.string().min(1),
  quantity: z.number().min(0),
  isVoided: z.boolean().default(false),
  isRefunded: z.boolean().default(false),
  sizeModifierId: z.string().optional(),
  sizeModifierName: z.string().optional(),
  rawPayloadJson: z.record(z.unknown()).optional(),
});

export const posMappingCreateSchema = z.object({
  locationId: z.string().uuid(),
  sourceSystem: z.nativeEnum(SourceSystem),
  posItemId: z.string().min(1),
  inventoryItemId: z.string().uuid().optional(),
  mode: z.nativeEnum(MappingMode),
  pourProfileId: z.string().uuid().optional(),
  tapLineId: z.string().uuid().optional(),
  recipeId: z.string().uuid().optional(),
  effectiveFromTs: z.coerce.date(),
  effectiveToTs: z.coerce.date().optional(),
});

export const posMappingUpdateSchema = z.object({
  active: z.boolean().optional(),
  effectiveToTs: z.coerce.date().optional(),
});

export const importRequestSchema = z.object({
  locationId: z.string().uuid(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
});

export const depletionRequestSchema = z.object({
  locationId: z.string().uuid(),
  fromTs: z.coerce.date(),
  toTs: z.coerce.date(),
});

// ─── CSV Import Schemas ─────────────────────────────────────

export const csvSalesLineSchema = z.object({
  sourceSystem: z.string().min(1),
  sourceLocationId: z.string().min(1),
  businessDate: z.coerce.date(),
  soldAt: z.coerce.date(),
  receiptId: z.string().min(1),
  lineId: z.string().min(1),
  posItemId: z.string().min(1),
  posItemName: z.string().min(1),
  quantity: z.number(),
  isVoided: z.boolean().default(false),
  isRefunded: z.boolean().default(false),
  sizeModifierId: z.string().optional(),
  sizeModifierName: z.string().optional(),
  rawPayloadJson: z.record(z.unknown()).optional(),
});

export const csvImportSchema = z.object({
  locationId: z.string().uuid(),
  sourceSystem: z.string().min(1),
  fileName: z.string().min(1),
  templateName: z.string().optional(),
  runDepletion: z.boolean().default(true),
  lines: z.array(csvSalesLineSchema).min(1).max(50000),
});

export const csvImportHistorySchema = z.object({
  locationId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).default(20),
});

export type POSConnectionCreateInput = z.infer<
  typeof posConnectionCreateSchema
>;
export type POSConnectionUpdateInput = z.infer<
  typeof posConnectionUpdateSchema
>;
export type SalesLineCreateInput = z.infer<typeof salesLineCreateSchema>;
export type POSMappingCreateInput = z.infer<typeof posMappingCreateSchema>;
export type POSMappingUpdateInput = z.infer<typeof posMappingUpdateSchema>;
export type ImportRequestInput = z.infer<typeof importRequestSchema>;
export type DepletionRequestInput = z.infer<typeof depletionRequestSchema>;
export type CSVSalesLineInput = z.infer<typeof csvSalesLineSchema>;
export type CSVImportInput = z.infer<typeof csvImportSchema>;
export type CSVImportHistoryInput = z.infer<typeof csvImportHistorySchema>;
