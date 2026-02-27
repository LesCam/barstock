import { Prisma } from "@prisma/client";
import type { ExtendedPrismaClient } from "@barstock/database";
import Anthropic from "@anthropic-ai/sdk";
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
  inventoryItemId: string | null;
  inventoryItemName: string | null;
  matchConfidence: number | null;
  matchSource: string | null;
}

export interface CaptureResult {
  receiptCaptureId: string;
  extraction: ExtractionResult;
  matchedLines: MatchedLine[];
}

export interface ConfirmResult {
  eventIds: string[];
  priceHistoryIds: string[];
}

// ─── Service ─────────────────────────────────────────────────

export class ReceiptService {
  private anthropic: Anthropic;

  constructor(private prisma: ExtendedPrismaClient) {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  // ── Capture + Extract ────────────────────────────────────

  async capture(input: {
    locationId: string;
    businessId: string;
    base64Data: string;
    filename: string;
    userId: string;
  }): Promise<CaptureResult> {
    const { locationId, businessId, base64Data, filename, userId } = input;

    // 1. Upload image to storage
    const buffer = Buffer.from(base64Data, "base64");
    const key = `receipts/${locationId}/${Date.now()}-${filename}`;
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

      // 4. Extract via Claude Vision
      const extraction = await this.extractFromImage(
        base64Data,
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

      // 8. Create receipt lines
      await this.prisma.receiptLine.createMany({
        data: matchedLines.map((line) => ({
          receiptCaptureId: capture.id,
          lineIndex: line.lineIndex,
          descriptionRaw: line.descriptionRaw,
          quantityRaw: line.quantityRaw != null ? new Prisma.Decimal(line.quantityRaw) : null,
          unitPriceRaw: line.unitPriceRaw != null ? new Prisma.Decimal(line.unitPriceRaw) : null,
          totalPriceRaw: line.totalPriceRaw != null ? new Prisma.Decimal(line.totalPriceRaw) : null,
          unitSizeRaw: line.unitSizeRaw,
          inventoryItemId: line.inventoryItemId,
          matchConfidence: line.matchConfidence != null ? new Prisma.Decimal(line.matchConfidence) : null,
          matchSource: line.matchSource,
        })),
      });

      return {
        receiptCaptureId: capture.id,
        extraction,
        matchedLines,
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

  // ── Claude Vision Extraction ──────────────────────────────

  private async extractFromImage(
    base64Data: string,
    vendorNames: string[],
    itemNames: string[]
  ): Promise<ExtractionResult> {
    const systemPrompt = `You are a receipt/invoice data extraction assistant for a bar inventory management system.
Extract structured data from the receipt image and return ONLY valid JSON (no markdown fences).

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
      "unitSize": "e.g. 750ml, 1L, 24pk — or null"
    }
  ]
}

Rules:
- Extract ALL line items, even if some fields are unreadable (use null for those)
- Use the exact text from the receipt for description — do not normalize or rename
- Prices should be decimal numbers, not strings (e.g. 29.99 not "$29.99")
- If quantity is not specified, use 1
- invoiceDate must be YYYY-MM-DD format
- Do not invent data that isn't on the receipt`;

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
      ? `Extract the receipt data from this image.\n\nContext:\n${contextLines.join("\n")}`
      : "Extract the receipt data from this image.";

    const response = await this.anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: base64Data,
              },
            },
            { type: "text", text: userPrompt },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from Claude Vision");
    }

    const parsed = JSON.parse(textBlock.text) as ExtractionResult;

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
