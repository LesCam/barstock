import { router, protectedProcedure, requireRole } from "../trpc";
import { locationCreateSchema, locationUpdateSchema } from "@barstock/validators";
import { z } from "zod";

export const locationsRouter = router({
  create: protectedProcedure
    .use(requireRole("admin"))
    .input(locationCreateSchema)
    .mutation(({ ctx, input }) => ctx.prisma.location.create({ data: input })),

  listByOrg: protectedProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      ctx.prisma.location.findMany({ where: { orgId: input.orgId } })
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
