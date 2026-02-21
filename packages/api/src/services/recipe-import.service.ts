import type { ExtendedPrismaClient } from "@barstock/database";
import type {
  RecipeBulkCreateInput,
  RecipeBulkIngredientMatch,
} from "@barstock/validators";
import { UOM } from "@barstock/types";
import { fuzzyMatch, type FuzzyResult } from "../utils/fuzzy-match";

// ─── CSV Parsing ───────────────────────────────────────────

interface RawCSVRow {
  recipeName: string;
  category?: string;
  ingredientName: string;
  quantity: number;
  uom: string;
}

interface ParsedRecipe {
  name: string;
  category?: string;
  ingredients: { csvName: string; quantity: number; uom: string }[];
}

interface IngredientSuggestion {
  csvName: string;
  bestMatch: { inventoryItemId: string; name: string; score: number } | null;
  alternatives: { inventoryItemId: string; name: string; score: number }[];
}

export interface ParseResult {
  recipes: ParsedRecipe[];
  ingredientSuggestions: IngredientSuggestion[];
  errors: { row: number; message: string }[];
  uniqueIngredients: string[];
}

export interface BulkCreateResult {
  recipesCreated: number;
  recipesSkipped: number;
  itemsCreated: number;
  ingredientsSkipped: number;
  errors: string[];
}

const UOM_ALIASES: Record<string, string> = {
  oz: UOM.oz,
  ounce: UOM.oz,
  ounces: UOM.oz,
  ml: UOM.ml,
  milliliter: UOM.ml,
  milliliters: UOM.ml,
  g: UOM.grams,
  gram: UOM.grams,
  grams: UOM.grams,
  unit: UOM.units,
  units: UOM.units,
  each: UOM.units,
  ea: UOM.units,
  l: UOM.L,
  liter: UOM.L,
  litre: UOM.L,
  liters: UOM.L,
  litres: UOM.L,
};

function normalizeUom(raw: string): string {
  const lower = raw.trim().toLowerCase();
  return UOM_ALIASES[lower] ?? lower;
}

function parseCSVText(csvText: string): { rows: Record<string, string>[]; headers: string[] } {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return { rows: [], headers: [] };

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^["']|["']$/g, ""));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Basic CSV parsing (handles quoted fields with commas)
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const char of line) {
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    rows.push(row);
  }

  return { rows, headers };
}

// Header name detection
const RECIPE_NAME_HEADERS = ["recipe name", "recipe", "drink name", "drink", "cocktail", "name"];
const CATEGORY_HEADERS = ["category", "recipe category", "type", "group"];
const INGREDIENT_HEADERS = ["ingredient name", "ingredient", "item", "item name", "inventory item"];
const QUANTITY_HEADERS = ["quantity", "qty", "amount", "vol"];
const UOM_HEADERS = ["uom", "unit", "unit of measure", "measure"];

function findHeader(headers: string[], candidates: string[]): string | null {
  const lower = headers.map((h) => h.toLowerCase());
  for (const c of candidates) {
    const idx = lower.indexOf(c);
    if (idx !== -1) return headers[idx];
  }
  return null;
}

export class RecipeImportService {
  constructor(private prisma: ExtendedPrismaClient) {}

  async parseAndMatch(locationId: string, csvText: string): Promise<ParseResult> {
    const { rows, headers } = parseCSVText(csvText);
    const errors: { row: number; message: string }[] = [];

    // Detect columns
    const recipeCol = findHeader(headers, RECIPE_NAME_HEADERS);
    const categoryCol = findHeader(headers, CATEGORY_HEADERS);
    const ingredientCol = findHeader(headers, INGREDIENT_HEADERS);
    const quantityCol = findHeader(headers, QUANTITY_HEADERS);
    const uomCol = findHeader(headers, UOM_HEADERS);

    if (!recipeCol) {
      return { recipes: [], ingredientSuggestions: [], errors: [{ row: 0, message: `Could not find recipe name column. Expected one of: ${RECIPE_NAME_HEADERS.join(", ")}` }], uniqueIngredients: [] };
    }
    if (!ingredientCol) {
      return { recipes: [], ingredientSuggestions: [], errors: [{ row: 0, message: `Could not find ingredient name column. Expected one of: ${INGREDIENT_HEADERS.join(", ")}` }], uniqueIngredients: [] };
    }
    if (!quantityCol) {
      return { recipes: [], ingredientSuggestions: [], errors: [{ row: 0, message: `Could not find quantity column. Expected one of: ${QUANTITY_HEADERS.join(", ")}` }], uniqueIngredients: [] };
    }

    // Parse rows into grouped recipes
    const recipeMap = new Map<string, ParsedRecipe>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const recipeName = row[recipeCol]?.trim();
      const ingredientName = row[ingredientCol]?.trim();
      const rawQty = row[quantityCol]?.trim();
      const rawUom = uomCol ? row[uomCol]?.trim() : "oz";
      const categoryVal = categoryCol ? row[categoryCol]?.trim() : undefined;

      if (!recipeName) {
        errors.push({ row: i + 2, message: "Missing recipe name" });
        continue;
      }
      if (!ingredientName) {
        errors.push({ row: i + 2, message: "Missing ingredient name" });
        continue;
      }

      const qty = parseFloat(rawQty ?? "");
      if (isNaN(qty) || qty <= 0) {
        errors.push({ row: i + 2, message: `Invalid quantity: "${rawQty}"` });
        continue;
      }

      const uom = normalizeUom(rawUom ?? "oz");
      if (!Object.values(UOM).includes(uom as any)) {
        errors.push({ row: i + 2, message: `Unknown UOM: "${rawUom}". Use oz, ml, grams, units, or L` });
        continue;
      }

      const key = recipeName.toLowerCase();
      if (!recipeMap.has(key)) {
        recipeMap.set(key, {
          name: recipeName,
          category: categoryVal || undefined,
          ingredients: [],
        });
      }

      const recipe = recipeMap.get(key)!;
      // Update category if later rows provide one
      if (categoryVal && !recipe.category) {
        recipe.category = categoryVal;
      }

      recipe.ingredients.push({
        csvName: ingredientName,
        quantity: qty,
        uom,
      });
    }

    const recipes = Array.from(recipeMap.values());

    // Collect unique ingredient names
    const uniqueNames = new Set<string>();
    for (const r of recipes) {
      for (const ing of r.ingredients) {
        uniqueNames.add(ing.csvName.toLowerCase());
      }
    }
    const uniqueIngredients = Array.from(uniqueNames);

    // Fetch inventory items for fuzzy matching
    const inventoryItems = await this.prisma.inventoryItem.findMany({
      where: { locationId, active: true },
      select: { id: true, name: true },
    });

    // Fuzzy match each unique ingredient
    const ingredientSuggestions: IngredientSuggestion[] = [];

    for (const csvNameLower of uniqueIngredients) {
      // Use original casing from first occurrence
      let originalName = csvNameLower;
      for (const r of recipes) {
        for (const ing of r.ingredients) {
          if (ing.csvName.toLowerCase() === csvNameLower) {
            originalName = ing.csvName;
            break;
          }
        }
        if (originalName !== csvNameLower) break;
      }

      const matches = fuzzyMatch(originalName, inventoryItems, (i) => i.name, 0.25);
      const top = matches[0];
      const alternatives = matches.slice(0, 5).map((m) => ({
        inventoryItemId: m.item.id,
        name: m.label,
        score: Math.round(m.score * 100) / 100,
      }));

      ingredientSuggestions.push({
        csvName: originalName,
        bestMatch: top
          ? {
              inventoryItemId: top.item.id,
              name: top.label,
              score: Math.round(top.score * 100) / 100,
            }
          : null,
        alternatives,
      });
    }

    return { recipes, ingredientSuggestions, errors, uniqueIngredients: Array.from(uniqueNames) };
  }

  async bulkCreate(
    input: RecipeBulkCreateInput,
    businessId: string,
  ): Promise<BulkCreateResult> {
    const { locationId, recipes, ingredientMatches } = input;

    // Build csvName → resolved inventoryItemId map
    const matchMap = new Map<string, RecipeBulkIngredientMatch>();
    for (const m of ingredientMatches) {
      matchMap.set(m.csvName.toLowerCase(), m);
    }

    // Check existing recipes to skip duplicates
    const existingRecipes = await this.prisma.recipe.findMany({
      where: { locationId },
      select: { name: true },
    });
    const existingNames = new Set(existingRecipes.map((r) => r.name.toLowerCase()));

    return this.prisma.$transaction(async (tx) => {
      let recipesCreated = 0;
      let recipesSkipped = 0;
      let itemsCreated = 0;
      let ingredientsSkipped = 0;
      const errors: string[] = [];

      // First pass: create any new inventory items for "create" actions
      const createdItemIds = new Map<string, string>(); // csvName lower → new item id

      for (const m of ingredientMatches) {
        if (m.action === "create") {
          if (!m.newItemName) {
            errors.push(`Missing new item name for "${m.csvName}"`);
            continue;
          }

          const item = await tx.inventoryItem.create({
            data: {
              locationId,
              name: m.newItemName,
              categoryId: m.newItemCategoryId ?? null,
              baseUom: (m.newItemBaseUom ?? "oz") as any,
            },
          });

          createdItemIds.set(m.csvName.toLowerCase(), item.id);
          itemsCreated++;
        }
      }

      // Second pass: create recipes
      for (const recipe of recipes) {
        if (existingNames.has(recipe.name.toLowerCase())) {
          recipesSkipped++;
          continue;
        }

        // Resolve ingredients
        const resolvedIngredients: { inventoryItemId: string; quantity: number; uom: string }[] = [];
        let skipRecipe = false;

        for (const ing of recipe.ingredients) {
          const match = matchMap.get(ing.csvName.toLowerCase());
          if (!match) {
            errors.push(`No match resolution for ingredient "${ing.csvName}" in recipe "${recipe.name}"`);
            skipRecipe = true;
            break;
          }

          if (match.action === "skip") {
            ingredientsSkipped++;
            continue;
          }

          let itemId: string | undefined;
          if (match.action === "match") {
            itemId = match.inventoryItemId;
          } else if (match.action === "create") {
            itemId = createdItemIds.get(match.csvName.toLowerCase());
          }

          if (!itemId) {
            errors.push(`Could not resolve inventory item for ingredient "${ing.csvName}" in recipe "${recipe.name}"`);
            skipRecipe = true;
            break;
          }

          resolvedIngredients.push({
            inventoryItemId: itemId,
            quantity: ing.quantity,
            uom: ing.uom,
          });
        }

        if (skipRecipe || resolvedIngredients.length === 0) {
          if (!skipRecipe) recipesSkipped++;
          continue;
        }

        await tx.recipe.create({
          data: {
            locationId,
            name: recipe.name,
            category: recipe.category ?? null,
            ingredients: {
              create: resolvedIngredients.map((ing) => ({
                inventoryItemId: ing.inventoryItemId,
                quantity: ing.quantity,
                uom: ing.uom as any,
              })),
            },
          },
        });

        existingNames.add(recipe.name.toLowerCase());
        recipesCreated++;
      }

      return { recipesCreated, recipesSkipped, itemsCreated, ingredientsSkipped, errors };
    });
  }
}
