import { router, protectedProcedure } from "../trpc";
import { sessionCreateSchema, sessionLineCreateSchema, sessionCloseSchema } from "@barstock/validators";
import { SessionService } from "../services/session.service";
import type { VarianceReason } from "@barstock/types";
import { z } from "zod";

export const sessionsRouter = router({
  create: protectedProcedure
    .input(sessionCreateSchema)
    .mutation(({ ctx, input }) =>
      ctx.prisma.inventorySession.create({
        data: { ...input, createdBy: ctx.user.userId },
      })
    ),

  list: protectedProcedure
    .input(z.object({
      locationId: z.string().uuid(),
      openOnly: z.boolean().default(false),
    }))
    .query(({ ctx, input }) =>
      ctx.prisma.inventorySession.findMany({
        where: {
          locationId: input.locationId,
          ...(input.openOnly && { endedTs: null }),
        },
        include: {
          createdByUser: { select: { email: true } },
          closedByUser: { select: { email: true } },
          _count: { select: { lines: true } },
        },
        orderBy: { startedTs: "desc" },
      })
    ),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) =>
      ctx.prisma.inventorySession.findUniqueOrThrow({
        where: { id: input.id },
        include: {
          lines: {
            include: {
              inventoryItem: { select: { name: true, type: true, baseUom: true } },
              tapLine: { select: { name: true } },
            },
          },
        },
      })
    ),

  addLine: protectedProcedure
    .input(sessionLineCreateSchema)
    .mutation(({ ctx, input }) =>
      ctx.prisma.inventorySessionLine.create({ data: input })
    ),

  updateLine: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      countUnits: z.number().optional(),
      grossWeightGrams: z.number().min(0).optional(),
      percentRemaining: z.number().min(0).max(100).optional(),
      notes: z.string().optional(),
    }))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.inventorySessionLine.update({ where: { id }, data });
    }),

  close: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }).merge(sessionCloseSchema))
    .mutation(async ({ ctx, input }) => {
      const svc = new SessionService(ctx.prisma);
      const reasons: Record<string, VarianceReason> = {};
      if (input.varianceReasons) {
        for (const vr of input.varianceReasons) {
          reasons[vr.itemId] = vr.reason;
        }
      }

      // Also set closedBy
      const result = await svc.closeSession(input.sessionId, reasons);

      await ctx.prisma.inventorySession.update({
        where: { id: input.sessionId },
        data: { closedBy: ctx.user.userId },
      });

      return result;
    }),
});
