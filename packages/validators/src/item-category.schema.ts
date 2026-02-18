import { z } from "zod";
import { CountingMethod } from "@barstock/types";

export const itemCategoryCreateSchema = z.object({
  businessId: z.string().uuid(),
  name: z.string().min(1).max(100),
  countingMethod: z.nativeEnum(CountingMethod),
  defaultDensity: z.number().positive().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const itemCategoryUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  countingMethod: z.nativeEnum(CountingMethod).optional(),
  defaultDensity: z.number().positive().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

export const itemCategoryListSchema = z.object({
  businessId: z.string().uuid(),
  activeOnly: z.boolean().default(true),
});

export type ItemCategoryCreateInput = z.infer<typeof itemCategoryCreateSchema>;
export type ItemCategoryUpdateInput = z.infer<typeof itemCategoryUpdateSchema>;
export type ItemCategoryListInput = z.infer<typeof itemCategoryListSchema>;
