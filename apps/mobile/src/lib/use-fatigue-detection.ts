import { useMemo } from "react";

interface SessionLine {
  id: string;
  inventoryItemId: string;
  countUnits: number | string | null;
  grossWeightGrams: number | string | null;
  createdAt: string | Date;
}

interface HintData {
  inventoryItemId: string;
  lastCountValue: number | null;
  avgDailyUsage: number | null;
  lastCountDate: string | Date;
  isWeight?: boolean;
}

interface FatigueResult {
  detected: boolean;
  recentAvgDeviation: number;
  earlyAvgDeviation: number;
}

/**
 * Client-side fatigue detection hook.
 * Compares deviation from predicted levels between early and recent items.
 * If recent deviation exceeds early deviation * multiplier, fatigue is detected.
 */
export function useFatigueDetection(
  lines: SessionLine[],
  hintsMap: Map<string, HintData>,
  settings: {
    fatigueDetectionEnabled: boolean;
    fatigueVarianceThresholdMultiplier: number;
  } | null,
): FatigueResult {
  return useMemo(() => {
    const noDetection: FatigueResult = { detected: false, recentAvgDeviation: 0, earlyAvgDeviation: 0 };

    if (!settings?.fatigueDetectionEnabled || lines.length < 10) return noDetection;

    // Sort lines by creation time
    const sorted = [...lines].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    // Compute deviation for each line that has a hint estimate
    const deviations: number[] = [];
    for (const line of sorted) {
      const hint = hintsMap.get(line.inventoryItemId);
      if (!hint || hint.lastCountValue == null || hint.avgDailyUsage == null) continue;

      const daysAgo = (new Date(line.createdAt).getTime() - new Date(hint.lastCountDate).getTime()) / 86400000;
      const predicted = Math.max(0, hint.lastCountValue - hint.avgDailyUsage * daysAgo);
      const counted = line.countUnits != null ? Number(line.countUnits) : Number(line.grossWeightGrams ?? 0);
      const dev = Math.abs(counted - predicted) / Math.max(predicted, 1);
      deviations.push(dev);
    }

    if (deviations.length < 10) return noDetection;

    // Split into first 2/3 and last 1/3
    const splitIdx = Math.floor(deviations.length * (2 / 3));
    const early = deviations.slice(0, splitIdx);
    const recent = deviations.slice(splitIdx);

    const earlyAvg = early.reduce((s, v) => s + v, 0) / early.length;
    const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;

    const multiplier = settings.fatigueVarianceThresholdMultiplier;
    const detected = recentAvg > earlyAvg * multiplier && recentAvg > 0.15;

    return {
      detected,
      recentAvgDeviation: Math.round(recentAvg * 1000) / 1000,
      earlyAvgDeviation: Math.round(earlyAvg * 1000) / 1000,
    };
  }, [lines.length, hintsMap, settings?.fatigueDetectionEnabled, settings?.fatigueVarianceThresholdMultiplier]);
}
