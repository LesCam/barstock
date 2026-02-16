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
        eventType: "pos_sale",
      },
      include: { inventoryItem: true },
    });

    const usageMap = new Map<
      string,
      { itemId: string; name: string; quantityUsed: number; uom: string }
    >();

    for (const event of events) {
      const key = event.inventoryItemId;
      const existing = usageMap.get(key);
      if (existing) {
        existing.quantityUsed += Math.abs(Number(event.quantityDelta));
      } else {
        usageMap.set(key, {
          itemId: event.inventoryItemId,
          name: event.inventoryItem.name,
          quantityUsed: Math.abs(Number(event.quantityDelta)),
          uom: event.uom,
        });
      }
    }

    const sessions = await this.prisma.inventorySession.count({
      where: {
        locationId,
        startedTs: { gte: fromDate, lt: toDate },
      },
    });

    return {
      locationId,
      fromDate,
      toDate,
      items: Array.from(usageMap.values()),
      totalSessions: sessions,
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
