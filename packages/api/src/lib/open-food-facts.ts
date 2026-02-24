/**
 * Open Food Facts API integration for barcode product lookup.
 * Free, no auth required. Uses the v2 API.
 */

const OFF_BASE_URL = "https://world.openfoodfacts.net/api/v2/product";
const TIMEOUT_MS = 3000;

export interface OpenFoodFactsResult {
  name: string;
  brand: string | null;
  containerSizeMl: number | null;
  categoryHint: string | null;
  imageUrl: string | null;
}

/** Parse quantity strings like "750 ml", "1.75 L", "70 cl" to ml */
export function parseQuantityToMl(quantity: string): number | null {
  if (!quantity) return null;
  const normalized = quantity.toLowerCase().trim();

  // Match patterns like "750 ml", "1.75L", "70cl", "1 liter"
  const match = normalized.match(
    /(\d+(?:[.,]\d+)?)\s*(ml|cl|l|liter|litre|fl\s*oz)/
  );
  if (!match) return null;

  const value = parseFloat(match[1].replace(",", "."));
  if (isNaN(value) || value <= 0) return null;

  const unit = match[2];
  if (unit === "ml") return Math.round(value);
  if (unit === "cl") return Math.round(value * 10);
  if (unit === "l" || unit === "liter" || unit === "litre")
    return Math.round(value * 1000);
  if (unit.startsWith("fl")) return Math.round(value * 29.5735); // fl oz to ml

  return null;
}

/** Look up a barcode on Open Food Facts. Returns product info or null. */
export async function lookupOpenFoodFacts(
  barcode: string
): Promise<OpenFoodFactsResult | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = `${OFF_BASE_URL}/${encodeURIComponent(barcode)}?fields=product_name,brands,quantity,categories_tags,image_front_url`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Barstock/1.0 (barcode-lookup)" },
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      status: number;
      product?: {
        product_name?: string;
        brands?: string;
        quantity?: string;
        categories_tags?: string[];
        image_front_url?: string;
      };
    };
    if (data.status !== 1 || !data.product) return null;

    const product = data.product;
    const name = product.product_name?.trim();
    if (!name) return null;

    const brand = product.brands?.trim() || null;
    const containerSizeMl = product.quantity
      ? parseQuantityToMl(product.quantity)
      : null;

    // Extract a useful category hint from categories_tags
    // Tags look like "en:alcoholic-beverages", "en:spirits", "en:vodkas"
    let categoryHint: string | null = null;
    const tags: string[] = product.categories_tags ?? [];
    // Pick the most specific (last) English tag
    for (let i = tags.length - 1; i >= 0; i--) {
      if (tags[i].startsWith("en:")) {
        categoryHint = tags[i]
          .replace("en:", "")
          .replace(/-/g, " ");
        break;
      }
    }

    const imageUrl = product.image_front_url?.trim() || null;

    return { name, brand, containerSizeMl, categoryHint, imageUrl };
  } catch {
    // Timeout, network error, parse error — all return null
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
