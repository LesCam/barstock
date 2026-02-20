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
  predictedLevel: number | null;
  avgDailyUsage: number | null;
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
        pos_depletion_since_count: string | null;
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
          AND event_type = 'pos_sale'
          AND event_ts >= NOW() - INTERVAL '30 days'
        GROUP BY inventory_item_id
      ),
      depletion_since AS (
        SELECT ce.inventory_item_id, ABS(SUM(ce.quantity_delta)) AS depleted
        FROM consumption_events ce
        JOIN last_counts lc ON lc.inventory_item_id = ce.inventory_item_id
        WHERE ce.location_id = ${locationId}::uuid
          AND ce.event_type = 'pos_sale'
          AND ce.event_ts > lc.created_at
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
        COALESCE(dsc.depleted, 0) AS pos_depletion_since_count,
        au.avg_daily
      FROM inventory_items i
      LEFT JOIN inventory_item_categories c ON c.id = i.category_id
      LEFT JOIN on_hand oh ON oh.inventory_item_id = i.id
      LEFT JOIN last_counts lc ON lc.inventory_item_id = i.id
      LEFT JOIN avg_usage au ON au.inventory_item_id = i.id
      LEFT JOIN depletion_since dsc ON dsc.inventory_item_id = i.id
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
      const posDepletionSinceCount = Number(
        row.pos_depletion_since_count ?? 0
      );
      const predictedLevel =
        lastCountValue != null
          ? Math.max(0, lastCountValue - posDepletionSinceCount)
          : null;
      const avgDailyUsage =
        row.avg_daily != null ? Number(row.avg_daily) : null;

      let status: "green" | "yellow" | "red" = "green";
      if (daysSinceLastCount == null || daysSinceLastCount > 14) {
        status = "red";
      } else if (daysSinceLastCount > 7) {
        status = "yellow";
      }
      if (
        predictedLevel != null &&
        lastCountValue != null &&
        lastCountValue - posDepletionSinceCount < 0
      ) {
        status = "red";
      }

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
        predictedLevel,
        avgDailyUsage,
        status,
      };
    });
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
