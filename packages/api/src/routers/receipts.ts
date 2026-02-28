import { router, protectedProcedure, requireLocationAccess, requireRole } from "../trpc";
import {
  receiptCaptureSchema,
  receiptConfirmSchema,
  receiptListSchema,
  receiptGetByIdSchema,
  receiptListSkippedSchema,
  createFromSkippedSchema,
  requestItemCreationSchema,
} from "@barstock/validators";
import { Prisma } from "@prisma/client";
import { ReceiptService } from "../services/receipt.service";
import { AuditService } from "../services/audit.service";
import { NotificationService } from "../services/notification.service";
import { AlertService } from "../services/alert.service";

export const receiptsRouter = router({
  capture: protectedProcedure
    .use(requireLocationAccess())
    .input(receiptCaptureSchema)
    .mutation(async ({ ctx, input }) => {
      const svc = new ReceiptService(ctx.prisma);
      const result = await svc.capture({
        locationId: input.locationId,
        businessId: ctx.user.businessId,
        base64Data: input.base64Data,
        images: input.images,
        filename: input.filename,
        userId: ctx.user.userId,
      });

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "receipt.captured",
        objectType: "receipt_capture",
        objectId: result.receiptCaptureId,
        metadata: {
          locationId: input.locationId,
          lineCount: result.matchedLines.length,
          vendorNameRaw: result.extraction.vendorName,
        },
      });

      return result;
    }),

  confirm: protectedProcedure
    .input(receiptConfirmSchema)
    .mutation(async ({ ctx, input }) => {
      const svc = new ReceiptService(ctx.prisma);
      const result = await svc.confirm({
        receiptCaptureId: input.receiptCaptureId,
        vendorId: input.vendorId ?? null,
        invoiceDate: input.invoiceDate ?? null,
        invoiceNumber: input.invoiceNumber ?? null,
        lines: input.lines.map((l) => ({
          receiptLineId: l.receiptLineId,
          inventoryItemId: l.inventoryItemId,
          quantity: l.quantity,
          unitPrice: l.unitPrice ?? null,
          skipped: l.skipped,
        })),
        userId: ctx.user.userId,
        businessId: ctx.user.businessId,
      });

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "receipt.confirmed",
        objectType: "receipt_capture",
        objectId: input.receiptCaptureId,
        metadata: {
          eventCount: result.eventIds.length,
          priceHistoryCount: result.priceHistoryIds.length,
        },
      });

      return result;
    }),

  list: protectedProcedure
    .use(requireLocationAccess())
    .input(receiptListSchema)
    .query(({ ctx, input }) => {
      const svc = new ReceiptService(ctx.prisma);
      return svc.list(input.locationId, input.cursor, input.limit);
    }),

  listSkipped: protectedProcedure
    .use(requireLocationAccess())
    .input(receiptListSkippedSchema)
    .query(({ ctx, input }) => {
      const svc = new ReceiptService(ctx.prisma);
      return svc.listSkipped(input.locationId);
    }),

  getById: protectedProcedure
    .input(receiptGetByIdSchema)
    .query(({ ctx, input }) => {
      const svc = new ReceiptService(ctx.prisma);
      return svc.getById(input.id);
    }),

  createFromSkipped: protectedProcedure
    .use(requireRole("manager"))
    .input(createFromSkippedSchema)
    .mutation(async ({ ctx, input }) => {
      // Fetch the receipt line with its capture
      const receiptLine = await ctx.prisma.receiptLine.findUnique({
        where: { id: input.receiptLineId },
        include: {
          receiptCapture: {
            select: {
              id: true,
              locationId: true,
              businessId: true,
              vendorId: true,
            },
          },
        },
      });
      if (!receiptLine) throw new Error("Receipt line not found");
      if (!receiptLine.skipped) throw new Error("Receipt line is not skipped");
      if (receiptLine.inventoryItemId) throw new Error("Receipt line already has an inventory item");

      // Fetch category for countingMethod → baseUom
      const category = await ctx.prisma.inventoryItemCategory.findUnique({
        where: { id: input.categoryId },
        select: { countingMethod: true },
      });
      if (!category) throw new Error("Category not found");

      const baseUom = category.countingMethod === "weighable" ? "oz" : "units";
      const itemName = input.name ?? toTitleCase(receiptLine.descriptionRaw);

      const result = await ctx.prisma.$transaction(async (tx) => {
        // 1. Create inventory item
        const item = await tx.inventoryItem.create({
          data: {
            locationId: input.locationId,
            name: itemName,
            categoryId: input.categoryId,
            baseUom,
          },
        });

        // 2. Create consumption event (receiving)
        const quantity = receiptLine.quantityRaw
          ? Number(receiptLine.quantityRaw)
          : (receiptLine.quantityConfirmed ? Number(receiptLine.quantityConfirmed) : 1);

        const event = await tx.consumptionEvent.create({
          data: {
            locationId: input.locationId,
            eventType: "receiving",
            sourceSystem: "receipt_capture",
            eventTs: new Date(),
            inventoryItemId: item.id,
            receiptId: receiptLine.receiptCaptureId,
            quantityDelta: new Prisma.Decimal(quantity),
            uom: baseUom,
            confidenceLevel: "measured",
            notes: `Receipt capture: ${quantity} ${baseUom} of ${itemName}`,
          },
        });

        // 3. Create price history if price available
        const unitPrice = receiptLine.unitPriceRaw
          ? Number(receiptLine.unitPriceRaw)
          : (receiptLine.unitPriceConfirmed ? Number(receiptLine.unitPriceConfirmed) : null);

        let priceHistoryId: string | null = null;
        if (unitPrice != null) {
          const ph = await tx.priceHistory.create({
            data: {
              inventoryItemId: item.id,
              unitCost: new Prisma.Decimal(unitPrice),
              effectiveFromTs: new Date(),
            },
          });
          priceHistoryId = ph.id;
        }

        // 4. Upsert ItemVendor if capture has a vendor
        const vendorId = receiptLine.receiptCapture.vendorId;
        if (vendorId) {
          await tx.itemVendor.upsert({
            where: {
              inventoryItemId_vendorId: {
                inventoryItemId: item.id,
                vendorId,
              },
            },
            create: {
              inventoryItemId: item.id,
              vendorId,
              vendorSku: receiptLine.productCodeRaw ?? null,
            },
            update: {},
          });
        }

        // 5. Upsert SupplierItemAlias for future auto-matching
        const aliasText = receiptLine.descriptionRaw.toLowerCase().trim();
        if (aliasText) {
          await tx.supplierItemAlias.upsert({
            where: {
              businessId_aliasText: {
                businessId: ctx.user.businessId,
                aliasText,
              },
            },
            create: {
              businessId: ctx.user.businessId,
              aliasText,
              inventoryItemId: item.id,
              confidence: 1.0,
              useCount: 1,
            },
            update: {
              inventoryItemId: item.id,
              useCount: { increment: 1 },
            },
          });
        }

        // 6. Update receipt line
        await tx.receiptLine.update({
          where: { id: input.receiptLineId },
          data: {
            inventoryItemId: item.id,
            skipped: false,
            quantityConfirmed: new Prisma.Decimal(quantity),
            unitPriceConfirmed: unitPrice != null ? new Prisma.Decimal(unitPrice) : null,
          },
        });

        return { item, eventId: event.id, priceHistoryId };
      });

      // Audit log
      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "inventory_item.created_from_receipt",
        objectType: "inventory_item",
        objectId: result.item.id,
        metadata: {
          receiptLineId: input.receiptLineId,
          name: itemName,
          categoryId: input.categoryId,
        },
      });

      // Fire price change alert if price was set
      const unitPrice = receiptLine.unitPriceRaw
        ? Number(receiptLine.unitPriceRaw)
        : (receiptLine.unitPriceConfirmed ? Number(receiptLine.unitPriceConfirmed) : null);
      if (unitPrice != null) {
        const loc = await ctx.prisma.location.findUnique({
          where: { id: input.locationId },
          select: { name: true },
        });
        const alertSvc = new AlertService(ctx.prisma);
        alertSvc.checkPriceChange(ctx.user.businessId, result.item.id, unitPrice, loc?.name ?? "").catch(() => {});
      }

      return {
        item: result.item,
        eventId: result.eventId,
        priceHistoryId: result.priceHistoryId,
        countingMethod: category.countingMethod,
      };
    }),

  requestItemCreation: protectedProcedure
    .input(requestItemCreationSchema)
    .mutation(async ({ ctx, input }) => {
      const receiptLine = await ctx.prisma.receiptLine.findUnique({
        where: { id: input.receiptLineId },
        include: {
          receiptCapture: {
            select: {
              id: true,
              locationId: true,
              businessId: true,
              location: { select: { name: true, businessId: true } },
            },
          },
        },
      });
      if (!receiptLine) throw new Error("Receipt line not found");

      const location = receiptLine.receiptCapture.location;

      // Notify all managers and business_admins at this location
      const managers = await ctx.prisma.userLocation.findMany({
        where: {
          location: { businessId: location.businessId },
          role: { in: ["manager", "business_admin"] },
        },
        select: { userId: true },
        distinct: ["userId"],
      });

      const notifService = new NotificationService(ctx.prisma);
      const staffName = ctx.user.email.split("@")[0];
      const unitSize = receiptLine.unitSizeRaw ? ` (${receiptLine.unitSizeRaw})` : "";

      for (const mgr of managers) {
        await notifService.send({
          businessId: location.businessId,
          recipientUserId: mgr.userId,
          title: "New Item Requested",
          body: `${staffName} requested adding "${receiptLine.descriptionRaw}"${unitSize} from a receipt at ${location.name}`,
          linkUrl: `/receipt/add-skipped?receiptCaptureId=${receiptLine.receiptCaptureId}`,
        });
      }

      // Audit log
      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "receipt.item_creation_requested",
        objectType: "receipt_line",
        objectId: input.receiptLineId,
        metadata: {
          description: receiptLine.descriptionRaw,
          locationName: location.name,
        },
      });

      return { success: true };
    }),
});

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/(?:^|\s|[-/])\w/g, (match) => match.toUpperCase());
}
