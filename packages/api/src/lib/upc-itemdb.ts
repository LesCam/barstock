/**
 * UPC Item DB API integration for barcode product lookup.
 * Free trial tier: 100 requests/day, no API key required.
 * Good coverage for spirits/liquor that Open Food Facts often misses.
 */

import { parseQuantityToMl } from "./open-food-facts";

const UPCITEMDB_BASE_URL = "https://api.upcitemdb.com/prod/trial/lookup";
const TIMEOUT_MS = 3000;

export interface UpcItemDbResult {
  name: string;
  brand: string | null;
  containerSizeMl: number | null;
  categoryHint: string | null;
  imageUrl: string | null;
}

/** Look up a barcode on UPC Item DB. Returns product info or null. */
export async function lookupUpcItemDb(
  barcode: string
): Promise<UpcItemDbResult | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = `${UPCITEMDB_BASE_URL}?upc=${encodeURIComponent(barcode)}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Barstock/1.0 (barcode-lookup)",
      },
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      code: string;
      total: number;
      items?: Array<{
        title?: string;
        brand?: string;
        description?: string;
        category?: string;
        size?: string;
        weight?: string;
        dimension?: string;
        images?: string[];
      }>;
    };

    if (data.code !== "OK" || !data.items?.length) return null;

    const item = data.items[0];
    const name = item.title?.trim();
    if (!name) return null;

    const brand = item.brand?.trim() || null;

    // Try to parse container size from the size or description fields
    let containerSizeMl: number | null = null;
    if (item.size) {
      containerSizeMl = parseQuantityToMl(item.size);
    }
    if (!containerSizeMl && item.description) {
      containerSizeMl = parseQuantityToMl(item.description);
    }
    if (!containerSizeMl && item.title) {
      containerSizeMl = parseQuantityToMl(item.title);
    }

    // Extract category hint from Google product taxonomy
    let categoryHint: string | null = null;
    if (item.category) {
      // Category looks like "Food, Beverages & Tobacco > Beverages > Alcoholic Beverages > Spirits"
      const parts = item.category.split(">");
      const last = parts[parts.length - 1]?.trim().toLowerCase();
      if (last) categoryHint = last;
    }

    const imageUrl = item.images?.[0]?.trim() || null;

    return { name, brand, containerSizeMl, categoryHint, imageUrl };
  } catch {
    // Timeout, network error, parse error — all return null
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
