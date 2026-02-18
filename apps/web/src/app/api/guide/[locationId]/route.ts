import { NextResponse } from "next/server";
import { prisma } from "@barstock/database";
import { ProductGuideService } from "@barstock/api/src/services/product-guide.service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ locationId: string }> }
) {
  const { locationId } = await params;

  if (!UUID_RE.test(locationId)) {
    return NextResponse.json(
      { error: "Invalid locationId" },
      { status: 400 }
    );
  }

  const service = new ProductGuideService(prisma as any);
  const guide = await service.getPublicGuide(locationId);

  return NextResponse.json(guide, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
