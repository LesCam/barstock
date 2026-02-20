import { router, protectedProcedure, requireRole } from "../trpc";
import {
  recipeCreateSchema,
  recipeUpdateSchema,
  recipeListSchema,
} from "@barstock/validators";
import { RecipeService } from "../services/recipe.service";
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
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      const svc = new RecipeService(ctx.prisma);
      return svc.update(id, data);
    }),

  list: protectedProcedure.input(recipeListSchema).query(({ ctx, input }) => {
    const svc = new RecipeService(ctx.prisma);
    return svc.list(input.locationId);
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
