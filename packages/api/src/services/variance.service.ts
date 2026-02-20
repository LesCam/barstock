/**
 * Variance Service
 * Calculates and analyzes inventory variance
 *
 * Ported from: backend/app/services/variance_service.py
 */

import type { ExtendedPrismaClient } from "@barstock/database";

export interface VarianceTrendPoint {
  weekStart: string;
  sessionCount: number;
  totalVarianceUnits: number;
  adjustmentCount: number;
}

export interface VarianceHeatmapResult {
  dayTimeGrid: Array<{
    dayOfWeek: number;
    hour: number;
    totalVariance: number;
    eventCount: number;
  }>;
  staffBreakdown: Array<{
    userId: string;
    email: string;
    sessionsCounted: number;
    linesCounted: number;
    linesWithAdjustment: number;
  }>;
}

export interface VarianceReasonDistributionResult {
  reasons: Array<{
    reason: string | null;
    label: string;
    count: number;
    totalUnits: number;
  }>;
  totalAdjustments: number;
  withReason: number;
  withoutReason: number;
}

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

  async getVarianceTrend(
    locationId: string,
    weeksBack = 4
  ): Promise<VarianceTrendPoint[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        week_start: Date;
        session_count: bigint;
        total_variance_units: number | null;
        adjustment_count: bigint;
      }>
    >`
      SELECT
        date_trunc('week', s.ended_ts) AS week_start,
        COUNT(DISTINCT s.id) AS session_count,
        SUM(ABS(ce.quantity_delta)) AS total_variance_units,
        COUNT(ce.id) AS adjustment_count
      FROM inventory_sessions s
      JOIN consumption_events ce ON ce.location_id = s.location_id
        AND ce.event_type = 'inventory_count_adjustment'
        AND ce.event_ts BETWEEN s.started_ts AND s.ended_ts
      WHERE s.location_id = ${locationId}::uuid
        AND s.ended_ts IS NOT NULL
        AND s.ended_ts >= NOW() - (${weeksBack} || ' weeks')::INTERVAL
      GROUP BY week_start
      ORDER BY week_start
    `;

    return rows.map((r) => ({
      weekStart: r.week_start.toISOString(),
      sessionCount: Number(r.session_count),
      totalVarianceUnits: Number(r.total_variance_units ?? 0),
      adjustmentCount: Number(r.adjustment_count),
    }));
  }

  async getVarianceHeatmap(
    locationId: string,
    fromDate?: Date,
    toDate?: Date
  ): Promise<VarianceHeatmapResult> {
    // Day/time grid
    const dayTimeRows = await this.prisma.$queryRaw<
      Array<{
        day_of_week: number;
        hour: number;
        total_variance: number | null;
        event_count: bigint;
      }>
    >`
      SELECT
        EXTRACT(DOW FROM ce.event_ts)::int AS day_of_week,
        EXTRACT(HOUR FROM ce.event_ts)::int AS hour,
        SUM(ABS(ce.quantity_delta)) AS total_variance,
        COUNT(*) AS event_count
      FROM consumption_events ce
      WHERE ce.location_id = ${locationId}::uuid
        AND ce.event_type = 'inventory_count_adjustment'
        AND (${fromDate}::timestamptz IS NULL OR ce.event_ts >= ${fromDate}::timestamptz)
        AND (${toDate}::timestamptz IS NULL OR ce.event_ts < ${toDate}::timestamptz)
      GROUP BY day_of_week, hour
    `;

    // Staff breakdown
    const staffRows = await this.prisma.$queryRaw<
      Array<{
        user_id: string;
        email: string;
        sessions_counted: bigint;
        lines_counted: bigint;
        lines_with_adjustment: bigint;
      }>
    >`
      SELECT
        u.id AS user_id,
        u.email,
        COUNT(DISTINCT sl.session_id) AS sessions_counted,
        COUNT(sl.id) AS lines_counted,
        COUNT(CASE WHEN adj.id IS NOT NULL THEN 1 END) AS lines_with_adjustment
      FROM inventory_session_lines sl
      JOIN users u ON u.id = sl.counted_by
      JOIN inventory_sessions s ON s.id = sl.session_id
      LEFT JOIN consumption_events adj
        ON adj.inventory_item_id = sl.inventory_item_id
        AND adj.event_type = 'inventory_count_adjustment'
        AND adj.event_ts BETWEEN s.started_ts AND s.ended_ts
      WHERE s.location_id = ${locationId}::uuid
        AND s.ended_ts IS NOT NULL
        AND sl.counted_by IS NOT NULL
        AND (${fromDate}::timestamptz IS NULL OR s.ended_ts >= ${fromDate}::timestamptz)
        AND (${toDate}::timestamptz IS NULL OR s.ended_ts < ${toDate}::timestamptz)
      GROUP BY u.id, u.email
      ORDER BY lines_with_adjustment DESC
    `;

    return {
      dayTimeGrid: dayTimeRows.map((r) => ({
        dayOfWeek: r.day_of_week,
        hour: r.hour,
        totalVariance: Number(r.total_variance ?? 0),
        eventCount: Number(r.event_count),
      })),
      staffBreakdown: staffRows.map((r) => ({
        userId: r.user_id,
        email: r.email,
        sessionsCounted: Number(r.sessions_counted),
        linesCounted: Number(r.lines_counted),
        linesWithAdjustment: Number(r.lines_with_adjustment),
      })),
    };
  }

  private static REASON_LABELS: Record<string, string> = {
    waste_foam: "Waste/Foam",
    comp: "Comp",
    staff_drink: "Staff Drink",
    theft: "Theft/Shrinkage",
    breakage: "Breakage",
    line_cleaning: "Line Cleaning",
    transfer: "Transfer",
    unknown: "Unknown",
  };

  async getVarianceReasonDistribution(
    locationId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<VarianceReasonDistributionResult> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        variance_reason: string | null;
        count: bigint;
        total_units: number | null;
      }>
    >`
      SELECT
        variance_reason,
        COUNT(*) AS count,
        SUM(ABS(quantity_delta)) AS total_units
      FROM consumption_events
      WHERE location_id = ${locationId}::uuid
        AND event_type = 'inventory_count_adjustment'
        AND event_ts >= ${fromDate}::timestamptz
        AND event_ts < ${toDate}::timestamptz
      GROUP BY variance_reason
      ORDER BY count DESC
    `;

    let totalAdjustments = 0;
    let withReason = 0;
    let withoutReason = 0;

    const reasons = rows.map((r) => {
      const count = Number(r.count);
      totalAdjustments += count;
      if (r.variance_reason) {
        withReason += count;
      } else {
        withoutReason += count;
      }
      return {
        reason: r.variance_reason,
        label: r.variance_reason
          ? VarianceService.REASON_LABELS[r.variance_reason] ?? r.variance_reason
          : "No Reason",
        count,
        totalUnits: Number(r.total_units ?? 0),
      };
    });

    return { reasons, totalAdjustments, withReason, withoutReason };
  }
}
