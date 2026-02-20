/**
 * Session Service
 * Manages inventory counting sessions and creates adjustment events
 *
 * Ported from: backend/app/services/session_service.py
 */

import { Prisma } from "@prisma/client";
import type { ExtendedPrismaClient } from "@barstock/database";
import type { VarianceReason } from "@barstock/types";
import { AuditService } from "./audit.service";

export interface AdjustmentDetail {
  itemId: string;
  itemName: string;
  variance: number;
  variancePercent: number;
  reason: string | null;
}

export interface SessionCloseResult {
  sessionId: string;
  adjustmentsCreated: number;
  totalVariance: number;
  requiresReasons: string[];
  adjustments: AdjustmentDetail[];
}

export class SessionService {
  constructor(private prisma: ExtendedPrismaClient) {}

  /**
   * Close inventory session and create adjustment events
   */
  async closeSession(
    sessionId: string,
    varianceReasons: Record<string, VarianceReason>
  ): Promise<SessionCloseResult> {
    const session = await this.prisma.inventorySession.findUnique({
      where: { id: sessionId },
      include: { lines: { include: { inventoryItem: true } } },
    });

    if (!session) throw new Error("Session not found");
    if (session.endedTs) throw new Error("Session already closed");

    let adjustmentsCreated = 0;
    let totalVariance = 0;
    const requiresReasons: string[] = [];
    const adjustments: AdjustmentDetail[] = [];
    const audit = new AuditService(this.prisma);

    for (const line of session.lines) {
      // Calculate theoretical on-hand from ledger
      const theoretical = await this.calculateTheoreticalOnHand(
        line.inventoryItemId,
        session.startedTs
      );

      // Get actual count from session line
      const actual = this.getActualFromLine(line);

      const variance = actual - theoretical;
      totalVariance += Math.abs(variance);

      // Check threshold (configurable, default 5 units)
      // Skip variance check on first count (no prior ledger data)
      const threshold = 5.0;

      if (theoretical !== 0 && Math.abs(variance) > threshold) {
        if (!(line.inventoryItemId in varianceReasons)) {
          requiresReasons.push(line.inventoryItemId);
          continue;
        }
      }

      // Create adjustment event if variance exists
      if (variance !== 0) {
        const event = await this.prisma.consumptionEvent.create({
          data: {
            locationId: session.locationId,
            eventType: "inventory_count_adjustment",
            sourceSystem: "manual",
            eventTs: new Date(),
            inventoryItemId: line.inventoryItemId,
            quantityDelta: new Prisma.Decimal(variance),
            uom: line.inventoryItem.baseUom,
            confidenceLevel: "measured",
            varianceReason: varianceReasons[line.inventoryItemId] ?? null,
            notes: `Session ${sessionId} adjustment`,
          },
        });

        const variancePercent = theoretical !== 0
          ? (variance / theoretical) * 100
          : 0;
        const reason = varianceReasons[line.inventoryItemId] ?? null;

        adjustments.push({
          itemId: line.inventoryItemId,
          itemName: line.inventoryItem.name,
          variance,
          variancePercent,
          reason,
        });

        // Look up the business for this session's location
        const location = await this.prisma.location.findUnique({
          where: { id: session.locationId },
          select: { businessId: true },
        });

        if (location) {
          await audit.log({
            businessId: location.businessId,
            actionType: "adjustment.created",
            objectType: "consumption_event",
            objectId: event.id,
            metadata: {
              inventoryItemId: line.inventoryItemId,
              itemName: line.inventoryItem.name,
              variance,
              variancePercent,
              varianceReason: reason,
              sessionId,
            },
          });
        }

        adjustmentsCreated++;
      }
    }

    if (requiresReasons.length > 0) {
      throw new Error(
        `Variance reasons required for items: ${requiresReasons.join(", ")}`
      );
    }

    // Close session
    await this.prisma.inventorySession.update({
      where: { id: sessionId },
      data: { endedTs: new Date() },
    });

    return {
      sessionId,
      adjustmentsCreated,
      totalVariance,
      requiresReasons: [],
      adjustments,
    };
  }

  async calculateTheoreticalOnHand(
    itemId: string,
    asOf: Date
  ): Promise<number> {
    const result = await this.prisma.consumptionEvent.aggregate({
      where: {
        inventoryItemId: itemId,
        eventTs: { lte: asOf },
      },
      _sum: { quantityDelta: true },
    });
    return Number(result._sum.quantityDelta ?? 0);
  }

  /**
   * Preview session close — read-only variance calculation without creating events
   */
  async previewClose(sessionId: string) {
    const session = await this.prisma.inventorySession.findUnique({
      where: { id: sessionId },
      include: { lines: { include: { inventoryItem: true } } },
    });

    if (!session) throw new Error("Session not found");

    const lines: Array<{
      inventoryItemId: string;
      itemName: string;
      countedValue: number;
      theoretical: number;
      variance: number;
      variancePercent: number;
      uom: string;
    }> = [];

    let itemsWithVariance = 0;

    for (const line of session.lines) {
      const theoretical = await this.calculateTheoreticalOnHand(
        line.inventoryItemId,
        session.startedTs
      );
      const actual = this.getActualFromLine(line);
      const variance = actual - theoretical;
      const variancePercent = theoretical !== 0
        ? (variance / theoretical) * 100
        : 0;

      if (variance !== 0) itemsWithVariance++;

      lines.push({
        inventoryItemId: line.inventoryItemId,
        itemName: line.inventoryItem.name,
        countedValue: actual,
        theoretical,
        variance,
        variancePercent,
        uom: line.inventoryItem.baseUom,
      });
    }

    return {
      lines,
      totalItems: session.lines.length,
      itemsWithVariance,
    };
  }

  private getActualFromLine(line: {
    countUnits: Prisma.Decimal | null;
    derivedOz: Prisma.Decimal | null;
  }): number {
    if (line.countUnits !== null) return Number(line.countUnits);
    if (line.derivedOz !== null) return Number(line.derivedOz);
    return 0;
  }
}
