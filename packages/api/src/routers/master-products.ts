import { router, protectedProcedure } from "../trpc";
import { masterProductLookupSchema, masterProductContributeSchema, chainedLookupSchema } from "@barstock/validators";
import { SettingsService } from "../services/settings.service";
import { TRPCError } from "@trpc/server";
import { lookupOpenFoodFacts } from "../lib/open-food-facts";
import { lookupUpcItemDb } from "../lib/upc-itemdb";

export const masterProductsRouter = router({
  lookup: protectedProcedure
    .input(masterProductLookupSchema)
    .query(({ ctx, input }) =>
      ctx.prisma.masterProduct.findUnique({
        where: { barcode: input.barcode },
      })
    ),

  /** Chained lookup: local inventory → master products → Open Food Facts */
  chainedLookup: protectedProcedure
    .input(chainedLookupSchema)
    .query(async ({ ctx, input }) => {
      // 1. Check local inventory
      const localItem = await ctx.prisma.inventoryItem.findFirst({
        where: {
          locationId: input.locationId,
          barcode: input.barcode,
          active: true,
        },
        include: {
          category: {
            select: { id: true, name: true, countingMethod: true, defaultDensity: true },
          },
        },
      });

      if (localItem) {
        return { source: "local" as const, localItem, suggestion: null };
      }

      // 2. Check master products
      const masterProduct = await ctx.prisma.masterProduct.findUnique({
        where: { barcode: input.barcode },
      });

      if (masterProduct) {
        const tareSuggestion =
          masterProduct.tareSampleCount > 0 && masterProduct.tareConfidence >= 30
            ? {
                tareWeightG: Number(masterProduct.emptyBottleWeightG),
                confidence: masterProduct.tareConfidence,
                sampleCount: masterProduct.tareSampleCount,
              }
            : null;

        return {
          source: "master" as const,
          localItem: null,
          suggestion: {
            name: masterProduct.name,
            containerSizeMl: masterProduct.containerSizeMl
              ? Number(masterProduct.containerSizeMl)
              : null,
            categoryHint: masterProduct.categoryHint,
            brand: null as string | null,
            imageUrl: null as string | null,
            tareSuggestion,
          },
        };
      }

      // 3. Check Open Food Facts (external API, 3s timeout)
      const offResult = await lookupOpenFoodFacts(input.barcode);

      if (offResult) {
        const displayName =
          offResult.brand && !offResult.name.toLowerCase().startsWith(offResult.brand.toLowerCase())
            ? `${offResult.brand} ${offResult.name}`
            : offResult.name;

        return {
          source: "openfoodfacts" as const,
          localItem: null,
          suggestion: {
            name: displayName,
            containerSizeMl: offResult.containerSizeMl,
            categoryHint: offResult.categoryHint,
            brand: offResult.brand,
            imageUrl: offResult.imageUrl,
            tareSuggestion: null,
          },
        };
      }

      // 4. Check UPC Item DB (external API, 3s timeout — better spirits coverage)
      const upcResult = await lookupUpcItemDb(input.barcode);

      if (upcResult) {
        const displayName =
          upcResult.brand && !upcResult.name.toLowerCase().startsWith(upcResult.brand.toLowerCase())
            ? `${upcResult.brand} ${upcResult.name}`
            : upcResult.name;

        return {
          source: "upcitemdb" as const,
          localItem: null,
          suggestion: {
            name: displayName,
            containerSizeMl: upcResult.containerSizeMl,
            categoryHint: upcResult.categoryHint,
            brand: upcResult.brand,
            imageUrl: upcResult.imageUrl,
            tareSuggestion: null,
          },
        };
      }

      // 5. Not found anywhere
      return { source: "none" as const, localItem: null, suggestion: null };
    }),

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
