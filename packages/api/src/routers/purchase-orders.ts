import { router, protectedProcedure } from "../trpc";
import {
  purchaseOrderCreateSchema,
  purchaseOrderPickupSchema,
  purchaseOrderListSchema,
  purchaseOrderCloseSchema,
} from "@barstock/validators";
import { PurchaseOrderService } from "../services/purchase-order.service";
import { AuditService } from "../services/audit.service";
import { z } from "zod";

export const purchaseOrdersRouter = router({
  create: protectedProcedure
    .input(purchaseOrderCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const svc = new PurchaseOrderService(ctx.prisma);
      const result = await svc.create(input, ctx.user.userId);

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "purchase_order.created",
        objectType: "purchase_order",
        objectId: result.id,
        metadata: {
          vendorId: input.vendorId,
          lineCount: input.lines.length,
        },
      });

      return result;
    }),

  list: protectedProcedure
    .input(purchaseOrderListSchema)
    .query(({ ctx, input }) => {
      const svc = new PurchaseOrderService(ctx.prisma);
      return svc.list(input);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) => {
      const svc = new PurchaseOrderService(ctx.prisma);
      return svc.getById(input.id);
    }),

  recordPickup: protectedProcedure
    .input(purchaseOrderPickupSchema)
    .mutation(async ({ ctx, input }) => {
      const svc = new PurchaseOrderService(ctx.prisma);
      const result = await svc.recordPickup(input, ctx.user.userId);

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "purchase_order.pickup_recorded",
        objectType: "purchase_order",
        objectId: input.purchaseOrderId,
        metadata: {
          linesPickedUp: input.lines.length,
          eventsCreated: result.count,
        },
      });

      return result;
    }),

  close: protectedProcedure
    .input(purchaseOrderCloseSchema)
    .mutation(async ({ ctx, input }) => {
      const svc = new PurchaseOrderService(ctx.prisma);
      const result = await svc.close(input);

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "purchase_order.closed",
        objectType: "purchase_order",
        objectId: input.purchaseOrderId,
        metadata: {},
      });

      return result;
    }),

  textOrder: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) => {
      const svc = new PurchaseOrderService(ctx.prisma);
      return svc.generateTextOrder(input.id);
    }),
});
