import { router, protectedProcedure, requireRole } from "../trpc";
import { DepletionEngine } from "../services/depletion.service";
import { depletionRequestSchema } from "@barstock/validators";
import { z } from "zod";
import { UOM } from "@barstock/types";

export const eventsRouter = router({
  /** List consumption events (audit log) */
  list: protectedProcedure
    .input(z.object({
      locationId: z.string().uuid(),
      fromTs: z.coerce.date().optional(),
      toTs: z.coerce.date().optional(),
      inventoryItemId: z.string().uuid().optional(),
      eventType: z.string().optional(),
      limit: z.number().int().min(1).max(500).default(100),
      offset: z.number().int().min(0).default(0),
    }))
    .query(({ ctx, input }) =>
      ctx.prisma.consumptionEvent.findMany({
        where: {
          locationId: input.locationId,
          ...(input.fromTs && { eventTs: { gte: input.fromTs } }),
          ...(input.toTs && { eventTs: { lt: input.toTs } }),
          ...(input.inventoryItemId && { inventoryItemId: input.inventoryItemId }),
          ...(input.eventType && { eventType: input.eventType as any }),
        },
        include: {
          inventoryItem: { select: { name: true } },
          salesLine: { select: { posItemName: true, receiptId: true } },
        },
        orderBy: { eventTs: "desc" },
        take: input.limit,
        skip: input.offset,
      })
    ),

  /** Run depletion processing */
  runDepletion: protectedProcedure
    .use(requireRole("manager"))
    .input(depletionRequestSchema)
    .mutation(async ({ ctx, input }) => {
      const engine = new DepletionEngine(ctx.prisma);
      return engine.processSalesLines(input.locationId, input.fromTs, input.toTs);
    }),

  /** Correct an event via reversal + replacement */
  correct: protectedProcedure
    .use(requireRole("manager"))
    .input(z.object({
      originalEventId: z.string().uuid(),
      newQuantityDelta: z.number(),
      newUom: z.nativeEnum(UOM),
      reason: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const engine = new DepletionEngine(ctx.prisma);
      const [reversalId, replacementId] = await engine.correctEvent(
        input.originalEventId,
        input.newQuantityDelta,
        input.newUom,
        input.reason
      );
      return { reversalId, replacementId };
    }),
});
