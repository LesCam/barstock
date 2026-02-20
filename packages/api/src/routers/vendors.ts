import { router, protectedProcedure, requireBusinessAccess, requireRole } from "../trpc";
import { vendorCreateSchema, vendorListSchema, vendorGetByIdSchema, vendorUpdateSchema } from "@barstock/validators";
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

  getById: protectedProcedure
    .input(vendorGetByIdSchema)
    .query(({ ctx, input }) =>
      ctx.prisma.vendor.findUniqueOrThrow({
        where: { id: input.id },
        include: { _count: { select: { itemVendors: true } } },
      })
    ),

  update: protectedProcedure
    .use(requireRole("manager"))
    .input(vendorUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const vendor = await ctx.prisma.vendor.update({ where: { id }, data });
      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: vendor.businessId,
        actorUserId: ctx.user.userId,
        actionType: "vendor.updated",
        objectType: "vendor",
        objectId: vendor.id,
        metadata: data,
      });
      return vendor;
    }),

  delete: protectedProcedure
    .use(requireRole("manager"))
    .input(vendorGetByIdSchema)
    .mutation(async ({ ctx, input }) => {
      const vendor = await ctx.prisma.vendor.update({
        where: { id: input.id },
        data: { active: false },
      });
      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: vendor.businessId,
        actorUserId: ctx.user.userId,
        actionType: "vendor.deleted",
        objectType: "vendor",
        objectId: vendor.id,
        metadata: { name: vendor.name },
      });
      return vendor;
    }),
});
