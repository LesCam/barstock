import { NextResponse } from "next/server";
import { prisma } from "@barstock/database";

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
    select: { id: true, name: true, timezone: true, closeoutHour: true },
  });

  const now = new Date();
  const matchingLocationIds: string[] = [];
  const matchingLocationNames: string[] = [];

  for (const loc of locations) {
    const localHour = getHourInTimezone(now, loc.timezone);
    if (localHour === loc.closeoutHour) {
      matchingLocationIds.push(loc.id);
      matchingLocationNames.push(loc.name);
    }
  }

  if (matchingLocationIds.length === 0) {
    return NextResponse.json({ closed: 0, locations: [] });
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
