import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";

export interface PrefillItem {
  id: string;
  name: string;
  barcode: string | null;
  packSize: unknown;
  containerSize: unknown;
  baseUom: string;
  category?: { id: string; name: string; countingMethod: string } | null;
}

/**
 * Fetches an inventory item by ID (from route params) and returns it once.
 * Designed for voice-command pre-fill — fires the query once, then stops.
 */
export function usePrefillItem(itemId: string | undefined): PrefillItem | null {
  const applied = useRef(false);
  const [item, setItem] = useState<PrefillItem | null>(null);

  const { data } = trpc.inventory.getById.useQuery(
    { id: itemId! },
    { enabled: !!itemId && !applied.current },
  );

  useEffect(() => {
    if (data && !applied.current) {
      applied.current = true;
      setItem({
        id: data.id,
        name: data.name,
        barcode: data.barcode ?? null,
        packSize: data.packSize,
        containerSize: data.containerSize,
        baseUom: data.baseUom,
        category: data.category ?? null,
      });
    }
  }, [data]);

  return item;
}
