import { z } from "zod";

export const parUomSchema = z.enum(["unit", "package"]);

export const parLevelCreateSchema = z.object({
  locationId: z.string().uuid(),
  inventoryItemId: z.string().uuid(),
  vendorId: z.string().uuid(),
  parLevel: z.number().min(0),
  minLevel: z.number().min(0),
  reorderQty: z.number().min(0).nullish(),
  parUom: parUomSchema.default("unit"),
  leadTimeDays: z.number().int().min(0).default(1),
  safetyStockDays: z.number().int().min(0).default(0),
});

export const parLevelUpdateSchema = z.object({
  parLevel: z.number().min(0).optional(),
  minLevel: z.number().min(0).optional(),
  reorderQty: z.number().min(0).nullish(),
  parUom: parUomSchema.optional(),
  leadTimeDays: z.number().int().min(0).optional(),
  safetyStockDays: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

export const parLevelBulkUpsertSchema = z.object({
  locationId: z.string().uuid(),
  items: z.array(
    z.object({
      inventoryItemId: z.string().uuid(),
      vendorId: z.string().uuid(),
      parLevel: z.number().min(0),
      minLevel: z.number().min(0),
      reorderQty: z.number().min(0).nullish(),
      parUom: parUomSchema.default("unit"),
      leadTimeDays: z.number().int().min(0).default(1),
      safetyStockDays: z.number().int().min(0).default(0),
    })
  ),
});

export const parLevelListSchema = z.object({
  locationId: z.string().uuid(),
  vendorId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  belowParOnly: z.boolean().optional(),
});

export const parLevelSuggestionsSchema = z.object({
  locationId: z.string().uuid(),
  vendorId: z.string().uuid().optional(),
});

export const parLevelSuggestSchema = z.object({
  locationId: z.string().uuid(),
  leadTimeDays: z.number().min(0).default(2),
  safetyStockDays: z.number().min(0).default(1),
  bufferDays: z.number().min(0).default(3),
});

export type ParLevelCreateInput = z.infer<typeof parLevelCreateSchema>;
export type ParLevelUpdateInput = z.infer<typeof parLevelUpdateSchema>;
export type ParLevelBulkUpsertInput = z.infer<typeof parLevelBulkUpsertSchema>;
export type ParLevelListInput = z.infer<typeof parLevelListSchema>;
export type ParLevelSuggestionsInput = z.infer<typeof parLevelSuggestionsSchema>;
export type ParLevelSuggestInput = z.infer<typeof parLevelSuggestSchema>;
