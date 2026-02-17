import { router, protectedProcedure, requireBusinessAccess } from "../trpc";
import { vendorCreateSchema, vendorListSchema } from "@barstock/validators";

export const vendorsRouter = router({
  create: protectedProcedure
    .use(requireBusinessAccess())
    .input(vendorCreateSchema)
    .mutation(({ ctx, input }) =>
      ctx.prisma.vendor.create({ data: input })
    ),

  list: protectedProcedure
    .use(requireBusinessAccess())
    .input(vendorListSchema)
    .query(({ ctx, input }) =>
      ctx.prisma.vendor.findMany({
        where: {
          businessId: input.businessId,
          ...(input.activeOnly ? { active: true } : {}),
        },
        orderBy: { name: "asc" },
      })
    ),
});
