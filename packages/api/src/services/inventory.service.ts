/**
 * Inventory Service
 * Calculates on-hand inventory from the immutable ledger
 *
 * Ported from: backend/app/services/inventory_service.py
 */

import { Prisma } from "@prisma/client";
import type { ExtendedPrismaClient } from "@barstock/database";

interface OnHandItem {
  inventoryItemId: string;
  itemName: string;
  quantity: number;
  uom: string;
  unitCost: number | null;
  totalValue: number | null;
  asOfDate: Date;
}

export class InventoryService {
  constructor(private prisma: ExtendedPrismaClient) {}

  /**
   * Calculate on-hand inventory for all active items at a location
   */
  async calculateOnHand(
    locationId: string,
    asOf: Date = new Date()
  ): Promise<OnHandItem[]> {
    const items = await this.prisma.inventoryItem.findMany({
      where: { locationId, active: true },
      include: {
        priceHistory: {
          where: {
            effectiveFromTs: { lte: asOf },
            OR: [
              { effectiveToTs: null },
              { effectiveToTs: { gt: asOf } },
            ],
          },
          orderBy: { effectiveFromTs: "desc" },
          take: 1,
        },
      },
    });

    const results: OnHandItem[] = [];

    for (const item of items) {
      // Sum all consumption events for this item up to asOf
      const aggregate = await this.prisma.consumptionEvent.aggregate({
        where: {
          inventoryItemId: item.id,
          eventTs: { lte: asOf },
        },
        _sum: { quantityDelta: true },
      });

      const onHand = Number(aggregate._sum.quantityDelta ?? 0);
      const currentPrice = item.priceHistory[0]
        ? Number(item.priceHistory[0].unitCost)
        : null;

      results.push({
        inventoryItemId: item.id,
        itemName: item.name,
        quantity: onHand,
        uom: item.baseUom,
        unitCost: currentPrice,
        totalValue:
          currentPrice !== null ? onHand * currentPrice : null,
        asOfDate: asOf,
      });
    }

    return results;
  }
}
