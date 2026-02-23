import { router, protectedProcedure } from "../trpc";
import { masterProductLookupSchema, masterProductContributeSchema } from "@barstock/validators";
import { SettingsService } from "../services/settings.service";
import { TRPCError } from "@trpc/server";

export const masterProductsRouter = router({
  lookup: protectedProcedure
    .input(masterProductLookupSchema)
    .query(({ ctx, input }) =>
      ctx.prisma.masterProduct.findUnique({
        where: { barcode: input.barcode },
      })
    ),

  contribute: protectedProcedure
    .input(masterProductContributeSchema)
    .mutation(async ({ ctx, input }) => {
      // Check if business has opted in to sharing
      const settingsService = new SettingsService(ctx.prisma);
      const settings = await settingsService.getSettings(ctx.user.businessId);
      if (!settings.masterProductSharing.optedIn) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Product data sharing is not enabled for this business. Enable it in Settings.",
        });
      }

      const { barcode, name, categoryHint, baseUom, containerSizeMl, emptyBottleWeightG, fullBottleWeightG, densityGPerMl } = input;

      const existing = await ctx.prisma.masterProduct.findUnique({
        where: { barcode },
      });

      if (existing) {
        // Update existing: increment count, update fields if provided
        return ctx.prisma.masterProduct.update({
          where: { barcode },
          data: {
            name,
            ...(categoryHint !== undefined && { categoryHint }),
            ...(baseUom !== undefined && { baseUom }),
            ...(containerSizeMl !== undefined && { containerSizeMl }),
            ...(emptyBottleWeightG !== undefined && { emptyBottleWeightG }),
            ...(fullBottleWeightG !== undefined && { fullBottleWeightG }),
            ...(densityGPerMl !== undefined && { densityGPerMl }),
            contributionCount: { increment: 1 },
            lastContributedAt: new Date(),
            lastContributedByBusinessId: ctx.user.businessId,
          },
        });
      }

      // Create new
      return ctx.prisma.masterProduct.create({
        data: {
          barcode,
          name,
          categoryHint: categoryHint ?? null,
          baseUom: baseUom ?? "oz",
          containerSizeMl: containerSizeMl ?? null,
          emptyBottleWeightG: emptyBottleWeightG ?? null,
          fullBottleWeightG: fullBottleWeightG ?? null,
          densityGPerMl: densityGPerMl ?? null,
          lastContributedByBusinessId: ctx.user.businessId,
        },
      });
    }),
});
