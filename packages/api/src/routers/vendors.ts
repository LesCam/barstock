import { router, protectedProcedure, requireBusinessAccess } from "../trpc";
import { vendorCreateSchema, vendorListSchema } from "@barstock/validators";
import { AuditService } from "../services/audit.service";

export const vendorsRouter = router({
  create: protectedProcedure
    .use(requireBusinessAccess())
    .input(vendorCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const vendor = await ctx.prisma.vendor.create({ data: input });

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: input.businessId,
        actorUserId: ctx.user.userId,
        actionType: "vendor.created",
        objectType: "vendor",
        objectId: vendor.id,
        metadata: { name: input.name, businessId: input.businessId },
      });

      return vendor;
    }),

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
