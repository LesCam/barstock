import { router, protectedProcedure, requireRole } from "../trpc";
import {
  posMappingCreateSchema,
  posMappingUpdateSchema,
  posSuggestMappingsSchema,
  posBulkMappingSchema,
} from "@barstock/validators";
import { MappingSuggestService } from "../services/mapping-suggest.service";
import { AuditService } from "../services/audit.service";
import { z } from "zod";

export const mappingsRouter = router({
  create: protectedProcedure
    .use(requireRole("manager"))
    .input(posMappingCreateSchema)
    .mutation(({ ctx, input }) =>
      ctx.prisma.pOSItemMapping.create({ data: input })
    ),

  list: protectedProcedure
    .input(z.object({ locationId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      ctx.prisma.pOSItemMapping.findMany({
        where: { locationId: input.locationId },
        include: {
          inventoryItem: { select: { name: true, category: { select: { name: true } } } },
          pourProfile: { select: { name: true, oz: true } },
          tapLine: { select: { name: true } },
          recipe: { select: { name: true, ingredients: { select: { inventoryItem: { select: { name: true } }, quantity: true, uom: true } } } },
        },
        orderBy: { createdAt: "desc" },
      })
    ),

  update: protectedProcedure
    .use(requireRole("manager"))
    .input(z.object({ id: z.string().uuid() }).merge(posMappingUpdateSchema))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.pOSItemMapping.update({ where: { id }, data });
    }),

  suggestMappings: protectedProcedure
    .use(requireRole("manager"))
    .input(posSuggestMappingsSchema)
    .mutation(async ({ ctx, input }) => {
      const svc = new MappingSuggestService(ctx.prisma);
      return svc.suggestMappings(input.locationId, input.posItemNames);
    }),

  bulkCreate: protectedProcedure
    .use(requireRole("manager"))
    .input(posBulkMappingSchema)
    .mutation(async ({ ctx, input }) => {
      const svc = new MappingSuggestService(ctx.prisma);
      const result = await svc.bulkCreateMappings(input);

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "mapping.bulk_created",
        objectType: "pos_mapping",
        objectId: input.locationId,
        metadata: {
          created: result.created,
          skipped: result.skipped,
          sourceSystem: input.sourceSystem,
        },
      });

      return result;
    }),
});
