import { router, protectedProcedure, requireLocationAccess } from "../trpc";
import { z } from "zod";
import { ReceivingService } from "../services/receiving.service";
import { AuditService } from "../services/audit.service";

const receiveStockSchema = z.object({
  locationId: z.string().uuid(),
  inventoryItemId: z.string().uuid(),
  quantity: z.number().positive(),
  vendorId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

export const receivingRouter = router({
  receive: protectedProcedure
    .use(requireLocationAccess())
    .input(receiveStockSchema)
    .mutation(async ({ ctx, input }) => {
      const svc = new ReceivingService(ctx.prisma);
      const result = await svc.receiveStock(input, ctx.user.userId);

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "stock.received",
        objectType: "consumption_event",
        objectId: result.eventId,
        metadata: {
          locationId: input.locationId,
          inventoryItemId: input.inventoryItemId,
          quantity: input.quantity,
          vendorId: input.vendorId,
          notes: input.notes,
        },
      });

      return result;
    }),
});
