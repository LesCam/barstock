import { router, protectedProcedure, requireRole } from "../trpc";
import {
  parLevelCreateSchema,
  parLevelUpdateSchema,
  parLevelBulkUpsertSchema,
  parLevelListSchema,
  parLevelSuggestionsSchema,
  parLevelSuggestSchema,
} from "@barstock/validators";
import { ParLevelService } from "../services/par-level.service";
import { AuditService } from "../services/audit.service";
import { z } from "zod";

export const parLevelsRouter = router({
  list: protectedProcedure
    .input(parLevelListSchema)
    .query(({ ctx, input }) => {
      const svc = new ParLevelService(ctx.prisma);
      return svc.list(
        input.locationId,
        input.vendorId,
        input.categoryId,
        input.belowParOnly
      );
    }),

  create: protectedProcedure
    .use(requireRole("manager"))
    .input(parLevelCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const svc = new ParLevelService(ctx.prisma);
      const result = await svc.create(input);

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "par_level.created",
        objectType: "par_level",
        objectId: result.id,
        metadata: {
          inventoryItemId: input.inventoryItemId,
          vendorId: input.vendorId,
          parLevel: input.parLevel,
          minLevel: input.minLevel,
        },
      });

      return result;
    }),

  update: protectedProcedure
    .use(requireRole("manager"))
    .input(z.object({ id: z.string().uuid() }).merge(parLevelUpdateSchema))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const svc = new ParLevelService(ctx.prisma);
      const result = await svc.update(id, data);

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "par_level.updated",
        objectType: "par_level",
        objectId: id,
        metadata: data,
      });

      return result;
    }),

  bulkUpsert: protectedProcedure
    .use(requireRole("manager"))
    .input(parLevelBulkUpsertSchema)
    .mutation(async ({ ctx, input }) => {
      const svc = new ParLevelService(ctx.prisma);
      const results = await svc.bulkUpsert(input);

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "par_level.bulk_upserted",
        objectType: "par_level",
        objectId: input.locationId,
        metadata: { itemCount: input.items.length },
      });

      return results;
    }),

  suggestions: protectedProcedure
    .input(parLevelSuggestionsSchema)
    .query(({ ctx, input }) => {
      const svc = new ParLevelService(ctx.prisma);
      return svc.getReorderSuggestions(input.locationId, input.vendorId);
    }),

  suggestPars: protectedProcedure
    .input(parLevelSuggestSchema)
    .query(({ ctx, input }) => {
      const svc = new ParLevelService(ctx.prisma);
      return svc.suggestParLevels(
        input.locationId,
        input.leadTimeDays,
        input.safetyStockDays,
        input.bufferDays,
      );
    }),

  delete: protectedProcedure
    .use(requireRole("manager"))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const svc = new ParLevelService(ctx.prisma);
      const result = await svc.delete(input.id);

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "par_level.deleted",
        objectType: "par_level",
        objectId: input.id,
        metadata: {},
      });

      return result;
    }),
});
