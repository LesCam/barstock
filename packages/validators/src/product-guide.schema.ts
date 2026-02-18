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
  prices: z.array(z.object({
    label: z.string().min(1).max(50),
    price: z.number().min(0),
  })).optional(),
  abv: z.number().min(0).max(100).optional(),
  producer: z.string().max(200).optional(),
  region: z.string().max(200).optional(),
  vintage: z.number().int().min(1900).max(2100).optional(),
  varietal: z.string().max(200).optional(),
});

export const guideItemUpdateSchema = z.object({
  id: z.string().uuid(),
  locationId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  description: z.string().max(1000).nullish(),
  sortOrder: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
  prices: z.array(z.object({
    label: z.string().min(1).max(50),
    price: z.number().min(0),
  })).nullish(),
  abv: z.number().min(0).max(100).nullish(),
  producer: z.string().max(200).nullish(),
  region: z.string().max(200).nullish(),
  vintage: z.number().int().min(1900).max(2100).nullish(),
  varietal: z.string().max(200).nullish(),
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

export const guideItemDeleteSchema = z.object({
  id: z.string().uuid(),
  locationId: z.string().uuid(),
});

// ─── Reorder / Delete Category / Bulk Import ────────────────

export const guideCategoryReorderSchema = z.object({
  locationId: z.string().uuid(),
  items: z.array(z.object({ id: z.string().uuid(), sortOrder: z.number().int().min(0) })),
});

export const guideItemReorderSchema = z.object({
  locationId: z.string().uuid(),
  items: z.array(z.object({ id: z.string().uuid(), sortOrder: z.number().int().min(0) })),
});

export const guideCategoryDeleteSchema = z.object({
  id: z.string().uuid(),
  locationId: z.string().uuid(),
});

export const guideItemBulkCreateSchema = z.object({
  locationId: z.string().uuid(),
  categoryId: z.string().uuid(),
  inventoryItemIds: z.array(z.string().uuid()).min(1),
});

// ─── Types ──────────────────────────────────────────────────

export type GuideCategoryCreateInput = z.infer<typeof guideCategoryCreateSchema>;
export type GuideCategoryUpdateInput = z.infer<typeof guideCategoryUpdateSchema>;
export type GuideCategoryListInput = z.infer<typeof guideCategoryListSchema>;
export type GuideCategoryReorderInput = z.infer<typeof guideCategoryReorderSchema>;
export type GuideCategoryDeleteInput = z.infer<typeof guideCategoryDeleteSchema>;
export type GuideItemCreateInput = z.infer<typeof guideItemCreateSchema>;
export type GuideItemUpdateInput = z.infer<typeof guideItemUpdateSchema>;
export type GuideItemListInput = z.infer<typeof guideItemListSchema>;
export type GuideItemGetInput = z.infer<typeof guideItemGetSchema>;
export type GuideItemDeleteInput = z.infer<typeof guideItemDeleteSchema>;
export type GuideItemReorderInput = z.infer<typeof guideItemReorderSchema>;
export type GuideItemBulkCreateInput = z.infer<typeof guideItemBulkCreateSchema>;
