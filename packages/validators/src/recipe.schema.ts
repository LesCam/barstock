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

// ─── Bulk Import Schemas ───────────────────────────────────

export const recipeParseCSVSchema = z.object({
  locationId: z.string().uuid(),
  csvText: z.string().min(1),
});

const ingredientMatchActionSchema = z.enum(["match", "create", "skip"]);

export const recipeBulkIngredientMatchSchema = z.object({
  csvName: z.string().min(1),
  action: ingredientMatchActionSchema,
  inventoryItemId: z.string().uuid().optional(),
  // Fields for "create" action
  newItemName: z.string().min(1).optional(),
  newItemCategoryId: z.string().uuid().optional(),
  newItemBaseUom: z.nativeEnum(UOM).optional(),
});

const bulkRecipeRowSchema = z.object({
  name: z.string().min(1),
  category: z.string().max(100).optional(),
  ingredients: z.array(
    z.object({
      csvName: z.string().min(1),
      quantity: z.number().positive(),
      uom: z.nativeEnum(UOM),
    })
  ).min(1),
});

export const recipeBulkCreateSchema = z.object({
  locationId: z.string().uuid(),
  recipes: z.array(bulkRecipeRowSchema).min(1),
  ingredientMatches: z.array(recipeBulkIngredientMatchSchema).min(1),
});

// ─── Types ─────────────────────────────────────────────────

export type RecipeCreateInput = z.infer<typeof recipeCreateSchema>;
export type RecipeUpdateInput = z.infer<typeof recipeUpdateSchema>;
export type RecipeListInput = z.infer<typeof recipeListSchema>;
export type RecipeParseCSVInput = z.infer<typeof recipeParseCSVSchema>;
export type RecipeBulkIngredientMatch = z.infer<typeof recipeBulkIngredientMatchSchema>;
export type RecipeBulkCreateInput = z.infer<typeof recipeBulkCreateSchema>;
