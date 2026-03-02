/**
 * Analytics Service
 * Anomaly detection, POS-depletion ratio analysis, variance forecasting,
 * cross-tenant portfolio analytics, and predictive pattern detection
 */

import type { ExtendedPrismaClient } from "@barstock/database";
import { Prisma } from "@prisma/client";
import { VarianceService } from "./variance.service";
import { ReportService } from "./report.service";

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

// ─── Cross-Tenant / Portfolio Types ─────────────────────────

export interface PortfolioAnomalySummary {
  totals: {
    anomalyCount: number;
    depletionMismatchCount: number;
    varianceForecastRiskCount: number;
    portfolioRiskScore: number;
  };
  locations: Array<{
    locationId: string;
    locationName: string;
    anomalyCount: number;
    depletionMismatchCount: number;
    varianceForecastRiskCount: number;
    riskScore: number;
  }>;
  topConcerns: Array<{
    itemName: string;
    locationName: string;
    type: string;
    detail: string;
    severity: "critical" | "warning" | "info";
  }>;
}

export interface LocationHealthScore {
  locationId: string;
  locationName: string;
  countFrequencyDays: number | null;
  mappingCoveragePct: number;
  varianceTrend: "improving" | "stable" | "worsening";
  avgCoverageDays: number | null;
  overallHealthScore: number;
}

export interface LocationRadarData {
  locationId: string;
  locationName: string;
  axes: {
    onHandValue: number;
    cogs7d: number;
    varianceImpact: number;
    pourCostPct: number;
    mappingCoveragePct: number;
    countFrequencyDays: number;
  };
}

// ─── Predictive Analytics Types ─────────────────────────────

export interface ScaleWeightAnomaly {
  inventoryItemId: string;
  itemName: string;
  emptyWeight: number | null;
  fullWeight: number | null;
  avgWeight: number;
  stddevWeight: number;
  measurementCount: number;
  latestWeight: number;
  zScore: number;
  flag: "overweight" | "underweight" | "out_of_range" | null;
}

export interface DepletionCorrelation {
  inventoryItemId: string;
  itemName: string;
  categoryName: string | null;
  pearsonR: number;
  avgDailyOffset: number;
  offsetTrend: "increasing" | "decreasing" | "stable";
  flag: "low_correlation" | "systematic_offset" | "negative_correlation" | null;
  totalPosDays: number;
  totalDays: number;
}

export interface AnomalyCluster {
  clusterId: string;
  type: "temporal" | "categorical";
  description: string;
  severity: "critical" | "warning";
  groupKey: string;
  items: Array<{ itemId: string; itemName: string; anomalyType: string }>;
  suggestedAction: string;
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

  // ─── Phase 1: Cross-Tenant Analytics ────────────────────────

  async getPortfolioAnomalySummary(businessId: string): Promise<PortfolioAnomalySummary> {
    const locations = await this.prisma.location.findMany({
      where: { businessId, active: true },
      select: { id: true, name: true },
    });

    const locationResults = await Promise.all(
      locations.map(async (loc) => {
        try {
          const summary = await this.getAnalyticsSummary(loc.id);
          return { locationId: loc.id, locationName: loc.name, summary };
        } catch {
          return {
            locationId: loc.id,
            locationName: loc.name,
            summary: {
              anomalyCount: 0,
              depletionMismatchCount: 0,
              varianceForecastRiskCount: 0,
              overallRiskScore: 0,
              topConcerns: [],
            } as AnalyticsSummary,
          };
        }
      })
    );

    const totals = {
      anomalyCount: locationResults.reduce((s, r) => s + r.summary.anomalyCount, 0),
      depletionMismatchCount: locationResults.reduce((s, r) => s + r.summary.depletionMismatchCount, 0),
      varianceForecastRiskCount: locationResults.reduce((s, r) => s + r.summary.varianceForecastRiskCount, 0),
      portfolioRiskScore: 0,
    };

    // Weighted average of per-location risk scores
    if (locationResults.length > 0) {
      totals.portfolioRiskScore = Math.round(
        locationResults.reduce((s, r) => s + r.summary.overallRiskScore, 0) / locationResults.length
      );
    }

    // Merge top concerns across locations, tag with locationName
    const allConcerns = locationResults.flatMap((r) =>
      r.summary.topConcerns.map((c) => ({
        ...c,
        locationName: r.locationName,
      }))
    );
    allConcerns.sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    });

    return {
      totals,
      locations: locationResults.map((r) => ({
        locationId: r.locationId,
        locationName: r.locationName,
        anomalyCount: r.summary.anomalyCount,
        depletionMismatchCount: r.summary.depletionMismatchCount,
        varianceForecastRiskCount: r.summary.varianceForecastRiskCount,
        riskScore: r.summary.overallRiskScore,
      })),
      topConcerns: allConcerns.slice(0, 10),
    };
  }

  async getPortfolioHealthScorecard(businessId: string): Promise<LocationHealthScore[]> {
    const locations = await this.prisma.location.findMany({
      where: { businessId, active: true },
      select: { id: true, name: true },
    });

    const varianceService = new VarianceService(this.prisma);
    const reportService = new ReportService(this.prisma);

    const results: LocationHealthScore[] = [];

    for (const loc of locations) {
      try {
        // Get latest benchmark snapshot for coverage/frequency metrics
        const snapshot = await this.prisma.benchmarkSnapshot.findFirst({
          where: { locationId: loc.id },
          orderBy: { snapshotDate: "desc" },
        });
        const metrics = snapshot?.metricsJson as any;

        const countFrequencyDays = metrics?.countFrequencyDays ?? null;
        const mappingCoveragePct = metrics?.mappingCoveragePct ?? 0;

        // Variance trend from recent data
        let varianceTrend: LocationHealthScore["varianceTrend"] = "stable";
        try {
          const trend = await varianceService.getVarianceTrend(loc.id, 4);
          if (trend.length >= 2) {
            const first = trend[0]!;
            const last = trend[trend.length - 1]!;
            const firstVal = typeof first === "object" && "totalVarianceValue" in (first as any) ? (first as any).totalVarianceValue : 0;
            const lastVal = typeof last === "object" && "totalVarianceValue" in (last as any) ? (last as any).totalVarianceValue : 0;
            const diff = lastVal - firstVal;
            varianceTrend = diff < -0.5 ? "worsening" : diff > 0.5 ? "improving" : "stable";
          }
        } catch { /* no data */ }

        // Average days to stockout
        let avgCoverageDays: number | null = null;
        try {
          const expected = await reportService.getExpectedOnHandDashboard(loc.id);
          const withDays = expected.filter((e) => e.daysToStockout != null);
          if (withDays.length > 0) {
            avgCoverageDays = Math.round(
              withDays.reduce((s, e) => s + e.daysToStockout!, 0) / withDays.length
            );
          }
        } catch { /* no data */ }

        // Composite health score (0-100)
        const coverageScore = avgCoverageDays != null ? Math.min(avgCoverageDays / 14 * 100, 100) : 50;
        const freqScore = countFrequencyDays != null
          ? Math.max(0, 100 - (countFrequencyDays / 14) * 100)
          : 50;
        const varianceScore = varianceTrend === "improving" ? 100 : varianceTrend === "stable" ? 70 : 30;
        const mappingScore = mappingCoveragePct;

        const overallHealthScore = Math.round(
          coverageScore * 0.30 + freqScore * 0.25 + varianceScore * 0.25 + mappingScore * 0.20
        );

        results.push({
          locationId: loc.id,
          locationName: loc.name,
          countFrequencyDays,
          mappingCoveragePct,
          varianceTrend,
          avgCoverageDays,
          overallHealthScore,
        });
      } catch {
        results.push({
          locationId: loc.id,
          locationName: loc.name,
          countFrequencyDays: null,
          mappingCoveragePct: 0,
          varianceTrend: "stable",
          avgCoverageDays: null,
          overallHealthScore: 50,
        });
      }
    }

    return results;
  }

  async getPortfolioRadarComparison(businessId: string): Promise<LocationRadarData[]> {
    const latestDate = await this.prisma.$queryRaw<Array<{ max_date: Date | null }>>`
      SELECT MAX(snapshot_date) as max_date FROM benchmark_snapshots WHERE business_id = ${businessId}::uuid
    `;
    const snapshotDate = latestDate[0]?.max_date;
    if (!snapshotDate) return [];

    const snapshots = await this.prisma.$queryRaw<Array<{
      location_id: string;
      location_name: string;
      on_hand_value: number;
      cogs_7d: number;
      variance_impact: number;
      pour_cost_pct: number | null;
      mapping_coverage_pct: number;
      count_frequency_days: number | null;
    }>>`
      SELECT
        bs.location_id,
        l.name as location_name,
        (bs.metrics_json->>'onHandValue')::float as on_hand_value,
        (bs.metrics_json->>'cogs7d')::float as cogs_7d,
        (bs.metrics_json->>'varianceImpact')::float as variance_impact,
        (bs.metrics_json->>'pourCostPct')::float as pour_cost_pct,
        (bs.metrics_json->>'mappingCoveragePct')::float as mapping_coverage_pct,
        (bs.metrics_json->>'countFrequencyDays')::float as count_frequency_days
      FROM benchmark_snapshots bs
      JOIN locations l ON l.id = bs.location_id
      WHERE bs.business_id = ${businessId}::uuid AND bs.snapshot_date = ${snapshotDate}::date
    `;

    if (snapshots.length === 0) return [];

    // Normalize each metric to 0-100 within this business's locations
    const axes = ["on_hand_value", "cogs_7d", "variance_impact", "pour_cost_pct", "mapping_coverage_pct", "count_frequency_days"] as const;
    const radarKeys = ["onHandValue", "cogs7d", "varianceImpact", "pourCostPct", "mappingCoveragePct", "countFrequencyDays"] as const;

    const ranges = axes.map((axis) => {
      const values = snapshots.map((s) => (s as any)[axis] as number | null).filter((v): v is number => v != null);
      const min = values.length > 0 ? Math.min(...values) : 0;
      const max = values.length > 0 ? Math.max(...values) : 1;
      return { min, max, range: max - min || 1 };
    });

    return snapshots.map((s) => ({
      locationId: s.location_id,
      locationName: s.location_name,
      axes: {
        onHandValue: normalize((s as any).on_hand_value, ranges[0]!),
        cogs7d: normalize((s as any).cogs_7d, ranges[1]!),
        varianceImpact: 100 - normalize(Math.abs((s as any).variance_impact ?? 0), ranges[2]!), // invert: less variance = better
        pourCostPct: 100 - normalize((s as any).pour_cost_pct ?? 0, ranges[3]!), // invert: lower pour cost = better
        mappingCoveragePct: normalize((s as any).mapping_coverage_pct ?? 0, ranges[4]!),
        countFrequencyDays: 100 - normalize((s as any).count_frequency_days ?? 0, ranges[5]!), // invert: fewer days = better
      },
    }));
  }

  // ─── Phase 2: Predictive Analytics ──────────────────────────

  async getScaleWeightAnomalies(locationId: string): Promise<ScaleWeightAnomaly[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        inventory_item_id: string;
        item_name: string;
        empty_bottle_weight_g: number | null;
        full_bottle_weight_g: number | null;
        avg_weight: number;
        stddev_weight: number;
        measurement_count: number;
        latest_weight: number;
      }>
    >(Prisma.sql`
      SELECT
        bm.inventory_item_id, i.name AS item_name,
        bt.empty_bottle_weight_g, bt.full_bottle_weight_g,
        AVG(bm.gross_weight_g)::float AS avg_weight,
        COALESCE(STDDEV(bm.gross_weight_g)::float, 0) AS stddev_weight,
        COUNT(*)::int AS measurement_count,
        (SELECT bm2.gross_weight_g FROM bottle_measurements bm2
         WHERE bm2.inventory_item_id = bm.inventory_item_id AND bm2.location_id = ${locationId}::uuid
         ORDER BY bm2.measured_at_ts DESC LIMIT 1)::float AS latest_weight
      FROM bottle_measurements bm
      JOIN inventory_items i ON i.id = bm.inventory_item_id
      LEFT JOIN bottle_templates bt ON bt.inventory_item_id = bm.inventory_item_id AND bt.enabled = true
      WHERE bm.location_id = ${locationId}::uuid AND bm.measured_at_ts >= NOW() - INTERVAL '90 days'
      GROUP BY bm.inventory_item_id, i.name, bt.empty_bottle_weight_g, bt.full_bottle_weight_g
      HAVING COUNT(*) >= 3
    `);

    const anomalies: ScaleWeightAnomaly[] = [];

    for (const row of rows) {
      const avgWeight = Number(row.avg_weight);
      const stddev = Number(row.stddev_weight);
      const latest = Number(row.latest_weight);
      const emptyWeight = row.empty_bottle_weight_g != null ? Number(row.empty_bottle_weight_g) : null;
      const fullWeight = row.full_bottle_weight_g != null ? Number(row.full_bottle_weight_g) : null;

      const zScore = stddev > 0.01 ? (latest - avgWeight) / stddev : 0;

      let flag: ScaleWeightAnomaly["flag"] = null;
      if (fullWeight != null && latest > fullWeight * 1.05) flag = "overweight";
      else if (emptyWeight != null && latest < emptyWeight * 0.9) flag = "underweight";
      else if (Math.abs(zScore) > 2.5) flag = "out_of_range";

      if (!flag) continue; // Only return anomalous items

      anomalies.push({
        inventoryItemId: row.inventory_item_id,
        itemName: row.item_name,
        emptyWeight,
        fullWeight,
        avgWeight,
        stddevWeight: stddev,
        measurementCount: Number(row.measurement_count),
        latestWeight: latest,
        zScore,
        flag,
      });
    }

    anomalies.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
    return anomalies;
  }

  async getDepletionCorrelation(locationId: string): Promise<DepletionCorrelation[]> {
    // Query daily depletion buckets over 30 days
    const rows = await this.prisma.$queryRaw<
      Array<{
        inventory_item_id: string;
        item_name: string;
        category_name: string | null;
        usage_date: Date;
        pos_qty: number;
        total_qty: number;
      }>
    >(Prisma.sql`
      SELECT
        ce.inventory_item_id,
        i.name AS item_name,
        c.name AS category_name,
        date_trunc('day', ce.event_ts)::date AS usage_date,
        COALESCE(SUM(ABS(ce.quantity_delta)) FILTER (WHERE ce.event_type = 'pos_sale'), 0)::float AS pos_qty,
        COALESCE(SUM(ABS(ce.quantity_delta)), 0)::float AS total_qty
      FROM consumption_events ce
      JOIN inventory_items i ON i.id = ce.inventory_item_id
      LEFT JOIN inventory_item_categories c ON c.id = i.category_id
      WHERE ce.location_id = ${locationId}::uuid
        AND ce.quantity_delta < 0
        AND ce.event_ts >= NOW() - INTERVAL '30 days'
        AND ce.reversal_of_event_id IS NULL
      GROUP BY ce.inventory_item_id, i.name, c.name, usage_date
      ORDER BY ce.inventory_item_id, usage_date
    `);

    // Group by item
    const itemMap = new Map<string, {
      itemName: string;
      categoryName: string | null;
      days: Array<{ pos: number; total: number }>;
    }>();

    for (const row of rows) {
      const id = row.inventory_item_id;
      if (!itemMap.has(id)) {
        itemMap.set(id, { itemName: row.item_name, categoryName: row.category_name, days: [] });
      }
      itemMap.get(id)!.days.push({ pos: Number(row.pos_qty), total: Number(row.total_qty) });
    }

    const results: DepletionCorrelation[] = [];

    for (const [itemId, data] of itemMap) {
      if (data.days.length < 7) continue;

      const n = data.days.length;
      const posValues = data.days.map((d) => d.pos);
      const totalValues = data.days.map((d) => d.total);

      // Pearson correlation
      const meanPos = posValues.reduce((s, v) => s + v, 0) / n;
      const meanTotal = totalValues.reduce((s, v) => s + v, 0) / n;

      let sumXY = 0, sumX2 = 0, sumY2 = 0;
      for (let i = 0; i < n; i++) {
        const dx = posValues[i]! - meanPos;
        const dy = totalValues[i]! - meanTotal;
        sumXY += dx * dy;
        sumX2 += dx * dx;
        sumY2 += dy * dy;
      }

      const denom = Math.sqrt(sumX2 * sumY2);
      const pearsonR = denom > 0 ? sumXY / denom : 0;

      // Average daily offset
      const offsets = data.days.map((d) => d.total - d.pos);
      const avgOffset = offsets.reduce((s, v) => s + v, 0) / n;
      const avgDailyOffset = meanPos > 0 ? avgOffset / meanPos : 0;

      // Offset trend (first half vs second half)
      const mid = Math.floor(n / 2);
      const firstHalfAvg = offsets.slice(0, mid).reduce((s, v) => s + v, 0) / mid;
      const secondHalfAvg = offsets.slice(mid).reduce((s, v) => s + v, 0) / (n - mid);
      const trendDiff = secondHalfAvg - firstHalfAvg;
      const offsetTrend: DepletionCorrelation["offsetTrend"] =
        trendDiff > 0.5 ? "increasing" : trendDiff < -0.5 ? "decreasing" : "stable";

      // Flag determination
      let flag: DepletionCorrelation["flag"] = null;
      if (pearsonR < 0) flag = "negative_correlation";
      else if (pearsonR < 0.5 && meanTotal > 1) flag = "low_correlation";
      else if (pearsonR > 0.7 && Math.abs(avgDailyOffset) > 0.2) flag = "systematic_offset";

      results.push({
        inventoryItemId: itemId,
        itemName: data.itemName,
        categoryName: data.categoryName,
        pearsonR,
        avgDailyOffset,
        offsetTrend,
        flag,
        totalPosDays: n,
        totalDays: n,
      });
    }

    results.sort((a, b) => Math.abs(1 - a.pearsonR) - Math.abs(1 - b.pearsonR));
    // Put flagged items first
    results.sort((a, b) => (a.flag ? 0 : 1) - (b.flag ? 0 : 1));
    return results;
  }

  async getAnomalyClusters(locationId: string): Promise<AnomalyCluster[]> {
    const [anomalies, ratios] = await Promise.all([
      this.getUsageAnomalies(locationId),
      this.getPosDepletionRatios(locationId),
    ]);

    const flaggedRatios = ratios.filter((r) => r.flag !== null);
    const clusters: AnomalyCluster[] = [];
    let clusterId = 0;

    // Temporal clusters: items with DOW anomalies on the same day
    const dowMap = new Map<string, Array<{ itemId: string; itemName: string; anomalyType: string }>>();
    for (const a of anomalies) {
      for (const dow of a.dowAnomalies) {
        if (!dowMap.has(dow.dayOfWeek)) dowMap.set(dow.dayOfWeek, []);
        dowMap.get(dow.dayOfWeek)!.push({
          itemId: a.inventoryItemId,
          itemName: a.itemName,
          anomalyType: a.type,
        });
      }
    }

    for (const [day, items] of dowMap) {
      if (items.length < 3) continue;
      clusters.push({
        clusterId: `temporal-${++clusterId}`,
        type: "temporal",
        description: `${items.length} items showing usage anomalies on ${day} — possible over-pouring or event pattern`,
        severity: items.length >= 5 ? "critical" : "warning",
        groupKey: day,
        items,
        suggestedAction: `Review staffing and POS data for ${day}s. Check for events or promotions.`,
      });
    }

    // Categorical clusters: items in the same category all flagged
    const catMap = new Map<string, Array<{ itemId: string; itemName: string; anomalyType: string }>>();
    const allFlagged = [
      ...anomalies.map((a) => ({ ...a, category: a.categoryName, anomalyType: a.type })),
      ...flaggedRatios.map((r) => ({ ...r, category: r.categoryName, anomalyType: r.flag! })),
    ];
    for (const item of allFlagged) {
      if (!item.category) continue;
      if (!catMap.has(item.category)) catMap.set(item.category, []);
      // Deduplicate by item id
      const existing = catMap.get(item.category)!;
      const id = "inventoryItemId" in item ? item.inventoryItemId : "";
      if (!existing.some((e) => e.itemId === id)) {
        existing.push({
          itemId: id,
          itemName: "itemName" in item ? item.itemName : "",
          anomalyType: item.anomalyType,
        });
      }
    }

    for (const [category, items] of catMap) {
      if (items.length < 3) continue;
      clusters.push({
        clusterId: `category-${++clusterId}`,
        type: "categorical",
        description: `${items.length} ${category} items flagged — possible category-wide issue`,
        severity: items.length >= 5 ? "critical" : "warning",
        groupKey: category,
        items,
        suggestedAction: `Investigate ${category} storage, handling procedures, or POS mapping for this category.`,
      });
    }

    clusters.sort((a, b) => {
      const order = { critical: 0, warning: 1 };
      return order[a.severity] - order[b.severity];
    });

    return clusters;
  }
}

// ─── Helpers ────────────────────────────────────────────────

function normalize(value: number | null, range: { min: number; max: number; range: number }): number {
  if (value == null) return 50;
  return Math.round(((value - range.min) / range.range) * 100);
}
