import { router, protectedProcedure, requireLocationAccess } from "../trpc";
import { transferCreateSchema, transferListSchema } from "@barstock/validators";
import { TransferService } from "../services/transfer.service";
import { AuditService } from "../services/audit.service";

export const transfersRouter = router({
  create: protectedProcedure
    .use(requireLocationAccess())
    .input(transferCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const svc = new TransferService(ctx.prisma);
      const result = await svc.createTransfer(input);

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "transfer.created",
        objectType: "transfer",
        metadata: {
          inventoryItemId: input.inventoryItemId,
          fromSubAreaId: input.fromSubAreaId,
          toSubAreaId: input.toSubAreaId,
          quantity: input.quantity,
        },
      });

      return result;
    }),

  list: protectedProcedure
    .use(requireLocationAccess())
    .input(transferListSchema)
    .query(({ ctx, input }) =>
      ctx.prisma.consumptionEvent.findMany({
        where: {
          locationId: input.locationId,
          eventType: "transfer",
          quantityDelta: { gt: 0 }, // Only show the "to" side to avoid duplicates
        },
        include: {
          inventoryItem: { select: { name: true, baseUom: true, category: { select: { name: true } } } },
        },
        orderBy: { eventTs: "desc" },
        take: input.limit,
      })
    ),
});
