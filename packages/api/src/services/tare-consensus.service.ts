import type { ExtendedPrismaClient } from "@barstock/database";

export interface TareSuggestion {
  tareWeightG: number;
  stdDev: number;
  sampleCount: number;
  confidence: number;
}

export class TareConsensusService {
  constructor(private prisma: ExtendedPrismaClient) {}

  /**
   * Recalculate consensus tare weight for a barcode using trimmed mean.
   * Updates master_products consensus fields. Graceful no-op if master_product missing.
   */
  async recalculate(barcode: string): Promise<void> {
    const observations = await this.prisma.tareObservation.findMany({
      where: { barcode, isOutlier: false },
      select: { id: true, measuredWeightG: true },
      orderBy: { measuredWeightG: "asc" },
    });

    const n = observations.length;
    if (n === 0) return;

    const weights = observations.map((o) => Number(o.measuredWeightG));

    // Trimmed mean: remove top/bottom 10% if n >= 5
    let trimmedWeights: number[];
    if (n >= 5) {
      const trimCount = Math.floor(n * 0.1);
      trimmedWeights = weights.slice(trimCount, n - trimCount);
    } else {
      trimmedWeights = weights;
    }

    const mean =
      trimmedWeights.reduce((sum, w) => sum + w, 0) / trimmedWeights.length;

    // Standard deviation (population) of ALL non-outlier observations
    const variance =
      weights.reduce((sum, w) => sum + (w - mean) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);

    // Flag outliers (> 2σ from mean) — only if we have enough data
    if (n >= 3 && stdDev > 0) {
      const outlierIds: string[] = [];
      for (const obs of observations) {
        const w = Number(obs.measuredWeightG);
        if (Math.abs(w - mean) > 2 * stdDev) {
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

    // Confidence: min(100, n * 10 * consistencyFactor)
    let consistencyFactor: number;
    if (stdDev < 5) consistencyFactor = 1.0;
    else if (stdDev < 15) consistencyFactor = 0.7;
    else if (stdDev < 30) consistencyFactor = 0.4;
    else consistencyFactor = 0.2;

    const confidence = Math.min(100, Math.round(n * 10 * consistencyFactor));

    // Update master_products — updateMany so it gracefully no-ops if not found
    await this.prisma.masterProduct.updateMany({
      where: { barcode },
      data: {
        emptyBottleWeightG: mean,
        tareStdDev: stdDev,
        tareSampleCount: n,
        tareConfidence: confidence,
        tareAlgorithmVersion: 1,
        tareLastUpdatedAt: new Date(),
      },
    });
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
      },
    });

    if (!mp || mp.tareSampleCount === 0) return null;

    return {
      tareWeightG: Number(mp.emptyBottleWeightG),
      stdDev: mp.tareStdDev != null ? Number(mp.tareStdDev) : 0,
      sampleCount: mp.tareSampleCount,
      confidence: mp.tareConfidence,
    };
  }
}
