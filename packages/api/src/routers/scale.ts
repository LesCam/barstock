import { router, protectedProcedure, requirePermission } from "../trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const DEFAULT_DENSITY = 0.95;

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
            ...(location.businessId ? [{ businessId: location.businessId, locationId: null }] : []),
          ],
        },
        include: {
          inventoryItem: { select: { name: true, type: true, barcode: true } },
        },
      });
    }),

  createTemplate: protectedProcedure
    .use(requirePermission("canManageTareWeights"))
    .input(z.object({
      businessId: z.string().uuid().optional(),
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

  updateTemplate: protectedProcedure
    .use(requirePermission("canManageTareWeights"))
    .input(z.object({
      templateId: z.string().uuid(),
      emptyBottleWeightG: z.number().positive().optional(),
      fullBottleWeightG: z.number().positive().optional(),
      densityGPerMl: z.number().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const template = await ctx.prisma.bottleTemplate.findUniqueOrThrow({
        where: { id: input.templateId },
      });
      if (template.businessId && template.businessId !== ctx.user.businessId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Template belongs to another business" });
      }
      const { templateId, ...data } = input;
      return ctx.prisma.bottleTemplate.update({
        where: { id: templateId },
        data,
      });
    }),

  deleteTemplate: protectedProcedure
    .use(requirePermission("canManageTareWeights"))
    .input(z.object({ templateId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const template = await ctx.prisma.bottleTemplate.findUniqueOrThrow({
        where: { id: input.templateId },
      });
      if (template.businessId && template.businessId !== ctx.user.businessId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Template belongs to another business" });
      }
      return ctx.prisma.bottleTemplate.update({
        where: { id: input.templateId },
        data: { enabled: false },
      });
    }),

  /** Create an inventory item + bottle template in one step (from scan-not-found flow) */
  createItemWithTemplate: protectedProcedure
    .use(requirePermission("canManageTareWeights"))
    .input(z.object({
      locationId: z.string().uuid(),
      name: z.string().min(1).max(255),
      barcode: z.string().optional(),
      containerSizeMl: z.number().positive(),
      type: z.enum(["liquor", "wine"]).default("liquor"),
      vendorId: z.string().uuid().optional(),
      newVendorName: z.string().min(1).max(255).optional(),
      emptyBottleWeightG: z.number().positive().optional(),
      fullBottleWeightG: z.number().positive().optional(),
    }).refine(
      (d) => d.emptyBottleWeightG || d.fullBottleWeightG,
      { message: "At least one weight (empty or full) is required" }
    ))
    .mutation(async ({ ctx, input }) => {
      const location = await ctx.prisma.location.findUniqueOrThrow({
        where: { id: input.locationId },
      });

      return ctx.prisma.$transaction(async (tx) => {
        // 1. Create vendor if newVendorName provided and no vendorId
        let vendorId = input.vendorId;
        if (input.newVendorName && !vendorId) {
          const vendor = await tx.vendor.create({
            data: {
              businessId: location.businessId,
              name: input.newVendorName,
            },
          });
          vendorId = vendor.id;
        }

        // 2. Create inventory item
        const item = await tx.inventoryItem.create({
          data: {
            locationId: input.locationId,
            name: input.name,
            type: input.type,
            barcode: input.barcode || null,
            vendorId: vendorId || null,
            baseUom: "units",
            containerSize: input.containerSizeMl,
            containerUom: "ml",
          },
        });

        // 3. Calculate counterpart weight from volume + density
        let emptyG = input.emptyBottleWeightG;
        let fullG = input.fullBottleWeightG;
        const liquidWeightG = input.containerSizeMl * DEFAULT_DENSITY;

        if (emptyG && !fullG) {
          fullG = emptyG + liquidWeightG;
        } else if (fullG && !emptyG) {
          emptyG = fullG - liquidWeightG;
        }

        // 4. Create bottle template
        const template = await tx.bottleTemplate.create({
          data: {
            businessId: location.businessId,
            locationId: input.locationId,
            inventoryItemId: item.id,
            containerSizeMl: input.containerSizeMl,
            emptyBottleWeightG: emptyG!,
            fullBottleWeightG: fullG!,
            densityGPerMl: DEFAULT_DENSITY,
          },
        });

        return { item, template };
      });
    }),

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
