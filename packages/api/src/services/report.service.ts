/**
 * Report Service
 * On-hand, usage, valuation, and org rollup reports
 */

import type { ExtendedPrismaClient } from "@barstock/database";
import { Prisma } from "@prisma/client";
import { InventoryService } from "./inventory.service";
import { VarianceService } from "./variance.service";
import { ParLevelService } from "./par-level.service";

export interface ExpectedOnHandItem {
  inventoryItemId: string;
  itemName: string;
  categoryName: string | null;
  categoryId: string | null;
  uom: string;
  currentOnHand: number;
  lastCountValue: number | null;
  lastCountDate: Date | null;
  daysSinceLastCount: number | null;
  posDepletionSinceCount: number;
  posChangeSinceCount: number;
  tapFlowChangeSinceCount: number;
  receivingChangeSinceCount: number;
  transferChangeSinceCount: number;
  adjustmentChangeSinceCount: number;
  netChangeSinceCount: number;
  predictedLevel: number | null;
  avgDailyUsage: number | null;
  daysToStockout: number | null;
  confidence: "high" | "medium" | "low";
  status: "green" | "yellow" | "red";
}

export class ReportService {
  private inventoryService: InventoryService;

  constructor(private prisma: ExtendedPrismaClient) {
    this.inventoryService = new InventoryService(prisma);
  }

  async getOnHandReport(locationId: string, asOfDate?: Date) {
    const items = await this.inventoryService.calculateOnHand(
      locationId,
      asOfDate
    );
    const totalValue = items.reduce(
      (sum, i) => sum + (i.totalValue ?? 0),
      0
    );
    return {
      locationId,
      asOfDate: asOfDate ?? new Date(),
      items,
      totalItems: items.length,
      totalValue,
    };
  }

  async getUsageReport(
    locationId: string,
    fromDate: Date,
    toDate: Date
  ) {
    const events = await this.prisma.consumptionEvent.findMany({
      where: {
        locationId,
        eventTs: { gte: fromDate, lt: toDate },
        eventType: { in: ["pos_sale", "tap_flow"] },
      },
      include: {
        inventoryItem: {
          include: {
            priceHistory: true,
            category: true,
          },
        },
      },
    });

    const usageMap = new Map<
      string,
      {
        itemId: string;
        name: string;
        categoryName: string | null;
        quantityUsed: number;
        uom: string;
        unitCost: number | null;
        totalCost: number | null;
      }
    >();

    for (const event of events) {
      const key = event.inventoryItemId;
      const qty = Math.abs(Number(event.quantityDelta));
      const unitCost = this.getEffectiveUnitCost(
        event.inventoryItem.priceHistory,
        event.eventTs
      );
      const existing = usageMap.get(key);
      if (existing) {
        existing.quantityUsed += qty;
        if (unitCost !== null) {
          existing.totalCost = (existing.totalCost ?? 0) + qty * unitCost;
        }
      } else {
        usageMap.set(key, {
          itemId: event.inventoryItemId,
          name: event.inventoryItem.name,
          categoryName: event.inventoryItem.category?.name ?? null,
          quantityUsed: qty,
          uom: event.uom,
          unitCost,
          totalCost: unitCost !== null ? qty * unitCost : null,
        });
      }
    }

    const sessions = await this.prisma.inventorySession.count({
      where: {
        locationId,
        startedTs: { gte: fromDate, lt: toDate },
      },
    });

    const items = Array.from(usageMap.values());
    const totalUsageCost = items.reduce(
      (sum, i) => sum + (i.totalCost ?? 0),
      0
    );

    return {
      locationId,
      fromDate,
      toDate,
      items,
      totalItems: items.length,
      totalUsageCost,
      totalSessions: sessions,
    };
  }

  async getCOGSReport(
    locationId: string,
    fromDate: Date,
    toDate: Date
  ) {
    const [openingItems, closingItems, receivingEvents] = await Promise.all([
      this.inventoryService.calculateOnHand(locationId, fromDate),
      this.inventoryService.calculateOnHand(locationId, toDate),
      this.prisma.consumptionEvent.findMany({
        where: {
          locationId,
          eventTs: { gte: fromDate, lt: toDate },
          eventType: "receiving",
        },
        include: {
          inventoryItem: {
            include: { priceHistory: true },
          },
        },
      }),
    ]);

    const openingValue = openingItems.reduce(
      (sum, i) => sum + (i.totalValue ?? 0),
      0
    );
    const closingValue = closingItems.reduce(
      (sum, i) => sum + (i.totalValue ?? 0),
      0
    );

    const purchaseMap = new Map<
      string,
      {
        itemName: string;
        quantityReceived: number;
        uom: string;
        totalCost: number | null;
      }
    >();

    let purchasesValue = 0;

    for (const event of receivingEvents) {
      const qty = Math.abs(Number(event.quantityDelta));
      const unitCost = this.getEffectiveUnitCost(
        event.inventoryItem.priceHistory,
        event.eventTs
      );
      const cost = unitCost !== null ? qty * unitCost : null;
      if (cost !== null) {
        purchasesValue += cost;
      }
      const key = event.inventoryItemId;
      const existing = purchaseMap.get(key);
      if (existing) {
        existing.quantityReceived += qty;
        if (cost !== null) {
          existing.totalCost = (existing.totalCost ?? 0) + cost;
        }
      } else {
        purchaseMap.set(key, {
          itemName: event.inventoryItem.name,
          quantityReceived: qty,
          uom: event.uom,
          totalCost: cost,
        });
      }
    }

    const purchases = Array.from(purchaseMap.values()).map((p) => ({
      ...p,
      unitCost: p.totalCost !== null && p.quantityReceived > 0
        ? p.totalCost / p.quantityReceived
        : null,
    }));

    const cogs = openingValue + purchasesValue - closingValue;

    return {
      locationId,
      fromDate,
      toDate,
      openingValue,
      purchasesValue,
      closingValue,
      cogs,
      purchases,
    };
  }

  private getEffectiveUnitCost(
    priceHistory: Array<{
      unitCost: any;
      effectiveFromTs: Date;
      effectiveToTs: Date | null;
    }>,
    asOf: Date
  ): number | null {
    const effective = priceHistory.find(
      (p) =>
        p.effectiveFromTs <= asOf &&
        (p.effectiveToTs === null || p.effectiveToTs > asOf)
    );
    return effective ? Number(effective.unitCost) : null;
  }

  async getExpectedOnHandDashboard(
    locationId: string
  ): Promise<ExpectedOnHandItem[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        base_uom: string;
        category_name: string | null;
        category_id: string | null;
        current_on_hand: string | null;
        count_units: string | null;
        gross_weight_grams: string | null;
        last_count_date: Date | null;
        net_change: string | null;
        pos_change: string | null;
        tap_change: string | null;
        receiving_change: string | null;
        transfer_change: string | null;
        adjustment_change: string | null;
        avg_daily: string | null;
      }>
    >(Prisma.sql`
      WITH last_counts AS (
        SELECT DISTINCT ON (sl.inventory_item_id)
          sl.inventory_item_id,
          sl.count_units,
          sl.gross_weight_grams,
          sl.created_at
        FROM inventory_session_lines sl
        JOIN inventory_sessions s ON s.id = sl.session_id
        WHERE s.location_id = ${locationId}::uuid
          AND s.ended_ts IS NOT NULL
        ORDER BY sl.inventory_item_id, sl.created_at DESC
      ),
      on_hand AS (
        SELECT inventory_item_id, SUM(quantity_delta) AS total
        FROM consumption_events
        WHERE location_id = ${locationId}::uuid
        GROUP BY inventory_item_id
      ),
      avg_usage AS (
        SELECT inventory_item_id, ABS(SUM(quantity_delta)) / 30.0 AS avg_daily
        FROM consumption_events
        WHERE location_id = ${locationId}::uuid
          AND event_type IN ('pos_sale', 'tap_flow')
          AND event_ts >= NOW() - INTERVAL '30 days'
          AND reversal_of_event_id IS NULL
        GROUP BY inventory_item_id
      ),
      changes_since_count AS (
        SELECT
          ce.inventory_item_id,
          SUM(ce.quantity_delta) AS net_change,
          COALESCE(SUM(ce.quantity_delta) FILTER (WHERE ce.event_type = 'pos_sale'), 0) AS pos_change,
          COALESCE(SUM(ce.quantity_delta) FILTER (WHERE ce.event_type = 'tap_flow'), 0) AS tap_change,
          COALESCE(SUM(ce.quantity_delta) FILTER (WHERE ce.event_type = 'receiving'), 0) AS receiving_change,
          COALESCE(SUM(ce.quantity_delta) FILTER (WHERE ce.event_type = 'transfer'), 0) AS transfer_change,
          COALESCE(SUM(ce.quantity_delta) FILTER (WHERE ce.event_type = 'manual_adjustment'), 0) AS adjustment_change
        FROM consumption_events ce
        JOIN last_counts lc ON lc.inventory_item_id = ce.inventory_item_id
        WHERE ce.location_id = ${locationId}::uuid
          AND ce.event_type != 'inventory_count_adjustment'
          AND ce.event_ts > lc.created_at
          AND ce.reversal_of_event_id IS NULL
        GROUP BY ce.inventory_item_id
      )
      SELECT
        i.id, i.name, i.base_uom,
        c.name AS category_name,
        c.id AS category_id,
        COALESCE(oh.total, 0) AS current_on_hand,
        lc.count_units,
        lc.gross_weight_grams,
        lc.created_at AS last_count_date,
        csc.net_change,
        csc.pos_change,
        csc.tap_change,
        csc.receiving_change,
        csc.transfer_change,
        csc.adjustment_change,
        au.avg_daily
      FROM inventory_items i
      LEFT JOIN inventory_item_categories c ON c.id = i.category_id
      LEFT JOIN on_hand oh ON oh.inventory_item_id = i.id
      LEFT JOIN last_counts lc ON lc.inventory_item_id = i.id
      LEFT JOIN avg_usage au ON au.inventory_item_id = i.id
      LEFT JOIN changes_since_count csc ON csc.inventory_item_id = i.id
      WHERE i.location_id = ${locationId}::uuid AND i.active = true
      ORDER BY i.name
    `);

    const now = new Date();

    return rows.map((row) => {
      const currentOnHand = Number(row.current_on_hand ?? 0);
      const lastCountValue = row.count_units != null
        ? Number(row.count_units)
        : row.gross_weight_grams != null
          ? Number(row.gross_weight_grams)
          : null;
      const lastCountDate = row.last_count_date;
      const daysSinceLastCount = lastCountDate
        ? Math.floor(
            (now.getTime() - new Date(lastCountDate).getTime()) /
              (24 * 60 * 60 * 1000)
          )
        : null;

      const posChangeSinceCount = Number(row.pos_change ?? 0);
      const tapFlowChangeSinceCount = Number(row.tap_change ?? 0);
      const receivingChangeSinceCount = Number(row.receiving_change ?? 0);
      const transferChangeSinceCount = Number(row.transfer_change ?? 0);
      const adjustmentChangeSinceCount = Number(row.adjustment_change ?? 0);
      const netChangeSinceCount = Number(row.net_change ?? 0);
      const posDepletionSinceCount = Math.abs(posChangeSinceCount);

      const predictedLevel =
        lastCountValue != null
          ? lastCountValue + netChangeSinceCount
          : null;

      const avgDailyUsage =
        row.avg_daily != null ? Number(row.avg_daily) : null;

      let daysToStockout: number | null = null;
      if (predictedLevel != null && avgDailyUsage != null && avgDailyUsage > 0) {
        daysToStockout = predictedLevel <= 0 ? 0 : Math.floor(predictedLevel / avgDailyUsage);
      }

      const hasDepletionData = posChangeSinceCount !== 0 || tapFlowChangeSinceCount !== 0;
      let confidence: "high" | "medium" | "low" = "low";
      if (predictedLevel != null && predictedLevel < 0) {
        confidence = "low";
      } else if (daysSinceLastCount != null && daysSinceLastCount <= 3 && hasDepletionData) {
        confidence = "high";
      } else if (
        daysSinceLastCount != null &&
        (daysSinceLastCount <= 7 || (daysSinceLastCount <= 14 && receivingChangeSinceCount > 0))
      ) {
        confidence = "medium";
      }

      const statusMap = { high: "green", medium: "yellow", low: "red" } as const;
      const status = statusMap[confidence];

      return {
        inventoryItemId: row.id,
        itemName: row.name,
        categoryName: row.category_name,
        categoryId: row.category_id,
        uom: row.base_uom,
        currentOnHand,
        lastCountValue,
        lastCountDate,
        daysSinceLastCount,
        posDepletionSinceCount,
        posChangeSinceCount,
        tapFlowChangeSinceCount,
        receivingChangeSinceCount,
        transferChangeSinceCount,
        adjustmentChangeSinceCount,
        netChangeSinceCount,
        predictedLevel,
        avgDailyUsage,
        daysToStockout,
        confidence,
        status,
      };
    });
  }

  async getUsageOverTime(
    locationId: string,
    fromDate: Date,
    toDate: Date,
    granularity: "day" | "week" | "month" = "day",
    categoryId?: string
  ) {
    const categoryFilter = categoryId
      ? Prisma.sql`AND i.category_id = ${categoryId}::uuid`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      Array<{
        bucket: Date;
        item_id: string;
        item_name: string;
        category_name: string | null;
        total_qty: number | null;
        total_cost: number | null;
      }>
    >(Prisma.sql`
      SELECT
        date_trunc(${granularity}, ce.event_ts) AS bucket,
        ce.inventory_item_id AS item_id,
        i.name AS item_name,
        c.name AS category_name,
        SUM(ABS(ce.quantity_delta)) AS total_qty,
        SUM(ABS(ce.quantity_delta) * COALESCE(ph.unit_cost, 0)) AS total_cost
      FROM consumption_events ce
      JOIN inventory_items i ON i.id = ce.inventory_item_id
      LEFT JOIN inventory_item_categories c ON c.id = i.category_id
      LEFT JOIN LATERAL (
        SELECT ph2.unit_cost
        FROM price_history ph2
        WHERE ph2.inventory_item_id = ce.inventory_item_id
          AND ph2.effective_from_ts <= ce.event_ts
          AND (ph2.effective_to_ts IS NULL OR ph2.effective_to_ts > ce.event_ts)
        ORDER BY ph2.effective_from_ts DESC
        LIMIT 1
      ) ph ON true
      WHERE ce.location_id = ${locationId}::uuid
        AND ce.event_type IN ('pos_sale', 'tap_flow')
        AND ce.event_ts >= ${fromDate}
        AND ce.event_ts < ${toDate}
        AND ce.reversal_of_event_id IS NULL
        ${categoryFilter}
      GROUP BY bucket, ce.inventory_item_id, i.name, c.name
      ORDER BY bucket
    `);

    // Aggregate totals per bucket
    const bucketMap = new Map<string, { period: string; totalQty: number; totalCost: number }>();
    // Track per-item totals for ranking
    const itemTotals = new Map<string, { itemId: string; itemName: string; categoryName: string | null; totalQty: number }>();
    // Per-item per-bucket data
    const itemBucketMap = new Map<string, Map<string, { qty: number; cost: number }>>();

    for (const row of rows) {
      const period = row.bucket.toISOString();
      const qty = Number(row.total_qty ?? 0);
      const cost = Number(row.total_cost ?? 0);

      // Aggregate bucket totals
      const existing = bucketMap.get(period);
      if (existing) {
        existing.totalQty += qty;
        existing.totalCost += cost;
      } else {
        bucketMap.set(period, { period, totalQty: qty, totalCost: cost });
      }

      // Track item totals
      const itemTotal = itemTotals.get(row.item_id);
      if (itemTotal) {
        itemTotal.totalQty += qty;
      } else {
        itemTotals.set(row.item_id, {
          itemId: row.item_id,
          itemName: row.item_name,
          categoryName: row.category_name,
          totalQty: qty,
        });
      }

      // Per-item per-bucket
      if (!itemBucketMap.has(row.item_id)) {
        itemBucketMap.set(row.item_id, new Map());
      }
      const bucketData = itemBucketMap.get(row.item_id)!;
      const eb = bucketData.get(period);
      if (eb) {
        eb.qty += qty;
        eb.cost += cost;
      } else {
        bucketData.set(period, { qty, cost });
      }
    }

    const buckets = Array.from(bucketMap.values()).sort(
      (a, b) => new Date(a.period).getTime() - new Date(b.period).getTime()
    );
    const allPeriods = buckets.map((b) => b.period);

    // Top 10 items by total quantity
    const ranked = Array.from(itemTotals.values()).sort((a, b) => b.totalQty - a.totalQty);
    const top10Ids = new Set(ranked.slice(0, 10).map((r) => r.itemId));

    const itemSeries = ranked.slice(0, 10).map((item) => {
      const bucketData = itemBucketMap.get(item.itemId)!;
      return {
        itemId: item.itemId,
        itemName: item.itemName,
        categoryName: item.categoryName,
        dataPoints: allPeriods.map((p) => {
          const d = bucketData.get(p);
          return { period: p, qty: d?.qty ?? 0, cost: d?.cost ?? 0 };
        }),
      };
    });

    // "Other" series for remaining items
    if (ranked.length > 10) {
      const otherDataPoints = allPeriods.map((p) => {
        let qty = 0;
        let cost = 0;
        for (const [itemId, bucketData] of itemBucketMap) {
          if (top10Ids.has(itemId)) continue;
          const d = bucketData.get(p);
          if (d) {
            qty += d.qty;
            cost += d.cost;
          }
        }
        return { period: p, qty, cost };
      });
      itemSeries.push({
        itemId: "__other__",
        itemName: "Other",
        categoryName: null,
        dataPoints: otherDataPoints,
      });
    }

    return { buckets, itemSeries };
  }

  async getRecipeAnalytics(
    locationId: string,
    fromDate: Date,
    toDate: Date,
    granularity: "day" | "week" | "month" = "day"
  ) {
    // Query A: Per-recipe, per-ingredient summary
    // Query B: Time-bucketed trend data
    const [summaryRows, trendRows] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          recipe_id: string;
          recipe_name: string;
          recipe_category: string | null;
          inventory_item_id: string;
          ingredient_name: string;
          servings: string;
          total_qty: string;
          total_cost: string;
        }>
      >(Prisma.sql`
        WITH recipe_events AS (
          SELECT
            ce.id AS event_id,
            ce.sales_line_id,
            ce.inventory_item_id,
            ce.quantity_delta,
            ce.event_ts,
            pim.recipe_id
          FROM consumption_events ce
          JOIN sales_lines sl ON sl.id = ce.sales_line_id
          JOIN pos_item_mappings pim
            ON pim.location_id = ce.location_id
            AND pim.source_system = sl.source_system
            AND pim.pos_item_id = sl.pos_item_id
            AND pim.mode = 'recipe'
            AND pim.active = true
            AND pim.effective_from_ts <= ce.event_ts
            AND (pim.effective_to_ts IS NULL OR pim.effective_to_ts > ce.event_ts)
          WHERE ce.location_id = ${locationId}::uuid
            AND ce.event_type = 'pos_sale'
            AND ce.event_ts >= ${fromDate}
            AND ce.event_ts < ${toDate}
            AND ce.reversal_of_event_id IS NULL
        )
        SELECT
          r.id AS recipe_id,
          r.name AS recipe_name,
          r.category AS recipe_category,
          re.inventory_item_id,
          i.name AS ingredient_name,
          COUNT(DISTINCT re.sales_line_id)::text AS servings,
          SUM(ABS(re.quantity_delta))::text AS total_qty,
          SUM(ABS(re.quantity_delta) * COALESCE(ph.unit_cost, 0))::text AS total_cost
        FROM recipe_events re
        JOIN recipes r ON r.id = re.recipe_id
        JOIN inventory_items i ON i.id = re.inventory_item_id
        LEFT JOIN LATERAL (
          SELECT ph2.unit_cost
          FROM price_history ph2
          WHERE ph2.inventory_item_id = re.inventory_item_id
            AND ph2.effective_from_ts <= re.event_ts
            AND (ph2.effective_to_ts IS NULL OR ph2.effective_to_ts > re.event_ts)
          ORDER BY ph2.effective_from_ts DESC
          LIMIT 1
        ) ph ON true
        GROUP BY r.id, r.name, r.category, re.inventory_item_id, i.name
        ORDER BY r.name, i.name
      `),

      this.prisma.$queryRaw<
        Array<{
          bucket: Date;
          recipe_id: string;
          recipe_name: string;
          servings: string;
          cost: string;
        }>
      >(Prisma.sql`
        WITH recipe_events AS (
          SELECT
            ce.id AS event_id,
            ce.sales_line_id,
            ce.quantity_delta,
            ce.event_ts,
            pim.recipe_id
          FROM consumption_events ce
          JOIN sales_lines sl ON sl.id = ce.sales_line_id
          JOIN pos_item_mappings pim
            ON pim.location_id = ce.location_id
            AND pim.source_system = sl.source_system
            AND pim.pos_item_id = sl.pos_item_id
            AND pim.mode = 'recipe'
            AND pim.active = true
            AND pim.effective_from_ts <= ce.event_ts
            AND (pim.effective_to_ts IS NULL OR pim.effective_to_ts > ce.event_ts)
          WHERE ce.location_id = ${locationId}::uuid
            AND ce.event_type = 'pos_sale'
            AND ce.event_ts >= ${fromDate}
            AND ce.event_ts < ${toDate}
            AND ce.reversal_of_event_id IS NULL
        )
        SELECT
          date_trunc(${granularity}, re.event_ts) AS bucket,
          r.id AS recipe_id,
          r.name AS recipe_name,
          COUNT(DISTINCT re.sales_line_id)::text AS servings,
          SUM(ABS(re.quantity_delta) * COALESCE(ph.unit_cost, 0))::text AS cost
        FROM recipe_events re
        JOIN recipes r ON r.id = re.recipe_id
        LEFT JOIN LATERAL (
          SELECT ph2.unit_cost
          FROM price_history ph2
          WHERE ph2.inventory_item_id = re.inventory_item_id
            AND ph2.effective_from_ts <= re.event_ts
            AND (ph2.effective_to_ts IS NULL OR ph2.effective_to_ts > re.event_ts)
          ORDER BY ph2.effective_from_ts DESC
          LIMIT 1
        ) ph ON true
        GROUP BY bucket, r.id, r.name
        ORDER BY bucket
      `),
    ]);

    // Post-process summary: aggregate per-recipe totals from ingredient rows
    const recipeMap = new Map<
      string,
      {
        recipeId: string;
        recipeName: string;
        recipeCategory: string | null;
        totalServings: number;
        totalCost: number;
      }
    >();

    const ingredientCostMap = new Map<
      string,
      { inventoryItemId: string; ingredientName: string; totalCost: number; totalQty: number }
    >();

    for (const row of summaryRows) {
      const cost = Number(row.total_cost);
      const qty = Number(row.total_qty);
      const servings = Number(row.servings);

      // Aggregate per recipe
      const existing = recipeMap.get(row.recipe_id);
      if (existing) {
        existing.totalCost += cost;
        // Servings is per-ingredient COUNT(DISTINCT sales_line_id), same across ingredients for a recipe
        // Use max to avoid double-counting
        if (servings > existing.totalServings) {
          existing.totalServings = servings;
        }
      } else {
        recipeMap.set(row.recipe_id, {
          recipeId: row.recipe_id,
          recipeName: row.recipe_name,
          recipeCategory: row.recipe_category,
          totalServings: servings,
          totalCost: cost,
        });
      }

      // Aggregate top ingredients by cost
      const ingExisting = ingredientCostMap.get(row.inventory_item_id);
      if (ingExisting) {
        ingExisting.totalCost += cost;
        ingExisting.totalQty += qty;
      } else {
        ingredientCostMap.set(row.inventory_item_id, {
          inventoryItemId: row.inventory_item_id,
          ingredientName: row.ingredient_name,
          totalCost: cost,
          totalQty: qty,
        });
      }
    }

    const recipes = Array.from(recipeMap.values());
    const totalRecipeCost = recipes.reduce((s, r) => s + r.totalCost, 0);
    const totalServings = recipes.reduce((s, r) => s + r.totalServings, 0);

    const recipesWithPct = recipes
      .map((r) => ({
        ...r,
        avgCostPerServing: r.totalServings > 0 ? r.totalCost / r.totalServings : 0,
        pctOfTotalCost: totalRecipeCost > 0 ? (r.totalCost / totalRecipeCost) * 100 : 0,
      }))
      .sort((a, b) => b.totalCost - a.totalCost);

    const topIngredients = Array.from(ingredientCostMap.values())
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 10);

    // Post-process trend: aggregate totals + per-recipe series
    const bucketMap = new Map<string, { period: string; totalServings: number; totalCost: number }>();
    const recipeTrendMap = new Map<string, { recipeId: string; recipeName: string; bucketData: Map<string, { servings: number; cost: number }> }>();
    const recipeTrendTotals = new Map<string, number>();

    for (const row of trendRows) {
      const period = row.bucket.toISOString();
      const servings = Number(row.servings);
      const cost = Number(row.cost);

      const existing = bucketMap.get(period);
      if (existing) {
        existing.totalServings += servings;
        existing.totalCost += cost;
      } else {
        bucketMap.set(period, { period, totalServings: servings, totalCost: cost });
      }

      if (!recipeTrendMap.has(row.recipe_id)) {
        recipeTrendMap.set(row.recipe_id, {
          recipeId: row.recipe_id,
          recipeName: row.recipe_name,
          bucketData: new Map(),
        });
      }
      recipeTrendMap.get(row.recipe_id)!.bucketData.set(period, { servings, cost });
      recipeTrendTotals.set(
        row.recipe_id,
        (recipeTrendTotals.get(row.recipe_id) ?? 0) + cost
      );
    }

    const trendBuckets = Array.from(bucketMap.values()).sort(
      (a, b) => new Date(a.period).getTime() - new Date(b.period).getTime()
    );
    const allPeriods = trendBuckets.map((b) => b.period);

    // Top 8 recipes by trend cost + "Other"
    const rankedRecipes = Array.from(recipeTrendTotals.entries())
      .sort((a, b) => b[1] - a[1]);
    const top8Ids = new Set(rankedRecipes.slice(0, 8).map(([id]) => id));

    const recipeSeries = rankedRecipes.slice(0, 8).map(([id]) => {
      const entry = recipeTrendMap.get(id)!;
      return {
        recipeId: entry.recipeId,
        recipeName: entry.recipeName,
        dataPoints: allPeriods.map((p) => {
          const d = entry.bucketData.get(p);
          return { period: p, servings: d?.servings ?? 0, cost: d?.cost ?? 0 };
        }),
      };
    });

    if (rankedRecipes.length > 8) {
      const otherDataPoints = allPeriods.map((p) => {
        let servings = 0;
        let cost = 0;
        for (const [id, entry] of recipeTrendMap) {
          if (top8Ids.has(id)) continue;
          const d = entry.bucketData.get(p);
          if (d) {
            servings += d.servings;
            cost += d.cost;
          }
        }
        return { period: p, servings, cost };
      });
      recipeSeries.push({
        recipeId: "__other__",
        recipeName: "Other",
        dataPoints: otherDataPoints,
      });
    }

    return {
      totalRecipesUsed: recipes.length,
      totalServings,
      totalRecipeCost,
      avgCostPerServing: totalServings > 0 ? totalRecipeCost / totalServings : 0,
      recipes: recipesWithPct,
      topIngredients,
      trendBuckets,
      recipeSeries,
    };
  }

  async getRecipeDetail(
    locationId: string,
    recipeId: string,
    fromDate: Date,
    toDate: Date
  ) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        inventory_item_id: string;
        ingredient_name: string;
        uom: string;
        quantity_per_serving: string | null;
        total_qty: string;
        total_cost: string;
        servings: string;
      }>
    >(Prisma.sql`
      WITH recipe_events AS (
        SELECT
          ce.id AS event_id,
          ce.sales_line_id,
          ce.inventory_item_id,
          ce.quantity_delta,
          ce.event_ts
        FROM consumption_events ce
        JOIN sales_lines sl ON sl.id = ce.sales_line_id
        JOIN pos_item_mappings pim
          ON pim.location_id = ce.location_id
          AND pim.source_system = sl.source_system
          AND pim.pos_item_id = sl.pos_item_id
          AND pim.mode = 'recipe'
          AND pim.recipe_id = ${recipeId}::uuid
          AND pim.active = true
          AND pim.effective_from_ts <= ce.event_ts
          AND (pim.effective_to_ts IS NULL OR pim.effective_to_ts > ce.event_ts)
        WHERE ce.location_id = ${locationId}::uuid
          AND ce.event_type = 'pos_sale'
          AND ce.event_ts >= ${fromDate}
          AND ce.event_ts < ${toDate}
          AND ce.reversal_of_event_id IS NULL
      )
      SELECT
        re.inventory_item_id,
        i.name AS ingredient_name,
        ri.uom,
        ri.quantity::text AS quantity_per_serving,
        SUM(ABS(re.quantity_delta))::text AS total_qty,
        SUM(ABS(re.quantity_delta) * COALESCE(ph.unit_cost, 0))::text AS total_cost,
        COUNT(DISTINCT re.sales_line_id)::text AS servings
      FROM recipe_events re
      JOIN inventory_items i ON i.id = re.inventory_item_id
      LEFT JOIN recipe_ingredients ri
        ON ri.recipe_id = ${recipeId}::uuid
        AND ri.inventory_item_id = re.inventory_item_id
      LEFT JOIN LATERAL (
        SELECT ph2.unit_cost
        FROM price_history ph2
        WHERE ph2.inventory_item_id = re.inventory_item_id
          AND ph2.effective_from_ts <= re.event_ts
          AND (ph2.effective_to_ts IS NULL OR ph2.effective_to_ts > re.event_ts)
        ORDER BY ph2.effective_from_ts DESC
        LIMIT 1
      ) ph ON true
      GROUP BY re.inventory_item_id, i.name, ri.uom, ri.quantity
      ORDER BY total_cost DESC
    `);

    const totalRecipeCost = rows.reduce((s, r) => s + Number(r.total_cost), 0);

    return {
      ingredients: rows.map((row) => {
        const totalCost = Number(row.total_cost);
        const totalQty = Number(row.total_qty);
        const servings = Number(row.servings);
        return {
          inventoryItemId: row.inventory_item_id,
          ingredientName: row.ingredient_name,
          uom: row.uom ?? "units",
          quantityPerServing: row.quantity_per_serving != null ? Number(row.quantity_per_serving) : null,
          totalQty,
          unitCost: totalQty > 0 ? totalCost / totalQty : 0,
          totalCost,
          pctOfRecipeCost: totalRecipeCost > 0 ? (totalCost / totalRecipeCost) * 100 : 0,
          servings,
        };
      }),
    };
  }

  async getUsageItemDetail(
    locationId: string,
    itemId: string,
    fromDate: Date,
    toDate: Date,
    granularity: "day" | "week" | "month" = "day"
  ) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        bucket: Date;
        total_qty: number | null;
        total_cost: number | null;
      }>
    >(Prisma.sql`
      SELECT
        date_trunc(${granularity}, ce.event_ts) AS bucket,
        SUM(ABS(ce.quantity_delta)) AS total_qty,
        SUM(ABS(ce.quantity_delta) * COALESCE(ph.unit_cost, 0)) AS total_cost
      FROM consumption_events ce
      LEFT JOIN LATERAL (
        SELECT ph2.unit_cost
        FROM price_history ph2
        WHERE ph2.inventory_item_id = ce.inventory_item_id
          AND ph2.effective_from_ts <= ce.event_ts
          AND (ph2.effective_to_ts IS NULL OR ph2.effective_to_ts > ce.event_ts)
        ORDER BY ph2.effective_from_ts DESC
        LIMIT 1
      ) ph ON true
      WHERE ce.location_id = ${locationId}::uuid
        AND ce.inventory_item_id = ${itemId}::uuid
        AND ce.event_type IN ('pos_sale', 'tap_flow')
        AND ce.event_ts >= ${fromDate}
        AND ce.event_ts < ${toDate}
        AND ce.reversal_of_event_id IS NULL
      GROUP BY bucket
      ORDER BY bucket
    `);

    return {
      periods: rows.map((r) => ({
        period: r.bucket.toISOString(),
        qty: Number(r.total_qty ?? 0),
        cost: Number(r.total_cost ?? 0),
      })),
    };
  }

  async getUsageByVendor(
    locationId: string,
    fromDate: Date,
    toDate: Date,
    granularity: "day" | "week" | "month" = "day",
    categoryId?: string
  ) {
    const categoryFilter = categoryId
      ? Prisma.sql`AND i.category_id = ${categoryId}::uuid`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      Array<{
        bucket: Date;
        vendor_id: string | null;
        vendor_name: string | null;
        total_qty: number | null;
        total_cost: number | null;
      }>
    >(Prisma.sql`
      SELECT
        date_trunc(${granularity}, ce.event_ts) AS bucket,
        v.id AS vendor_id,
        v.name AS vendor_name,
        SUM(ABS(ce.quantity_delta)) AS total_qty,
        SUM(ABS(ce.quantity_delta) * COALESCE(ph.unit_cost, 0)) AS total_cost
      FROM consumption_events ce
      JOIN inventory_items i ON i.id = ce.inventory_item_id
      LEFT JOIN vendors v ON v.id = i.vendor_id
      LEFT JOIN LATERAL (
        SELECT ph2.unit_cost
        FROM price_history ph2
        WHERE ph2.inventory_item_id = ce.inventory_item_id
          AND ph2.effective_from_ts <= ce.event_ts
          AND (ph2.effective_to_ts IS NULL OR ph2.effective_to_ts > ce.event_ts)
        ORDER BY ph2.effective_from_ts DESC
        LIMIT 1
      ) ph ON true
      WHERE ce.location_id = ${locationId}::uuid
        AND ce.event_type IN ('pos_sale', 'tap_flow')
        AND ce.event_ts >= ${fromDate}
        AND ce.event_ts < ${toDate}
        AND ce.reversal_of_event_id IS NULL
        ${categoryFilter}
      GROUP BY bucket, v.id, v.name
      ORDER BY bucket
    `);

    // Aggregate totals per bucket
    const bucketMap = new Map<string, { period: string; totalQty: number; totalCost: number }>();
    // Track per-vendor totals for ranking
    const vendorTotals = new Map<string, { vendorId: string; vendorName: string; totalCost: number }>();
    // Per-vendor per-bucket data
    const vendorBucketMap = new Map<string, Map<string, { qty: number; cost: number }>>();

    for (const row of rows) {
      const period = row.bucket.toISOString();
      const qty = Number(row.total_qty ?? 0);
      const cost = Number(row.total_cost ?? 0);
      const vendorId = row.vendor_id ?? "__no_vendor__";
      const vendorName = row.vendor_name ?? "No Vendor";

      // Aggregate bucket totals
      const existing = bucketMap.get(period);
      if (existing) {
        existing.totalQty += qty;
        existing.totalCost += cost;
      } else {
        bucketMap.set(period, { period, totalQty: qty, totalCost: cost });
      }

      // Track vendor totals
      const vt = vendorTotals.get(vendorId);
      if (vt) {
        vt.totalCost += cost;
      } else {
        vendorTotals.set(vendorId, { vendorId, vendorName, totalCost: cost });
      }

      // Per-vendor per-bucket
      if (!vendorBucketMap.has(vendorId)) {
        vendorBucketMap.set(vendorId, new Map());
      }
      const bd = vendorBucketMap.get(vendorId)!;
      const eb = bd.get(period);
      if (eb) {
        eb.qty += qty;
        eb.cost += cost;
      } else {
        bd.set(period, { qty, cost });
      }
    }

    const buckets = Array.from(bucketMap.values()).sort(
      (a, b) => new Date(a.period).getTime() - new Date(b.period).getTime()
    );
    const allPeriods = buckets.map((b) => b.period);

    // Top 10 vendors by totalCost + "Other" bucket
    const ranked = Array.from(vendorTotals.values()).sort((a, b) => b.totalCost - a.totalCost);
    const top10Ids = new Set(ranked.slice(0, 10).map((r) => r.vendorId));

    const vendorSeries = ranked.slice(0, 10).map((vendor) => {
      const bd = vendorBucketMap.get(vendor.vendorId)!;
      return {
        vendorId: vendor.vendorId,
        vendorName: vendor.vendorName,
        dataPoints: allPeriods.map((p) => {
          const d = bd.get(p);
          return { period: p, qty: d?.qty ?? 0, cost: d?.cost ?? 0 };
        }),
      };
    });

    if (ranked.length > 10) {
      const otherDataPoints = allPeriods.map((p) => {
        let qty = 0;
        let cost = 0;
        for (const [vendorId, bd] of vendorBucketMap) {
          if (top10Ids.has(vendorId)) continue;
          const d = bd.get(p);
          if (d) {
            qty += d.qty;
            cost += d.cost;
          }
        }
        return { period: p, qty, cost };
      });
      vendorSeries.push({
        vendorId: "__other__",
        vendorName: "Other",
        dataPoints: otherDataPoints,
      });
    }

    return { buckets, vendorSeries };
  }

  async getPourCost(locationId: string, fromDate: Date, toDate: Date) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        pos_item_id: string;
        pos_item_name: string;
        mapping_mode: string | null;
        recipe_id: string | null;
        recipe_name: string | null;
        total_sold: number;
        avg_sale_price: number | null;
        total_revenue: number | null;
        total_ingredient_cost: number;
        pour_cost_pct: number | null;
      }>
    >`
      WITH mapped_sales AS (
        SELECT
          sl.pos_item_id,
          sl.pos_item_name,
          m.mode::text as mapping_mode,
          m.recipe_id,
          r.name as recipe_name,
          SUM(sl.quantity)::float as total_sold,
          AVG(sl.unit_sale_price)::float as avg_sale_price,
          SUM(sl.unit_sale_price * sl.quantity)::float as total_revenue
        FROM sales_lines sl
        JOIN pos_item_mappings m
          ON m.location_id = sl.location_id
          AND m.source_system = sl.source_system
          AND m.pos_item_id = sl.pos_item_id
          AND m.active = true
        LEFT JOIN recipes r ON m.recipe_id = r.id
        WHERE sl.location_id = ${locationId}::uuid
          AND sl.sold_at >= ${fromDate}
          AND sl.sold_at < ${toDate}
          AND sl.unit_sale_price IS NOT NULL
        GROUP BY sl.pos_item_id, sl.pos_item_name, m.mode, m.recipe_id, r.name
      ),
      ingredient_costs AS (
        SELECT
          ms.pos_item_id,
          COALESCE(SUM(
            ABS(ce.quantity_delta) * COALESCE((
              SELECT ph.unit_cost::float
              FROM price_history ph
              WHERE ph.inventory_item_id = ce.inventory_item_id
                AND ph.effective_from_ts <= ce.event_ts
              ORDER BY ph.effective_from_ts DESC
              LIMIT 1
            ), 0)
          ), 0)::float as total_ingredient_cost
        FROM mapped_sales ms
        JOIN sales_lines sl2
          ON sl2.pos_item_id = ms.pos_item_id
          AND sl2.location_id = ${locationId}::uuid
          AND sl2.sold_at >= ${fromDate}
          AND sl2.sold_at < ${toDate}
        JOIN consumption_events ce
          ON ce.sales_line_id = sl2.id
          AND ce.reversal_of_event_id IS NULL
        GROUP BY ms.pos_item_id
      )
      SELECT
        ms.pos_item_id,
        ms.pos_item_name,
        ms.mapping_mode,
        ms.recipe_id,
        ms.recipe_name,
        ms.total_sold,
        ms.avg_sale_price,
        ms.total_revenue,
        COALESCE(ic.total_ingredient_cost, 0)::float as total_ingredient_cost,
        CASE WHEN ms.total_revenue > 0
          THEN (COALESCE(ic.total_ingredient_cost, 0) / ms.total_revenue * 100)::float
          ELSE NULL
        END as pour_cost_pct
      FROM mapped_sales ms
      LEFT JOIN ingredient_costs ic ON ic.pos_item_id = ms.pos_item_id
      ORDER BY pour_cost_pct DESC NULLS LAST
    `;

    const totalRevenue = rows.reduce((s, r) => s + (r.total_revenue ?? 0), 0);
    const totalCost = rows.reduce((s, r) => s + r.total_ingredient_cost, 0);
    const blendedPourCostPct = totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : null;

    return {
      items: rows.map((r) => ({
        posItemId: r.pos_item_id,
        posItemName: r.pos_item_name,
        mappingMode: r.mapping_mode,
        recipeId: r.recipe_id,
        recipeName: r.recipe_name,
        totalSold: r.total_sold,
        avgSalePrice: r.avg_sale_price,
        totalRevenue: r.total_revenue,
        totalIngredientCost: r.total_ingredient_cost,
        pourCostPct: r.pour_cost_pct,
      })),
      blendedPourCostPct,
      totalRevenue,
      totalIngredientCost: totalCost,
    };
  }

  async getPortfolioRollup(businessId: string, fromDate: Date, toDate: Date) {
    const locations = await this.prisma.location.findMany({
      where: { businessId, active: true },
    });

    const varianceService = new VarianceService(this.prisma);
    const parLevelService = new ParLevelService(this.prisma);

    const locationData = await Promise.all(
      locations.map(async (loc) => {
        const [onHand, cogs, variance, patterns, pourCost, coverageRows, parItems] =
          await Promise.all([
            this.getOnHandReport(loc.id),
            this.getCOGSReport(loc.id, fromDate, toDate),
            varianceService.calculateVarianceReport(loc.id, fromDate, toDate),
            varianceService.analyzeVariancePatterns(loc.id, 10),
            this.getPourCost(loc.id, fromDate, toDate),
            this.prisma.$queryRaw<
              Array<{ total_items: number; mapped_items: number }>
            >`
              SELECT
                COUNT(DISTINCT sl.pos_item_id)::int as total_items,
                COUNT(DISTINCT CASE WHEN pim.id IS NOT NULL THEN sl.pos_item_id END)::int as mapped_items
              FROM sales_lines sl
              LEFT JOIN pos_item_mappings pim
                ON pim.location_id = sl.location_id
                AND pim.source_system = sl.source_system
                AND pim.pos_item_id = sl.pos_item_id
                AND pim.active = true
              WHERE sl.location_id = ${loc.id}::uuid
                AND sl.sold_at >= NOW() - INTERVAL '7 days'
            `,
            parLevelService.list(loc.id),
          ]);

        const coverageRow = coverageRows[0] ?? { total_items: 0, mapped_items: 0 };
        const mappingCoveragePct =
          coverageRow.total_items > 0
            ? Math.round((coverageRow.mapped_items / coverageRow.total_items) * 100)
            : 100;

        const shrinkageSuspects = patterns.filter((p) => p.isShrinkageSuspect).length;
        const reorderCount = parItems.filter((i) => i.needsReorder).length;

        return {
          locationId: loc.id,
          locationName: loc.name,
          onHandValue: onHand.totalValue,
          onHandItems: onHand.totalItems,
          cogs7d: cogs.cogs,
          varianceImpact: variance.totalVarianceValue,
          shrinkageSuspects,
          pourCostPct: pourCost.blendedPourCostPct,
          mappingCoveragePct,
          reorderCount,
        };
      })
    );

    const totalOnHandValue = locationData.reduce((s, l) => s + l.onHandValue, 0);
    const totalCogs = locationData.reduce((s, l) => s + l.cogs7d, 0);
    const totalVarianceImpact = locationData.reduce((s, l) => s + l.varianceImpact, 0);
    const totalShrinkageSuspects = locationData.reduce((s, l) => s + l.shrinkageSuspects, 0);
    const totalReorderCount = locationData.reduce((s, l) => s + l.reorderCount, 0);

    const pourCostValues = locationData.filter((l) => l.pourCostPct != null);
    const avgPourCostPct =
      pourCostValues.length > 0
        ? pourCostValues.reduce((s, l) => s + (l.pourCostPct ?? 0), 0) / pourCostValues.length
        : null;

    const avgMappingCoveragePct =
      locationData.length > 0
        ? locationData.reduce((s, l) => s + l.mappingCoveragePct, 0) / locationData.length
        : 100;

    return {
      locations: locationData,
      totals: {
        totalLocations: locations.length,
        totalOnHandValue,
        totalCogs,
        totalVarianceImpact,
        totalShrinkageSuspects,
        avgPourCostPct,
        avgMappingCoveragePct,
        totalReorderCount,
      },
    };
  }

  async getForecastDashboard(locationId: string) {
    // 1. Query daily usage per item for last 56 days
    const rows = await this.prisma.$queryRaw<
      Array<{
        inventory_item_id: string;
        item_name: string;
        category_name: string | null;
        usage_date: Date;
        daily_qty: number | null;
        unit_cost: number | null;
      }>
    >(Prisma.sql`
      SELECT
        ce.inventory_item_id,
        i.name AS item_name,
        c.name AS category_name,
        date_trunc('day', ce.event_ts)::date AS usage_date,
        SUM(ABS(ce.quantity_delta)) AS daily_qty,
        AVG(COALESCE(ph.unit_cost, 0))::float AS unit_cost
      FROM consumption_events ce
      JOIN inventory_items i ON i.id = ce.inventory_item_id
      LEFT JOIN inventory_item_categories c ON c.id = i.category_id
      LEFT JOIN LATERAL (
        SELECT ph2.unit_cost
        FROM price_history ph2
        WHERE ph2.inventory_item_id = ce.inventory_item_id
          AND ph2.effective_from_ts <= ce.event_ts
          AND (ph2.effective_to_ts IS NULL OR ph2.effective_to_ts > ce.event_ts)
        ORDER BY ph2.effective_from_ts DESC
        LIMIT 1
      ) ph ON true
      WHERE ce.location_id = ${locationId}::uuid
        AND ce.event_type IN ('pos_sale', 'tap_flow')
        AND ce.event_ts >= NOW() - INTERVAL '56 days'
        AND ce.reversal_of_event_id IS NULL
      GROUP BY ce.inventory_item_id, i.name, c.name, usage_date
      ORDER BY ce.inventory_item_id, usage_date
    `);

    // Group by item
    const itemDataMap = new Map<
      string,
      {
        itemName: string;
        categoryName: string | null;
        unitCost: number;
        dailyUsage: Map<string, number>; // date string -> qty
      }
    >();

    for (const row of rows) {
      const id = row.inventory_item_id;
      if (!itemDataMap.has(id)) {
        itemDataMap.set(id, {
          itemName: row.item_name,
          categoryName: row.category_name,
          unitCost: Number(row.unit_cost ?? 0),
          dailyUsage: new Map(),
        });
      }
      const dateStr = new Date(row.usage_date).toISOString().split("T")[0]!;
      itemDataMap.get(id)!.dailyUsage.set(dateStr, Number(row.daily_qty ?? 0));
    }

    // Get expected on-hand + par levels
    const [expectedItems, parLevelService] = await Promise.all([
      this.getExpectedOnHandDashboard(locationId),
      Promise.resolve(new ParLevelService(this.prisma)),
    ]);
    const parItems = await parLevelService.list(locationId);

    const expectedMap = new Map(expectedItems.map((e) => [e.inventoryItemId, e]));
    const parMap = new Map(parItems.map((p) => [p.inventoryItemId, p]));

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekWeights = [0.30, 0.25, 0.20, 0.15, 0.04, 0.03, 0.02, 0.01];

    type ForecastItem = {
      inventoryItemId: string;
      itemName: string;
      categoryName: string | null;
      currentLevel: number | null;
      forecastDailyUsage: number;
      daysToStockout: number | null;
      reorderByDate: string | null;
      needsReorderSoon: boolean;
      projectedCogs7d: number;
      parLevel: number | null;
      minLevel: number | null;
      leadTimeDays: number | null;
    };

    const forecastItems: ForecastItem[] = [];
    let totalProjectedCogs = 0;
    let itemsNeedingReorder = 0;

    for (const [itemId, data] of itemDataMap) {
      // 2. Weekly totals (8 weeks)
      const weeklyTotals: number[] = [];
      for (let w = 0; w < 8; w++) {
        let weekTotal = 0;
        for (let d = 0; d < 7; d++) {
          const date = new Date(today);
          date.setDate(date.getDate() - (w * 7 + d + 1));
          const dateStr = date.toISOString().split("T")[0]!;
          weekTotal += data.dailyUsage.get(dateStr) ?? 0;
        }
        weeklyTotals.push(weekTotal);
      }

      // Check if we have enough data
      const weeksWithData = weeklyTotals.filter((w) => w > 0).length;

      let forecastDailyUsage: number;
      if (weeksWithData < 2) {
        // Simple average over all days with data
        const totalQty = Array.from(data.dailyUsage.values()).reduce((s, v) => s + v, 0);
        const daysWithData = data.dailyUsage.size;
        forecastDailyUsage = daysWithData > 0 ? totalQty / daysWithData : 0;
      } else {
        // Exponential-weighted weekly average
        let weightedSum = 0;
        let weightSum = 0;
        for (let w = 0; w < weeklyTotals.length; w++) {
          const weight = weekWeights[w] ?? 0.01;
          weightedSum += weeklyTotals[w]! * weight;
          weightSum += weight;
        }
        forecastDailyUsage = weightSum > 0 ? weightedSum / weightSum / 7 : 0;
      }

      // 3. Day-of-week ratios
      const dowTotals = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
      const dowCounts = [0, 0, 0, 0, 0, 0, 0];
      for (const [dateStr, qty] of data.dailyUsage) {
        const dow = new Date(dateStr + "T12:00:00").getDay();
        dowTotals[dow] += qty;
        dowCounts[dow] += 1;
      }
      const overallAvg = data.dailyUsage.size > 0
        ? Array.from(data.dailyUsage.values()).reduce((s, v) => s + v, 0) / data.dailyUsage.size
        : 1;
      const dowRatios = dowTotals.map((total, i) => {
        const avg = dowCounts[i]! > 0 ? total! / dowCounts[i]! : overallAvg;
        return overallAvg > 0 ? avg / overallAvg : 1;
      });

      // 4. Forecast next 30 days with DOW seasonality
      const forecast30d: number[] = [];
      for (let d = 0; d < 30; d++) {
        const futureDate = new Date(today);
        futureDate.setDate(futureDate.getDate() + d + 1);
        const dow = futureDate.getDay();
        forecast30d.push(forecastDailyUsage * (dowRatios[dow] ?? 1));
      }

      // 5. Reorder logic
      const expected = expectedMap.get(itemId);
      const par = parMap.get(itemId);
      const currentLevel = expected?.predictedLevel ?? null;
      const parLevel = par?.parLevel ?? null;
      const minLevel = par?.minLevel ?? null;
      const leadTimeDays = par?.leadTimeDays ?? null;

      let daysToStockout: number | null = null;
      let reorderByDate: string | null = null;
      let needsReorderSoon = false;

      if (currentLevel != null && forecastDailyUsage > 0) {
        // Walk forecast days until level hits 0
        let level = currentLevel;
        for (let d = 0; d < 30; d++) {
          level -= forecast30d[d]!;
          if (level <= 0) {
            daysToStockout = d + 1;
            break;
          }
        }
        if (daysToStockout == null && level > 0) {
          daysToStockout = forecastDailyUsage > 0
            ? Math.floor(currentLevel / forecastDailyUsage)
            : null;
        }

        // Reorder date logic
        if (minLevel != null) {
          let runningLevel = currentLevel;
          for (let d = 0; d < 30; d++) {
            runningLevel -= forecast30d[d]!;
            if (runningLevel <= minLevel) {
              const reorderDate = new Date(today);
              reorderDate.setDate(reorderDate.getDate() + d + 1 - (leadTimeDays ?? 0));
              reorderByDate = reorderDate.toISOString().split("T")[0]!;
              break;
            }
          }

          // Check if needs reorder soon (level after lead time < minLevel)
          const lt = leadTimeDays ?? 0;
          let levelAfterLead = currentLevel;
          for (let d = 0; d < Math.min(lt, 30); d++) {
            levelAfterLead -= forecast30d[d]!;
          }
          if (levelAfterLead < minLevel) {
            needsReorderSoon = true;
          }
        }
      } else if (currentLevel != null && currentLevel <= 0) {
        daysToStockout = 0;
        needsReorderSoon = minLevel != null;
      }

      // 6. Cost projection
      const projectedCogs7d = forecastDailyUsage * 7 * data.unitCost;
      totalProjectedCogs += projectedCogs7d;
      if (needsReorderSoon) itemsNeedingReorder++;

      forecastItems.push({
        inventoryItemId: itemId,
        itemName: data.itemName,
        categoryName: data.categoryName,
        currentLevel,
        forecastDailyUsage,
        daysToStockout,
        reorderByDate,
        needsReorderSoon,
        projectedCogs7d,
        parLevel,
        minLevel,
        leadTimeDays,
      });
    }

    // Sort: needs reorder first, then by days to stockout
    forecastItems.sort((a, b) => {
      if (a.needsReorderSoon !== b.needsReorderSoon) return a.needsReorderSoon ? -1 : 1;
      const aDays = a.daysToStockout ?? 999;
      const bDays = b.daysToStockout ?? 999;
      return aDays - bDays;
    });

    return {
      items: forecastItems,
      summary: {
        totalItems: forecastItems.length,
        itemsNeedingReorderSoon: itemsNeedingReorder,
        projectedCogs7d: totalProjectedCogs,
        avgForecastAccuracy: null as number | null,
      },
    };
  }

  async getForecastAccuracy(locationId: string, sessionCount = 5) {
    // Fetch last N closed sessions
    const sessions = await this.prisma.inventorySession.findMany({
      where: { locationId, endedTs: { not: null } },
      orderBy: { startedTs: "desc" },
      take: sessionCount,
      include: {
        lines: {
          include: {
            inventoryItem: { select: { id: true, name: true } },
          },
          take: 20,
        },
      },
    });

    if (sessions.length === 0) {
      return { avgAccuracy: null, sessions: [] };
    }

    const sessionResults: Array<{
      sessionId: string;
      startedTs: string;
      items: Array<{
        itemId: string;
        itemName: string;
        forecasted: number;
        actual: number;
        delta: number;
        accuracyPct: number;
      }>;
      avgAccuracy: number;
    }> = [];

    for (const session of sessions) {
      const itemResults: Array<{
        itemId: string;
        itemName: string;
        forecasted: number;
        actual: number;
        delta: number;
        accuracyPct: number;
      }> = [];

      for (const line of session.lines) {
        const actual =
          line.countUnits != null
            ? Number(line.countUnits)
            : line.grossWeightGrams != null
              ? Number(line.grossWeightGrams)
              : null;

        if (actual == null || actual === 0) continue;

        // Compute what we would have predicted: sum all consumption_events before session start
        const result = await this.prisma.consumptionEvent.aggregate({
          where: {
            inventoryItemId: line.inventoryItemId,
            locationId,
            eventTs: { lt: session.startedTs },
          },
          _sum: { quantityDelta: true },
        });

        const forecasted = Number(result._sum.quantityDelta ?? 0);
        const delta = forecasted - actual;
        const accuracyPct = Math.max(
          0,
          100 - (Math.abs(delta) / Math.abs(actual)) * 100
        );

        itemResults.push({
          itemId: line.inventoryItemId,
          itemName: line.inventoryItem.name,
          forecasted,
          actual,
          delta,
          accuracyPct,
        });
      }

      const avgAccuracy =
        itemResults.length > 0
          ? itemResults.reduce((s, i) => s + i.accuracyPct, 0) / itemResults.length
          : 0;

      sessionResults.push({
        sessionId: session.id,
        startedTs: session.startedTs.toISOString(),
        items: itemResults,
        avgAccuracy,
      });
    }

    const overallAvg =
      sessionResults.length > 0
        ? sessionResults.reduce((s, sr) => s + sr.avgAccuracy, 0) / sessionResults.length
        : null;

    return { avgAccuracy: overallAvg, sessions: sessionResults };
  }

  async getForecastItemDetail(locationId: string, itemId: string) {
    // 56 days historical + 30 days forecast
    const rows = await this.prisma.$queryRaw<
      Array<{
        usage_date: Date;
        daily_qty: number | null;
      }>
    >(Prisma.sql`
      SELECT
        date_trunc('day', ce.event_ts)::date AS usage_date,
        SUM(ABS(ce.quantity_delta)) AS daily_qty
      FROM consumption_events ce
      WHERE ce.location_id = ${locationId}::uuid
        AND ce.inventory_item_id = ${itemId}::uuid
        AND ce.event_type IN ('pos_sale', 'tap_flow')
        AND ce.event_ts >= NOW() - INTERVAL '56 days'
        AND ce.reversal_of_event_id IS NULL
      GROUP BY usage_date
      ORDER BY usage_date
    `);

    const dailyUsageMap = new Map<string, number>();
    for (const row of rows) {
      const dateStr = new Date(row.usage_date).toISOString().split("T")[0]!;
      dailyUsageMap.set(dateStr, Number(row.daily_qty ?? 0));
    }

    // Build complete historical array (56 days)
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const historical: Array<{ date: string; qty: number }> = [];
    for (let d = 55; d >= 0; d--) {
      const date = new Date(today);
      date.setDate(date.getDate() - d);
      const dateStr = date.toISOString().split("T")[0]!;
      historical.push({ date: dateStr, qty: dailyUsageMap.get(dateStr) ?? 0 });
    }

    // EWMA forecast
    const weekWeights = [0.30, 0.25, 0.20, 0.15, 0.04, 0.03, 0.02, 0.01];
    const weeklyTotals: number[] = [];
    for (let w = 0; w < 8; w++) {
      let weekTotal = 0;
      for (let d = 0; d < 7; d++) {
        const date = new Date(today);
        date.setDate(date.getDate() - (w * 7 + d + 1));
        const dateStr = date.toISOString().split("T")[0]!;
        weekTotal += dailyUsageMap.get(dateStr) ?? 0;
      }
      weeklyTotals.push(weekTotal);
    }

    const weeksWithData = weeklyTotals.filter((w) => w > 0).length;
    let forecastDailyUsage: number;
    if (weeksWithData < 2) {
      const totalQty = Array.from(dailyUsageMap.values()).reduce((s, v) => s + v, 0);
      forecastDailyUsage = dailyUsageMap.size > 0 ? totalQty / dailyUsageMap.size : 0;
    } else {
      let weightedSum = 0;
      let weightSum = 0;
      for (let w = 0; w < weeklyTotals.length; w++) {
        const weight = weekWeights[w] ?? 0.01;
        weightedSum += weeklyTotals[w]! * weight;
        weightSum += weight;
      }
      forecastDailyUsage = weightSum > 0 ? weightedSum / weightSum / 7 : 0;
    }

    // Day-of-week pattern
    const dowTotals = [0, 0, 0, 0, 0, 0, 0];
    const dowCounts = [0, 0, 0, 0, 0, 0, 0];
    for (const [dateStr, qty] of dailyUsageMap) {
      const dow = new Date(dateStr + "T12:00:00").getDay();
      dowTotals[dow] += qty;
      dowCounts[dow] += 1;
    }
    const overallAvg = dailyUsageMap.size > 0
      ? Array.from(dailyUsageMap.values()).reduce((s, v) => s + v, 0) / dailyUsageMap.size
      : 1;
    const dowPattern = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, i) => {
      const avg = dowCounts[i]! > 0 ? dowTotals[i]! / dowCounts[i]! : 0;
      const ratio = overallAvg > 0 ? avg / overallAvg : 1;
      return { day: label, avgUsage: avg, ratio };
    });

    // 30-day forecast
    const forecast: Array<{ date: string; qty: number }> = [];
    for (let d = 0; d < 30; d++) {
      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + d + 1);
      const dow = futureDate.getDay();
      const ratio = dowPattern[dow]?.ratio ?? 1;
      forecast.push({
        date: futureDate.toISOString().split("T")[0]!,
        qty: forecastDailyUsage * ratio,
      });
    }

    // Get par levels for reference lines
    const parLevelService = new ParLevelService(this.prisma);
    const parItems = await parLevelService.list(locationId);
    const par = parItems.find((p) => p.inventoryItemId === itemId);

    return {
      historical,
      forecast,
      dowPattern,
      forecastDailyUsage,
      parLevel: par?.parLevel ?? null,
      minLevel: par?.minLevel ?? null,
    };
  }

  async getBusinessRollup(businessId: string, asOfDate?: Date) {
    const locations = await this.prisma.location.findMany({
      where: { businessId },
    });

    const locationReports = await Promise.all(
      locations.map(async (loc) => {
        const onHand = await this.getOnHandReport(loc.id, asOfDate);
        return {
          locationId: loc.id,
          locationName: loc.name,
          totalItems: onHand.totalItems,
          totalValue: onHand.totalValue,
        };
      })
    );

    return {
      businessId,
      asOfDate: asOfDate ?? new Date(),
      locations: locationReports,
      businessTotals: {
        totalLocations: locations.length,
        totalValue: locationReports.reduce(
          (sum, l) => sum + l.totalValue,
          0
        ),
        totalItems: locationReports.reduce(
          (sum, l) => sum + l.totalItems,
          0
        ),
      },
    };
  }
}
