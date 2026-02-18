import { z } from "zod";

// ─── Categories ─────────────────────────────────────────────

export const guideCategoryCreateSchema = z.object({
  locationId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  sortOrder: z.number().int().min(0).default(0),
});

export const guideCategoryUpdateSchema = z.object({
  id: z.string().uuid(),
  locationId: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullish(),
  sortOrder: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

export const guideCategoryListSchema = z.object({
  locationId: z.string().uuid(),
  activeOnly: z.boolean().default(true),
});

// ─── Items ──────────────────────────────────────────────────

export const guideItemCreateSchema = z.object({
  locationId: z.string().uuid(),
  categoryId: z.string().uuid(),
  inventoryItemId: z.string().uuid(),
  description: z.string().max(1000).optional(),
  sortOrder: z.number().int().min(0).default(0),
});

export const guideItemUpdateSchema = z.object({
  id: z.string().uuid(),
  locationId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  description: z.string().max(1000).nullish(),
  sortOrder: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

export const guideItemListSchema = z.object({
  locationId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  activeOnly: z.boolean().default(true),
});

export const guideItemGetSchema = z.object({
  id: z.string().uuid(),
  locationId: z.string().uuid(),
});

export const guideItemUploadImageSchema = z.object({
  id: z.string().uuid(),
  locationId: z.string().uuid(),
  base64Data: z.string(),
  filename: z.string(),
});

export const guideItemRemoveImageSchema = z.object({
  id: z.string().uuid(),
  locationId: z.string().uuid(),
});

// ─── Types ──────────────────────────────────────────────────

export type GuideCategoryCreateInput = z.infer<typeof guideCategoryCreateSchema>;
export type GuideCategoryUpdateInput = z.infer<typeof guideCategoryUpdateSchema>;
export type GuideCategoryListInput = z.infer<typeof guideCategoryListSchema>;
export type GuideItemCreateInput = z.infer<typeof guideItemCreateSchema>;
export type GuideItemUpdateInput = z.infer<typeof guideItemUpdateSchema>;
export type GuideItemListInput = z.infer<typeof guideItemListSchema>;
export type GuideItemGetInput = z.infer<typeof guideItemGetSchema>;
