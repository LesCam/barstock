import { NextResponse } from "next/server";
import { prisma } from "@barstock/database";
import { BenchmarkService } from "@barstock/api/src/services/benchmark.service";

export const dynamic = "force-dynamic";

const NO_STORE = { headers: { "Cache-Control": "no-store" } };

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

  try {
    const benchmarkSvc = new BenchmarkService(prisma);
    const result = await benchmarkSvc.captureAllSnapshots();

    return NextResponse.json(
      { businessCount: result.businessCount, locationCount: result.locationCount },
      NO_STORE,
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
