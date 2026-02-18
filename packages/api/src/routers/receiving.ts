import { router, protectedProcedure, requireLocationAccess } from "../trpc";
import { z } from "zod";
import { ReceivingService } from "../services/receiving.service";

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
      return svc.receiveStock(input, ctx.user.userId);
    }),
});
