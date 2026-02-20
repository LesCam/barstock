import { router, protectedProcedure, requireBusinessAccess, requireRole } from "../trpc";
import { vendorCreateSchema, vendorListSchema, vendorGetByIdSchema, vendorUpdateSchema, vendorOrdererSchema } from "@barstock/validators";
import { AuditService } from "../services/audit.service";
import { z } from "zod";

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
        include: {
          vendorOrderers: { select: { userId: true } },
        },
        orderBy: { name: "asc" },
      })
    ),

  getById: protectedProcedure
    .input(vendorGetByIdSchema)
    .query(({ ctx, input }) =>
      ctx.prisma.vendor.findUniqueOrThrow({
        where: { id: input.id },
        include: {
          _count: { select: { itemVendors: true } },
          vendorOrderers: { select: { userId: true } },
        },
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

  assignOrderer: protectedProcedure
    .use(requireRole("business_admin"))
    .input(vendorOrdererSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prisma.vendorOrderer.upsert({
        where: {
          vendorId_userId: {
            vendorId: input.vendorId,
            userId: input.userId,
          },
        },
        create: {
          vendorId: input.vendorId,
          userId: input.userId,
        },
        update: {},
      });

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "vendor.orderer_assigned",
        objectType: "vendor",
        objectId: input.vendorId,
        metadata: { assignedUserId: input.userId },
      });

      return result;
    }),

  removeOrderer: protectedProcedure
    .use(requireRole("business_admin"))
    .input(vendorOrdererSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.vendorOrderer.delete({
        where: {
          vendorId_userId: {
            vendorId: input.vendorId,
            userId: input.userId,
          },
        },
      });

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "vendor.orderer_removed",
        objectType: "vendor",
        objectId: input.vendorId,
        metadata: { removedUserId: input.userId },
      });

      return { success: true };
    }),

  listOrderers: protectedProcedure
    .use(requireRole("business_admin"))
    .input(z.object({ vendorId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      ctx.prisma.vendorOrderer.findMany({
        where: { vendorId: input.vendorId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
      })
    ),
});
