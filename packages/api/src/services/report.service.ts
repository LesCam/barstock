/**
 * Report Service
 * On-hand, usage, valuation, and org rollup reports
 */

import type { ExtendedPrismaClient } from "@barstock/database";
import { Prisma } from "@prisma/client";
import { InventoryService } from "./inventory.service";

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
