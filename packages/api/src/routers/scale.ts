import { router, protectedProcedure, requireRole } from "../trpc";
import { z } from "zod";

export const scaleRouter = router({
  /** Bottle templates for a location (includes org-level) */
  listTemplates: protectedProcedure
    .input(z.object({ locationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const location = await ctx.prisma.location.findUniqueOrThrow({
        where: { id: input.locationId },
      });

      return ctx.prisma.bottleTemplate.findMany({
        where: {
          enabled: true,
          OR: [
            { locationId: input.locationId },
            ...(location.orgId ? [{ orgId: location.orgId, locationId: null }] : []),
          ],
        },
        include: {
          inventoryItem: { select: { name: true, type: true } },
        },
      });
    }),

  createTemplate: protectedProcedure
    .use(requireRole("manager"))
    .input(z.object({
      orgId: z.string().uuid().optional(),
      locationId: z.string().uuid().optional(),
      inventoryItemId: z.string().uuid(),
      containerSizeMl: z.number().positive(),
      emptyBottleWeightG: z.number().positive(),
      fullBottleWeightG: z.number().positive(),
      densityGPerMl: z.number().positive().optional(),
    }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.bottleTemplate.create({ data: input })
    ),

  /** Record a bottle measurement */
  recordMeasurement: protectedProcedure
    .input(z.object({
      locationId: z.string().uuid(),
      inventoryItemId: z.string().uuid(),
      sessionId: z.string().uuid().optional(),
      grossWeightG: z.number().min(0),
      isManual: z.boolean().default(false),
      confidenceLevel: z.enum(["measured", "estimated"]),
      scaleDeviceId: z.string().optional(),
      scaleDeviceName: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.bottleMeasurement.create({
        data: {
          ...input,
          measuredAtTs: new Date(),
          createdBy: ctx.user.userId,
        },
      })
    ),

  /** Calculate liquid remaining from a weight measurement */
  calculateLiquid: protectedProcedure
    .input(z.object({
      templateId: z.string().uuid(),
      grossWeightG: z.number().min(0),
    }))
    .query(async ({ ctx, input }) => {
      const template = await ctx.prisma.bottleTemplate.findUniqueOrThrow({
        where: { id: input.templateId },
      });

      const liquidWeightG = input.grossWeightG - Number(template.emptyBottleWeightG);
      const density = Number(template.densityGPerMl) || 1.0;
      const liquidMl = Math.max(0, liquidWeightG / density);
      const liquidOz = liquidMl / 29.5735;
      const percentRemaining =
        (liquidMl / Number(template.containerSizeMl)) * 100;

      return {
        liquidMl: Math.round(liquidMl * 10) / 10,
        liquidOz: Math.round(liquidOz * 10) / 10,
        percentRemaining: Math.round(Math.min(100, Math.max(0, percentRemaining)) * 10) / 10,
      };
    }),
});
