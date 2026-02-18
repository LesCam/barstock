import { router, protectedProcedure, requireLocationAccess } from "../trpc";
import { transferCreateSchema, transferListSchema } from "@barstock/validators";
import { TransferService } from "../services/transfer.service";

export const transfersRouter = router({
  create: protectedProcedure
    .use(requireLocationAccess())
    .input(transferCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const svc = new TransferService(ctx.prisma);
      return svc.createTransfer(input);
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
          inventoryItem: { select: { name: true, type: true, baseUom: true } },
        },
        orderBy: { eventTs: "desc" },
        take: input.limit,
      })
    ),
});
