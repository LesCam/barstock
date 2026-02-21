/**
 * Session Service
 * Manages inventory counting sessions and creates adjustment events
 *
 * Ported from: backend/app/services/session_service.py
 */

import { Prisma, type UomT } from "@prisma/client";
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

    // Aggregate multiple lines for the same item (e.g. weighed + unit count)
    const itemTotals = this.aggregateLinesByItem(session.lines);

    for (const [itemId, { total, item }] of itemTotals) {
      // Calculate theoretical on-hand from ledger
      const theoretical = await this.calculateTheoreticalOnHand(
        itemId,
        session.startedTs
      );

      const variance = total - theoretical;
      totalVariance += Math.abs(variance);

      // Check threshold (configurable, default 5 units)
      // Skip variance check on first count (no prior ledger data)
      const threshold = 5.0;

      if (theoretical !== 0 && Math.abs(variance) > threshold) {
        if (!(itemId in varianceReasons)) {
          requiresReasons.push(itemId);
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
            inventoryItemId: itemId,
            quantityDelta: new Prisma.Decimal(variance),
            uom: item.baseUom,
            confidenceLevel: "measured",
            varianceReason: varianceReasons[itemId] ?? null,
            notes: `Session ${sessionId} adjustment`,
          },
        });

        const variancePercent = theoretical !== 0
          ? (variance / theoretical) * 100
          : 0;
        const reason = varianceReasons[itemId] ?? null;

        adjustments.push({
          itemId,
          itemName: item.name,
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
              inventoryItemId: itemId,
              itemName: item.name,
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

  /**
   * Auto-close session at end of business day.
   * Uses session_expired as variance reason for all items — no threshold prompt.
   */
  async autoCloseSession(sessionId: string): Promise<SessionCloseResult> {
    const session = await this.prisma.inventorySession.findUnique({
      where: { id: sessionId },
      include: { lines: { include: { inventoryItem: true } } },
    });

    if (!session) throw new Error("Session not found");
    if (session.endedTs) throw new Error("Session already closed");

    let adjustmentsCreated = 0;
    let totalVariance = 0;
    const adjustments: AdjustmentDetail[] = [];
    const audit = new AuditService(this.prisma);

    const itemTotals = this.aggregateLinesByItem(session.lines);

    const location = await this.prisma.location.findUnique({
      where: { id: session.locationId },
      select: { businessId: true },
    });

    for (const [itemId, { total, item }] of itemTotals) {
      const theoretical = await this.calculateTheoreticalOnHand(
        itemId,
        session.startedTs
      );

      const variance = total - theoretical;
      totalVariance += Math.abs(variance);

      if (variance !== 0) {
        const event = await this.prisma.consumptionEvent.create({
          data: {
            locationId: session.locationId,
            eventType: "inventory_count_adjustment",
            sourceSystem: "manual",
            eventTs: new Date(),
            inventoryItemId: itemId,
            quantityDelta: new Prisma.Decimal(variance),
            uom: item.baseUom,
            confidenceLevel: "measured",
            varianceReason: "session_expired",
            notes: "Auto-closed at end of business day",
          },
        });

        const variancePercent = theoretical !== 0
          ? (variance / theoretical) * 100
          : 0;

        adjustments.push({
          itemId,
          itemName: item.name,
          variance,
          variancePercent,
          reason: "session_expired",
        });

        if (location) {
          await audit.log({
            businessId: location.businessId,
            actionType: "adjustment.created",
            objectType: "consumption_event",
            objectId: event.id,
            metadata: {
              inventoryItemId: itemId,
              itemName: item.name,
              variance,
              variancePercent,
              varianceReason: "session_expired",
              sessionId,
              autoClose: true,
            },
          });
        }

        adjustmentsCreated++;
      }
    }

    // Close session — closedBy = null indicates system close
    await this.prisma.inventorySession.update({
      where: { id: sessionId },
      data: { endedTs: new Date(), closedBy: null },
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

    const previewLines: Array<{
      inventoryItemId: string;
      itemName: string;
      countedValue: number;
      theoretical: number;
      variance: number;
      variancePercent: number;
      uom: string;
    }> = [];

    let itemsWithVariance = 0;

    // Aggregate multiple lines for the same item
    const itemTotals = this.aggregateLinesByItem(session.lines);

    for (const [itemId, { total, item }] of itemTotals) {
      const theoretical = await this.calculateTheoreticalOnHand(
        itemId,
        session.startedTs
      );
      const variance = total - theoretical;
      const variancePercent = theoretical !== 0
        ? (variance / theoretical) * 100
        : 0;

      if (variance !== 0) itemsWithVariance++;

      previewLines.push({
        inventoryItemId: itemId,
        itemName: item.name,
        countedValue: total,
        theoretical,
        variance,
        variancePercent,
        uom: item.baseUom,
      });
    }

    return {
      lines: previewLines,
      totalItems: itemTotals.size,
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

  /**
   * Aggregate multiple session lines for the same inventory item.
   * Sums the actual values so that e.g. a weighed line + a unit count line
   * for the same vodka produces one combined total.
   */
  private aggregateLinesByItem(
    lines: Array<{
      inventoryItemId: string;
      countUnits: Prisma.Decimal | null;
      derivedOz: Prisma.Decimal | null;
      inventoryItem: { name: string; baseUom: UomT };
    }>
  ): Map<string, { total: number; item: { name: string; baseUom: UomT } }> {
    const map = new Map<string, { total: number; item: { name: string; baseUom: UomT } }>();
    for (const line of lines) {
      const existing = map.get(line.inventoryItemId);
      const lineValue = this.getActualFromLine(line);
      if (existing) {
        existing.total += lineValue;
      } else {
        map.set(line.inventoryItemId, {
          total: lineValue,
          item: line.inventoryItem,
        });
      }
    }
    return map;
  }
}
