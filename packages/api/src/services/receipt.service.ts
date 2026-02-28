import { Prisma } from "@prisma/client";
import type { ExtendedPrismaClient } from "@barstock/database";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { bestMatch } from "../utils/fuzzy-match";
import { createStorageAdapter } from "./storage";
import { NotificationService } from "./notification.service";

// ─── Types ──────────────────────────────────────────────────

interface ExtractionLineItem {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
  unitSize: string | null;
  productCode: string | null;
}

interface ExtractionResult {
  vendorName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  lineItems: ExtractionLineItem[];
}

interface MatchedLine {
  lineIndex: number;
  descriptionRaw: string;
  quantityRaw: number | null;
  unitPriceRaw: number | null;
  totalPriceRaw: number | null;
  unitSizeRaw: string | null;
  productCodeRaw: string | null;
  inventoryItemId: string | null;
  inventoryItemName: string | null;
  matchConfidence: number | null;
  matchSource: string | null;
}

export interface DuplicateInfo {
  receiptCaptureId: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  vendorName: string | null;
  processedAt: Date | null;
  lineCount: number;
}

export interface CaptureResult {
  receiptCaptureId: string;
  extraction: ExtractionResult;
  matchedLines: MatchedLine[];
  possibleDuplicate: DuplicateInfo | null;
}

export interface ConfirmResult {
  eventIds: string[];
  priceHistoryIds: string[];
}

// ─── Service ─────────────────────────────────────────────────

export class ReceiptService {
  private genai: GoogleGenerativeAI;

  constructor(private prisma: ExtendedPrismaClient) {
    this.genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");
  }

  // ── Capture + Extract ────────────────────────────────────

  async capture(input: {
    locationId: string;
    businessId: string;
    base64Data?: string;
    images?: Array<{ base64Data: string; filename: string }>;
    filename?: string;
    userId: string;
  }): Promise<CaptureResult> {
    const { locationId, businessId, userId } = input;

    // Normalize to array of images (backwards compatible)
    const imageList = input.images?.length
      ? input.images
      : input.base64Data
        ? [{ base64Data: input.base64Data, filename: input.filename ?? `receipt-${Date.now()}.jpg` }]
        : [];
    if (imageList.length === 0) throw new Error("No images provided");

    // 1. Upload first image to storage (primary image for the record)
    const buffer = Buffer.from(imageList[0].base64Data, "base64");
    const key = `receipts/${locationId}/${Date.now()}-${imageList[0].filename}`;
    const storage = createStorageAdapter();
    const imageUrl = await storage.upload(buffer, key);

    // 2. Create receipt capture row
    const capture = await this.prisma.receiptCapture.create({
      data: {
        locationId,
        businessId,
        status: "pending",
        imageKey: key,
        imageUrl,
        capturedBy: userId,
      },
    });

    try {
      // 3. Fetch context for prompt
      const [vendors, items] = await Promise.all([
        this.prisma.vendor.findMany({
          where: { businessId, active: true },
          select: { id: true, name: true },
        }),
        this.prisma.inventoryItem.findMany({
          where: { locationId, active: true },
          select: { id: true, name: true },
          take: 200,
        }),
      ]);

      // 4. Extract via Gemini Vision (all images at once)
      const extraction = await this.extractFromImage(
        imageList.map((img) => img.base64Data),
        vendors.map((v) => v.name),
        items.map((i) => i.name)
      );

      // 5. Update capture with extraction
      await this.prisma.receiptCapture.update({
        where: { id: capture.id },
        data: {
          status: "extracted",
          vendorNameRaw: extraction.vendorName,
          invoiceNumber: extraction.invoiceNumber,
          invoiceDate: extraction.invoiceDate
            ? new Date(extraction.invoiceDate)
            : null,
          extractedJson: extraction as unknown as Prisma.InputJsonValue,
        },
      });

      // 6. Match lines to inventory
      const matchedLines = await this.matchLines(
        businessId,
        null,
        extraction.lineItems,
        locationId
      );

      // 7. Try to auto-match vendor
      let vendorId: string | null = null;
      if (extraction.vendorName) {
        const vendorMatch = bestMatch(
          extraction.vendorName,
          vendors,
          (v) => v.name,
          0.6
        );
        if (vendorMatch) {
          vendorId = vendorMatch.item.id;
          await this.prisma.receiptCapture.update({
            where: { id: capture.id },
            data: { vendorId },
          });
        }
      }

      // 8. Check for duplicate receipts (all checks run, first match wins)
      let possibleDuplicate: DuplicateInfo | null = null;
      const dupConditions: Prisma.ReceiptCaptureWhereInput[] = [];

      // Check 1: Same invoice number
      if (extraction.invoiceNumber) {
        dupConditions.push({ invoiceNumber: extraction.invoiceNumber });
      }
      // Check 2: Same vendor + same date
      if (vendorId && extraction.invoiceDate) {
        dupConditions.push({
          vendorId,
          invoiceDate: new Date(extraction.invoiceDate),
        });
      }
      // Check 3: Same vendor name (raw) + same date — catches unmatched vendors
      if (extraction.vendorName && extraction.invoiceDate) {
        dupConditions.push({
          vendorNameRaw: extraction.vendorName,
          invoiceDate: new Date(extraction.invoiceDate),
        });
      }

      if (dupConditions.length > 0) {
        const existing = await this.prisma.receiptCapture.findFirst({
          where: {
            locationId,
            id: { not: capture.id },
            status: { not: "failed" },
            OR: dupConditions,
          },
          include: {
            vendor: { select: { name: true } },
            _count: { select: { lines: true } },
          },
          orderBy: { createdAt: "desc" },
        });
        if (existing) {
          possibleDuplicate = {
            receiptCaptureId: existing.id,
            invoiceNumber: existing.invoiceNumber,
            invoiceDate: existing.invoiceDate?.toISOString().split("T")[0] ?? null,
            vendorName: existing.vendor?.name ?? existing.vendorNameRaw,
            processedAt: existing.processedAt,
            lineCount: existing._count.lines,
          };
        }
      }

      // 9. Create receipt lines
      await this.prisma.receiptLine.createMany({
        data: matchedLines.map((line) => ({
          receiptCaptureId: capture.id,
          lineIndex: line.lineIndex,
          descriptionRaw: line.descriptionRaw,
          quantityRaw: line.quantityRaw != null ? new Prisma.Decimal(line.quantityRaw) : null,
          unitPriceRaw: line.unitPriceRaw != null ? new Prisma.Decimal(line.unitPriceRaw) : null,
          totalPriceRaw: line.totalPriceRaw != null ? new Prisma.Decimal(line.totalPriceRaw) : null,
          unitSizeRaw: line.unitSizeRaw,
          productCodeRaw: line.productCodeRaw,
          inventoryItemId: line.inventoryItemId,
          matchConfidence: line.matchConfidence != null ? new Prisma.Decimal(line.matchConfidence) : null,
          matchSource: line.matchSource,
        })),
      });

      return {
        receiptCaptureId: capture.id,
        extraction,
        matchedLines,
        possibleDuplicate,
      };
    } catch (err: any) {
      // Update capture with error
      await this.prisma.receiptCapture.update({
        where: { id: capture.id },
        data: {
          status: "failed",
          errorMessage: err?.message ?? "Unknown extraction error",
        },
      });
      throw err;
    }
  }

  // ── Gemini Vision Extraction ─────────────────────────────

  private async extractFromImage(
    base64DataList: string[],
    vendorNames: string[],
    itemNames: string[]
  ): Promise<ExtractionResult> {
    const multiImage = base64DataList.length > 1;
    const systemPrompt = `You are a receipt/invoice data extraction assistant for a bar inventory management system.
Extract structured data from the receipt image${multiImage ? "s" : ""} and return ONLY valid JSON (no markdown fences, no backticks).
${multiImage ? "Multiple images are provided showing different sections of the SAME receipt. Combine all items into a single result. Do not duplicate items that appear in multiple images." : ""}

Return this exact JSON structure:
{
  "vendorName": "string or null",
  "invoiceNumber": "string or null",
  "invoiceDate": "YYYY-MM-DD or null",
  "lineItems": [
    {
      "description": "exact text from receipt",
      "quantity": number or null,
      "unitPrice": number or null,
      "totalPrice": number or null,
      "unitSize": "e.g. 750ml, 1L, 24pk — or null",
      "productCode": "vendor's internal product/shelf code — or null"
    }
  ]
}

Rules:
- Extract ALL line items, even if some fields are unreadable (use null for those)
- Use the exact text from the receipt for description — do not normalize or rename
- Prices should be decimal numbers, not strings (e.g. 29.99 not "$29.99")
- If quantity is not specified, use 1
- invoiceDate must be YYYY-MM-DD format
- Do not invent data that isn't on the receipt
- If there is a product code, SKU, or shelf number for each item, extract it into productCode`;

    const contextLines: string[] = [];
    if (vendorNames.length > 0) {
      contextLines.push(`Known vendors: ${vendorNames.join(", ")}`);
    }
    if (itemNames.length > 0) {
      contextLines.push(
        `Known inventory items (for reference): ${itemNames.slice(0, 100).join(", ")}`
      );
    }

    const userPrompt = contextLines.length > 0
      ? `Extract the receipt data from ${multiImage ? "these images" : "this image"}.\n\nContext:\n${contextLines.join("\n")}`
      : `Extract the receipt data from ${multiImage ? "these images" : "this image"}.`;

    const model = this.genai.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: systemPrompt,
      generationConfig: {
        maxOutputTokens: 16384,
        responseMimeType: "application/json",
      },
    });

    // Build content parts: all images first, then the text prompt
    const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [];
    for (const base64Data of base64DataList) {
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Data,
        },
      });
    }
    parts.push({ text: userPrompt });

    const response = await model.generateContent(parts);

    const text = response.response.text();
    if (!text) {
      throw new Error("No text response from Gemini Vision");
    }

    const cleaned = text.trim();
    const parsed = JSON.parse(cleaned) as ExtractionResult;

    // Validate basic structure
    if (!Array.isArray(parsed.lineItems)) {
      throw new Error("Invalid extraction: lineItems is not an array");
    }

    return parsed;
  }

  // ── Match Lines to Inventory ─────────────────────────────

  private async matchLines(
    businessId: string,
    vendorId: string | null,
    lineItems: ExtractionLineItem[],
    locationId: string
  ): Promise<MatchedLine[]> {
    // Fetch aliases and inventory items for matching
    const [aliases, items] = await Promise.all([
      this.prisma.supplierItemAlias.findMany({
        where: { businessId },
        select: {
          aliasText: true,
          inventoryItemId: true,
          confidence: true,
        },
      }),
      this.prisma.inventoryItem.findMany({
        where: { locationId, active: true },
        select: { id: true, name: true },
      }),
    ]);

    const aliasMap = new Map(
      aliases.map((a) => [
        a.aliasText.toLowerCase().trim(),
        { inventoryItemId: a.inventoryItemId, confidence: Number(a.confidence) },
      ])
    );

    return lineItems.map((line, index) => {
      const desc = line.description;
      const descNormalized = desc.toLowerCase().trim();

      // Priority 1: Exact alias match
      const alias = aliasMap.get(descNormalized);
      if (alias) {
        const matchedItem = items.find((i) => i.id === alias.inventoryItemId);
        return {
          lineIndex: index,
          descriptionRaw: desc,
          quantityRaw: line.quantity,
          unitPriceRaw: line.unitPrice,
          totalPriceRaw: line.totalPrice,
          unitSizeRaw: line.unitSize,
          productCodeRaw: line.productCode ?? null,
          inventoryItemId: alias.inventoryItemId,
          inventoryItemName: matchedItem?.name ?? null,
          matchConfidence: alias.confidence,
          matchSource: "alias",
        };
      }

      // Priority 2: Fuzzy match against inventory items
      const fuzzy = bestMatch(desc, items, (i) => i.name, 0.3);
      if (fuzzy) {
        return {
          lineIndex: index,
          descriptionRaw: desc,
          quantityRaw: line.quantity,
          unitPriceRaw: line.unitPrice,
          totalPriceRaw: line.totalPrice,
          unitSizeRaw: line.unitSize,
          productCodeRaw: line.productCode ?? null,
          inventoryItemId: fuzzy.item.id,
          inventoryItemName: fuzzy.item.name,
          matchConfidence: Math.round(fuzzy.score * 100) / 100,
          matchSource: "fuzzy",
        };
      }

      // No match
      return {
        lineIndex: index,
        descriptionRaw: desc,
        quantityRaw: line.quantity,
        unitPriceRaw: line.unitPrice,
        totalPriceRaw: line.totalPrice,
        unitSizeRaw: line.unitSize,
        productCodeRaw: line.productCode ?? null,
        inventoryItemId: null,
        inventoryItemName: null,
        matchConfidence: null,
        matchSource: null,
      };
    });
  }

  // ── Confirm + Create Receiving Events ────────────────────

  async confirm(input: {
    receiptCaptureId: string;
    vendorId: string | null;
    invoiceDate: string | null;
    invoiceNumber: string | null;
    lines: Array<{
      receiptLineId: string;
      inventoryItemId: string | null;
      quantity: number;
      unitPrice: number | null;
      skipped: boolean;
    }>;
    userId: string;
    businessId: string;
  }): Promise<ConfirmResult> {
    const {
      receiptCaptureId,
      vendorId,
      invoiceDate,
      invoiceNumber,
      lines,
      userId,
      businessId,
    } = input;

    const capture = await this.prisma.receiptCapture.findUnique({
      where: { id: receiptCaptureId },
      select: { locationId: true, status: true },
    });
    if (!capture) throw new Error("Receipt capture not found");
    if (capture.status === "processed") throw new Error("Receipt already processed");

    const eventIds: string[] = [];
    const priceHistoryIds: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      // Process each non-skipped line
      for (const line of lines) {
        // Update the receipt line
        await tx.receiptLine.update({
          where: { id: line.receiptLineId },
          data: {
            inventoryItemId: line.inventoryItemId,
            quantityConfirmed: new Prisma.Decimal(line.quantity),
            unitPriceConfirmed: line.unitPrice != null
              ? new Prisma.Decimal(line.unitPrice)
              : null,
            skipped: line.skipped,
          },
        });

        if (line.skipped || !line.inventoryItemId) continue;

        // Fetch item for uom
        const item = await tx.inventoryItem.findUnique({
          where: { id: line.inventoryItemId },
          select: { baseUom: true, name: true },
        });
        if (!item) continue;

        // Create consumption event (receiving)
        const event = await tx.consumptionEvent.create({
          data: {
            locationId: capture.locationId,
            eventType: "receiving",
            sourceSystem: "receipt_capture",
            eventTs: new Date(),
            inventoryItemId: line.inventoryItemId,
            receiptId: receiptCaptureId,
            quantityDelta: new Prisma.Decimal(line.quantity),
            uom: item.baseUom,
            confidenceLevel: "measured",
            notes: `Receipt capture: ${line.quantity} ${item.baseUom} of ${item.name}`,
          },
        });
        eventIds.push(event.id);

        // Create price history if unit price provided
        if (line.unitPrice != null) {
          const ph = await tx.priceHistory.create({
            data: {
              inventoryItemId: line.inventoryItemId,
              unitCost: new Prisma.Decimal(line.unitPrice),
              effectiveFromTs: new Date(),
            },
          });
          priceHistoryIds.push(ph.id);
        }
      }

      // Auto-link vendor to items via ItemVendor
      if (vendorId) {
        for (const line of lines) {
          if (line.skipped || !line.inventoryItemId) continue;
          // Fetch the receipt line to get product code
          const rl = await tx.receiptLine.findUnique({
            where: { id: line.receiptLineId },
            select: { productCodeRaw: true },
          });
          await tx.itemVendor.upsert({
            where: {
              inventoryItemId_vendorId: {
                inventoryItemId: line.inventoryItemId,
                vendorId,
              },
            },
            create: {
              inventoryItemId: line.inventoryItemId,
              vendorId,
              vendorSku: rl?.productCodeRaw ?? null,
            },
            update: {
              // Update SKU if we have one and it's not already set
              ...(rl?.productCodeRaw ? { vendorSku: rl.productCodeRaw } : {}),
            },
          });
        }
      }

      // Update capture record
      await tx.receiptCapture.update({
        where: { id: receiptCaptureId },
        data: {
          status: "processed",
          vendorId,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : null,
          invoiceNumber,
          processedAt: new Date(),
        },
      });
    });

    // Fire price change alerts for items with prices (fire-and-forget)
    try {
      const { AlertService } = await import("./alert.service");
      const alertSvc = new AlertService(this.prisma);
      const location = await this.prisma.location.findUnique({
        where: { id: capture.locationId },
        select: { name: true },
      });
      for (const line of lines) {
        if (line.skipped || !line.inventoryItemId || line.unitPrice == null) continue;
        alertSvc.checkPriceChange(businessId, line.inventoryItemId, line.unitPrice, location?.name ?? "").catch(() => {});
      }
    } catch {
      // Don't fail if alert check fails
    }

    // Learn aliases (outside transaction — non-critical)
    try {
      await this.learnAliases(receiptCaptureId, businessId);
    } catch {
      // Don't fail if learning fails
    }

    // Notify admins (fire-and-forget)
    try {
      const location = await this.prisma.location.findUnique({
        where: { id: capture.locationId },
        select: { businessId: true, name: true },
      });
      if (location) {
        const admins = await this.prisma.userLocation.findMany({
          where: {
            location: { businessId: location.businessId },
            role: "business_admin",
          },
          select: { userId: true },
          distinct: ["userId"],
        });
        const notifService = new NotificationService(this.prisma);
        for (const admin of admins) {
          await notifService.send({
            businessId: location.businessId,
            recipientUserId: admin.userId,
            title: "Receipt Processed",
            body: `${eventIds.length} items received via receipt scan at ${location.name}`,
          });
        }
      }
    } catch {
      // Don't fail if notification fails
    }

    return { eventIds, priceHistoryIds };
  }

  // ── Learn Aliases ──────────────────────────────────────────

  private async learnAliases(
    receiptCaptureId: string,
    businessId: string
  ): Promise<void> {
    const lines = await this.prisma.receiptLine.findMany({
      where: {
        receiptCaptureId,
        skipped: false,
        inventoryItemId: { not: null },
      },
      select: {
        descriptionRaw: true,
        inventoryItemId: true,
      },
    });

    for (const line of lines) {
      if (!line.inventoryItemId) continue;

      const aliasText = line.descriptionRaw.toLowerCase().trim();
      if (!aliasText) continue;

      await this.prisma.supplierItemAlias.upsert({
        where: {
          businessId_aliasText: {
            businessId,
            aliasText,
          },
        },
        create: {
          businessId,
          aliasText,
          inventoryItemId: line.inventoryItemId,
          confidence: 1.0,
          useCount: 1,
        },
        update: {
          inventoryItemId: line.inventoryItemId,
          useCount: { increment: 1 },
        },
      });
    }
  }

  // ── Queries ────────────────────────────────────────────────

  async list(locationId: string, cursor?: string, limit = 20) {
    const where: Prisma.ReceiptCaptureWhereInput = { locationId };
    if (cursor) {
      const cursorRecord = await this.prisma.receiptCapture.findUnique({
        where: { id: cursor },
        select: { createdAt: true },
      });
      if (cursorRecord) {
        where.createdAt = { lt: cursorRecord.createdAt };
      }
    }

    const items = await this.prisma.receiptCapture.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      include: {
        vendor: { select: { id: true, name: true } },
        _count: { select: { lines: true } },
      },
    });

    const hasMore = items.length > limit;
    if (hasMore) items.pop();

    return {
      items: items.map((item) => ({
        id: item.id,
        status: item.status,
        vendorName: item.vendor?.name ?? item.vendorNameRaw ?? null,
        invoiceNumber: item.invoiceNumber,
        invoiceDate: item.invoiceDate,
        lineCount: item._count.lines,
        createdAt: item.createdAt,
      })),
      nextCursor: hasMore ? items[items.length - 1]?.id : null,
    };
  }

  async listSkipped(locationId: string) {
    const receipts = await this.prisma.receiptCapture.findMany({
      where: {
        locationId,
        status: "processed",
        lines: {
          some: {
            skipped: true,
            inventoryItemId: null,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      include: {
        vendor: { select: { name: true } },
        lines: {
          where: {
            skipped: true,
            inventoryItemId: null,
          },
          select: { id: true },
        },
      },
    });

    return receipts.map((r) => ({
      id: r.id,
      vendorName: r.vendor?.name ?? r.vendorNameRaw ?? null,
      invoiceDate: r.invoiceDate,
      createdAt: r.createdAt,
      skippedCount: r.lines.length,
    }));
  }

  async getById(id: string) {
    const capture = await this.prisma.receiptCapture.findUnique({
      where: { id },
      include: {
        vendor: { select: { id: true, name: true } },
        lines: {
          orderBy: { lineIndex: "asc" },
          include: {
            inventoryItem: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!capture) throw new Error("Receipt capture not found");
    return capture;
  }
}
