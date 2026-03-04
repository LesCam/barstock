import { router, protectedProcedure, requirePermission, requireRecentAuth, requireLocationAccess, isPlatformAdmin } from "../trpc";
import { TRPCError } from "@trpc/server";
import {
  purchaseOrderCreateSchema,
  purchaseOrderPickupSchema,
  purchaseOrderListSchema,
  purchaseOrderCloseSchema,
  orderTrendsQuerySchema,
} from "@barstock/validators";
import { PurchaseOrderService } from "../services/purchase-order.service";
import { AuditService } from "../services/audit.service";
import { z } from "zod";

/** Verify the caller has access to the location that owns this purchase order */
async function verifyPOAccess(
  prisma: any,
  purchaseOrderId: string,
  user: { locationIds: string[] },
  platformAdmin: boolean,
) {
  const po = await prisma.purchaseOrder.findUniqueOrThrow({
    where: { id: purchaseOrderId },
    select: { locationId: true },
  });
  if (!platformAdmin && !user.locationIds.includes(po.locationId)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Resource not found" });
  }
}

export const purchaseOrdersRouter = router({
  create: protectedProcedure
    .use(requirePermission("canOrder"))
    .use(requireRecentAuth())
    .use(requireLocationAccess())
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
    .use(requireLocationAccess())
    .input(purchaseOrderListSchema)
    .query(({ ctx, input }) => {
      const svc = new PurchaseOrderService(ctx.prisma);
      return svc.list(input);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyPOAccess(ctx.prisma, input.id, ctx.user, isPlatformAdmin(ctx.user));
      const svc = new PurchaseOrderService(ctx.prisma);
      return svc.getById(input.id);
    }),

  recordPickup: protectedProcedure
    .use(requirePermission("canOrder"))
    .input(purchaseOrderPickupSchema)
    .mutation(async ({ ctx, input }) => {
      await verifyPOAccess(ctx.prisma, input.purchaseOrderId, ctx.user, isPlatformAdmin(ctx.user));
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
    .use(requirePermission("canOrder"))
    .use(requireRecentAuth())
    .input(purchaseOrderCloseSchema)
    .mutation(async ({ ctx, input }) => {
      await verifyPOAccess(ctx.prisma, input.purchaseOrderId, ctx.user, isPlatformAdmin(ctx.user));
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
    .query(async ({ ctx, input }) => {
      await verifyPOAccess(ctx.prisma, input.id, ctx.user, isPlatformAdmin(ctx.user));
      const svc = new PurchaseOrderService(ctx.prisma);
      return svc.generateTextOrder(input.id);
    }),

  orderTrends: protectedProcedure
    .use(requireLocationAccess())
    .input(orderTrendsQuerySchema)
    .query(({ ctx, input }) => {
      const svc = new PurchaseOrderService(ctx.prisma);
      return svc.getOrderTrends(input);
    }),
});
