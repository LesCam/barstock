import { NextResponse } from "next/server";
import { prisma } from "@barstock/database";
import { AlertService } from "@barstock/api/src/services/alert.service";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const locations = await prisma.location.findMany({
    select: { id: true, name: true, timezone: true, closeoutHour: true, businessId: true },
  });

  const now = new Date();
  const matchingLocationIds: string[] = [];
  const matchingLocationNames: string[] = [];

  // Track which businesses had sessions to close
  const businessLocations = new Map<string, string[]>();

  for (const loc of locations) {
    const localHour = getHourInTimezone(now, loc.timezone);
    if (localHour === loc.closeoutHour) {
      matchingLocationIds.push(loc.id);
      matchingLocationNames.push(loc.name);

      const names = businessLocations.get(loc.businessId) ?? [];
      names.push(loc.name);
      businessLocations.set(loc.businessId, names);
    }
  }

  if (matchingLocationIds.length === 0) {
    return NextResponse.json({ closed: 0, locations: [] });
  }

  // Query open sessions before closing so we know which businesses are affected
  const openSessions = await prisma.inventorySession.findMany({
    where: {
      locationId: { in: matchingLocationIds },
      endedTs: null,
    },
    select: {
      id: true,
      location: { select: { businessId: true, name: true } },
    },
  });

  // Group by businessId
  const affectedBusinesses = new Map<string, Set<string>>();
  for (const session of openSessions) {
    const bizId = session.location.businessId;
    const names = affectedBusinesses.get(bizId) ?? new Set();
    names.add(session.location.name);
    affectedBusinesses.set(bizId, names);
  }

  const result = await prisma.inventorySession.updateMany({
    where: {
      locationId: { in: matchingLocationIds },
      endedTs: null,
    },
    data: {
      endedTs: now,
      closedBy: null,
    },
  });

  // Notify admins for each affected business
  if (affectedBusinesses.size > 0) {
    const alertSvc = new AlertService(prisma);
    for (const [businessId, locationNames] of affectedBusinesses) {
      const names = Array.from(locationNames);
      try {
        await alertSvc.notifyAdmins(
          businessId,
          "Sessions auto-closed",
          `${names.length} location(s) had sessions auto-closed at closeout: ${names.join(", ")}`,
          "/sessions",
          { rule: "sessionAutoClosed" },
        );
      } catch {
        // Alert failure should not break the cron
      }
    }
  }

  return NextResponse.json({
    closed: result.count,
    locations: matchingLocationNames,
  });
}

function getHourInTimezone(date: Date, timezone: string): number {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  }).format(date);
  return parseInt(formatted, 10);
}
