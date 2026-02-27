import { router, protectedProcedure, requirePermission } from "../trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { SettingsService } from "../services/settings.service";
import { TareConsensusService } from "../services/tare-consensus.service";

const DEFAULT_DENSITY = 0.95;

/**
 * Auto-contribute tare weight data to master_products when:
 * 1. The item has a barcode
 * 2. The business has master product sharing opted in
 * Best-effort — silently fails if sharing is disabled or errors occur.
 */
async function contributeWeightToMasterDb(
  prisma: any,
  businessId: string,
  userId: string,
  inventoryItemId: string,
  weights: {
    emptyBottleWeightG?: number | null;
    fullBottleWeightG?: number | null;
    densityGPerMl?: number | null;
    containerSizeMl?: number;
  }
) {
  try {
    const item = await prisma.inventoryItem.findUnique({
      where: { id: inventoryItemId },
      select: { barcode: true },
    });
    if (!item?.barcode) return;

    const settingsService = new SettingsService(prisma);
    const settings = await settingsService.getSettings(businessId);
    if (!settings.masterProductSharing.optedIn) return;

    const updateData: Record<string, any> = {
      contributionCount: { increment: 1 },
      lastContributedAt: new Date(),
      lastContributedByBusinessId: businessId,
    };
    if (weights.emptyBottleWeightG != null) updateData.emptyBottleWeightG = weights.emptyBottleWeightG;
    if (weights.fullBottleWeightG != null) updateData.fullBottleWeightG = weights.fullBottleWeightG;
    if (weights.densityGPerMl != null) updateData.densityGPerMl = weights.densityGPerMl;
    if (weights.containerSizeMl != null) updateData.containerSizeMl = weights.containerSizeMl;

    await prisma.masterProduct.update({
      where: { barcode: item.barcode },
      data: updateData,
    });

    // Also create a tare observation if emptyBottleWeightG is provided
    if (weights.emptyBottleWeightG != null) {
      await prisma.tareObservation.create({
        data: {
          barcode: item.barcode,
          measuredWeightG: weights.emptyBottleWeightG,
          sourceType: "manual_template",
          sourceBusinessId: businessId,
          sourceUserId: userId,
          containerSizeMl: weights.containerSizeMl,
          isManualEntry: true,
        },
      });
      const consensus = new TareConsensusService(prisma);
      await consensus.recalculate(item.barcode);
    }
  } catch {
    // Best-effort — don't break the main operation
  }
}

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
          inventoryItem: {
            select: {
              name: true,
              barcode: true,
              category: { select: { id: true, name: true, countingMethod: true, defaultDensity: true } },
            },
          },
        },
      });
    }),

  /** Look up an item by barcode and return its existing template (if any) */
  lookupByBarcode: protectedProcedure
    .input(z.object({ locationId: z.string().uuid(), barcode: z.string() }))
    .query(async ({ ctx, input }) => {
      const item = await ctx.prisma.inventoryItem.findFirst({
        where: { locationId: input.locationId, barcode: input.barcode },
        select: {
          id: true, name: true, barcode: true, containerSize: true,
          category: { select: { id: true, name: true, countingMethod: true, defaultDensity: true } },
        },
      });
      if (!item) return null;

      const template = await ctx.prisma.bottleTemplate.findFirst({
        where: { inventoryItemId: item.id, enabled: true },
      });

      return {
        item,
        template: template
          ? {
              emptyBottleWeightG: template.emptyBottleWeightG != null ? Number(template.emptyBottleWeightG) : null,
              fullBottleWeightG: template.fullBottleWeightG != null ? Number(template.fullBottleWeightG) : null,
              containerSizeMl: Number(template.containerSizeMl),
              densityGPerMl: template.densityGPerMl != null ? Number(template.densityGPerMl) : null,
            }
          : null,
      };
    }),

  createTemplate: protectedProcedure
    .use(requirePermission("canManageTareWeights"))
    .input(z.object({
      businessId: z.string().uuid().optional(),
      locationId: z.string().uuid().optional(),
      inventoryItemId: z.string().uuid(),
      containerSizeMl: z.number().positive(),
      emptyBottleWeightG: z.number().positive().optional(),
      fullBottleWeightG: z.number().positive().optional(),
      densityGPerMl: z.number().positive().optional(),
      force: z.boolean().default(false),
    }).refine(
      (d) => d.emptyBottleWeightG || d.fullBottleWeightG,
      { message: "At least one weight (empty or full) is required" }
    ))
    .mutation(async ({ ctx, input }) => {
      const { force, ...data } = input;

      // Check for an active template for this item
      const active = await ctx.prisma.bottleTemplate.findFirst({
        where: { inventoryItemId: input.inventoryItemId, locationId: input.locationId ?? null, enabled: true },
      });
      if (active && !force) {
        throw new TRPCError({ code: "CONFLICT", message: "A template already exists for this item. Override with new values?" });
      }
      // Sync container size to inventory item
      await ctx.prisma.inventoryItem.update({
        where: { id: input.inventoryItemId },
        data: { containerSize: input.containerSizeMl, containerUom: "ml" },
      });

      const templateData = {
        containerSizeMl: input.containerSizeMl,
        emptyBottleWeightG: input.emptyBottleWeightG ?? null,
        fullBottleWeightG: input.fullBottleWeightG ?? null,
        densityGPerMl: input.densityGPerMl ?? null,
      };

      let result;
      if (active) {
        // Force: update the existing active template
        result = await ctx.prisma.bottleTemplate.update({
          where: { id: active.id },
          data: templateData,
        });
      } else {
        // Reactivate a soft-deleted template if one exists
        const disabled = await ctx.prisma.bottleTemplate.findFirst({
          where: { inventoryItemId: input.inventoryItemId, locationId: input.locationId ?? null, enabled: false },
        });
        if (disabled) {
          result = await ctx.prisma.bottleTemplate.update({
            where: { id: disabled.id },
            data: { enabled: true, ...templateData },
          });
        } else {
          result = await ctx.prisma.bottleTemplate.create({
            data: {
              ...data,
              emptyBottleWeightG: data.emptyBottleWeightG ?? null,
              fullBottleWeightG: data.fullBottleWeightG ?? null,
            },
          });
        }
      }

      // Auto-contribute weight data to master product DB
      contributeWeightToMasterDb(ctx.prisma, ctx.user.businessId, ctx.user.userId, input.inventoryItemId, {
        emptyBottleWeightG: input.emptyBottleWeightG,
        fullBottleWeightG: input.fullBottleWeightG,
        densityGPerMl: input.densityGPerMl,
        containerSizeMl: input.containerSizeMl,
      });

      return result;
    }),

  updateTemplate: protectedProcedure
    .use(requirePermission("canManageTareWeights"))
    .input(z.object({
      templateId: z.string().uuid(),
      emptyBottleWeightG: z.number().positive().nullable().optional(),
      fullBottleWeightG: z.number().positive().nullable().optional(),
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
      const result = await ctx.prisma.bottleTemplate.update({
        where: { id: templateId },
        data,
      });

      // Auto-contribute weight data to master product DB
      contributeWeightToMasterDb(ctx.prisma, ctx.user.businessId, ctx.user.userId, template.inventoryItemId, {
        emptyBottleWeightG: input.emptyBottleWeightG,
        fullBottleWeightG: input.fullBottleWeightG,
        densityGPerMl: input.densityGPerMl,
      });

      return result;
    }),

  /** Check if a template has related measurements or session lines */
  checkTemplateUsage: protectedProcedure
    .input(z.object({ templateId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [sessionLineCount, measurementCount] = await Promise.all([
        ctx.prisma.inventorySessionLine.count({
          where: { bottleTemplateId: input.templateId },
        }),
        ctx.prisma.bottleMeasurement.count({
          where: {
            inventoryItemId: (
              await ctx.prisma.bottleTemplate.findUniqueOrThrow({
                where: { id: input.templateId },
                select: { inventoryItemId: true },
              })
            ).inventoryItemId,
          },
        }),
      ]);
      return { sessionLineCount, measurementCount, hasUsage: sessionLineCount > 0 || measurementCount > 0 };
    }),

  deleteTemplate: protectedProcedure
    .use(requirePermission("canManageTareWeights"))
    .input(z.object({ templateId: z.string().uuid(), force: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const template = await ctx.prisma.bottleTemplate.findUniqueOrThrow({
        where: { id: input.templateId },
      });
      if (template.businessId && template.businessId !== ctx.user.businessId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Template belongs to another business" });
      }

      // Check for references if not forcing
      if (!input.force) {
        const sessionLineCount = await ctx.prisma.inventorySessionLine.count({
          where: { bottleTemplateId: input.templateId },
        });
        if (sessionLineCount > 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `This template is used in ${sessionLineCount} session line${sessionLineCount !== 1 ? "s" : ""}. Are you sure you want to remove it?`,
          });
        }
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
      categoryId: z.string().uuid(),
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

      // Validate category exists, is weighable, and belongs to this business
      const category = await ctx.prisma.inventoryItemCategory.findUniqueOrThrow({
        where: { id: input.categoryId },
      });
      if (category.businessId !== location.businessId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Category does not belong to this business" });
      }
      if (category.countingMethod !== "weighable") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Category must use weighable counting method" });
      }

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
            categoryId: input.categoryId,
            barcode: input.barcode || null,
            vendorId: vendorId || null,
            baseUom: "units",
            containerSize: input.containerSizeMl,
            containerUom: "ml",
          },
        });

        // 3. Determine weights and density using category default
        const catDensity = category.defaultDensity ? Number(category.defaultDensity) : DEFAULT_DENSITY;
        let emptyG = input.emptyBottleWeightG ?? null;
        let fullG = input.fullBottleWeightG ?? null;
        let density: number = catDensity;

        if (emptyG != null && fullG != null) {
          // Both measured — derive actual density
          const liquidG = fullG - emptyG;
          density = (liquidG > 0 && input.containerSizeMl > 0) ? liquidG / input.containerSizeMl : catDensity;
        }

        // 4. Create bottle template
        const template = await tx.bottleTemplate.create({
          data: {
            businessId: location.businessId,
            locationId: input.locationId,
            inventoryItemId: item.id,
            containerSizeMl: input.containerSizeMl,
            emptyBottleWeightG: emptyG,
            fullBottleWeightG: fullG,
            densityGPerMl: density,
          },
        });

        return { item, template };
      });
    }),

  updateTemplateDensity: protectedProcedure
    .input(z.object({
      templateId: z.string().uuid(),
      densityGPerMl: z.number().min(0.5).max(2.0),
    }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.bottleTemplate.update({
        where: { id: input.templateId },
        data: { densityGPerMl: input.densityGPerMl },
      })
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

      const density = Number(template.densityGPerMl) || DEFAULT_DENSITY;
      const containerMl = Number(template.containerSizeMl);
      const liquidContentG = containerMl * density;

      // Derive whichever weight is missing from the other + density
      const effectiveTareG = template.emptyBottleWeightG != null
        ? Number(template.emptyBottleWeightG)
        : template.fullBottleWeightG != null
          ? Number(template.fullBottleWeightG) - liquidContentG
          : 0; // shouldn't happen — at least one weight must exist
      const liquidWeightG = input.grossWeightG - effectiveTareG;
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
