import {
  router,
  protectedProcedure,
  requireRole,
  requireLocationAccess,
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
} from "@barstock/validators";
import { ProductGuideService } from "../services/product-guide.service";

export const productGuideRouter = router({
  // ─── Categories ───────────────────────────────────────────

  createCategory: protectedProcedure
    .use(requireRole("manager"))
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
    .use(requireLocationAccess())
    .input(guideCategoryUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ProductGuideService(ctx.prisma);
      return service.updateCategory(input, ctx.user.userId);
    }),

  reorderCategories: protectedProcedure
    .use(requireRole("manager"))
    .use(requireLocationAccess())
    .input(guideCategoryReorderSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ProductGuideService(ctx.prisma);
      return service.reorderCategories(input, ctx.user.userId);
    }),

  deleteCategory: protectedProcedure
    .use(requireRole("manager"))
    .use(requireLocationAccess())
    .input(guideCategoryDeleteSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ProductGuideService(ctx.prisma);
      return service.deleteCategory(input, ctx.user.userId);
    }),

  // ─── Items ────────────────────────────────────────────────

  createItem: protectedProcedure
    .use(requireRole("manager"))
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
    .use(requireLocationAccess())
    .input(guideItemUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ProductGuideService(ctx.prisma);
      return service.updateItem(input, ctx.user.userId);
    }),

  uploadItemImage: protectedProcedure
    .use(requireRole("manager"))
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
    .use(requireLocationAccess())
    .input(guideItemRemoveImageSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ProductGuideService(ctx.prisma);
      return service.removeItemImage(input.id, input.locationId, ctx.user.userId);
    }),

  deleteItem: protectedProcedure
    .use(requireRole("manager"))
    .use(requireLocationAccess())
    .input(guideItemDeleteSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ProductGuideService(ctx.prisma);
      return service.deleteItem(input.id, input.locationId, ctx.user.userId);
    }),

  reorderItems: protectedProcedure
    .use(requireRole("manager"))
    .use(requireLocationAccess())
    .input(guideItemReorderSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ProductGuideService(ctx.prisma);
      return service.reorderItems(input, ctx.user.userId);
    }),

  bulkCreateItems: protectedProcedure
    .use(requireRole("manager"))
    .use(requireLocationAccess())
    .input(guideItemBulkCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ProductGuideService(ctx.prisma);
      return service.bulkCreateItems(input, ctx.user.userId);
    }),
});
