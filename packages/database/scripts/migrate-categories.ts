/**
 * Data migration: populate inventory_item_categories per business
 * and backfill category_id on existing inventory_items.
 *
 * Run with: npx tsx packages/database/scripts/migrate-categories.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_CATEGORIES = [
  { name: "Packaged Beer", countingMethod: "unit_count" as const, defaultDensity: null, sortOrder: 0 },
  { name: "Keg Beer",      countingMethod: "keg" as const,        defaultDensity: null, sortOrder: 1 },
  { name: "Liquor",        countingMethod: "weighable" as const,  defaultDensity: 0.95, sortOrder: 2 },
  { name: "Wine",          countingMethod: "weighable" as const,  defaultDensity: 0.99, sortOrder: 3 },
  { name: "Food",          countingMethod: "unit_count" as const, defaultDensity: null, sortOrder: 4 },
  { name: "Misc",          countingMethod: "unit_count" as const, defaultDensity: null, sortOrder: 5 },
] as const;

const TYPE_TO_CATEGORY_NAME: Record<string, string> = {
  packaged_beer: "Packaged Beer",
  keg_beer: "Keg Beer",
  liquor: "Liquor",
  wine: "Wine",
  food: "Food",
  misc: "Misc",
};

async function main() {
  const businesses = await prisma.business.findMany({ select: { id: true, name: true } });
  console.log(`Found ${businesses.length} businesses to migrate\n`);

  for (const biz of businesses) {
    console.log(`--- ${biz.name} (${biz.id}) ---`);

    await prisma.$transaction(async (tx) => {
      // 1. Create default categories (skip if already exist)
      const existing = await tx.inventoryItemCategory.findMany({
        where: { businessId: biz.id },
        select: { name: true, id: true },
      });
      const existingNames = new Set(existing.map((c) => c.name));

      const created: Array<{ id: string; name: string }> = [];
      for (const cat of DEFAULT_CATEGORIES) {
        if (existingNames.has(cat.name)) {
          console.log(`  Category "${cat.name}" already exists, skipping`);
          continue;
        }
        const row = await tx.inventoryItemCategory.create({
          data: {
            businessId: biz.id,
            name: cat.name,
            countingMethod: cat.countingMethod,
            defaultDensity: cat.defaultDensity,
            sortOrder: cat.sortOrder,
          },
        });
        created.push({ id: row.id, name: row.name });
        console.log(`  Created category: ${cat.name}`);
      }

      // Build name→id lookup (existing + newly created)
      const allCategories = await tx.inventoryItemCategory.findMany({
        where: { businessId: biz.id },
        select: { id: true, name: true },
      });
      const nameToId = new Map(allCategories.map((c) => [c.name, c.id]));

      // 2. Backfill category_id on inventory items for this business
      const locations = await tx.location.findMany({
        where: { businessId: biz.id },
        select: { id: true },
      });
      const locationIds = locations.map((l) => l.id);

      const items = await tx.inventoryItem.findMany({
        where: {
          locationId: { in: locationIds },
          categoryId: null,
          type: { not: null },
        },
        select: { id: true, type: true },
      });

      let updated = 0;
      for (const item of items) {
        const catName = TYPE_TO_CATEGORY_NAME[item.type!];
        const catId = catName ? nameToId.get(catName) : null;
        if (catId) {
          await tx.inventoryItem.update({
            where: { id: item.id },
            data: { categoryId: catId },
          });
          updated++;
        } else {
          console.log(`  WARNING: No category for type "${item.type}" on item ${item.id}`);
        }
      }
      console.log(`  Backfilled ${updated} items\n`);
    });
  }

  console.log("Migration complete!");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
