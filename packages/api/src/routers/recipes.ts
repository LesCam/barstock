import { router, protectedProcedure, requireRole } from "../trpc";
import {
  recipeCreateSchema,
  recipeUpdateSchema,
  recipeListSchema,
} from "@barstock/validators";
import { RecipeService } from "../services/recipe.service";
import { AuditService } from "../services/audit.service";
import { z } from "zod";

export const recipesRouter = router({
  create: protectedProcedure
    .use(requireRole("manager"))
    .input(recipeCreateSchema)
    .mutation(({ ctx, input }) => {
      const svc = new RecipeService(ctx.prisma);
      return svc.create(input);
    }),

  update: protectedProcedure
    .use(requireRole("manager"))
    .input(z.object({ id: z.string().uuid() }).merge(recipeUpdateSchema))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const svc = new RecipeService(ctx.prisma);
      const result = await svc.update(id, data);

      if (data.ingredients) {
        const audit = new AuditService(ctx.prisma);
        await audit.log({
          businessId: ctx.user.businessId,
          actorUserId: ctx.user.userId,
          actionType: "recipe.updated",
          objectType: "recipe",
          objectId: id,
          metadata: { name: result.name, ingredientCount: data.ingredients.length },
        });
      }

      return result;
    }),

  list: protectedProcedure.input(recipeListSchema).query(({ ctx, input }) => {
    const svc = new RecipeService(ctx.prisma);
    return svc.list(input.locationId);
  }),

  listCategories: protectedProcedure
    .input(recipeListSchema)
    .query(({ ctx, input }) => {
      const svc = new RecipeService(ctx.prisma);
      return svc.listCategories(input.locationId);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) => {
      const svc = new RecipeService(ctx.prisma);
      return svc.getById(input.id);
    }),

  delete: protectedProcedure
    .use(requireRole("manager"))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => {
      const svc = new RecipeService(ctx.prisma);
      return svc.update(input.id, { active: false });
    }),
});
