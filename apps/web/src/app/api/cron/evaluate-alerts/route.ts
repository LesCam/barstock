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

  const businesses = await prisma.business.findMany({
    select: { id: true },
  });

  const alertSvc = new AlertService(prisma);
  let totalSent = 0;
  let evaluated = 0;
  const errors: string[] = [];

  for (const biz of businesses) {
    try {
      const sent = await alertSvc.evaluateAndNotify(biz.id);
      totalSent += sent;
      evaluated++;
    } catch (err) {
      errors.push(
        `Business ${biz.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return NextResponse.json({
    evaluated,
    sent: totalSent,
    errors,
  });
}
