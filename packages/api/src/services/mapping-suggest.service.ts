import type { ExtendedPrismaClient } from "@barstock/database";
import { MappingMode } from "@barstock/types";
import { fuzzyMatch } from "../utils/fuzzy-match";

export interface MappingSuggestion {
  posItemName: string;
  suggestedMode: string;
  suggestedTarget: {
    id: string;
    name: string;
    type: "inventoryItem" | "recipe";
  } | null;
  confidence: number; // 0-1
  alternatives: {
    id: string;
    name: string;
    type: "inventoryItem" | "recipe";
    score: number;
  }[];
}

// Keywords that suggest specific mapping modes
const DRAFT_KEYWORDS = ["draft", "tap", "dft", "draught", "on tap"];
const PACKAGED_KEYWORDS = ["bottle", "btl", "can", "pkg", "packaged"];

function detectMode(name: string): string | null {
  const lower = name.toLowerCase();
  for (const kw of DRAFT_KEYWORDS) {
    if (lower.includes(kw)) return MappingMode.draft_by_tap;
  }
  for (const kw of PACKAGED_KEYWORDS) {
    if (lower.includes(kw)) return MappingMode.packaged_unit;
  }
  return null;
}

export class MappingSuggestService {
  constructor(private prisma: ExtendedPrismaClient) {}

  async suggestMappings(
    locationId: string,
    posItemNames: string[],
  ): Promise<MappingSuggestion[]> {
    // Fetch inventory items and recipes for matching
    const [inventoryItems, recipes] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where: { locationId, active: true },
        select: { id: true, name: true },
      }),
      this.prisma.recipe.findMany({
        where: { locationId, active: true },
        select: { id: true, name: true },
      }),
    ]);

    // Combine candidates with type labels
    type Candidate = { id: string; name: string; type: "inventoryItem" | "recipe" };
    const allCandidates: Candidate[] = [
      ...inventoryItems.map((i) => ({ ...i, type: "inventoryItem" as const })),
      ...recipes.map((r) => ({ ...r, type: "recipe" as const })),
    ];

    const suggestions: MappingSuggestion[] = [];

    for (const posName of posItemNames) {
      const matches = fuzzyMatch(posName, allCandidates, (c) => c.name, 0.25);

      const top = matches[0];
      const keywordMode = detectMode(posName);

      let suggestedMode: string;
      let suggestedTarget: MappingSuggestion["suggestedTarget"] = null;
      let confidence = 0;

      if (top) {
        suggestedTarget = {
          id: top.item.id,
          name: top.label,
          type: top.item.type,
        };
        confidence = Math.round(top.score * 100) / 100;

        if (top.item.type === "recipe") {
          suggestedMode = MappingMode.recipe;
        } else if (keywordMode) {
          suggestedMode = keywordMode;
        } else {
          suggestedMode = MappingMode.packaged_unit;
        }
      } else {
        suggestedMode = keywordMode ?? MappingMode.packaged_unit;
      }

      const alternatives = matches.slice(0, 5).map((m) => ({
        id: m.item.id,
        name: m.label,
        type: m.item.type,
        score: Math.round(m.score * 100) / 100,
      }));

      suggestions.push({
        posItemName: posName,
        suggestedMode,
        suggestedTarget,
        confidence,
        alternatives,
      });
    }

    return suggestions;
  }

  async bulkCreateMappings(input: {
    locationId: string;
    sourceSystem: string;
    mappings: {
      posItemId: string;
      posItemName: string;
      mode: string;
      inventoryItemId?: string;
      recipeId?: string;
      pourProfileId?: string;
    }[];
  }): Promise<{ created: number; skipped: number; errors: string[] }> {
    const { locationId, sourceSystem, mappings } = input;

    // Check existing mappings to skip duplicates
    const existingMappings = await this.prisma.pOSItemMapping.findMany({
      where: { locationId, active: true },
      select: { posItemId: true },
    });
    const existingIds = new Set(existingMappings.map((m) => m.posItemId));

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Create in a transaction
    await this.prisma.$transaction(async (tx) => {
      for (const m of mappings) {
        if (existingIds.has(m.posItemId)) {
          skipped++;
          continue;
        }

        try {
          await tx.pOSItemMapping.create({
            data: {
              locationId,
              sourceSystem: sourceSystem as any,
              posItemId: m.posItemId,
              mode: m.mode as any,
              inventoryItemId: m.mode === "recipe" ? null : (m.inventoryItemId ?? null),
              recipeId: m.mode === "recipe" ? (m.recipeId ?? null) : null,
              pourProfileId: m.pourProfileId ?? null,
              effectiveFromTs: new Date(),
            },
          });
          created++;
        } catch (err: any) {
          errors.push(`Failed to create mapping for "${m.posItemName}": ${err.message}`);
        }
      }
    });

    return { created, skipped, errors };
  }
}
