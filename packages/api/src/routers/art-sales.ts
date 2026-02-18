import {
  router,
  protectedProcedure,
  requireRole,
  requireBusinessAccess,
  requireCapability,
} from "../trpc";
import { artSaleCreateSchema, artSaleListSchema } from "@barstock/validators";
import { ArtSaleService } from "../services/art-sale.service";

export const artSalesRouter = router({
  recordSale: protectedProcedure
    .use(requireCapability("artSalesEnabled"))
    .use(requireRole("staff"))
    .use(requireBusinessAccess())
    .input(artSaleCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ArtSaleService(ctx.prisma);
      return service.recordSale(input, ctx.user.userId);
    }),

  list: protectedProcedure
    .use(requireCapability("artSalesEnabled"))
    .use(requireRole("manager"))
    .use(requireBusinessAccess())
    .input(artSaleListSchema)
    .query(async ({ ctx, input }) => {
      const service = new ArtSaleService(ctx.prisma);
      return service.list(input);
    }),
});
