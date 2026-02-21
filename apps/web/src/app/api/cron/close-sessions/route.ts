import { NextResponse } from "next/server";
import { prisma } from "@barstock/database";
import { AlertService } from "@barstock/api/src/services/alert.service";
import { SessionService } from "@barstock/api/src/services/session.service";
import { SettingsService } from "@barstock/api/src/services/settings.service";

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

  const settingsSvc = new SettingsService(prisma);
  const sessionSvc = new SessionService(prisma);

  // Get all locations grouped by business
  const locations = await prisma.location.findMany({
    select: { id: true, name: true, timezone: true, businessId: true },
  });

  // Group locations by business so we fetch settings once per business
  const bizLocations = new Map<string, typeof locations>();
  for (const loc of locations) {
    const list = bizLocations.get(loc.businessId) ?? [];
    list.push(loc);
    bizLocations.set(loc.businessId, list);
  }

  const now = new Date();
  const matchingLocationIds: string[] = [];
  const matchingLocationNames: string[] = [];

  for (const [businessId, locs] of bizLocations) {
    const settings = await settingsSvc.getSettings(businessId);
    const eodTime = settings.endOfDayTime; // "HH:mm"

    for (const loc of locs) {
      const localTime = getTimeInTimezone(now, loc.timezone);
      if (localTime === eodTime) {
        matchingLocationIds.push(loc.id);
        matchingLocationNames.push(loc.name);
      }
    }
  }

  if (matchingLocationIds.length === 0) {
    return NextResponse.json({ closed: 0, locations: [] });
  }

  // Find open sessions at matching locations
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

  if (openSessions.length === 0) {
    return NextResponse.json({ closed: 0, locations: matchingLocationNames });
  }

  // Close each session with the full variance flow
  let closedCount = 0;
  let totalAdjustments = 0;
  const errors: string[] = [];

  // Track affected businesses for notifications
  const affectedBusinesses = new Map<string, { locations: Set<string>; sessionCount: number; adjustmentCount: number }>();

  for (const session of openSessions) {
    try {
      const result = await sessionSvc.autoCloseSession(session.id);
      closedCount++;
      totalAdjustments += result.adjustmentsCreated;

      const bizId = session.location.businessId;
      const entry = affectedBusinesses.get(bizId) ?? { locations: new Set(), sessionCount: 0, adjustmentCount: 0 };
      entry.locations.add(session.location.name);
      entry.sessionCount++;
      entry.adjustmentCount += result.adjustmentsCreated;
      affectedBusinesses.set(bizId, entry);
    } catch (err) {
      errors.push(`Session ${session.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Notify admins for each affected business
  if (affectedBusinesses.size > 0) {
    const alertSvc = new AlertService(prisma);
    for (const [businessId, data] of affectedBusinesses) {
      const names = Array.from(data.locations);
      try {
        await alertSvc.notifyAdmins(
          businessId,
          "Sessions auto-closed",
          `${data.sessionCount} session(s) auto-closed at end of day at ${names.join(", ")}. ${data.adjustmentCount} variance adjustment(s) created with reason: session_expired.`,
          "/sessions",
          { rule: "sessionAutoClosed" },
        );
      } catch {
        // Alert failure should not break the cron
      }
    }
  }

  return NextResponse.json({
    closed: closedCount,
    adjustments: totalAdjustments,
    locations: matchingLocationNames,
    errors: errors.length > 0 ? errors : undefined,
  });
}

function getTimeInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}
