import { router, protectedProcedure, requireRole } from "../trpc";
import {
  itemCategoryCreateSchema,
  itemCategoryUpdateSchema,
  itemCategoryListSchema,
} from "@barstock/validators";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { AuditService } from "../services/audit.service";

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
    .mutation(async ({ ctx, input }) => {
      const category = await ctx.prisma.inventoryItemCategory.create({ data: input });

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: input.businessId,
        actorUserId: ctx.user.userId,
        actionType: "category.created",
        objectType: "inventory_item_category",
        objectId: category.id,
        metadata: { name: input.name, countingMethod: input.countingMethod },
      });

      return category;
    }),

  update: protectedProcedure
    .use(requireRole("manager"))
    .input(z.object({ id: z.string().uuid() }).merge(itemCategoryUpdateSchema))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const category = await ctx.prisma.inventoryItemCategory.update({ where: { id }, data });

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "category.updated",
        objectType: "inventory_item_category",
        objectId: id,
        metadata: data,
      });

      return category;
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
      const category = await ctx.prisma.inventoryItemCategory.delete({ where: { id: input.id } });

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "category.deleted",
        objectType: "inventory_item_category",
        objectId: input.id,
        metadata: { name: category.name },
      });

      return category;
    }),
});
