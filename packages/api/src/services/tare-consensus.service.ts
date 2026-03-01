import type { ExtendedPrismaClient } from "@barstock/database";
import type { BusinessSettingsData, TareTrustSettings } from "./settings.service";

export interface TareSuggestion {
  tareWeightG: number;
  stdDev: number;
  sampleCount: number;
  confidence: number;
  contributorCount: number;
  redesignSuspected: boolean;
}

// Source type reliability multipliers
const SOURCE_MULTIPLIERS: Record<string, number> = {
  empty_confirmed: 1.0,
  manual_template: 0.8,
  imported: 0.6,
};

const RECENCY_HALF_LIFE_DAYS = 365;
const ALGORITHM_VERSION = 2;

interface ObservationRow {
  id: string;
  measuredWeightG: number;
  sourceBusinessId: string | null;
  sourceType: string;
  createdAt: Date;
}

export class TareConsensusService {
  constructor(private prisma: ExtendedPrismaClient) {}

  /**
   * Recalculate consensus tare weight for a barcode using trust-weighted consensus (v2).
   * Updates master_products consensus fields. Graceful no-op if master_product missing.
   */
  async recalculate(barcode: string): Promise<void> {
    const rawObservations = await this.prisma.tareObservation.findMany({
      where: { barcode, isOutlier: false },
      select: {
        id: true,
        measuredWeightG: true,
        sourceBusinessId: true,
        sourceType: true,
        createdAt: true,
      },
      orderBy: { measuredWeightG: "asc" },
    });

    const n = rawObservations.length;
    if (n === 0) return;

    const observations: ObservationRow[] = rawObservations.map((o) => ({
      id: o.id,
      measuredWeightG: Number(o.measuredWeightG),
      sourceBusinessId: o.sourceBusinessId,
      sourceType: o.sourceType,
      createdAt: o.createdAt,
    }));

    // Collect distinct business IDs
    const businessIds = [
      ...new Set(
        observations
          .map((o) => o.sourceBusinessId)
          .filter((id): id is string => id != null)
      ),
    ];
    const contributorCount = businessIds.length;

    // Load trust scores for all contributing businesses
    const trustScores = await this.loadBusinessTrustScores(businessIds);

    // Compute composite weight per observation
    const now = Date.now();
    const compositeWeights: number[] = observations.map((obs) => {
      const trust = obs.sourceBusinessId
        ? (trustScores.get(obs.sourceBusinessId) ?? 50)
        : 50;
      const sourceMultiplier = SOURCE_MULTIPLIERS[obs.sourceType] ?? 0.6;
      const ageDays =
        (now - obs.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      const recencyFactor = Math.pow(
        0.5,
        ageDays / RECENCY_HALF_LIFE_DAYS
      );
      return (trust / 100) * sourceMultiplier * recencyFactor;
    });

    // Weighted mean
    let totalWeight = 0;
    let weightedSum = 0;
    for (let i = 0; i < n; i++) {
      weightedSum += observations[i].measuredWeightG * compositeWeights[i];
      totalWeight += compositeWeights[i];
    }
    const mean = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Weighted standard deviation
    let weightedVarianceSum = 0;
    for (let i = 0; i < n; i++) {
      weightedVarianceSum +=
        compositeWeights[i] *
        (observations[i].measuredWeightG - mean) ** 2;
    }
    const stdDev =
      totalWeight > 0 ? Math.sqrt(weightedVarianceSum / totalWeight) : 0;

    // Flag outliers (> 2σ from mean) — only if we have enough data
    if (n >= 3 && stdDev > 0) {
      const outlierIds: string[] = [];
      for (const obs of observations) {
        if (Math.abs(obs.measuredWeightG - mean) > 2 * stdDev) {
          outlierIds.push(obs.id);
        }
      }
      if (outlierIds.length > 0) {
        await this.prisma.tareObservation.updateMany({
          where: { id: { in: outlierIds } },
          data: { isOutlier: true },
        });
      }
    }

    // Multi-factor confidence
    const confidence = this.computeConfidence(
      n,
      stdDev,
      contributorCount,
      observations
    );

    // Redesign detection
    const redesignSuspected = this.detectRedesign(observations, mean);

    // Update master_products
    await this.prisma.masterProduct.updateMany({
      where: { barcode },
      data: {
        emptyBottleWeightG: mean,
        tareStdDev: stdDev,
        tareSampleCount: n,
        tareConfidence: confidence,
        tareAlgorithmVersion: ALGORITHM_VERSION,
        tareLastUpdatedAt: new Date(),
        redesignSuspected,
        tareContributorCount: contributorCount,
      },
    });

    // Lazy trust update for contributing businesses
    await this.updateBusinessTrustScores(
      observations,
      mean,
      stdDev,
      trustScores
    );
  }

  /**
   * Get the current tare suggestion for a barcode.
   * Returns null if no observations exist.
   */
  async getSuggestion(barcode: string): Promise<TareSuggestion | null> {
    const mp = await this.prisma.masterProduct.findUnique({
      where: { barcode },
      select: {
        emptyBottleWeightG: true,
        tareStdDev: true,
        tareSampleCount: true,
        tareConfidence: true,
        tareContributorCount: true,
        redesignSuspected: true,
      },
    });

    if (!mp || mp.tareSampleCount === 0) return null;

    return {
      tareWeightG: Number(mp.emptyBottleWeightG),
      stdDev: mp.tareStdDev != null ? Number(mp.tareStdDev) : 0,
      sampleCount: mp.tareSampleCount,
      confidence: mp.tareConfidence,
      contributorCount: mp.tareContributorCount,
      redesignSuspected: mp.redesignSuspected,
    };
  }

  /**
   * Load trust scores for a batch of business IDs from business_settings.
   */
  private async loadBusinessTrustScores(
    businessIds: string[]
  ): Promise<Map<string, number>> {
    const scores = new Map<string, number>();
    if (businessIds.length === 0) return scores;

    const rows = await this.prisma.businessSettings.findMany({
      where: { businessId: { in: businessIds } },
      select: { businessId: true, settingsJson: true },
    });

    for (const row of rows) {
      const settings = row.settingsJson as Partial<BusinessSettingsData> | null;
      const trust = settings?.tareTrust?.trustScore ?? 50;
      scores.set(row.businessId, trust);
    }

    // Default score for businesses without settings rows
    for (const id of businessIds) {
      if (!scores.has(id)) scores.set(id, 50);
    }

    return scores;
  }

  /**
   * Multi-factor confidence scoring.
   * - Sample count: 0-30pts (logarithmic)
   * - Consistency (stdDev): 0-30pts
   * - Contributor diversity: 0-20pts
   * - Recency: 0-20pts
   */
  private computeConfidence(
    n: number,
    stdDev: number,
    contributorCount: number,
    observations: ObservationRow[]
  ): number {
    // Sample count: logarithmic scale, 30 samples → 30pts
    const sampleScore = Math.min(30, Math.round(30 * (Math.log(n + 1) / Math.log(31))));

    // Consistency: inverse of stdDev
    let consistencyScore: number;
    if (stdDev < 3) consistencyScore = 30;
    else if (stdDev < 8) consistencyScore = 25;
    else if (stdDev < 15) consistencyScore = 18;
    else if (stdDev < 30) consistencyScore = 10;
    else consistencyScore = 3;

    // Contributor diversity: more businesses = higher trust
    let diversityScore: number;
    if (contributorCount >= 5) diversityScore = 20;
    else if (contributorCount >= 3) diversityScore = 15;
    else if (contributorCount >= 2) diversityScore = 10;
    else diversityScore = 3;

    // Recency: based on most recent observation
    const now = Date.now();
    const mostRecent = Math.max(
      ...observations.map((o) => o.createdAt.getTime())
    );
    const daysSinceRecent =
      (now - mostRecent) / (1000 * 60 * 60 * 24);
    let recencyScore: number;
    if (daysSinceRecent < 30) recencyScore = 20;
    else if (daysSinceRecent < 90) recencyScore = 15;
    else if (daysSinceRecent < 180) recencyScore = 10;
    else if (daysSinceRecent < 365) recencyScore = 5;
    else recencyScore = 2;

    return Math.min(
      100,
      sampleScore + consistencyScore + diversityScore + recencyScore
    );
  }

  /**
   * Detect possible bottle redesign via bimodal weight distribution.
   * Requires n>=6 with two clusters of >=3 obs each, separated by >20g,
   * and each cluster internally consistent (stdDev <10g).
   */
  private detectRedesign(
    observations: ObservationRow[],
    mean: number
  ): boolean {
    if (observations.length < 6) return false;

    const below = observations.filter((o) => o.measuredWeightG < mean);
    const above = observations.filter((o) => o.measuredWeightG >= mean);

    if (below.length < 3 || above.length < 3) return false;

    const belowMean =
      below.reduce((s, o) => s + o.measuredWeightG, 0) / below.length;
    const aboveMean =
      above.reduce((s, o) => s + o.measuredWeightG, 0) / above.length;

    // Clusters must be separated by >20g
    if (aboveMean - belowMean <= 20) return false;

    // Each cluster must be internally consistent (stdDev < 10g)
    const belowStdDev = Math.sqrt(
      below.reduce((s, o) => s + (o.measuredWeightG - belowMean) ** 2, 0) /
        below.length
    );
    const aboveStdDev = Math.sqrt(
      above.reduce((s, o) => s + (o.measuredWeightG - aboveMean) ** 2, 0) /
        above.length
    );

    return belowStdDev < 10 && aboveStdDev < 10;
  }

  /**
   * Lazy trust adjustment for contributing businesses.
   * Within 1σ: +2, within 2σ: 0, beyond 2σ: -3. Clamped [10, 100].
   */
  private async updateBusinessTrustScores(
    observations: ObservationRow[],
    consensusMean: number,
    stdDev: number,
    currentScores: Map<string, number>
  ): Promise<void> {
    if (stdDev === 0) return; // Can't evaluate accuracy with no variance

    // Group observations by business
    const businessObservations = new Map<string, number[]>();
    for (const obs of observations) {
      if (!obs.sourceBusinessId) continue;
      const existing = businessObservations.get(obs.sourceBusinessId) ?? [];
      existing.push(obs.measuredWeightG);
      businessObservations.set(obs.sourceBusinessId, existing);
    }

    for (const [businessId, weights] of businessObservations) {
      const avgWeight =
        weights.reduce((s, w) => s + w, 0) / weights.length;
      const distance = Math.abs(avgWeight - consensusMean);

      let delta: number;
      if (distance <= stdDev) delta = 2;
      else if (distance <= 2 * stdDev) delta = 0;
      else delta = -3;

      if (delta === 0) continue;

      const currentScore = currentScores.get(businessId) ?? 50;
      const newScore = Math.max(10, Math.min(100, currentScore + delta));
      if (newScore === currentScore) continue;

      // Write directly to business_settings.settings_json
      const row = await this.prisma.businessSettings.findUnique({
        where: { businessId },
        select: { settingsJson: true },
      });

      const settings = (row?.settingsJson as Record<string, any>) ?? {};
      settings.tareTrust = {
        ...(settings.tareTrust ?? {}),
        trustScore: newScore,
        trustUpdatedAt: new Date().toISOString(),
      };

      await this.prisma.businessSettings.upsert({
        where: { businessId },
        create: { businessId, settingsJson: settings },
        update: { settingsJson: settings },
      });
    }
  }
}
