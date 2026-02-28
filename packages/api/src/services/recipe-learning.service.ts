/**
 * Recipe Auto-Learning Service
 *
 * Captures implied pour ratios when inventory sessions close, and computes
 * exponentially-weighted moving averages to reveal real recipe accuracy.
 */

import { Prisma } from "@prisma/client";
import type { ExtendedPrismaClient } from "@barstock/database";

interface SnapshotRow {
  recipeId: string;
  inventoryItemId: string;
  recipeQuantity: number;
  impliedQuantity: number;
  ratio: number;
}

export interface RecipeTrendIngredient {
  inventoryItemId: string;
  itemName: string;
  recipeQuantity: number;
  weightedAvgRatio: number;
  trend: "improving" | "stable" | "worsening";
  history: Array<{
    sessionId: string;
    sessionDate: string;
    ratio: number;
  }>;
}

export interface RecipeTrendResult {
  recipeId: string;
  recipeName: string;
  ingredients: RecipeTrendIngredient[];
  snapshotCount: number;
}

// Exponential decay weights (most recent first)
const EXP_WEIGHTS = [0.30, 0.25, 0.20, 0.12, 0.08, 0.05];

export class RecipeLearningService {
  constructor(private prisma: ExtendedPrismaClient) {}

  /**
   * Called after session close — compute implied ratios for all recipe-mapped items.
   *
   * Logic:
   * 1. Find all recipe-mapped POS items sold during the session window
   * 2. For each recipe: get total servings sold (from consumption_events with recipe depletion)
   * 3. For each ingredient: get actual depletion from session variance
   * 4. impliedQuantity = actualDepletion / totalServings
   * 5. ratio = impliedQuantity / recipeQuantity
   * 6. Upsert into recipe_ratio_snapshots
   */
  async captureSessionSnapshot(
    sessionId: string,
    locationId: string
  ): Promise<number> {
    // Get the session time window
    const session = await this.prisma.inventorySession.findUnique({
      where: { id: sessionId },
      select: { startedTs: true, endedTs: true },
    });
    if (!session?.endedTs) return 0;

    // Find all recipes at this location with their ingredients
    const recipes = await this.prisma.recipe.findMany({
      where: { locationId, active: true },
      include: {
        ingredients: {
          include: { inventoryItem: { select: { id: true, name: true } } },
        },
        posMappings: {
          where: { active: true },
          select: { posItemId: true, sourceSystem: true },
        },
      },
    });

    if (recipes.length === 0) return 0;

    const snapshots: SnapshotRow[] = [];

    for (const recipe of recipes) {
      if (recipe.posMappings.length === 0 || recipe.ingredients.length === 0) {
        continue;
      }

      // Count total recipe servings during the session window
      // These are the consumption_events created by recipe depletion
      const servingsResult = await this.prisma.$queryRaw<
        Array<{ total_servings: string | null }>
      >(Prisma.sql`
        SELECT COUNT(DISTINCT ce.sales_line_id) AS total_servings
        FROM consumption_events ce
        WHERE ce.location_id = ${locationId}::uuid
          AND ce.event_ts >= ${session.startedTs}
          AND ce.event_ts <= ${session.endedTs}
          AND ce.reversal_of_event_id IS NULL
          AND ce.event_type = 'pos_sale'
          AND ce.inventory_item_id = ANY(${recipe.ingredients.map((i) => i.inventoryItemId)}::uuid[])
      `);

      const totalServings = Number(servingsResult[0]?.total_servings ?? 0);
      if (totalServings === 0) continue;

      // For each ingredient, compute the actual depletion from the session's count adjustment
      for (const ingredient of recipe.ingredients) {
        // Get the count adjustment event for this item from this session
        const adjustmentResult = await this.prisma.$queryRaw<
          Array<{ quantity_delta: string | null }>
        >(Prisma.sql`
          SELECT quantity_delta
          FROM consumption_events
          WHERE location_id = ${locationId}::uuid
            AND event_type = 'inventory_count_adjustment'
            AND inventory_item_id = ${ingredient.inventoryItemId}::uuid
            AND notes LIKE ${"Session " + sessionId + "%"}
            AND reversal_of_event_id IS NULL
          ORDER BY created_at DESC
          LIMIT 1
        `);

        // Also get POS depletion for this ingredient during the session
        const posDepletionResult = await this.prisma.$queryRaw<
          Array<{ total_depletion: string | null }>
        >(Prisma.sql`
          SELECT COALESCE(SUM(ABS(quantity_delta)), 0) AS total_depletion
          FROM consumption_events
          WHERE location_id = ${locationId}::uuid
            AND event_type = 'pos_sale'
            AND inventory_item_id = ${ingredient.inventoryItemId}::uuid
            AND event_ts >= ${session.startedTs}
            AND event_ts <= ${session.endedTs}
            AND reversal_of_event_id IS NULL
        `);

        const posDepletion = Number(posDepletionResult[0]?.total_depletion ?? 0);
        const countAdjustment = Math.abs(
          Number(adjustmentResult[0]?.quantity_delta ?? 0)
        );

        // Actual depletion = POS-predicted + variance adjustment
        // If variance is negative (counted less than expected), actual usage was higher
        const actualDepletion = posDepletion + countAdjustment;
        if (actualDepletion === 0) continue;

        const impliedPerServing = actualDepletion / totalServings;
        const recipeQty = Number(ingredient.quantity);
        if (recipeQty === 0) continue;

        const ratio = impliedPerServing / recipeQty;

        // Only record reasonable ratios (0.1x to 5x) to filter noise
        if (ratio >= 0.1 && ratio <= 5.0) {
          snapshots.push({
            recipeId: recipe.id,
            inventoryItemId: ingredient.inventoryItemId,
            recipeQuantity: recipeQty,
            impliedQuantity: impliedPerServing,
            ratio,
          });
        }
      }
    }

    if (snapshots.length === 0) return 0;

    // Upsert all snapshots
    for (const snap of snapshots) {
      await this.prisma.recipeRatioSnapshot.upsert({
        where: {
          recipeId_sessionId_inventoryItemId: {
            recipeId: snap.recipeId,
            sessionId,
            inventoryItemId: snap.inventoryItemId,
          },
        },
        create: {
          recipeId: snap.recipeId,
          sessionId,
          inventoryItemId: snap.inventoryItemId,
          recipeQuantity: new Prisma.Decimal(snap.recipeQuantity),
          impliedQuantity: new Prisma.Decimal(snap.impliedQuantity),
          ratio: new Prisma.Decimal(snap.ratio),
        },
        update: {
          recipeQuantity: new Prisma.Decimal(snap.recipeQuantity),
          impliedQuantity: new Prisma.Decimal(snap.impliedQuantity),
          ratio: new Prisma.Decimal(snap.ratio),
        },
      });
    }

    return snapshots.length;
  }

  /**
   * Get weighted moving average for a recipe (last N sessions, exponential decay).
   */
  async getRecipeTrend(
    recipeId: string,
    limit = 6
  ): Promise<RecipeTrendResult> {
    const recipe = await this.prisma.recipe.findUniqueOrThrow({
      where: { id: recipeId },
      select: { id: true, name: true },
    });

    // Get snapshots grouped by ingredient, ordered by session date DESC
    const snapshots = await this.prisma.recipeRatioSnapshot.findMany({
      where: { recipeId },
      include: {
        inventoryItem: { select: { name: true } },
        session: { select: { startedTs: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Group by ingredient
    const byIngredient = new Map<
      string,
      Array<{
        sessionId: string;
        sessionDate: string;
        ratio: number;
        recipeQuantity: number;
      }>
    >();
    const itemNames = new Map<string, string>();

    for (const snap of snapshots) {
      const key = snap.inventoryItemId;
      if (!byIngredient.has(key)) {
        byIngredient.set(key, []);
        itemNames.set(key, snap.inventoryItem.name);
      }
      byIngredient.get(key)!.push({
        sessionId: snap.sessionId,
        sessionDate: snap.session.startedTs.toISOString(),
        ratio: Number(snap.ratio),
        recipeQuantity: Number(snap.recipeQuantity),
      });
    }

    const ingredients: RecipeTrendIngredient[] = [];

    for (const [itemId, history] of byIngredient) {
      const limited = history.slice(0, limit);

      // Compute weighted average
      let weightedSum = 0;
      let totalWeight = 0;
      for (let i = 0; i < limited.length; i++) {
        const weight = EXP_WEIGHTS[i] ?? EXP_WEIGHTS[EXP_WEIGHTS.length - 1];
        weightedSum += limited[i].ratio * weight;
        totalWeight += weight;
      }
      const weightedAvgRatio = totalWeight > 0 ? weightedSum / totalWeight : 1;

      // Determine trend: compare first half avg vs second half avg
      let trend: "improving" | "stable" | "worsening" = "stable";
      if (limited.length >= 4) {
        const half = Math.floor(limited.length / 2);
        const recentAvg =
          limited.slice(0, half).reduce((s, h) => s + h.ratio, 0) / half;
        const olderAvg =
          limited.slice(half).reduce((s, h) => s + h.ratio, 0) /
          (limited.length - half);
        const recentDelta = Math.abs(recentAvg - 1);
        const olderDelta = Math.abs(olderAvg - 1);
        if (recentDelta < olderDelta - 0.05) trend = "improving";
        else if (recentDelta > olderDelta + 0.05) trend = "worsening";
      }

      ingredients.push({
        inventoryItemId: itemId,
        itemName: itemNames.get(itemId) ?? "Unknown",
        recipeQuantity: limited[0]?.recipeQuantity ?? 0,
        weightedAvgRatio,
        trend,
        history: limited.map((h) => ({
          sessionId: h.sessionId,
          sessionDate: h.sessionDate,
          ratio: h.ratio,
        })),
      });
    }

    return {
      recipeId: recipe.id,
      recipeName: recipe.name,
      ingredients,
      snapshotCount: snapshots.length,
    };
  }

  /**
   * Get adaptive depletion ratios for a recipe.
   * Returns Map<inventoryItemId, ewmaRatio> for ingredients that meet threshold.
   */
  async getAdaptiveRatios(
    recipeId: string,
    minSnapshots: number,
    ratioFloor: number,
    ratioCeiling: number
  ): Promise<Map<string, number>> {
    const snapshots = await this.prisma.recipeRatioSnapshot.findMany({
      where: { recipeId },
      orderBy: { createdAt: "desc" },
    });

    // Group by ingredient
    const byIngredient = new Map<string, number[]>();
    for (const snap of snapshots) {
      const key = snap.inventoryItemId;
      if (!byIngredient.has(key)) byIngredient.set(key, []);
      byIngredient.get(key)!.push(Number(snap.ratio));
    }

    const result = new Map<string, number>();

    for (const [itemId, ratios] of byIngredient) {
      if (ratios.length < minSnapshots) continue;

      // Compute EWMA (ratios already ordered most recent first)
      let weightedSum = 0;
      let totalWeight = 0;
      for (let i = 0; i < ratios.length; i++) {
        const weight = EXP_WEIGHTS[i] ?? EXP_WEIGHTS[EXP_WEIGHTS.length - 1];
        weightedSum += ratios[i] * weight;
        totalWeight += weight;
      }
      const ewma = totalWeight > 0 ? weightedSum / totalWeight : 1;

      // Only include if within bounds
      if (ewma >= ratioFloor && ewma <= ratioCeiling) {
        result.set(itemId, ewma);
      }
    }

    return result;
  }

  /**
   * Get snapshot history for a recipe.
   */
  async getSnapshotHistory(recipeId: string, limit = 20) {
    const snapshots = await this.prisma.recipeRatioSnapshot.findMany({
      where: { recipeId },
      include: {
        inventoryItem: { select: { name: true } },
        session: { select: { startedTs: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return snapshots.map((s) => ({
      id: s.id,
      sessionId: s.sessionId,
      sessionDate: s.session.startedTs.toISOString(),
      inventoryItemId: s.inventoryItemId,
      itemName: s.inventoryItem.name,
      recipeQuantity: Number(s.recipeQuantity),
      impliedQuantity: Number(s.impliedQuantity),
      ratio: Number(s.ratio),
      createdAt: s.createdAt.toISOString(),
    }));
  }
}
