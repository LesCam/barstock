import { z } from "zod";
import { UOM } from "@barstock/types";

const ingredientSchema = z.object({
  inventoryItemId: z.string().uuid(),
  quantity: z.number().positive(),
  uom: z.nativeEnum(UOM),
});

export const recipeCreateSchema = z.object({
  locationId: z.string().uuid(),
  name: z.string().min(1).max(200),
  category: z.string().max(100).optional(),
  ingredients: z.array(ingredientSchema).min(1),
});

export const recipeUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z.string().max(100).nullish(),
  active: z.boolean().optional(),
  ingredients: z.array(ingredientSchema).min(1).optional(),
});

export const recipeListSchema = z.object({
  locationId: z.string().uuid(),
});

export type RecipeCreateInput = z.infer<typeof recipeCreateSchema>;
export type RecipeUpdateInput = z.infer<typeof recipeUpdateSchema>;
export type RecipeListInput = z.infer<typeof recipeListSchema>;
