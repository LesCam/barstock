import { useMemo } from "react";
import { trpc } from "@/lib/trpc";

export interface ParStatusInfo {
  status: "green" | "yellow" | "red" | "none";
  parLevel: number | null;
  minLevel: number | null;
  currentOnHand: number;
  daysToStockout: number | null;
}

export function useParStatus(locationId: string | null) {
  const { data, isLoading } = trpc.parLevels.list.useQuery(
    { locationId: locationId! },
    {
      enabled: !!locationId,
      staleTime: 5 * 60 * 1000,
    }
  );

  const parMap = useMemo(() => {
    const map = new Map<string, ParStatusInfo>();
    if (!data) return map;
    for (const item of data) {
      if (item.status === "none") continue;
      map.set(item.inventoryItemId, {
        status: item.status,
        parLevel: item.parLevel,
        minLevel: item.minLevel,
        currentOnHand: item.currentOnHand,
        daysToStockout: item.daysToStockout,
      });
    }
    return map;
  }, [data]);

  return { parMap, isLoading };
}
