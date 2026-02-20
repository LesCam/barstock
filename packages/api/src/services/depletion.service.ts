/**
 * Depletion Engine Service
 * Converts canonical SalesLine records into ConsumptionEvents
 *
 * CORE of the inventory system:
 * - POS-agnostic: only consumes canonical SalesLine records
 * - Creates immutable ConsumptionEvents in the ledger
 * - Handles voids/refunds via reversal events
 * - Uses mappings to determine how to deplete inventory
 *
 * Ported from: backend/app/services/depletion_service.py
 */

import { Prisma, UomT } from "@prisma/client";
import type { ExtendedPrismaClient } from "@barstock/database";

export interface DepletionStats {
  processed: number;
  created: number;
  unmapped: number;
  skipped: number;
}

export class DepletionEngine {
  constructor(private prisma: ExtendedPrismaClient) {}

  /**
   * Process all sales lines in a time window
   */
  async processSalesLines(
    locationId: string,
    fromTs: Date,
    toTs: Date
  ): Promise<DepletionStats> {
    const stats: DepletionStats = {
      processed: 0,
      created: 0,
      unmapped: 0,
      skipped: 0,
    };

    const salesLines = await this.prisma.salesLine.findMany({
      where: {
        locationId,
        soldAt: { gte: fromTs, lt: toTs },
      },
    });

    for (const salesLine of salesLines) {
      // Skip if already depleted
      const existing = await this.prisma.consumptionEvent.findFirst({
        where: { salesLineId: salesLine.id },
      });

      if (existing) {
        stats.skipped++;
        continue;
      }

      stats.processed++;

      // Get active mapping for this POS item
      const mapping = await this.getActiveMapping(
        locationId,
        salesLine.sourceSystem,
        salesLine.posItemId,
        salesLine.soldAt
      );

      if (!mapping) {
        stats.unmapped++;
        continue;
      }

      const eventsCreated = await this.createConsumptionEvents(
        salesLine,
        mapping
      );
      stats.created += eventsCreated;
    }

    return stats;
  }

  private async getActiveMapping(
    locationId: string,
    sourceSystem: string,
    posItemId: string,
    asOfDate: Date
  ) {
    return this.prisma.pOSItemMapping.findFirst({
      where: {
        locationId,
        sourceSystem: sourceSystem as any,
        posItemId,
        active: true,
        effectiveFromTs: { lte: asOfDate },
        OR: [
          { effectiveToTs: null },
          { effectiveToTs: { gt: asOfDate } },
        ],
      },
      include: {
        recipe: { include: { ingredients: true } },
      },
    });
  }

  private async createConsumptionEvents(
    salesLine: Awaited<ReturnType<ExtendedPrismaClient["salesLine"]["findFirst"]>> & {},
    mapping: Awaited<ReturnType<ExtendedPrismaClient["pOSItemMapping"]["findFirst"]>> & {}
  ): Promise<number> {
    // Handle voids/refunds
    if (salesLine.isVoided || salesLine.isRefunded) {
      return this.createReversalEvent(salesLine, mapping);
    }

    switch (mapping.mode) {
      case "packaged_unit":
        return this.depletePackaged(salesLine, mapping);
      case "draft_by_tap":
        return this.depleteDraftByTap(salesLine, mapping);
      case "recipe":
        return this.depleteByRecipe(salesLine, mapping);
      case "draft_by_product":
        // Not recommended — draft_by_tap preferred
        return 0;
      default:
        return 0;
    }
  }

  /**
   * Deplete packaged inventory (bottles, cans, cases)
   */
  private async depletePackaged(
    salesLine: any,
    mapping: any
  ): Promise<number> {
    await this.prisma.consumptionEvent.create({
      data: {
        locationId: salesLine.locationId,
        eventType: "pos_sale",
        sourceSystem: salesLine.sourceSystem,
        eventTs: salesLine.soldAt,
        inventoryItemId: mapping.inventoryItemId,
        receiptId: salesLine.receiptId,
        salesLineId: salesLine.id,
        quantityDelta: new Prisma.Decimal(-Number(salesLine.quantity)),
        uom: "units",
        confidenceLevel: "theoretical",
        notes: `POS sale: ${salesLine.posItemName}`,
      },
    });
    return 1;
  }

  /**
   * Deplete draft beer by tap line
   * Requires pour profile + active tap assignment at sold_at time
   */
  private async depleteDraftByTap(
    salesLine: any,
    mapping: any
  ): Promise<number> {
    if (!mapping.pourProfileId) return 0;

    const pourProfile = await this.prisma.pourProfile.findUnique({
      where: { id: mapping.pourProfileId },
    });
    if (!pourProfile) return 0;

    const ozDepleted =
      Number(salesLine.quantity) * Number(pourProfile.oz);

    // Get active tap assignment at sale time
    let tapAssignment = null;
    if (mapping.tapLineId) {
      tapAssignment = await this.prisma.tapAssignment.findFirst({
        where: {
          tapLineId: mapping.tapLineId,
          effectiveStartTs: { lte: salesLine.soldAt },
          OR: [
            { effectiveEndTs: null },
            { effectiveEndTs: { gt: salesLine.soldAt } },
          ],
        },
      });
    }

    if (!tapAssignment) return 0;

    await this.prisma.consumptionEvent.create({
      data: {
        locationId: salesLine.locationId,
        eventType: "pos_sale",
        sourceSystem: salesLine.sourceSystem,
        eventTs: salesLine.soldAt,
        inventoryItemId: mapping.inventoryItemId,
        kegInstanceId: tapAssignment.kegInstanceId,
        tapLineId: mapping.tapLineId,
        receiptId: salesLine.receiptId,
        salesLineId: salesLine.id,
        quantityDelta: new Prisma.Decimal(-ozDepleted),
        uom: "oz",
        confidenceLevel: "theoretical",
        notes: `Draft sale: ${salesLine.posItemName}, ${pourProfile.name}`,
      },
    });
    return 1;
  }

  /**
   * Deplete multiple inventory items per recipe ingredients
   */
  private async depleteByRecipe(
    salesLine: any,
    mapping: any
  ): Promise<number> {
    const recipe = mapping.recipe;
    if (!recipe || !recipe.ingredients?.length) return 0;

    const events = recipe.ingredients.map((ing: any) => ({
      locationId: salesLine.locationId,
      eventType: "pos_sale" as const,
      sourceSystem: salesLine.sourceSystem,
      eventTs: salesLine.soldAt,
      inventoryItemId: ing.inventoryItemId,
      receiptId: salesLine.receiptId,
      salesLineId: salesLine.id,
      quantityDelta: new Prisma.Decimal(
        -Number(ing.quantity) * Number(salesLine.quantity)
      ),
      uom: ing.uom,
      confidenceLevel: "theoretical" as const,
      notes: `Recipe sale: ${salesLine.posItemName} (${recipe.name})`,
    }));

    await this.prisma.consumptionEvent.createMany({ data: events });
    return events.length;
  }

  /**
   * Create reversal event for voided/refunded sale
   * Positive quantity reverses the original depletion
   */
  private async createReversalEvent(
    salesLine: any,
    mapping: any
  ): Promise<number> {
    // Recipe mode: one positive reversal per ingredient
    if (mapping.mode === "recipe") {
      const recipe = mapping.recipe;
      if (!recipe || !recipe.ingredients?.length) return 0;

      const events = recipe.ingredients.map((ing: any) => ({
        locationId: salesLine.locationId,
        eventType: "pos_sale" as const,
        sourceSystem: salesLine.sourceSystem,
        eventTs: salesLine.soldAt,
        inventoryItemId: ing.inventoryItemId,
        receiptId: salesLine.receiptId,
        salesLineId: salesLine.id,
        quantityDelta: new Prisma.Decimal(
          Number(ing.quantity) * Number(salesLine.quantity)
        ),
        uom: ing.uom,
        confidenceLevel: "theoretical" as const,
        notes: `Void/Refund reversal: ${salesLine.posItemName} (${recipe.name})`,
      }));

      await this.prisma.consumptionEvent.createMany({ data: events });
      return events.length;
    }

    let quantity: number;
    let uom: "units" | "oz";

    if (mapping.mode === "packaged_unit") {
      quantity = Number(salesLine.quantity);
      uom = "units";
    } else {
      const pourProfile = mapping.pourProfileId
        ? await this.prisma.pourProfile.findUnique({
            where: { id: mapping.pourProfileId },
          })
        : null;
      quantity =
        Number(salesLine.quantity) *
        (pourProfile ? Number(pourProfile.oz) : 16);
      uom = "oz";
    }

    await this.prisma.consumptionEvent.create({
      data: {
        locationId: salesLine.locationId,
        eventType: "pos_sale",
        sourceSystem: salesLine.sourceSystem,
        eventTs: salesLine.soldAt,
        inventoryItemId: mapping.inventoryItemId,
        receiptId: salesLine.receiptId,
        salesLineId: salesLine.id,
        quantityDelta: new Prisma.Decimal(quantity), // POSITIVE = reversal
        uom,
        confidenceLevel: "theoretical",
        notes: `Void/Refund reversal: ${salesLine.posItemName}`,
      },
    });
    return 1;
  }

  /**
   * Correct an event via reversal + replacement pattern
   * Returns [reversalId, replacementId]
   */
  async correctEvent(
    originalEventId: string,
    newQuantityDelta: number,
    newUom: UomT,
    reason: string
  ): Promise<[string, string]> {
    const original = await this.prisma.consumptionEvent.findUnique({
      where: { id: originalEventId },
    });

    if (!original) throw new Error(`Event ${originalEventId} not found`);

    const reversal = await this.prisma.consumptionEvent.create({
      data: {
        locationId: original.locationId,
        eventType: original.eventType,
        sourceSystem: "manual",
        eventTs: new Date(),
        inventoryItemId: original.inventoryItemId,
        kegInstanceId: original.kegInstanceId,
        tapLineId: original.tapLineId,
        quantityDelta: new Prisma.Decimal(
          -Number(original.quantityDelta)
        ),
        uom: original.uom,
        confidenceLevel: "estimated",
        reversalOfEventId: originalEventId,
        notes: `Correction reversal: ${reason}`,
      },
    });

    const replacement = await this.prisma.consumptionEvent.create({
      data: {
        locationId: original.locationId,
        eventType: original.eventType,
        sourceSystem: "manual",
        eventTs: new Date(),
        inventoryItemId: original.inventoryItemId,
        kegInstanceId: original.kegInstanceId,
        tapLineId: original.tapLineId,
        quantityDelta: new Prisma.Decimal(newQuantityDelta),
        uom: newUom,
        confidenceLevel: "estimated",
        notes: `Correction replacement: ${reason}`,
      },
    });

    return [reversal.id, replacement.id];
  }
}
