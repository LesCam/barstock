/**
 * Seed POS test data for T's Pub
 *
 * Run: npx tsx packages/database/prisma/seed-pos-data.ts
 * Idempotent — safe to re-run (deletes prior seeded data first).
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LOCATION_ID = "62815fcb-deab-4698-9c65-b94649673cdc";
const USER_ID = "525e12fe-61a9-406a-af36-cfd1b9601c67"; // les@tspub.ca
const SOURCE_SYSTEM = "toast" as const;
const SEED_TAG = "seed-pos-data"; // used in notes field for cleanup

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 5 || day === 6;
}

async function main() {
  console.log("Seeding POS test data for T's Pub...\n");

  // ── Cleanup prior seed data ──────────────────────────────────
  // Delete in reverse dependency order
  const deleted1 = await prisma.consumptionEvent.deleteMany({
    where: { locationId: LOCATION_ID, notes: SEED_TAG },
  });
  console.log(`Cleaned up ${deleted1.count} old consumption events`);

  const deleted2 = await prisma.salesLine.deleteMany({
    where: { locationId: LOCATION_ID, posItemName: { startsWith: "POS-" } },
  });
  console.log(`Cleaned up ${deleted2.count} old sales lines`);

  const deleted3 = await prisma.inventorySessionLine.deleteMany({
    where: { session: { locationId: LOCATION_ID }, notes: SEED_TAG },
  });
  console.log(`Cleaned up ${deleted3.count} old session lines`);

  const deleted4 = await prisma.inventorySession.deleteMany({
    where: { locationId: LOCATION_ID, sessionType: "weekly" },
  });
  console.log(`Cleaned up ${deleted4.count} old seed sessions`);

  const deleted5 = await prisma.pOSItemMapping.deleteMany({
    where: { locationId: LOCATION_ID, posItemId: { startsWith: "toast-" } },
  });
  console.log(`Cleaned up ${deleted5.count} old POS mappings`);

  // ── Fetch active inventory items ──────────────────────────────
  const items = await prisma.inventoryItem.findMany({
    where: { locationId: LOCATION_ID, active: true },
    include: { category: true },
  });
  console.log(`Found ${items.length} active inventory items\n`);

  if (items.length === 0) {
    console.log("No items found — nothing to seed.");
    return;
  }

  // ── POS Item Mappings ─────────────────────────────────────────
  const mappings = items.map((item) => ({
    locationId: LOCATION_ID,
    sourceSystem: SOURCE_SYSTEM,
    posItemId: `toast-${item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    inventoryItemId: item.id,
    mode: "packaged_unit" as const,
    active: true,
    effectiveFromTs: daysAgo(31),
  }));

  await prisma.pOSItemMapping.createMany({ data: mappings });
  console.log(`Created ${mappings.length} POS item mappings`);

  // ── Receiving events (initial stock) ──────────────────────────
  const receivingEvents = items.map((item) => ({
    locationId: LOCATION_ID,
    eventType: "receiving" as const,
    sourceSystem: "manual" as const,
    eventTs: daysAgo(31),
    inventoryItemId: item.id,
    quantityDelta: randomInt(20, 60),
    uom: item.baseUom as any,
    confidenceLevel: "measured" as const,
    notes: SEED_TAG,
  }));

  await prisma.consumptionEvent.createMany({ data: receivingEvents });
  console.log(`Created ${receivingEvents.length} receiving events (initial stock)`);

  // ── Build per-item slug map for sales ─────────────────────────
  const itemsBySlug = new Map(
    mappings.map((m, i) => [m.posItemId, { item: items[i], mapping: m }])
  );

  // ── Sales lines + consumption events (30 days) ────────────────
  const salesLineBatch: any[] = [];
  const consumptionBatch: any[] = [];
  let salesCount = 0;

  for (let dayOffset = 30; dayOffset >= 1; dayOffset--) {
    const date = daysAgo(dayOffset);
    const businessDate = date.toISOString().split("T")[0];
    const weekend = isWeekend(date);
    const dailyLineCount = weekend ? randomInt(10, 18) : randomInt(5, 12);

    for (let lineNum = 0; lineNum < dailyLineCount; lineNum++) {
      // Pick a random item
      const idx = randomInt(0, items.length - 1);
      const item = items[idx];
      const mapping = mappings[idx];
      const quantity = randomInt(1, 3);

      // Vary sold_at within business hours (11am - 1am)
      const hourOffset = randomInt(0, 14); // 11am to 1am = 14 hrs
      const soldAt = new Date(date);
      soldAt.setHours(11 + hourOffset, randomInt(0, 59), randomInt(0, 59));

      const receiptId = `R-${businessDate}-${String(lineNum).padStart(3, "0")}`;
      const lineId = `L-${lineNum}`;

      salesLineBatch.push({
        sourceSystem: SOURCE_SYSTEM,
        sourceLocationId: LOCATION_ID,
        locationId: LOCATION_ID,
        businessDate: new Date(businessDate),
        soldAt,
        receiptId,
        lineId,
        posItemId: mapping.posItemId,
        posItemName: `POS-${item.name}`,
        quantity,
        isVoided: false,
        isRefunded: false,
      });

      consumptionBatch.push({
        locationId: LOCATION_ID,
        eventType: "pos_sale" as const,
        sourceSystem: SOURCE_SYSTEM,
        eventTs: soldAt,
        inventoryItemId: item.id,
        quantityDelta: -quantity,
        uom: item.baseUom as any,
        confidenceLevel: "theoretical" as const,
        notes: SEED_TAG,
      });

      salesCount++;
    }
  }

  // Batch insert sales lines
  await prisma.salesLine.createMany({ data: salesLineBatch });
  console.log(`Created ${salesCount} sales lines`);

  // Batch insert consumption events for sales
  await prisma.consumptionEvent.createMany({ data: consumptionBatch });
  console.log(`Created ${consumptionBatch.length} pos_sale consumption events`);

  // ── Track running on-hand per item for sessions ───────────────
  const onHand = new Map<string, number>();
  for (const re of receivingEvents) {
    onHand.set(re.inventoryItemId, re.quantityDelta);
  }

  // Sort consumption by time so running total is accurate
  const sortedConsumption = [...consumptionBatch].sort(
    (a, b) => a.eventTs.getTime() - b.eventTs.getTime()
  );

  // Build cumulative depletion up to each day
  function getOnHandAt(itemId: string, asOf: Date): number {
    let total = onHand.get(itemId) ?? 0;
    for (const ce of sortedConsumption) {
      if (ce.eventTs > asOf) break;
      if (ce.inventoryItemId === itemId) {
        total += ce.quantityDelta;
      }
    }
    return total;
  }

  // ── Inventory Sessions (3 closed) ─────────────────────────────
  const sessionDays = [20, 10, 3]; // days ago
  let totalSessionLines = 0;
  const adjustmentBatch: any[] = [];

  for (const dayOffset of sessionDays) {
    const startTime = daysAgo(dayOffset);
    startTime.setHours(10, 0, 0);
    const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000); // 2hr session

    const session = await prisma.inventorySession.create({
      data: {
        locationId: LOCATION_ID,
        sessionType: "weekly",
        startedTs: startTime,
        endedTs: endTime,
        createdBy: USER_ID,
        closedBy: USER_ID,
      },
    });

    // Create session lines for each item
    const sessionLineData: any[] = [];
    for (const item of items) {
      const theoretical = getOnHandAt(item.id, startTime);
      // Introduce some variance: ±0–3 units difference from theoretical
      const varianceAmount = randomInt(-3, 1);
      const counted = Math.max(0, Math.round(theoretical) + varianceAmount);

      const isWeighable = item.category?.countingMethod === "weighable";

      sessionLineData.push({
        sessionId: session.id,
        inventoryItemId: item.id,
        countUnits: isWeighable ? null : counted,
        grossWeightGrams: isWeighable ? counted * 30 : null, // rough approximation
        isManual: false,
        notes: SEED_TAG,
        countedBy: USER_ID,
      });

      // Create inventory_count_adjustment event
      const adjustment = counted - Math.round(theoretical);
      if (adjustment !== 0) {
        adjustmentBatch.push({
          locationId: LOCATION_ID,
          eventType: "inventory_count_adjustment" as const,
          sourceSystem: "manual" as const,
          eventTs: endTime,
          inventoryItemId: item.id,
          quantityDelta: adjustment,
          uom: item.baseUom as any,
          confidenceLevel: "measured" as const,
          notes: SEED_TAG,
        });
      }

      totalSessionLines++;
    }

    await prisma.inventorySessionLine.createMany({ data: sessionLineData });
    console.log(
      `Created session at day -${dayOffset} with ${sessionLineData.length} lines`
    );
  }

  if (adjustmentBatch.length > 0) {
    await prisma.consumptionEvent.createMany({ data: adjustmentBatch });
    console.log(
      `Created ${adjustmentBatch.length} inventory_count_adjustment events`
    );
  }

  // ── Summary ───────────────────────────────────────────────────
  console.log("\n--- POS Seed Complete ---");
  console.log(`  Sales lines: ${salesCount}`);
  console.log(`  Consumption events: ${consumptionBatch.length + receivingEvents.length + adjustmentBatch.length}`);
  console.log(`  Session lines: ${totalSessionLines}`);
  console.log(`  POS mappings: ${mappings.length}`);
  console.log(`  Sessions: ${sessionDays.length}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
