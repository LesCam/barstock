import { router, protectedProcedure, requireLocationAccess } from "../trpc";
import {
  receiptCaptureSchema,
  receiptConfirmSchema,
  receiptListSchema,
  receiptGetByIdSchema,
} from "@barstock/validators";
import { ReceiptService } from "../services/receipt.service";
import { AuditService } from "../services/audit.service";

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

  getById: protectedProcedure
    .input(receiptGetByIdSchema)
    .query(({ ctx, input }) => {
      const svc = new ReceiptService(ctx.prisma);
      return svc.getById(input.id);
    }),
});
