import {
  router,
  protectedProcedure,
  requireRole,
  requireLocationAccess,
  requireCapability,
} from "../trpc";
import {
  guideCategoryCreateSchema,
  guideCategoryUpdateSchema,
  guideCategoryListSchema,
  guideCategoryReorderSchema,
  guideCategoryDeleteSchema,
  guideItemCreateSchema,
  guideItemUpdateSchema,
  guideItemListSchema,
  guideItemGetSchema,
  guideItemUploadImageSchema,
  guideItemRemoveImageSchema,
  guideItemDeleteSchema,
  guideItemReorderSchema,
  guideItemBulkCreateSchema,
  guideItemLookupImageSchema,
  guideItemImportImageSchema,
} from "@barstock/validators";
import { ProductGuideService } from "../services/product-guide.service";
import { lookupOpenFoodFacts } from "../lib/open-food-facts";
import { lookupUpcItemDb } from "../lib/upc-itemdb";

export const productGuideRouter = router({
  // ─── Categories ───────────────────────────────────────────

  createCategory: protectedProcedure
    .use(requireRole("manager"))
    .use(requireCapability("productGuideEnabled"))
    .use(requireLocationAccess())
    .input(guideCategoryCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ProductGuideService(ctx.prisma);
      return service.createCategory(input, ctx.user.userId);
    }),

  listCategories: protectedProcedure
    .use(requireLocationAccess())
    .input(guideCategoryListSchema)
    .query(async ({ ctx, input }) => {
      const service = new ProductGuideService(ctx.prisma);
      return service.listCategories(input);
    }),

  updateCategory: protectedProcedure
    .use(requireRole("manager"))
    .use(requireCapability("productGuideEnabled"))
    .use(requireLocationAccess())
    .input(guideCategoryUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ProductGuideService(ctx.prisma);
      return service.updateCategory(input, ctx.user.userId);
    }),

  reorderCategories: protectedProcedure
    .use(requireRole("manager"))
    .use(requireCapability("productGuideEnabled"))
    .use(requireLocationAccess())
    .input(guideCategoryReorderSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ProductGuideService(ctx.prisma);
      return service.reorderCategories(input, ctx.user.userId);
    }),

  deleteCategory: protectedProcedure
    .use(requireRole("manager"))
    .use(requireCapability("productGuideEnabled"))
    .use(requireLocationAccess())
    .input(guideCategoryDeleteSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ProductGuideService(ctx.prisma);
      return service.deleteCategory(input, ctx.user.userId);
    }),

  // ─── Items ────────────────────────────────────────────────

  createItem: protectedProcedure
    .use(requireRole("manager"))
    .use(requireCapability("productGuideEnabled"))
    .use(requireLocationAccess())
    .input(guideItemCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ProductGuideService(ctx.prisma);
      return service.createItem(input, ctx.user.userId);
    }),

  listItems: protectedProcedure
    .use(requireLocationAccess())
    .input(guideItemListSchema)
    .query(async ({ ctx, input }) => {
      const service = new ProductGuideService(ctx.prisma);
      return service.listItems(input);
    }),

  getItem: protectedProcedure
    .use(requireLocationAccess())
    .input(guideItemGetSchema)
    .query(async ({ ctx, input }) => {
      const service = new ProductGuideService(ctx.prisma);
      return service.getItem(input.id);
    }),

  updateItem: protectedProcedure
    .use(requireRole("manager"))
    .use(requireCapability("productGuideEnabled"))
    .use(requireLocationAccess())
    .input(guideItemUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ProductGuideService(ctx.prisma);
      return service.updateItem(input, ctx.user.userId);
    }),

  uploadItemImage: protectedProcedure
    .use(requireRole("manager"))
    .use(requireCapability("productGuideEnabled"))
    .use(requireLocationAccess())
    .input(guideItemUploadImageSchema)
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.base64Data, "base64");
      const service = new ProductGuideService(ctx.prisma);
      return service.uploadItemImage(
        input.id,
        input.locationId,
        buffer,
        input.filename,
        ctx.user.userId
      );
    }),

  removeItemImage: protectedProcedure
    .use(requireRole("manager"))
    .use(requireCapability("productGuideEnabled"))
    .use(requireLocationAccess())
    .input(guideItemRemoveImageSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ProductGuideService(ctx.prisma);
      return service.removeItemImage(input.id, input.locationId, ctx.user.userId);
    }),

  deleteItem: protectedProcedure
    .use(requireRole("manager"))
    .use(requireCapability("productGuideEnabled"))
    .use(requireLocationAccess())
    .input(guideItemDeleteSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ProductGuideService(ctx.prisma);
      return service.deleteItem(input.id, input.locationId, ctx.user.userId);
    }),

  reorderItems: protectedProcedure
    .use(requireRole("manager"))
    .use(requireCapability("productGuideEnabled"))
    .use(requireLocationAccess())
    .input(guideItemReorderSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ProductGuideService(ctx.prisma);
      return service.reorderItems(input, ctx.user.userId);
    }),

  bulkCreateItems: protectedProcedure
    .use(requireRole("manager"))
    .use(requireCapability("productGuideEnabled"))
    .use(requireLocationAccess())
    .input(guideItemBulkCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ProductGuideService(ctx.prisma);
      return service.bulkCreateItems(input, ctx.user.userId);
    }),

  lookupProductImage: protectedProcedure
    .use(requireLocationAccess())
    .input(guideItemLookupImageSchema)
    .query(async ({ input }) => {
      // Try Open Food Facts first, then UPC Item DB
      const offResult = await lookupOpenFoodFacts(input.barcode);
      if (offResult?.imageUrl) {
        return {
          imageUrl: offResult.imageUrl,
          brand: offResult.brand,
          source: "Open Food Facts",
        };
      }

      const upcResult = await lookupUpcItemDb(input.barcode);
      if (upcResult?.imageUrl || upcResult?.brand) {
        return {
          imageUrl: upcResult?.imageUrl ?? null,
          brand: upcResult?.brand ?? null,
          source: "UPC Item DB",
        };
      }

      // One source may have brand but not image — check OFF for brand
      if (offResult?.brand) {
        return {
          imageUrl: null,
          brand: offResult.brand,
          source: "Open Food Facts",
        };
      }

      return { imageUrl: null, brand: null, source: null };
    }),

  importImageFromUrl: protectedProcedure
    .use(requireRole("manager"))
    .use(requireCapability("productGuideEnabled"))
    .use(requireLocationAccess())
    .input(guideItemImportImageSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ProductGuideService(ctx.prisma);
      return service.importImageFromUrl(
        input.id,
        input.locationId,
        input.imageUrl,
        ctx.user.userId
      );
    }),
});
