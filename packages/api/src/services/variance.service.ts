/**
 * Variance Service
 * Calculates and analyzes inventory variance
 *
 * Ported from: backend/app/services/variance_service.py
 */

import type { ExtendedPrismaClient } from "@barstock/database";

export interface VariancePatternItem {
  inventoryItemId: string;
  itemName: string;
  categoryName: string | null;
  sessionsAppeared: number;
  sessionsWithVariance: number;
  avgVariance: number;
  trend: "worsening" | "improving" | "stable";
  totalEstimatedLoss: number;
  isShrinkageSuspect: boolean;
}

export interface VarianceItem {
  inventoryItemId: string;
  itemName: string;
  categoryName: string | null;
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
        category: { select: { name: true } },
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
        categoryName: item.category?.name ?? null,
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

  async analyzeVariancePatterns(
    locationId: string,
    sessionCount = 10
  ): Promise<VariancePatternItem[]> {
    // 1. Fetch last N closed sessions
    const sessions = await this.prisma.inventorySession.findMany({
      where: { locationId, endedTs: { not: null } },
      orderBy: { startedTs: "desc" },
      take: sessionCount,
      include: {
        lines: {
          include: {
            inventoryItem: {
              include: { category: { select: { name: true } } },
            },
          },
        },
      },
    });

    if (sessions.length < 2) return [];

    // 2. For each session, compute variance per item
    // variance = counted - theoretical on-hand at session start
    type SessionVariance = Map<string, number>; // itemId -> variance
    const sessionVariances: SessionVariance[] = [];

    // Item metadata
    const itemMeta = new Map<
      string,
      { name: string; categoryName: string | null }
    >();

    for (const session of sessions) {
      const variances: SessionVariance = new Map();

      // Get theoretical on-hand at session start by summing all consumption_events up to that point
      const itemIds = session.lines.map((l) => l.inventoryItemId);
      if (itemIds.length === 0) {
        sessionVariances.push(variances);
        continue;
      }

      // Batch query theoretical on-hand for all items in this session
      const theoreticalResults = await this.prisma.consumptionEvent.groupBy({
        by: ["inventoryItemId"],
        where: {
          locationId,
          inventoryItemId: { in: itemIds },
          eventTs: { lt: session.startedTs },
        },
        _sum: { quantityDelta: true },
      });

      const theoreticalMap = new Map(
        theoreticalResults.map((r) => [
          r.inventoryItemId,
          Number(r._sum.quantityDelta ?? 0),
        ])
      );

      for (const line of session.lines) {
        const counted =
          line.countUnits != null
            ? Number(line.countUnits)
            : line.grossWeightGrams != null
              ? Number(line.grossWeightGrams)
              : null;

        if (counted == null) continue;

        const theoretical = theoreticalMap.get(line.inventoryItemId) ?? 0;
        const variance = counted - theoretical;

        // If multiple lines per item in same session, use last one
        variances.set(line.inventoryItemId, variance);

        if (!itemMeta.has(line.inventoryItemId)) {
          itemMeta.set(line.inventoryItemId, {
            name: line.inventoryItem.name,
            categoryName: line.inventoryItem.category?.name ?? null,
          });
        }
      }

      sessionVariances.push(variances);
    }

    // 3. Aggregate per item across sessions
    const results: VariancePatternItem[] = [];

    for (const [itemId, meta] of itemMeta) {
      const varianceValues: number[] = [];

      for (const sv of sessionVariances) {
        const v = sv.get(itemId);
        if (v !== undefined) {
          varianceValues.push(v);
        }
      }

      if (varianceValues.length === 0) continue;

      const sessionsAppeared = varianceValues.length;
      const sessionsWithVariance = varianceValues.filter(
        (v) => Math.abs(v) > 0.01
      ).length;
      const avgVariance =
        varianceValues.reduce((s, v) => s + v, 0) / varianceValues.length;

      // Trend: compare first-half vs second-half average
      // Sessions are ordered newest-first, so reverse for chronological
      const chronological = [...varianceValues].reverse();
      const mid = Math.floor(chronological.length / 2);
      const firstHalf = chronological.slice(0, mid);
      const secondHalf = chronological.slice(mid);

      const firstAvg =
        firstHalf.length > 0
          ? firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length
          : 0;
      const secondAvg =
        secondHalf.length > 0
          ? secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length
          : 0;

      let trend: "worsening" | "improving" | "stable" = "stable";
      const diff = secondAvg - firstAvg;
      if (diff < -0.5) {
        trend = "worsening";
      } else if (diff > 0.5) {
        trend = "improving";
      }

      const totalEstimatedLoss = varianceValues
        .filter((v) => v < 0)
        .reduce((s, v) => s + v, 0);

      const negativeCount = varianceValues.filter((v) => v < -0.01).length;
      const isShrinkageSuspect =
        sessionsAppeared >= 3 &&
        avgVariance < 0 &&
        negativeCount / sessionsAppeared > 0.5;

      results.push({
        inventoryItemId: itemId,
        itemName: meta.name,
        categoryName: meta.categoryName,
        sessionsAppeared,
        sessionsWithVariance,
        avgVariance,
        trend,
        totalEstimatedLoss,
        isShrinkageSuspect,
      });
    }

    // Default sort: avg variance ascending (worst first)
    results.sort((a, b) => a.avgVariance - b.avgVariance);

    return results;
  }
}
