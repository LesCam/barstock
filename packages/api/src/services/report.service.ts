/**
 * Report Service
 * On-hand, usage, valuation, and org rollup reports
 */

import type { ExtendedPrismaClient } from "@barstock/database";
import { InventoryService } from "./inventory.service";

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
