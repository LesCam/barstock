/**
 * Benchmark Service
 * Weekly snapshot capture + industry percentile queries for cross-tenant benchmarking
 */

import type { ExtendedPrismaClient } from "@barstock/database";
import { Prisma } from "@prisma/client";
import { ReportService } from "./report.service";
import { VarianceService } from "./variance.service";
import { ParLevelService } from "./par-level.service";
import { SettingsService } from "./settings.service";

export interface BenchmarkMetrics {
  onHandValue: number;
  cogs7d: number;
  varianceImpact: number;
  shrinkageSuspects: number;
  pourCostPct: number | null;
  mappingCoveragePct: number;
  reorderCount: number;
  avgSessionDurationMin: number | null;
  itemsPerSession: number | null;
  countFrequencyDays: number | null;
  activeItemCount: number;
}

export interface PercentileSet {
  p25: number | null;
  p50: number | null;
  p75: number | null;
}

export interface IndustryBenchmarks {
  snapshotDate: string;
  optedInCount: number;
  metrics: Record<keyof BenchmarkMetrics, PercentileSet>;
}

export interface BenchmarkTrendPoint {
  snapshotDate: string;
  business: Record<keyof BenchmarkMetrics, number | null>;
  industryMedian: Record<keyof BenchmarkMetrics, number | null>;
}

export class BenchmarkService {
  constructor(private prisma: ExtendedPrismaClient) {}

  /**
   * Capture a snapshot for a single location
   */
  async captureSnapshot(locationId: string): Promise<BenchmarkMetrics> {
    const location = await this.prisma.location.findUniqueOrThrow({
      where: { id: locationId },
    });

    const reportService = new ReportService(this.prisma);
    const varianceService = new VarianceService(this.prisma);
    const parLevelService = new ParLevelService(this.prisma);

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [onHand, cogs, variance, patterns, pourCost, coverageRows, parItems, sessionStats, activeItemCount] =
      await Promise.all([
        reportService.getOnHandReport(locationId),
        reportService.getCOGSReport(locationId, sevenDaysAgo, now),
        varianceService.calculateVarianceReport(locationId, sevenDaysAgo, now),
        varianceService.analyzeVariancePatterns(locationId, 10),
        reportService.getPourCost(locationId, sevenDaysAgo, now),
        this.prisma.$queryRaw<Array<{ total_items: number; mapped_items: number }>>`
          SELECT
            COUNT(DISTINCT sl.pos_item_id)::int as total_items,
            COUNT(DISTINCT CASE WHEN pim.id IS NOT NULL THEN sl.pos_item_id END)::int as mapped_items
          FROM sales_lines sl
          LEFT JOIN pos_item_mappings pim
            ON pim.location_id = sl.location_id
            AND pim.source_system = sl.source_system
            AND pim.pos_item_id = sl.pos_item_id
            AND pim.active = true
          WHERE sl.location_id = ${locationId}::uuid
            AND sl.sold_at >= NOW() - INTERVAL '7 days'
        `,
        parLevelService.list(locationId),
        this.prisma.$queryRaw<Array<{
          avg_duration_min: number | null;
          avg_items: number | null;
          avg_frequency_days: number | null;
        }>>`
          WITH closed_sessions AS (
            SELECT
              id,
              started_ts,
              ended_ts,
              EXTRACT(EPOCH FROM (ended_ts - started_ts)) / 60.0 as duration_min,
              (SELECT COUNT(*)::int FROM inventory_session_lines isl WHERE isl.session_id = s.id) as line_count
            FROM inventory_sessions s
            WHERE s.location_id = ${locationId}::uuid
              AND s.ended_ts IS NOT NULL
              AND s.ended_ts >= NOW() - INTERVAL '30 days'
          ),
          session_gaps AS (
            SELECT
              started_ts,
              LAG(started_ts) OVER (ORDER BY started_ts) as prev_started_ts
            FROM inventory_sessions
            WHERE location_id = ${locationId}::uuid
              AND ended_ts IS NOT NULL
              AND ended_ts >= NOW() - INTERVAL '90 days'
          )
          SELECT
            (SELECT AVG(duration_min)::float FROM closed_sessions WHERE duration_min > 0 AND duration_min < 480) as avg_duration_min,
            (SELECT AVG(line_count)::float FROM closed_sessions WHERE line_count > 0) as avg_items,
            (SELECT AVG(EXTRACT(EPOCH FROM (started_ts - prev_started_ts)) / 86400.0)::float
             FROM session_gaps WHERE prev_started_ts IS NOT NULL) as avg_frequency_days
        `,
        this.prisma.inventoryItem.count({
          where: { locationId, active: true },
        }),
      ]);

    const coverageRow = coverageRows[0] ?? { total_items: 0, mapped_items: 0 };
    const mappingCoveragePct =
      coverageRow.total_items > 0
        ? Math.round((coverageRow.mapped_items / coverageRow.total_items) * 100)
        : 100;

    const shrinkageSuspects = patterns.filter((p) => p.isShrinkageSuspect).length;
    const reorderCount = parItems.filter((i) => i.needsReorder).length;
    const stats = sessionStats[0];

    return {
      onHandValue: onHand.totalValue,
      cogs7d: cogs.cogs,
      varianceImpact: variance.totalVarianceValue,
      shrinkageSuspects,
      pourCostPct: pourCost.blendedPourCostPct,
      mappingCoveragePct,
      reorderCount,
      avgSessionDurationMin: stats?.avg_duration_min ?? null,
      itemsPerSession: stats?.avg_items ?? null,
      countFrequencyDays: stats?.avg_frequency_days ?? null,
      activeItemCount,
    };
  }

  /**
   * Capture snapshots for all locations of a single business
   */
  async captureBusinessSnapshots(businessId: string): Promise<number> {
    const locations = await this.prisma.location.findMany({
      where: { businessId, active: true },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let count = 0;

    for (const loc of locations) {
      try {
        const metrics = await this.captureSnapshot(loc.id);

        await this.prisma.benchmarkSnapshot.upsert({
          where: {
            locationId_snapshotDate: {
              locationId: loc.id,
              snapshotDate: today,
            },
          },
          create: {
            businessId,
            locationId: loc.id,
            snapshotDate: today,
            metricsJson: metrics as any,
          },
          update: {
            metricsJson: metrics as any,
          },
        });
        count++;
      } catch (err) {
        console.error(`Failed to capture snapshot for location ${loc.id}:`, err);
      }
    }

    return count;
  }

  /**
   * Capture snapshots for all opted-in businesses (platform-wide)
   */
  async captureAllSnapshots(): Promise<{ businessCount: number; locationCount: number }> {
    const settingsService = new SettingsService(this.prisma);

    const businesses = await this.prisma.business.findMany({
      where: { active: true },
      include: { businessSettings: true },
    });

    let businessCount = 0;
    let locationCount = 0;

    for (const biz of businesses) {
      const settings = biz.businessSettings?.settingsJson as any;
      if (!settings?.benchmarking?.optedIn) continue;

      const captured = await this.captureBusinessSnapshots(biz.id);
      if (captured > 0) {
        businessCount++;
        locationCount += captured;
      }
    }

    return { businessCount, locationCount };
  }

  /**
   * Get industry percentiles for the latest (or specified) snapshot date
   */
  async getIndustryPercentiles(callerBusinessId: string, snapshotDate?: Date): Promise<IndustryBenchmarks> {
    // Find the latest snapshot date if not specified
    const dateToUse = snapshotDate ?? await this.getLatestSnapshotDate();
    if (!dateToUse) {
      return {
        snapshotDate: new Date().toISOString().split("T")[0]!,
        optedInCount: 0,
        metrics: this.emptyPercentiles(),
      };
    }

    const dateStr = dateToUse instanceof Date
      ? dateToUse.toISOString().split("T")[0]!
      : dateToUse;

    // Get snapshots from opted-in businesses only, aggregated per business
    const rows = await this.prisma.$queryRaw<Array<{
      business_id: string;
      on_hand_value: number;
      cogs_7d: number;
      variance_impact: number;
      shrinkage_suspects: number;
      pour_cost_pct: number | null;
      mapping_coverage_pct: number;
      reorder_count: number;
      avg_session_duration_min: number | null;
      items_per_session: number | null;
      count_frequency_days: number | null;
      active_item_count: number;
    }>>`
      SELECT
        bs.business_id,
        AVG((bs.metrics_json->>'onHandValue')::float)::float as on_hand_value,
        AVG((bs.metrics_json->>'cogs7d')::float)::float as cogs_7d,
        AVG((bs.metrics_json->>'varianceImpact')::float)::float as variance_impact,
        SUM((bs.metrics_json->>'shrinkageSuspects')::int)::int as shrinkage_suspects,
        AVG((bs.metrics_json->>'pourCostPct')::float)::float as pour_cost_pct,
        AVG((bs.metrics_json->>'mappingCoveragePct')::float)::float as mapping_coverage_pct,
        SUM((bs.metrics_json->>'reorderCount')::int)::int as reorder_count,
        AVG((bs.metrics_json->>'avgSessionDurationMin')::float)::float as avg_session_duration_min,
        AVG((bs.metrics_json->>'itemsPerSession')::float)::float as items_per_session,
        AVG((bs.metrics_json->>'countFrequencyDays')::float)::float as count_frequency_days,
        SUM((bs.metrics_json->>'activeItemCount')::int)::int as active_item_count
      FROM benchmark_snapshots bs
      JOIN business_settings bset ON bset.business_id = bs.business_id
      WHERE bs.snapshot_date = ${dateToUse}::date
        AND (bset.settings_json->'benchmarking'->>'optedIn')::boolean = true
      GROUP BY bs.business_id
    `;

    if (rows.length === 0) {
      return {
        snapshotDate: dateStr,
        optedInCount: 0,
        metrics: this.emptyPercentiles(),
      };
    }

    const metricKeys: (keyof BenchmarkMetrics)[] = [
      "onHandValue", "cogs7d", "varianceImpact", "shrinkageSuspects",
      "pourCostPct", "mappingCoveragePct", "reorderCount",
      "avgSessionDurationMin", "itemsPerSession", "countFrequencyDays",
      "activeItemCount",
    ];

    const columnMap: Record<string, string> = {
      onHandValue: "on_hand_value",
      cogs7d: "cogs_7d",
      varianceImpact: "variance_impact",
      shrinkageSuspects: "shrinkage_suspects",
      pourCostPct: "pour_cost_pct",
      mappingCoveragePct: "mapping_coverage_pct",
      reorderCount: "reorder_count",
      avgSessionDurationMin: "avg_session_duration_min",
      itemsPerSession: "items_per_session",
      countFrequencyDays: "count_frequency_days",
      activeItemCount: "active_item_count",
    };

    const metrics = {} as Record<keyof BenchmarkMetrics, PercentileSet>;

    for (const key of metricKeys) {
      const col = columnMap[key]!;
      const values = rows
        .map((r) => (r as any)[col] as number | null)
        .filter((v): v is number => v != null)
        .sort((a, b) => a - b);

      if (values.length === 0) {
        metrics[key] = { p25: null, p50: null, p75: null };
      } else {
        metrics[key] = {
          p25: this.percentile(values, 0.25),
          p50: this.percentile(values, 0.5),
          p75: this.percentile(values, 0.75),
        };
      }
    }

    return {
      snapshotDate: dateStr,
      optedInCount: rows.length,
      metrics,
    };
  }

  /**
   * Get a location's trend over N weeks
   */
  async getLocationTrend(locationId: string, weeks: number = 12) {
    const snapshots = await this.prisma.benchmarkSnapshot.findMany({
      where: {
        locationId,
        snapshotDate: {
          gte: new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { snapshotDate: "asc" },
    });

    return snapshots.map((s) => ({
      snapshotDate: s.snapshotDate.toISOString().split("T")[0],
      metrics: s.metricsJson as unknown as BenchmarkMetrics,
    }));
  }

  /**
   * Get business trend (averaged across locations) + industry median over N weeks
   */
  async getBenchmarkTrend(businessId: string, weeks: number = 12): Promise<BenchmarkTrendPoint[]> {
    const since = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000);

    // Business's own snapshots, averaged per date
    const businessRows = await this.prisma.$queryRaw<Array<{
      snapshot_date: Date;
      on_hand_value: number;
      cogs_7d: number;
      variance_impact: number;
      shrinkage_suspects: number;
      pour_cost_pct: number | null;
      mapping_coverage_pct: number;
      reorder_count: number;
      avg_session_duration_min: number | null;
      items_per_session: number | null;
      count_frequency_days: number | null;
      active_item_count: number;
    }>>`
      SELECT
        snapshot_date,
        AVG((metrics_json->>'onHandValue')::float)::float as on_hand_value,
        AVG((metrics_json->>'cogs7d')::float)::float as cogs_7d,
        AVG((metrics_json->>'varianceImpact')::float)::float as variance_impact,
        SUM((metrics_json->>'shrinkageSuspects')::int)::int as shrinkage_suspects,
        AVG((metrics_json->>'pourCostPct')::float)::float as pour_cost_pct,
        AVG((metrics_json->>'mappingCoveragePct')::float)::float as mapping_coverage_pct,
        SUM((metrics_json->>'reorderCount')::int)::int as reorder_count,
        AVG((metrics_json->>'avgSessionDurationMin')::float)::float as avg_session_duration_min,
        AVG((metrics_json->>'itemsPerSession')::float)::float as items_per_session,
        AVG((metrics_json->>'countFrequencyDays')::float)::float as count_frequency_days,
        SUM((metrics_json->>'activeItemCount')::int)::int as active_item_count
      FROM benchmark_snapshots
      WHERE business_id = ${businessId}::uuid
        AND snapshot_date >= ${since}::date
      GROUP BY snapshot_date
      ORDER BY snapshot_date
    `;

    // Industry median per date (opted-in businesses only)
    const industryRows = await this.prisma.$queryRaw<Array<{
      snapshot_date: Date;
      on_hand_value: number | null;
      cogs_7d: number | null;
      variance_impact: number | null;
      pour_cost_pct: number | null;
      mapping_coverage_pct: number | null;
      count_frequency_days: number | null;
    }>>`
      WITH biz_agg AS (
        SELECT
          bs.snapshot_date,
          bs.business_id,
          AVG((bs.metrics_json->>'onHandValue')::float) as on_hand_value,
          AVG((bs.metrics_json->>'cogs7d')::float) as cogs_7d,
          AVG((bs.metrics_json->>'varianceImpact')::float) as variance_impact,
          AVG((bs.metrics_json->>'pourCostPct')::float) as pour_cost_pct,
          AVG((bs.metrics_json->>'mappingCoveragePct')::float) as mapping_coverage_pct,
          AVG((bs.metrics_json->>'countFrequencyDays')::float) as count_frequency_days
        FROM benchmark_snapshots bs
        JOIN business_settings bset ON bset.business_id = bs.business_id
        WHERE bs.snapshot_date >= ${since}::date
          AND (bset.settings_json->'benchmarking'->>'optedIn')::boolean = true
        GROUP BY bs.snapshot_date, bs.business_id
      )
      SELECT
        snapshot_date,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY on_hand_value)::float as on_hand_value,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY cogs_7d)::float as cogs_7d,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY variance_impact)::float as variance_impact,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY pour_cost_pct)::float as pour_cost_pct,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY mapping_coverage_pct)::float as mapping_coverage_pct,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY count_frequency_days)::float as count_frequency_days
      FROM biz_agg
      GROUP BY snapshot_date
      ORDER BY snapshot_date
    `;

    const industryMap = new Map(
      industryRows.map((r) => [r.snapshot_date.toISOString().split("T")[0], r])
    );

    return businessRows.map((b) => {
      const dateStr = b.snapshot_date.toISOString().split("T")[0]!;
      const ind = industryMap.get(dateStr);

      return {
        snapshotDate: dateStr,
        business: {
          onHandValue: b.on_hand_value,
          cogs7d: b.cogs_7d,
          varianceImpact: b.variance_impact,
          shrinkageSuspects: b.shrinkage_suspects,
          pourCostPct: b.pour_cost_pct,
          mappingCoveragePct: b.mapping_coverage_pct,
          reorderCount: b.reorder_count,
          avgSessionDurationMin: b.avg_session_duration_min,
          itemsPerSession: b.items_per_session,
          countFrequencyDays: b.count_frequency_days,
          activeItemCount: b.active_item_count,
        },
        industryMedian: {
          onHandValue: ind?.on_hand_value ?? null,
          cogs7d: ind?.cogs_7d ?? null,
          varianceImpact: ind?.variance_impact ?? null,
          shrinkageSuspects: null,
          pourCostPct: ind?.pour_cost_pct ?? null,
          mappingCoveragePct: ind?.mapping_coverage_pct ?? null,
          reorderCount: null,
          avgSessionDurationMin: null,
          itemsPerSession: null,
          countFrequencyDays: ind?.count_frequency_days ?? null,
          activeItemCount: null,
        },
      };
    });
  }

  /**
   * Platform admin: full cross-business benchmark data (named, not anonymous)
   */
  async getPlatformBenchmarks() {
    const latestDate = await this.getLatestSnapshotDate();
    if (!latestDate) return { snapshotDate: null, businesses: [] };

    const rows = await this.prisma.$queryRaw<Array<{
      business_id: string;
      business_name: string;
      location_count: number;
      opted_in: boolean;
      on_hand_value: number;
      cogs_7d: number;
      variance_impact: number;
      pour_cost_pct: number | null;
      active_item_count: number;
      mapping_coverage_pct: number;
    }>>`
      SELECT
        b.id as business_id,
        b.name as business_name,
        COUNT(DISTINCT bs.location_id)::int as location_count,
        COALESCE((bset.settings_json->'benchmarking'->>'optedIn')::boolean, false) as opted_in,
        SUM((bs.metrics_json->>'onHandValue')::float)::float as on_hand_value,
        SUM((bs.metrics_json->>'cogs7d')::float)::float as cogs_7d,
        SUM((bs.metrics_json->>'varianceImpact')::float)::float as variance_impact,
        AVG((bs.metrics_json->>'pourCostPct')::float)::float as pour_cost_pct,
        SUM((bs.metrics_json->>'activeItemCount')::int)::int as active_item_count,
        AVG((bs.metrics_json->>'mappingCoveragePct')::float)::float as mapping_coverage_pct
      FROM benchmark_snapshots bs
      JOIN businesses b ON b.id = bs.business_id
      LEFT JOIN business_settings bset ON bset.business_id = bs.business_id
      WHERE bs.snapshot_date = ${latestDate}::date
      GROUP BY b.id, b.name, bset.settings_json
      ORDER BY on_hand_value DESC
    `;

    return {
      snapshotDate: latestDate.toISOString().split("T")[0],
      businesses: rows.map((r) => ({
        businessId: r.business_id,
        businessName: r.business_name,
        locationCount: r.location_count,
        optedIn: r.opted_in,
        onHandValue: r.on_hand_value,
        cogs7d: r.cogs_7d,
        varianceImpact: r.variance_impact,
        pourCostPct: r.pour_cost_pct,
        activeItemCount: r.active_item_count,
        mappingCoveragePct: r.mapping_coverage_pct,
      })),
    };
  }

  /**
   * Platform admin: analytics summary per business with risk scores derived from benchmark snapshots
   */
  async getPlatformAnalyticsSummary() {
    const latestDate = await this.getLatestSnapshotDate();
    if (!latestDate) return { snapshotDate: null, businesses: [] };

    const rows = await this.prisma.$queryRaw<Array<{
      business_id: string;
      business_name: string;
      location_count: number;
      on_hand_value: number;
      cogs_7d: number;
      variance_impact: number;
      pour_cost_pct: number | null;
      shrinkage_suspects: number;
      count_frequency_days: number | null;
      mapping_coverage_pct: number;
      active_item_count: number;
    }>>`
      SELECT
        b.id as business_id,
        b.name as business_name,
        COUNT(DISTINCT bs.location_id)::int as location_count,
        SUM((bs.metrics_json->>'onHandValue')::float)::float as on_hand_value,
        SUM((bs.metrics_json->>'cogs7d')::float)::float as cogs_7d,
        SUM((bs.metrics_json->>'varianceImpact')::float)::float as variance_impact,
        AVG((bs.metrics_json->>'pourCostPct')::float)::float as pour_cost_pct,
        SUM((bs.metrics_json->>'shrinkageSuspects')::int)::int as shrinkage_suspects,
        AVG((bs.metrics_json->>'countFrequencyDays')::float)::float as count_frequency_days,
        AVG((bs.metrics_json->>'mappingCoveragePct')::float)::float as mapping_coverage_pct,
        SUM((bs.metrics_json->>'activeItemCount')::int)::int as active_item_count
      FROM benchmark_snapshots bs
      JOIN businesses b ON b.id = bs.business_id
      WHERE bs.snapshot_date = ${latestDate}::date
      GROUP BY b.id, b.name
      ORDER BY on_hand_value DESC
    `;

    return {
      snapshotDate: latestDate.toISOString().split("T")[0],
      businesses: rows.map((r) => {
        // Risk score: weighted combo of variance, shrinkage, count frequency
        const varianceRisk = Math.min(Math.abs(r.variance_impact) / 100, 1) * 40;
        const shrinkageRisk = Math.min(r.shrinkage_suspects / 10, 1) * 30;
        const freqRisk = r.count_frequency_days != null
          ? Math.min(r.count_frequency_days / 14, 1) * 30
          : 15;
        const riskScore = Math.round(varianceRisk + shrinkageRisk + freqRisk);
        const riskLevel = riskScore >= 70 ? "high" as const : riskScore >= 40 ? "medium" as const : "low" as const;

        // Health score (inverse of risk, plus mapping coverage)
        const healthScore = Math.max(0, Math.min(100, 100 - riskScore + Math.round(r.mapping_coverage_pct * 0.2)));

        return {
          businessId: r.business_id,
          businessName: r.business_name,
          locationCount: r.location_count,
          onHandValue: r.on_hand_value,
          cogs7d: r.cogs_7d,
          varianceImpact: r.variance_impact,
          pourCostPct: r.pour_cost_pct,
          riskScore,
          riskLevel,
          healthScore,
        };
      }),
    };
  }

  /**
   * Platform admin: aggregate trend across all opted-in businesses
   */
  async getPlatformTrend(weeks: number = 12) {
    const since = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.$queryRaw<Array<{
      snapshot_date: Date;
      on_hand_value: number;
      cogs_7d: number;
      variance_impact: number;
      pour_cost_pct: number | null;
      business_count: number;
    }>>`
      WITH biz_agg AS (
        SELECT
          bs.snapshot_date,
          bs.business_id,
          SUM((bs.metrics_json->>'onHandValue')::float) as on_hand_value,
          SUM((bs.metrics_json->>'cogs7d')::float) as cogs_7d,
          AVG((bs.metrics_json->>'varianceImpact')::float) as variance_impact,
          AVG((bs.metrics_json->>'pourCostPct')::float) as pour_cost_pct
        FROM benchmark_snapshots bs
        JOIN business_settings bset ON bset.business_id = bs.business_id
        WHERE bs.snapshot_date >= ${since}::date
          AND (bset.settings_json->'benchmarking'->>'optedIn')::boolean = true
        GROUP BY bs.snapshot_date, bs.business_id
      )
      SELECT
        snapshot_date,
        SUM(on_hand_value)::float as on_hand_value,
        SUM(cogs_7d)::float as cogs_7d,
        AVG(variance_impact)::float as variance_impact,
        AVG(pour_cost_pct)::float as pour_cost_pct,
        COUNT(DISTINCT business_id)::int as business_count
      FROM biz_agg
      GROUP BY snapshot_date
      ORDER BY snapshot_date
    `;

    return rows.map((r) => ({
      date: r.snapshot_date.toISOString().split("T")[0],
      onHandValue: r.on_hand_value,
      cogs7d: r.cogs_7d,
      varianceImpact: r.variance_impact,
      pourCostPct: r.pour_cost_pct,
      businessCount: r.business_count,
    }));
  }

  // ─── Helpers ──────────────────────────────────────────────

  private async getLatestSnapshotDate(): Promise<Date | null> {
    const result = await this.prisma.$queryRaw<Array<{ max_date: Date | null }>>`
      SELECT MAX(snapshot_date) as max_date FROM benchmark_snapshots
    `;
    return result[0]?.max_date ?? null;
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0]!;
    const index = p * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower]!;
    return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (index - lower);
  }

  private emptyPercentiles(): Record<keyof BenchmarkMetrics, PercentileSet> {
    const empty: PercentileSet = { p25: null, p50: null, p75: null };
    return {
      onHandValue: { ...empty },
      cogs7d: { ...empty },
      varianceImpact: { ...empty },
      shrinkageSuspects: { ...empty },
      pourCostPct: { ...empty },
      mappingCoveragePct: { ...empty },
      reorderCount: { ...empty },
      avgSessionDurationMin: { ...empty },
      itemsPerSession: { ...empty },
      countFrequencyDays: { ...empty },
      activeItemCount: { ...empty },
    };
  }
}
