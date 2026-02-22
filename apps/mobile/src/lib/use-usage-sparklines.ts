import { useMemo } from "react";
import { trpc } from "@/lib/trpc";

export function useUsageSparklines(locationId: string | null) {
  const fromDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d;
  }, []);
  const toDate = useMemo(() => new Date(), []);

  const { data, isLoading } = trpc.reports.usageOverTime.useQuery(
    {
      locationId: locationId!,
      fromDate,
      toDate,
      granularity: "day",
    },
    {
      enabled: !!locationId,
      staleTime: 5 * 60 * 1000,
    }
  );

  const sparklineMap = useMemo(() => {
    const map = new Map<string, number[]>();
    if (!data?.itemSeries) return map;
    for (const series of data.itemSeries) {
      map.set(
        series.itemId,
        series.dataPoints.map((dp) => dp.qty)
      );
    }
    return map;
  }, [data]);

  return { sparklineMap, isLoading };
}
