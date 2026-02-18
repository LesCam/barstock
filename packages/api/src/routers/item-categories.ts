import { router, protectedProcedure, requireRole } from "../trpc";
import {
  itemCategoryCreateSchema,
  itemCategoryUpdateSchema,
  itemCategoryListSchema,
} from "@barstock/validators";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const itemCategoriesRouter = router({
  list: protectedProcedure
    .input(itemCategoryListSchema)
    .query(({ ctx, input }) =>
      ctx.prisma.inventoryItemCategory.findMany({
        where: {
          businessId: input.businessId,
          ...(input.activeOnly && { active: true }),
        },
        orderBy: { sortOrder: "asc" },
      })
    ),

  create: protectedProcedure
    .use(requireRole("manager"))
    .input(itemCategoryCreateSchema)
    .mutation(({ ctx, input }) =>
      ctx.prisma.inventoryItemCategory.create({ data: input })
    ),

  update: protectedProcedure
    .use(requireRole("manager"))
    .input(z.object({ id: z.string().uuid() }).merge(itemCategoryUpdateSchema))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.inventoryItemCategory.update({ where: { id }, data });
    }),

  delete: protectedProcedure
    .use(requireRole("business_admin"))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const count = await ctx.prisma.inventoryItem.count({
        where: { categoryId: input.id },
      });
      if (count > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Cannot delete category: ${count} inventory item(s) reference it. Reassign them first or deactivate the category.`,
        });
      }
      return ctx.prisma.inventoryItemCategory.delete({ where: { id: input.id } });
    }),
});
