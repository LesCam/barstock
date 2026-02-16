/**
 * Variance Service
 * Calculates and analyzes inventory variance
 *
 * Ported from: backend/app/services/variance_service.py
 */

import type { ExtendedPrismaClient } from "@barstock/database";

export interface VarianceItem {
  inventoryItemId: string;
  itemName: string;
  theoretical: number;
  actual: number;
  variance: number;
  variancePercent: number;
  uom: string;
  unitCost: number | null;
  valueImpact: number | null;
}

export interface VarianceReport {
  locationId: string;
  fromDate: Date;
  toDate: Date;
  items: VarianceItem[];
  totalVarianceValue: number;
}

export class VarianceService {
  constructor(private prisma: ExtendedPrismaClient) {}

  /**
   * Generate variance report for a location in a time window
   */
  async calculateVarianceReport(
    locationId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<VarianceReport> {
    const items: VarianceItem[] = [];
    let totalVarianceValue = 0;

    const inventoryItems = await this.prisma.inventoryItem.findMany({
      where: { locationId, active: true },
      include: {
        priceHistory: {
          where: {
            effectiveFromTs: { lte: toDate },
            OR: [
              { effectiveToTs: null },
              { effectiveToTs: { gt: toDate } },
            ],
          },
          orderBy: { effectiveFromTs: "desc" },
          take: 1,
        },
      },
    });

    for (const item of inventoryItems) {
      // Theoretical: from POS depletion
      const theoreticalResult =
        await this.prisma.consumptionEvent.aggregate({
          where: {
            inventoryItemId: item.id,
            eventTs: { gte: fromDate, lt: toDate },
            eventType: "pos_sale",
          },
          _sum: { quantityDelta: true },
        });
      const theoretical = Number(
        theoreticalResult._sum.quantityDelta ?? 0
      );

      // Adjustments: from count adjustments
      const adjustmentResult =
        await this.prisma.consumptionEvent.aggregate({
          where: {
            inventoryItemId: item.id,
            eventTs: { gte: fromDate, lt: toDate },
            eventType: "inventory_count_adjustment",
          },
          _sum: { quantityDelta: true },
        });
      const adjustments = Number(
        adjustmentResult._sum.quantityDelta ?? 0
      );

      const actual = theoretical + adjustments;
      const variance = actual - theoretical;
      const variancePercent =
        theoretical !== 0
          ? (variance / Math.abs(theoretical)) * 100
          : 0;

      const currentPrice = item.priceHistory[0]
        ? Number(item.priceHistory[0].unitCost)
        : null;
      const valueImpact =
        currentPrice !== null ? variance * currentPrice : null;

      if (valueImpact !== null) {
        totalVarianceValue += Math.abs(valueImpact);
      }

      items.push({
        inventoryItemId: item.id,
        itemName: item.name,
        theoretical: Math.abs(theoretical),
        actual: Math.abs(actual),
        variance,
        variancePercent,
        uom: item.baseUom,
        unitCost: currentPrice,
        valueImpact,
      });
    }

    return {
      locationId,
      fromDate,
      toDate,
      items,
      totalVarianceValue,
    };
  }
}
