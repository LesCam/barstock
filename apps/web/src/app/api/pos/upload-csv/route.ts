import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthFailure } from "@/lib/require-auth";
import { CSVImportService } from "@barstock/api/src/services/csv-import.service";
import { prisma } from "@barstock/database";
import { z } from "zod";

export const dynamic = "force-dynamic";

const NO_STORE = { headers: { "Cache-Control": "no-store" } };
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const csvUploadSchema = z.object({
  sourceSystem: z.string().min(1),
  locationId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
  sourceLocationId: z.string().optional(),
  customMapping: z.string().optional(),
  businessDate: z.string().optional(),
}).strict();

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (isAuthFailure(authResult)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = authResult;
  const highestRole = user.highestRole as string;
  if (highestRole !== "business_admin" && highestRole !== "platform_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Missing required field: file" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5MB." },
        { status: 400 }
      );
    }

    // Validate text fields with Zod
    const parsed = csvUploadSchema.safeParse({
      sourceSystem: formData.get("sourceSystem") ?? undefined,
      locationId: formData.get("locationId") ?? undefined,
      templateId: formData.get("templateId") || undefined,
      sourceLocationId: formData.get("sourceLocationId") || undefined,
      customMapping: formData.get("customMapping") || undefined,
      businessDate: formData.get("businessDate") || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { sourceSystem, locationId, templateId, sourceLocationId, customMapping: customMappingStr, businessDate: businessDateStr } = parsed.data;
    const csvText = await file.text();

    let customMapping: Record<string, string> | undefined;
    if (customMappingStr) {
      try {
        customMapping = JSON.parse(customMappingStr);
      } catch {
        return NextResponse.json(
          { error: "Invalid customMapping JSON" },
          { status: 400 }
        );
      }
    }

    const businessDate = businessDateStr ? new Date(businessDateStr) : undefined;

    const service = new CSVImportService(prisma);
    const result = service.parseCSV(
      csvText,
      sourceSystem,
      sourceLocationId || locationId,
      locationId,
      templateId,
      customMapping,
      businessDate
    );

    return NextResponse.json(
      {
        headers: result.headers,
        totalRows: result.totalRows,
        parsedCount: result.rows.length,
        errorCount: result.errors.length,
        errors: result.errors.slice(0, 50),
        rows: result.rows,
      },
      NO_STORE,
    );
  } catch (err: any) {
    console.error("CSV upload error:", err?.message ?? "unknown");
    return NextResponse.json(
      { error: "Failed to parse CSV" },
      { status: 500 }
    );
  }
}
