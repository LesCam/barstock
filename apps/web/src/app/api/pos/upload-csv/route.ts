import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { CSVImportService } from "@barstock/api/src/services/csv-import.service";
import { prisma } from "@barstock/database";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(req: NextRequest) {
  // Auth check
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  const highestRole = user.highestRole as string;
  if (highestRole !== "business_admin" && highestRole !== "platform_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const sourceSystem = formData.get("sourceSystem") as string | null;
    const templateId = formData.get("templateId") as string | null;
    const locationId = formData.get("locationId") as string | null;
    const customMappingStr = formData.get("customMapping") as string | null;
    const sourceLocationId =
      (formData.get("sourceLocationId") as string) || locationId || "";
    const businessDateStr = formData.get("businessDate") as string | null;

    if (!file || !sourceSystem || !locationId) {
      return NextResponse.json(
        { error: "Missing required fields: file, sourceSystem, locationId" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5MB." },
        { status: 400 }
      );
    }

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
      sourceLocationId,
      locationId,
      templateId || undefined,
      customMapping,
      businessDate
    );

    return NextResponse.json({
      headers: result.headers,
      totalRows: result.totalRows,
      parsedCount: result.rows.length,
      errorCount: result.errors.length,
      errors: result.errors.slice(0, 50), // Cap error list
      rows: result.rows, // Full parsed rows for import step
    });
  } catch (err: any) {
    console.error("CSV upload error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to parse CSV" },
      { status: 500 }
    );
  }
}
