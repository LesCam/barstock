/**
 * Analytics Service
 * Anomaly detection, POS-depletion ratio analysis, and variance forecasting
 */

import type { ExtendedPrismaClient } from "@barstock/database";
import { Prisma } from "@prisma/client";
import { VarianceService } from "./variance.service";

export interface UsageAnomaly {
  inventoryItemId: string;
  itemName: string;
  categoryName: string | null;
  currentWeekUsage: number;
  rollingMean: number;
  stdDev: number;
  zScore: number;
  type: "usage_spike" | "usage_drop";
  dowAnomalies: Array<{
    dayOfWeek: string;
    usage: number;
    dowAverage: number;
    ratio: number;
  }>;
}

export interface PosDepletionRatio {
  inventoryItemId: string;
  itemName: string;
  categoryName: string | null;
  posDepletion: number;
  actualDepletion: number;
  ratio: number;
  flag: "potential_theft_waste" | "potential_mapping_error" | null;
}

export interface VarianceForecast {
  inventoryItemId: string;
  itemName: string;
  categoryName: string | null;
  sessionsWithData: number;
  predictedVariance: number;
  confidenceLow: number;
  confidenceHigh: number;
  trend: "worsening" | "improving" | "stable";
}

export interface AnalyticsSummary {
  anomalyCount: number;
  depletionMismatchCount: number;
  varianceForecastRiskCount: number;
  overallRiskScore: number;
  topConcerns: Array<{
    itemName: string;
    type: string;
    detail: string;
    severity: "critical" | "warning" | "info";
  }>;
}

export class AnalyticsService {
  constructor(private prisma: ExtendedPrismaClient) {}

  async getUsageAnomalies(locationId: string): Promise<UsageAnomaly[]> {
    // Pull 12 weeks (84 days) of daily usage from consumption_events
    const rows = await this.prisma.$queryRaw<
      Array<{
        inventory_item_id: string;
        item_name: string;
        category_name: string | null;
        usage_date: Date;
        daily_qty: number | null;
      }>
    >(Prisma.sql`
      SELECT
        ce.inventory_item_id,
        i.name AS item_name,
        c.name AS category_name,
        date_trunc('day', ce.event_ts)::date AS usage_date,
        SUM(ABS(ce.quantity_delta)) AS daily_qty
      FROM consumption_events ce
      JOIN inventory_items i ON i.id = ce.inventory_item_id
      LEFT JOIN inventory_item_categories c ON c.id = i.category_id
      WHERE ce.location_id = ${locationId}::uuid
        AND ce.event_type IN ('pos_sale', 'tap_flow')
        AND ce.event_ts >= NOW() - INTERVAL '84 days'
        AND ce.reversal_of_event_id IS NULL
      GROUP BY ce.inventory_item_id, i.name, c.name, usage_date
      ORDER BY ce.inventory_item_id, usage_date
    `);

    // Group by item
    const itemDataMap = new Map<
      string,
      {
        itemName: string;
        categoryName: string | null;
        dailyUsage: Map<string, number>;
      }
    >();

    for (const row of rows) {
      const id = row.inventory_item_id;
      if (!itemDataMap.has(id)) {
        itemDataMap.set(id, {
          itemName: row.item_name,
          categoryName: row.category_name,
          dailyUsage: new Map(),
        });
      }
      const dateStr = new Date(row.usage_date).toISOString().split("T")[0]!;
      itemDataMap.get(id)!.dailyUsage.set(dateStr, Number(row.daily_qty ?? 0));
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const anomalies: UsageAnomaly[] = [];
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    for (const [itemId, data] of itemDataMap) {
      // Compute weekly totals (12 weeks)
      const weeklyTotals: number[] = [];
      for (let w = 0; w < 12; w++) {
        let weekTotal = 0;
        for (let d = 0; d < 7; d++) {
          const date = new Date(today);
          date.setDate(date.getDate() - (w * 7 + d + 1));
          const dateStr = date.toISOString().split("T")[0]!;
          weekTotal += data.dailyUsage.get(dateStr) ?? 0;
        }
        weeklyTotals.push(weekTotal);
      }

      const currentWeekUsage = weeklyTotals[0] ?? 0;
      // Rolling history = weeks 1-11 (excluding current week)
      const history = weeklyTotals.slice(1);
      if (history.length < 3) continue; // Need at least 3 weeks of history

      const mean = history.reduce((s, v) => s + v, 0) / history.length;
      const variance =
        history.reduce((s, v) => s + (v - mean) ** 2, 0) / history.length;
      const stdDev = Math.sqrt(variance);

      if (stdDev < 0.01) continue; // Skip items with no variation

      const zScore = (currentWeekUsage - mean) / stdDev;

      if (Math.abs(zScore) <= 2) continue;

      // DOW anomaly detection
      const dowTotals = [0, 0, 0, 0, 0, 0, 0];
      const dowCounts = [0, 0, 0, 0, 0, 0, 0];
      for (const [dateStr, qty] of data.dailyUsage) {
        const dow = new Date(dateStr + "T12:00:00").getDay();
        dowTotals[dow]! += qty;
        dowCounts[dow]! += 1;
      }
      const dowAverages = dowTotals.map((total, i) =>
        dowCounts[i]! > 0 ? total! / dowCounts[i]! : 0
      );

      // Check current week's days against DOW averages
      const dowAnomalies: UsageAnomaly["dowAnomalies"] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(today);
        date.setDate(date.getDate() - d - 1);
        const dateStr = date.toISOString().split("T")[0]!;
        const usage = data.dailyUsage.get(dateStr) ?? 0;
        const dow = date.getDay();
        const dowAvg = dowAverages[dow] ?? 0;
        if (dowAvg > 0 && usage > 2.5 * dowAvg) {
          dowAnomalies.push({
            dayOfWeek: dayNames[dow]!,
            usage,
            dowAverage: dowAvg,
            ratio: usage / dowAvg,
          });
        }
      }

      anomalies.push({
        inventoryItemId: itemId,
        itemName: data.itemName,
        categoryName: data.categoryName,
        currentWeekUsage,
        rollingMean: mean,
        stdDev,
        zScore,
        type: zScore > 0 ? "usage_spike" : "usage_drop",
        dowAnomalies,
      });
    }

    // Sort by absolute z-score descending
    anomalies.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
    return anomalies;
  }

  async getPosDepletionRatios(locationId: string): Promise<PosDepletionRatio[]> {
    // For each item over last 14 days: POS depletion vs total depletion
    const rows = await this.prisma.$queryRaw<
      Array<{
        inventory_item_id: string;
        item_name: string;
        category_name: string | null;
        pos_depletion: number | null;
        total_depletion: number | null;
      }>
    >(Prisma.sql`
      SELECT
        ce.inventory_item_id,
        i.name AS item_name,
        c.name AS category_name,
        COALESCE(SUM(ABS(ce.quantity_delta)) FILTER (WHERE ce.event_type = 'pos_sale'), 0) AS pos_depletion,
        COALESCE(SUM(ABS(ce.quantity_delta)), 0) AS total_depletion
      FROM consumption_events ce
      JOIN inventory_items i ON i.id = ce.inventory_item_id
      LEFT JOIN inventory_item_categories c ON c.id = i.category_id
      WHERE ce.location_id = ${locationId}::uuid
        AND ce.event_type IN ('pos_sale', 'tap_flow', 'manual_adjustment')
        AND ce.quantity_delta < 0
        AND ce.event_ts >= NOW() - INTERVAL '14 days'
        AND ce.reversal_of_event_id IS NULL
      GROUP BY ce.inventory_item_id, i.name, c.name
      HAVING COALESCE(SUM(ABS(ce.quantity_delta)) FILTER (WHERE ce.event_type = 'pos_sale'), 0) > 0
    `);

    const results: PosDepletionRatio[] = [];
    for (const row of rows) {
      const posDepletion = Number(row.pos_depletion ?? 0);
      const actualDepletion = Number(row.total_depletion ?? 0);
      if (posDepletion === 0) continue;

      const ratio = actualDepletion / posDepletion;
      let flag: PosDepletionRatio["flag"] = null;
      if (ratio > 1.3) flag = "potential_theft_waste";
      else if (ratio < 0.7) flag = "potential_mapping_error";

      results.push({
        inventoryItemId: row.inventory_item_id,
        itemName: row.item_name,
        categoryName: row.category_name,
        posDepletion,
        actualDepletion,
        ratio,
        flag,
      });
    }

    // Sort by ratio descending (worst mismatches first)
    results.sort((a, b) => Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1));
    return results;
  }

  async getVarianceForecasts(locationId: string): Promise<VarianceForecast[]> {
    const varianceService = new VarianceService(this.prisma);
    const patterns = await varianceService.analyzeVariancePatterns(locationId, 10);

    // For each item with enough data, apply EWMA to predict next variance
    const ewmaWeights = [0.30, 0.25, 0.20, 0.15, 0.04, 0.03, 0.02, 0.01];
    const forecasts: VarianceForecast[] = [];

    // Need per-session variance values — re-fetch sessions
    const sessions = await this.prisma.inventorySession.findMany({
      where: { locationId, endedTs: { not: null } },
      orderBy: { startedTs: "desc" },
      take: 10,
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

    if (sessions.length < 3) return [];

    // Compute per-item variance per session
    const itemSessionVariances = new Map<
      string,
      {
        itemName: string;
        categoryName: string | null;
        variances: number[]; // newest first
      }
    >();

    // Get theoretical on-hand for each session's items
    for (const session of sessions) {
      const itemIds = session.lines.map((l) => l.inventoryItemId);
      if (itemIds.length === 0) continue;

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

        if (!itemSessionVariances.has(line.inventoryItemId)) {
          itemSessionVariances.set(line.inventoryItemId, {
            itemName: line.inventoryItem.name,
            categoryName: line.inventoryItem.category?.name ?? null,
            variances: [],
          });
        }
        const entry = itemSessionVariances.get(line.inventoryItemId)!;
        // Only keep one variance per item per session (last wins)
        if (entry.variances.length < sessions.indexOf(session) + 1) {
          entry.variances.push(variance);
        }
      }
    }

    for (const [itemId, data] of itemSessionVariances) {
      if (data.variances.length < 3) continue;

      // EWMA prediction
      let weightedSum = 0;
      let weightSum = 0;
      for (let i = 0; i < data.variances.length; i++) {
        const weight = ewmaWeights[i] ?? 0.01;
        weightedSum += data.variances[i]! * weight;
        weightSum += weight;
      }
      const predictedVariance = weightSum > 0 ? weightedSum / weightSum : 0;

      // Compute std dev of variance values
      const mean =
        data.variances.reduce((s, v) => s + v, 0) / data.variances.length;
      const varianceOfVariance =
        data.variances.reduce((s, v) => s + (v - mean) ** 2, 0) /
        data.variances.length;
      const stdDev = Math.sqrt(varianceOfVariance);

      const confidenceLow = predictedVariance - 1.5 * stdDev;
      const confidenceHigh = predictedVariance + 1.5 * stdDev;

      // Trend: first half vs second half (chronological order)
      const chronological = [...data.variances].reverse();
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
      const diff = secondAvg - firstAvg;
      const trend: VarianceForecast["trend"] =
        diff < -0.5 ? "worsening" : diff > 0.5 ? "improving" : "stable";

      forecasts.push({
        inventoryItemId: itemId,
        itemName: data.itemName,
        categoryName: data.categoryName,
        sessionsWithData: data.variances.length,
        predictedVariance,
        confidenceLow,
        confidenceHigh,
        trend,
      });
    }

    // Sort by predicted variance ascending (worst first)
    forecasts.sort((a, b) => a.predictedVariance - b.predictedVariance);
    return forecasts;
  }

  async getAnalyticsSummary(locationId: string): Promise<AnalyticsSummary> {
    const [anomalies, ratios, forecasts] = await Promise.all([
      this.getUsageAnomalies(locationId),
      this.getPosDepletionRatios(locationId),
      this.getVarianceForecasts(locationId),
    ]);

    const anomalyCount = anomalies.length;
    const depletionMismatchCount = ratios.filter((r) => r.flag !== null).length;
    const varianceForecastRiskCount = forecasts.filter(
      (f) => f.predictedVariance < -5
    ).length;

    // Risk score: weighted composite (0-100)
    const anomalyScore = Math.min(anomalyCount * 10, 30);
    const mismatchScore = Math.min(depletionMismatchCount * 15, 40);
    const forecastScore = Math.min(varianceForecastRiskCount * 10, 30);
    const overallRiskScore = Math.min(
      anomalyScore + mismatchScore + forecastScore,
      100
    );

    // Top concerns: merge and sort by severity
    const topConcerns: AnalyticsSummary["topConcerns"] = [];

    for (const a of anomalies.slice(0, 3)) {
      topConcerns.push({
        itemName: a.itemName,
        type: a.type,
        detail: `${Math.abs(a.zScore).toFixed(1)} std devs ${a.type === "usage_spike" ? "above" : "below"} normal`,
        severity: Math.abs(a.zScore) > 3 ? "critical" : "warning",
      });
    }

    for (const r of ratios.filter((r) => r.flag !== null).slice(0, 3)) {
      topConcerns.push({
        itemName: r.itemName,
        type: r.flag!,
        detail: `${r.ratio.toFixed(1)}x depletion ratio`,
        severity: r.ratio > 2 ? "critical" : "warning",
      });
    }

    for (const f of forecasts
      .filter((f) => f.predictedVariance < -5)
      .slice(0, 3)) {
      topConcerns.push({
        itemName: f.itemName,
        type: "variance_forecast",
        detail: `Predicted ${f.predictedVariance.toFixed(1)} variance`,
        severity: f.predictedVariance < -15 ? "critical" : "warning",
      });
    }

    // Sort: critical first, then warning
    topConcerns.sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    });

    return {
      anomalyCount,
      depletionMismatchCount,
      varianceForecastRiskCount,
      overallRiskScore,
      topConcerns: topConcerns.slice(0, 8),
    };
  }
}
