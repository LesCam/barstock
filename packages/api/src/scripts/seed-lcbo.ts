/**
 * Seed master_products from LCBO product catalog.
 * Fetches all ~6,600 products via GraphQL API (free, no auth).
 * Run: npx tsx packages/api/src/scripts/seed-lcbo.ts
 */

import { PrismaClient } from "@prisma/client";

const LCBO_GRAPHQL = "https://api.lcbo.dev/graphql";
const PAGE_SIZE = 100;

interface LcboProduct {
  name: string;
  sku: string;
  upcNumber: string | null;
  producerName: string | null;
  primaryCategory: string | null;
  unitVolumeMl: number | null;
  alcoholPercent: number | null;
  thumbnailUrl: string | null;
}

async function fetchPage(cursor: string | null): Promise<{
  products: LcboProduct[];
  hasNextPage: boolean;
  endCursor: string | null;
}> {
  const afterClause = cursor ? `, after: "${cursor}"` : "";
  const query = `{
    products(pagination: { first: ${PAGE_SIZE}${afterClause} }) {
      edges {
        node {
          name sku upcNumber producerName primaryCategory
          unitVolumeMl alcoholPercent thumbnailUrl
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }`;

  const res = await fetch(LCBO_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  const json = (await res.json()) as any;
  const connection = json.data.products;
  return {
    products: connection.edges.map((e: any) => e.node),
    hasNextPage: connection.pageInfo.hasNextPage,
    endCursor: connection.pageInfo.endCursor,
  };
}

/** Map LCBO category string to a simple category hint */
function parseCategoryHint(primary: string | null): string | null {
  if (!primary) return null;
  // Format: "Products|Spirits|Rum|White Rum|Classic White Rum"
  const parts = primary.split("|").map((s) => s.trim());
  // Return the most specific useful segment (index 2 or 3)
  if (parts.length >= 3) return parts[2].toLowerCase();
  if (parts.length >= 2) return parts[1].toLowerCase();
  return null;
}

async function main() {
  const prisma = new PrismaClient();
  let cursor: string | null = null;
  let total = 0;
  let upserted = 0;
  let skipped = 0;

  console.log("Fetching LCBO product catalog...");

  try {
    do {
      const page = await fetchPage(cursor);
      total += page.products.length;

      for (const p of page.products) {
        if (!p.upcNumber || !p.name) {
          skipped++;
          continue;
        }

        const barcode = p.upcNumber.replace(/^0+/, "") || p.upcNumber;
        // Also store the original with leading zeros
        const barcodes = [barcode];
        if (p.upcNumber !== barcode) barcodes.push(p.upcNumber);

        for (const bc of barcodes) {
          try {
            await prisma.masterProduct.upsert({
              where: { barcode: bc },
              update: {
                name: p.name,
                categoryHint: parseCategoryHint(p.primaryCategory),
                containerSizeMl: p.unitVolumeMl ?? undefined,
                lastContributedAt: new Date(),
                contributionCount: { increment: 1 },
              },
              create: {
                barcode: bc,
                name: p.name,
                categoryHint: parseCategoryHint(p.primaryCategory),
                baseUom: "oz",
                containerSizeMl: p.unitVolumeMl ?? null,
                contributionCount: 1,
              },
            });
            upserted++;
          } catch {
            // Duplicate or constraint error — skip
          }
        }
      }

      console.log(`  Fetched ${total} products so far (upserted ${upserted}, skipped ${skipped})`);
      cursor = page.hasNextPage ? page.endCursor : null;
    } while (cursor);

    console.log(`\nDone! ${total} LCBO products fetched, ${upserted} master products upserted, ${skipped} skipped (no UPC).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
