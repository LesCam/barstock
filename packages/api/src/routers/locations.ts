import { router, protectedProcedure, requireRole, requireBusinessAccess } from "../trpc";
import { locationCreateSchema, locationUpdateSchema } from "@barstock/validators";
import { AuditService } from "../services/audit.service";
import { z } from "zod";

export const locationsRouter = router({
  create: protectedProcedure
    .use(requireRole("business_admin"))
    .input(locationCreateSchema)
    .mutation(({ ctx, input }) => ctx.prisma.location.create({ data: input })),

  listByBusiness: protectedProcedure
    .use(requireBusinessAccess())
    .input(z.object({ businessId: z.string().uuid(), activeOnly: z.boolean().default(true) }))
    .query(({ ctx, input }) =>
      ctx.prisma.location.findMany({
        where: {
          businessId: input.businessId,
          ...(input.activeOnly ? { active: true } : {}),
        },
      })
    ),

  getById: protectedProcedure
    .input(z.object({ locationId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      ctx.prisma.location.findUniqueOrThrow({
        where: { id: input.locationId },
      })
    ),

  update: protectedProcedure
    .use(requireRole("manager"))
    .input(z.object({ locationId: z.string().uuid() }).merge(locationUpdateSchema))
    .mutation(({ ctx, input }) => {
      const { locationId, ...data } = input;
      return ctx.prisma.location.update({ where: { id: locationId }, data });
    }),

  archive: protectedProcedure
    .use(requireRole("business_admin"))
    .input(z.object({ locationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const location = await ctx.prisma.location.update({
        where: { id: input.locationId },
        data: { active: false },
      });

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "location.archive",
        objectType: "location",
        objectId: input.locationId,
        metadata: { locationName: location.name },
      });

      return location;
    }),

  restore: protectedProcedure
    .use(requireRole("business_admin"))
    .input(z.object({ locationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const location = await ctx.prisma.location.update({
        where: { id: input.locationId },
        data: { active: true },
      });

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "location.restore",
        objectType: "location",
        objectId: input.locationId,
        metadata: { locationName: location.name },
      });

      return location;
    }),

  archiveSummary: protectedProcedure
    .use(requireRole("business_admin"))
    .input(z.object({ locationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const lid = input.locationId;

      const [
        inventoryItems,
        inventorySessions,
        consumptionEvents,
        salesLines,
        purchaseOrders,
        kegInstances,
        tapLines,
        barAreas,
        recipes,
        parLevels,
        posConnections,
        scaleProfiles,
        primaryUsers,
        guideCategories,
        guideItems,
      ] = await Promise.all([
        ctx.prisma.inventoryItem.count({ where: { locationId: lid } }),
        ctx.prisma.inventorySession.count({ where: { locationId: lid } }),
        ctx.prisma.consumptionEvent.count({ where: { locationId: lid } }),
        ctx.prisma.salesLine.count({ where: { locationId: lid } }),
        ctx.prisma.purchaseOrder.count({ where: { locationId: lid } }),
        ctx.prisma.kegInstance.count({ where: { locationId: lid } }),
        ctx.prisma.tapLine.count({ where: { locationId: lid } }),
        ctx.prisma.barArea.count({ where: { locationId: lid } }),
        ctx.prisma.recipe.count({ where: { locationId: lid } }),
        ctx.prisma.parLevel.count({ where: { locationId: lid } }),
        ctx.prisma.pOSConnection.count({ where: { locationId: lid } }),
        ctx.prisma.scaleProfile.count({ where: { locationId: lid } }),
        ctx.prisma.user.count({ where: { locationId: lid } }),
        ctx.prisma.productGuideCategory.count({ where: { locationId: lid } }),
        ctx.prisma.productGuideItem.count({ where: { locationId: lid } }),
      ]);

      return {
        inventoryItems,
        inventorySessions,
        consumptionEvents,
        salesLines,
        purchaseOrders,
        kegInstances,
        tapLines,
        barAreas,
        recipes,
        parLevels,
        posConnections,
        scaleProfiles,
        primaryUsers,
        guideCategories,
        guideItems,
      };
    }),

  /** Dashboard stats for a location */
  stats: protectedProcedure
    .input(z.object({ locationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [unmappedCount, openSessions, lastConnection] = await Promise.all([
        // Unmapped POS items — sales with no mapping
        ctx.prisma.salesLine.count({
          where: {
            locationId: input.locationId,
            consumptionEvents: { none: {} },
          },
        }),
        ctx.prisma.inventorySession.count({
          where: { locationId: input.locationId, endedTs: null },
        }),
        ctx.prisma.pOSConnection.findFirst({
          where: { locationId: input.locationId },
          orderBy: { lastSuccessTs: "desc" },
        }),
      ]);

      return {
        unmappedCount,
        openSessions,
        lastPosImport: lastConnection?.lastSuccessTs ?? null,
      };
    }),
});
