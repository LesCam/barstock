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

export interface CategoryBenchmarkMetrics {
  categoryName: string;
  countingMethod: string;
  onHandValue: number;
  cogs7d: number;
  varianceImpact: number;
  activeItemCount: number;
  pourCostPct: number | null;
}

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
  byCategory?: CategoryBenchmarkMetrics[];
}

export interface PercentileSet {
  p25: number | null;
  p50: number | null;
  p75: number | null;
}

export interface CategoryPercentiles {
  groupKey: string; // normalized category name or counting method
  groupType: "category" | "countingMethod";
  businessCount: number;
  callerValue: CategoryBenchmarkMetrics | null;
  metrics: {
    onHandValue: PercentileSet;
    cogs7d: PercentileSet;
    varianceImpact: PercentileSet;
    activeItemCount: PercentileSet;
    pourCostPct: PercentileSet;
  };
}

export interface PeerFilter {
  locationCountTier?: "1" | "2-5" | "6+";
  activeItemCountTier?: "1-100" | "101-500" | "500+";
}

export interface IndustryBenchmarks {
  snapshotDate: string;
  optedInCount: number;
  metrics: Record<CoreMetricKeys, PercentileSet>;
  categoryBenchmarks?: CategoryPercentiles[];
  peerGroup?: {
    filter: PeerFilter;
    filteredCount: number;
  };
}

type CoreMetricKeys = Exclude<keyof BenchmarkMetrics, "byCategory">;

export interface BenchmarkTrendPoint {
  snapshotDate: string;
  business: Record<CoreMetricKeys, number | null>;
  industryMedian: Record<CoreMetricKeys, number | null>;
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

    // Build byCategory: look up category info for items, then group
    const itemCatRows = await this.prisma.$queryRaw<Array<{
      item_id: string;
      category_name: string;
      counting_method: string;
    }>>`
      SELECT
        i.id AS item_id,
        COALESCE(c.name, 'Uncategorized') AS category_name,
        COALESCE(c.counting_method::text, 'weighable') AS counting_method
      FROM inventory_items i
      LEFT JOIN inventory_item_categories c ON c.id = i.category_id
      WHERE i.location_id = ${locationId}::uuid AND i.active = true
    `;
    const itemCatMap = new Map(itemCatRows.map((r) => [r.item_id, r]));

    const categoryMap = new Map<string, {
      categoryName: string;
      countingMethod: string;
      onHandValue: number;
      cogs7d: number;
      varianceImpact: number;
      activeItemCount: number;
    }>();

    for (const item of onHand.items) {
      const catInfo = itemCatMap.get(item.inventoryItemId);
      const catName = catInfo?.category_name ?? "Uncategorized";
      const cm = catInfo?.counting_method ?? "weighable";
      const existing = categoryMap.get(catName);
      if (existing) {
        existing.onHandValue += item.totalValue ?? 0;
        existing.activeItemCount++;
      } else {
        categoryMap.set(catName, { categoryName: catName, countingMethod: cm, onHandValue: item.totalValue ?? 0, cogs7d: 0, varianceImpact: 0, activeItemCount: 1 });
      }
    }

    for (const item of variance.items) {
      const catName = item.categoryName ?? "Uncategorized";
      const existing = categoryMap.get(catName);
      if (existing) {
        existing.varianceImpact += item.valueImpact ?? 0;
      }
    }

    // COGS grouped by category
    const cogsByCat = await this.prisma.$queryRaw<Array<{ category_name: string; cogs: number }>>`
      SELECT
        COALESCE(c.name, 'Uncategorized') AS category_name,
        COALESCE(SUM(ABS(ce.quantity_delta) * ce.unit_cost), 0)::float AS cogs
      FROM consumption_events ce
      JOIN inventory_items i ON i.id = ce.inventory_item_id
      LEFT JOIN inventory_item_categories c ON c.id = i.category_id
      WHERE ce.location_id = ${locationId}::uuid
        AND ce.event_type = 'pos_sale'
        AND ce.event_ts >= ${sevenDaysAgo}
        AND ce.event_ts <= ${now}
        AND ce.reversal_of_event_id IS NULL
      GROUP BY c.name
    `;
    for (const row of cogsByCat) {
      const existing = categoryMap.get(row.category_name);
      if (existing) existing.cogs7d = row.cogs;
    }

    const byCategory: CategoryBenchmarkMetrics[] = Array.from(categoryMap.values()).map((cat) => ({
      categoryName: cat.categoryName,
      countingMethod: cat.countingMethod,
      onHandValue: cat.onHandValue,
      cogs7d: cat.cogs7d,
      varianceImpact: cat.varianceImpact,
      activeItemCount: cat.activeItemCount,
      pourCostPct: cat.onHandValue > 0 ? Math.round((cat.cogs7d / cat.onHandValue) * 1000) / 10 : null,
    }));

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
      byCategory,
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
  async getIndustryPercentiles(callerBusinessId: string, snapshotDate?: Date, peerFilter?: PeerFilter): Promise<IndustryBenchmarks> {
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

    // Apply peer filtering if specified
    let filteredRows = rows;
    if (peerFilter) {
      if (peerFilter.locationCountTier) {
        // Count locations per business from snapshot data
        const locationCounts = await this.prisma.$queryRaw<Array<{
          business_id: string;
          loc_count: number;
        }>>`
          SELECT business_id, COUNT(DISTINCT location_id)::int as loc_count
          FROM benchmark_snapshots
          WHERE snapshot_date = ${dateToUse}::date
          GROUP BY business_id
        `;
        const locCountMap = new Map(locationCounts.map((r) => [r.business_id, r.loc_count]));
        filteredRows = filteredRows.filter((r) => {
          const count = locCountMap.get(r.business_id) ?? 0;
          return this.matchesLocationTier(count, peerFilter.locationCountTier!);
        });
      }
      if (peerFilter.activeItemCountTier) {
        filteredRows = filteredRows.filter((r) => {
          return this.matchesItemTier(r.active_item_count, peerFilter.activeItemCountTier!);
        });
      }
    }

    if (filteredRows.length === 0) {
      return {
        snapshotDate: dateStr,
        optedInCount: 0,
        metrics: this.emptyPercentiles(),
        peerGroup: peerFilter ? { filter: peerFilter, filteredCount: 0 } : undefined,
      };
    }

    const metricKeys: CoreMetricKeys[] = [
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

    const metrics = {} as Record<CoreMetricKeys, PercentileSet>;

    for (const key of metricKeys) {
      const col = columnMap[key]!;
      const values = filteredRows
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

    // Category-level benchmarks from byCategory in metrics_json
    const categoryBenchmarks = await this.computeCategoryPercentiles(dateToUse, callerBusinessId, filteredRows.map((r) => r.business_id));

    return {
      snapshotDate: dateStr,
      optedInCount: filteredRows.length,
      metrics,
      categoryBenchmarks: categoryBenchmarks.length > 0 ? categoryBenchmarks : undefined,
      peerGroup: peerFilter ? { filter: peerFilter, filteredCount: filteredRows.length } : undefined,
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

  /**
   * Get percentile rank history for a business over N weeks
   */
  async getPercentileHistory(businessId: string, weeks: number = 12) {
    const since = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000);

    // Get all snapshot dates in range
    const snapshotDates = await this.prisma.$queryRaw<Array<{ snapshot_date: Date }>>`
      SELECT DISTINCT snapshot_date
      FROM benchmark_snapshots
      WHERE snapshot_date >= ${since}::date
      ORDER BY snapshot_date
    `;

    const result: Array<{
      snapshotDate: string;
      ranks: Record<string, number | null>;
      optedInCount: number;
    }> = [];

    for (const { snapshot_date } of snapshotDates) {
      // Get all opted-in businesses' aggregated values for this date
      const rows = await this.prisma.$queryRaw<Array<{
        business_id: string;
        on_hand_value: number;
        cogs_7d: number;
        variance_impact: number;
        shrinkage_suspects: number;
        pour_cost_pct: number | null;
        mapping_coverage_pct: number;
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
          AVG((bs.metrics_json->>'countFrequencyDays')::float)::float as count_frequency_days,
          SUM((bs.metrics_json->>'activeItemCount')::int)::int as active_item_count
        FROM benchmark_snapshots bs
        JOIN business_settings bset ON bset.business_id = bs.business_id
        WHERE bs.snapshot_date = ${snapshot_date}::date
          AND (bset.settings_json->'benchmarking'->>'optedIn')::boolean = true
        GROUP BY bs.business_id
      `;

      if (rows.length < 2) continue; // Need at least 2 businesses for meaningful ranking

      const callerRow = rows.find((r) => r.business_id === businessId);
      if (!callerRow) continue;

      const rankMetrics: Record<string, { col: string; lowerIsBetter: boolean }> = {
        onHandValue: { col: "on_hand_value", lowerIsBetter: false },
        cogs7d: { col: "cogs_7d", lowerIsBetter: false },
        varianceImpact: { col: "variance_impact", lowerIsBetter: true },
        shrinkageSuspects: { col: "shrinkage_suspects", lowerIsBetter: true },
        pourCostPct: { col: "pour_cost_pct", lowerIsBetter: true },
        mappingCoveragePct: { col: "mapping_coverage_pct", lowerIsBetter: false },
        countFrequencyDays: { col: "count_frequency_days", lowerIsBetter: true },
      };

      const ranks: Record<string, number | null> = {};

      for (const [metricKey, { col, lowerIsBetter }] of Object.entries(rankMetrics)) {
        const callerValue = (callerRow as any)[col] as number | null;
        if (callerValue == null) {
          ranks[metricKey] = null;
          continue;
        }

        const allValues = rows
          .map((r) => (r as any)[col] as number | null)
          .filter((v): v is number => v != null)
          .sort((a, b) => a - b);

        ranks[metricKey] = this.computeRank(callerValue, allValues, lowerIsBetter);
      }

      result.push({
        snapshotDate: snapshot_date.toISOString().split("T")[0]!,
        ranks,
        optedInCount: rows.length,
      });
    }

    return result;
  }

  // ─── Helpers ──────────────────────────────────────────────

  private computeRank(value: number, sortedAsc: number[], lowerIsBetter: boolean): number {
    if (sortedAsc.length === 0) return 50;
    if (sortedAsc.length === 1) return 50;

    // Count how many values the caller beats
    let beatCount = 0;
    for (const v of sortedAsc) {
      if (lowerIsBetter) {
        if (value < v) beatCount++;
      } else {
        if (value > v) beatCount++;
      }
    }

    // Percentile rank (0-100)
    return Math.round((beatCount / (sortedAsc.length - 1)) * 100);
  }

  private matchesLocationTier(count: number, tier: "1" | "2-5" | "6+"): boolean {
    switch (tier) {
      case "1": return count === 1;
      case "2-5": return count >= 2 && count <= 5;
      case "6+": return count >= 6;
    }
  }

  private matchesItemTier(count: number, tier: "1-100" | "101-500" | "500+"): boolean {
    switch (tier) {
      case "1-100": return count >= 1 && count <= 100;
      case "101-500": return count >= 101 && count <= 500;
      case "500+": return count > 500;
    }
  }

  private async computeCategoryPercentiles(
    snapshotDate: Date,
    callerBusinessId: string,
    businessIds: string[]
  ): Promise<CategoryPercentiles[]> {
    if (businessIds.length < 2) return [];

    // Extract byCategory arrays from all snapshots
    const snapshots = await this.prisma.$queryRaw<Array<{
      business_id: string;
      by_category: any;
    }>>`
      SELECT
        bs.business_id,
        bs.metrics_json->'byCategory' as by_category
      FROM benchmark_snapshots bs
      WHERE bs.snapshot_date = ${snapshotDate}::date
        AND bs.business_id = ANY(${businessIds}::uuid[])
        AND bs.metrics_json->'byCategory' IS NOT NULL
    `;

    // Group category data by countingMethod (always) and by normalized categoryName
    const byCountingMethod = new Map<string, Array<{ businessId: string; metrics: CategoryBenchmarkMetrics }>>();
    const byCategoryName = new Map<string, Array<{ businessId: string; metrics: CategoryBenchmarkMetrics }>>();

    for (const snap of snapshots) {
      const cats = snap.by_category as CategoryBenchmarkMetrics[] | null;
      if (!Array.isArray(cats)) continue;

      // Aggregate per-location categories into per-business
      const bizCats = new Map<string, CategoryBenchmarkMetrics>();
      for (const cat of cats) {
        const key = cat.categoryName?.toLowerCase() ?? "uncategorized";
        const existing = bizCats.get(key);
        if (existing) {
          existing.onHandValue += cat.onHandValue;
          existing.cogs7d += cat.cogs7d;
          existing.varianceImpact += cat.varianceImpact;
          existing.activeItemCount += cat.activeItemCount;
        } else {
          bizCats.set(key, { ...cat, categoryName: cat.categoryName });
        }
      }

      for (const [normName, cat] of bizCats) {
        // Recalculate pourCostPct after aggregation
        cat.pourCostPct = cat.onHandValue > 0 ? Math.round((cat.cogs7d / cat.onHandValue) * 1000) / 10 : null;

        // Group by counting method
        const cmKey = cat.countingMethod;
        if (!byCountingMethod.has(cmKey)) byCountingMethod.set(cmKey, []);
        byCountingMethod.get(cmKey)!.push({ businessId: snap.business_id, metrics: cat });

        // Group by category name
        if (!byCategoryName.has(normName)) byCategoryName.set(normName, []);
        byCategoryName.get(normName)!.push({ businessId: snap.business_id, metrics: cat });
      }
    }

    const results: CategoryPercentiles[] = [];
    const catMetricKeys = ["onHandValue", "cogs7d", "varianceImpact", "activeItemCount", "pourCostPct"] as const;

    // By counting method (always include)
    for (const [method, entries] of byCountingMethod) {
      if (entries.length < 2) continue;

      const callerEntry = entries.find((e) => e.businessId === callerBusinessId);
      const percMetrics = {} as CategoryPercentiles["metrics"];

      for (const mk of catMetricKeys) {
        const values = entries
          .map((e) => e.metrics[mk])
          .filter((v): v is number => v != null)
          .sort((a, b) => a - b);

        percMetrics[mk] = values.length > 0
          ? { p25: this.percentile(values, 0.25), p50: this.percentile(values, 0.5), p75: this.percentile(values, 0.75) }
          : { p25: null, p50: null, p75: null };
      }

      results.push({
        groupKey: method,
        groupType: "countingMethod",
        businessCount: entries.length,
        callerValue: callerEntry?.metrics ?? null,
        metrics: percMetrics,
      });
    }

    // By category name (only when 3+ businesses share it)
    for (const [catName, entries] of byCategoryName) {
      if (entries.length < 3) continue;

      const callerEntry = entries.find((e) => e.businessId === callerBusinessId);
      const percMetrics = {} as CategoryPercentiles["metrics"];

      for (const mk of catMetricKeys) {
        const values = entries
          .map((e) => e.metrics[mk])
          .filter((v): v is number => v != null)
          .sort((a, b) => a - b);

        percMetrics[mk] = values.length > 0
          ? { p25: this.percentile(values, 0.25), p50: this.percentile(values, 0.5), p75: this.percentile(values, 0.75) }
          : { p25: null, p50: null, p75: null };
      }

      results.push({
        groupKey: entries[0]!.metrics.categoryName,
        groupType: "category",
        businessCount: entries.length,
        callerValue: callerEntry?.metrics ?? null,
        metrics: percMetrics,
      });
    }

    return results;
  }

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

  private emptyPercentiles(): Record<CoreMetricKeys, PercentileSet> {
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
