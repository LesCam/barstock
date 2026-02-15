import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...\n");

  // ── Org ──────────────────────────────────────────────────────
  const org = await prisma.org.create({
    data: { name: "Demo Bar Group" },
  });
  console.log(`Created org: ${org.name} (${org.id})`);

  // ── Locations ────────────────────────────────────────────────
  const location1 = await prisma.location.create({
    data: {
      name: "The Brass Tap",
      timezone: "America/Montreal",
      closeoutHour: 4,
      orgId: org.id,
    },
  });

  const location2 = await prisma.location.create({
    data: {
      name: "Riverside Lounge",
      timezone: "America/Montreal",
      closeoutHour: 3,
      orgId: org.id,
    },
  });
  console.log(`Created locations: ${location1.name}, ${location2.name}`);

  // ── Users ────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash("password123", 12);

  const admin = await prisma.user.create({
    data: {
      email: "admin@barstock.app",
      passwordHash,
      role: "admin",
      locationId: location1.id,
    },
  });

  const manager = await prisma.user.create({
    data: {
      email: "manager@barstock.app",
      passwordHash,
      role: "manager",
      locationId: location1.id,
    },
  });

  const staff = await prisma.user.create({
    data: {
      email: "staff@barstock.app",
      passwordHash,
      role: "staff",
      locationId: location1.id,
    },
  });
  console.log(`Created users: admin, manager, staff (password: password123)`);

  // Give admin access to both locations
  await prisma.userLocation.create({
    data: {
      userId: admin.id,
      locationId: location2.id,
      role: "admin",
    },
  });
  console.log(`Granted admin access to ${location2.name}`);

  // ── Keg Sizes ────────────────────────────────────────────────
  const halfBarrel = await prisma.kegSize.create({
    data: { name: "Half Barrel (15.5 gal)", totalOz: 1984 },
  });
  const sixtel = await prisma.kegSize.create({
    data: { name: "Sixtel (5.16 gal)", totalOz: 661 },
  });
  const quarterBarrel = await prisma.kegSize.create({
    data: { name: "Quarter Barrel (7.75 gal)", totalOz: 992 },
  });
  console.log(`Created keg sizes: half barrel, sixtel, quarter barrel`);

  // ── Inventory Items (Location 1) ────────────────────────────
  const budLight = await prisma.inventoryItem.create({
    data: {
      locationId: location1.id,
      type: "packaged_beer",
      name: "Bud Light 12oz Can",
      barcode: "018200007712",
      baseUom: "units",
      packSize: 24,
      packUom: "units",
    },
  });

  const ipaKeg = await prisma.inventoryItem.create({
    data: {
      locationId: location1.id,
      type: "keg_beer",
      name: "Local IPA",
      baseUom: "oz",
    },
  });

  const lagerKeg = await prisma.inventoryItem.create({
    data: {
      locationId: location1.id,
      type: "keg_beer",
      name: "House Lager",
      baseUom: "oz",
    },
  });

  const jackDaniels = await prisma.inventoryItem.create({
    data: {
      locationId: location1.id,
      type: "liquor",
      name: "Jack Daniel's Old No. 7",
      barcode: "082184090466",
      baseUom: "oz",
    },
  });

  const greyGoose = await prisma.inventoryItem.create({
    data: {
      locationId: location1.id,
      type: "liquor",
      name: "Grey Goose Vodka",
      barcode: "080480280024",
      baseUom: "oz",
    },
  });

  const captainMorgan = await prisma.inventoryItem.create({
    data: {
      locationId: location1.id,
      type: "liquor",
      name: "Captain Morgan Spiced Rum",
      baseUom: "oz",
    },
  });

  const houseRed = await prisma.inventoryItem.create({
    data: {
      locationId: location1.id,
      type: "wine",
      name: "House Red Blend (750ml)",
      baseUom: "ml",
    },
  });

  const prosecco = await prisma.inventoryItem.create({
    data: {
      locationId: location1.id,
      type: "wine",
      name: "Prosecco (750ml)",
      baseUom: "ml",
    },
  });

  console.log(`Created 8 inventory items for ${location1.name}`);

  // ── Price History ────────────────────────────────────────────
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  await prisma.priceHistory.createMany({
    data: [
      { inventoryItemId: budLight.id, unitCost: 0.75, effectiveFromTs: thirtyDaysAgo },
      { inventoryItemId: ipaKeg.id, unitCost: 175.0, effectiveFromTs: thirtyDaysAgo },
      { inventoryItemId: lagerKeg.id, unitCost: 135.0, effectiveFromTs: thirtyDaysAgo },
      { inventoryItemId: jackDaniels.id, unitCost: 28.5, effectiveFromTs: thirtyDaysAgo },
      { inventoryItemId: greyGoose.id, unitCost: 32.0, effectiveFromTs: thirtyDaysAgo },
      { inventoryItemId: captainMorgan.id, unitCost: 18.5, effectiveFromTs: thirtyDaysAgo },
      { inventoryItemId: houseRed.id, unitCost: 8.5, effectiveFromTs: thirtyDaysAgo },
      { inventoryItemId: prosecco.id, unitCost: 11.0, effectiveFromTs: thirtyDaysAgo },
    ],
  });
  console.log(`Created price history for all items`);

  // ── Keg Instances ────────────────────────────────────────────
  const ipaKegInstance = await prisma.kegInstance.create({
    data: {
      locationId: location1.id,
      inventoryItemId: ipaKeg.id,
      kegSizeId: halfBarrel.id,
      status: "in_service",
      receivedTs: thirtyDaysAgo,
      tappedTs: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      startingOz: 1984,
    },
  });

  const lagerKegInstance = await prisma.kegInstance.create({
    data: {
      locationId: location1.id,
      inventoryItemId: lagerKeg.id,
      kegSizeId: sixtel.id,
      status: "in_service",
      receivedTs: thirtyDaysAgo,
      tappedTs: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      startingOz: 661,
    },
  });

  const spareKeg = await prisma.kegInstance.create({
    data: {
      locationId: location1.id,
      inventoryItemId: ipaKeg.id,
      kegSizeId: halfBarrel.id,
      status: "in_storage",
      receivedTs: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      startingOz: 1984,
    },
  });
  console.log(`Created 3 keg instances (2 tapped, 1 in storage)`);

  // ── Tap Lines ────────────────────────────────────────────────
  const tap1 = await prisma.tapLine.create({
    data: { locationId: location1.id, name: "Tap 1" },
  });
  const tap2 = await prisma.tapLine.create({
    data: { locationId: location1.id, name: "Tap 2" },
  });
  const tap3 = await prisma.tapLine.create({
    data: { locationId: location1.id, name: "Tap 3" },
  });
  const tap4 = await prisma.tapLine.create({
    data: { locationId: location1.id, name: "Tap 4" },
  });
  console.log(`Created 4 tap lines`);

  // ── Tap Assignments ──────────────────────────────────────────
  await prisma.tapAssignment.create({
    data: {
      locationId: location1.id,
      tapLineId: tap1.id,
      kegInstanceId: ipaKegInstance.id,
      effectiveStartTs: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.tapAssignment.create({
    data: {
      locationId: location1.id,
      tapLineId: tap2.id,
      kegInstanceId: lagerKegInstance.id,
      effectiveStartTs: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
    },
  });
  console.log(`Assigned kegs to Tap 1 and Tap 2`);

  // ── Pour Profiles ────────────────────────────────────────────
  const pint = await prisma.pourProfile.create({
    data: { locationId: location1.id, name: "Pint (16oz)", oz: 16 },
  });
  const halfPint = await prisma.pourProfile.create({
    data: { locationId: location1.id, name: "Half Pint (8oz)", oz: 8 },
  });
  const shot = await prisma.pourProfile.create({
    data: { locationId: location1.id, name: "Shot (1.5oz)", oz: 1.5 },
  });
  const doubleShot = await prisma.pourProfile.create({
    data: { locationId: location1.id, name: "Double (3oz)", oz: 3 },
  });
  const wineGlass = await prisma.pourProfile.create({
    data: { locationId: location1.id, name: "Wine Glass (5oz)", oz: 5 },
  });
  console.log(`Created 5 pour profiles`);

  // ── Bottle Templates (for scale weighing) ────────────────────
  await prisma.bottleTemplate.create({
    data: {
      orgId: org.id,
      inventoryItemId: jackDaniels.id,
      containerSizeMl: 750,
      emptyBottleWeightG: 380,
      fullBottleWeightG: 1120,
      densityGPerMl: 0.987,
    },
  });

  await prisma.bottleTemplate.create({
    data: {
      orgId: org.id,
      inventoryItemId: greyGoose.id,
      containerSizeMl: 750,
      emptyBottleWeightG: 620,
      fullBottleWeightG: 1370,
      densityGPerMl: 0.945,
    },
  });

  await prisma.bottleTemplate.create({
    data: {
      orgId: org.id,
      inventoryItemId: captainMorgan.id,
      containerSizeMl: 750,
      emptyBottleWeightG: 340,
      fullBottleWeightG: 1080,
      densityGPerMl: 0.985,
    },
  });
  console.log(`Created 3 bottle templates for liquor weighing`);

  // ── POS Connection ───────────────────────────────────────────
  await prisma.pOSConnection.create({
    data: {
      locationId: location1.id,
      sourceSystem: "toast",
      method: "sftp",
      status: "active",
    },
  });
  console.log(`Created Toast POS connection`);

  // ── Some inventory for Location 2 ───────────────────────────
  const loc2Beer = await prisma.inventoryItem.create({
    data: {
      locationId: location2.id,
      type: "packaged_beer",
      name: "Heineken 12oz Bottle",
      barcode: "087000764002",
      baseUom: "units",
      packSize: 24,
      packUom: "units",
    },
  });

  const loc2Whisky = await prisma.inventoryItem.create({
    data: {
      locationId: location2.id,
      type: "liquor",
      name: "Jameson Irish Whiskey",
      baseUom: "oz",
    },
  });

  await prisma.priceHistory.createMany({
    data: [
      { inventoryItemId: loc2Beer.id, unitCost: 1.1, effectiveFromTs: thirtyDaysAgo },
      { inventoryItemId: loc2Whisky.id, unitCost: 25.0, effectiveFromTs: thirtyDaysAgo },
    ],
  });
  console.log(`Created 2 inventory items for ${location2.name}`);

  // ── Bar Areas + Sub-Areas ────────────────────────────────────
  const mainBar = await prisma.barArea.create({
    data: { locationId: location1.id, name: "Main Bar", sortOrder: 0 },
  });
  await prisma.subArea.createMany({
    data: [
      { barAreaId: mainBar.id, name: "Rail", sortOrder: 0 },
      { barAreaId: mainBar.id, name: "Backbar Shelf", sortOrder: 1 },
    ],
  });

  const lounge = await prisma.barArea.create({
    data: { locationId: location1.id, name: "Lounge", sortOrder: 1 },
  });
  await prisma.subArea.createMany({
    data: [
      { barAreaId: lounge.id, name: "Wine Fridge", sortOrder: 0 },
      { barAreaId: lounge.id, name: "Beer Fridge", sortOrder: 1 },
    ],
  });

  const patioBar = await prisma.barArea.create({
    data: { locationId: location2.id, name: "Patio Bar", sortOrder: 0 },
  });
  await prisma.subArea.create({
    data: { barAreaId: patioBar.id, name: "Rail", sortOrder: 0 },
  });

  const storage = await prisma.barArea.create({
    data: { locationId: location2.id, name: "Storage", sortOrder: 1 },
  });
  await prisma.subArea.create({
    data: { barAreaId: storage.id, name: "Walk-in", sortOrder: 0 },
  });
  console.log(`Created bar areas + sub-areas for both locations`);

  // ── Summary ──────────────────────────────────────────────────
  console.log("\n--- Seed Complete ---");
  console.log("Login credentials:");
  console.log("  admin@barstock.app   / password123  (admin, both locations)");
  console.log("  manager@barstock.app / password123  (manager, The Brass Tap)");
  console.log("  staff@barstock.app   / password123  (staff, The Brass Tap)");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
