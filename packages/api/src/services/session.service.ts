/**
 * Session Service
 * Manages inventory counting sessions and creates adjustment events
 *
 * Ported from: backend/app/services/session_service.py
 */

import { Prisma } from "@prisma/client";
import type { ExtendedPrismaClient } from "@barstock/database";
import type { VarianceReason } from "@barstock/types";

export interface SessionCloseResult {
  sessionId: string;
  adjustmentsCreated: number;
  totalVariance: number;
  requiresReasons: string[];
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
        await this.prisma.consumptionEvent.create({
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
    };
  }

  private async calculateTheoreticalOnHand(
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

  private getActualFromLine(line: {
    countUnits: Prisma.Decimal | null;
    derivedOz: Prisma.Decimal | null;
  }): number {
    if (line.countUnits !== null) return Number(line.countUnits);
    if (line.derivedOz !== null) return Number(line.derivedOz);
    return 0;
  }
}
