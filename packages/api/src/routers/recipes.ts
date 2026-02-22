import { router, protectedProcedure, requireRole } from "../trpc";
import {
  recipeCreateSchema,
  recipeUpdateSchema,
  recipeListSchema,
  recipeParseCSVSchema,
  recipeBulkCreateSchema,
} from "@barstock/validators";
import { RecipeService } from "../services/recipe.service";
import { RecipeImportService } from "../services/recipe-import.service";
import { AuditService } from "../services/audit.service";
import { z } from "zod";

export const recipesRouter = router({
  create: protectedProcedure
    .use(requireRole("manager"))
    .input(recipeCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const svc = new RecipeService(ctx.prisma);
      const result = await svc.create(input);

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "recipe.created",
        objectType: "recipe",
        objectId: result.id,
        metadata: { name: result.name, ingredientCount: input.ingredients?.length ?? 0 },
      });

      return result;
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

  listWithCosts: protectedProcedure.input(recipeListSchema).query(({ ctx, input }) => {
    const svc = new RecipeService(ctx.prisma);
    return svc.listWithCosts(input.locationId);
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

  parseCSV: protectedProcedure
    .use(requireRole("manager"))
    .input(recipeParseCSVSchema)
    .mutation(async ({ ctx, input }) => {
      const svc = new RecipeImportService(ctx.prisma);
      return svc.parseAndMatch(input.locationId, input.csvText);
    }),

  bulkCreate: protectedProcedure
    .use(requireRole("manager"))
    .input(recipeBulkCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const svc = new RecipeImportService(ctx.prisma);
      const result = await svc.bulkCreate(input, ctx.user.businessId);

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "recipe.bulk_imported",
        objectType: "recipe",
        objectId: input.locationId,
        metadata: {
          recipesCreated: result.recipesCreated,
          recipesSkipped: result.recipesSkipped,
          itemsCreated: result.itemsCreated,
        },
      });

      return result;
    }),

  delete: protectedProcedure
    .use(requireRole("manager"))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const svc = new RecipeService(ctx.prisma);
      const result = await svc.update(input.id, { active: false });

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "recipe.deleted",
        objectType: "recipe",
        objectId: input.id,
        metadata: { name: result.name },
      });

      return result;
    }),
});
