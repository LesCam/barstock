import { router, protectedProcedure, requireRole } from "../trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { KegStatus } from "@barstock/types";

export const draftRouter = router({
  // ── Keg Sizes ──────────────────────
  listKegSizes: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.kegSize.findMany()
  ),

  createKegSize: protectedProcedure
    .use(requireRole("business_admin"))
    .input(z.object({ name: z.string().min(1), totalOz: z.number().positive() }))
    .mutation(({ ctx, input }) => ctx.prisma.kegSize.create({ data: input })),

  // ── Keg Instances ──────────────────
  listKegs: protectedProcedure
    .input(z.object({ locationId: z.string().uuid(), status: z.nativeEnum(KegStatus).optional() }))
    .query(({ ctx, input }) =>
      ctx.prisma.kegInstance.findMany({
        where: {
          locationId: input.locationId,
          ...(input.status && { status: input.status }),
        },
        include: {
          inventoryItem: { select: { name: true } },
          kegSize: { select: { name: true, totalOz: true } },
        },
        orderBy: { receivedTs: "desc" },
      })
    ),

  createKeg: protectedProcedure
    .input(z.object({
      locationId: z.string().uuid(),
      inventoryItemId: z.string().uuid(),
      kegSizeId: z.string().uuid(),
      receivedTs: z.coerce.date(),
      startingOz: z.number().positive(),
      notes: z.string().optional(),
    }))
    .mutation(({ ctx, input }) => ctx.prisma.kegInstance.create({ data: input })),

  updateKegStatus: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      status: z.nativeEnum(KegStatus),
      tappedTs: z.coerce.date().optional(),
      emptiedTs: z.coerce.date().optional(),
    }))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.kegInstance.update({ where: { id }, data });
    }),

  // ── Tap Lines ──────────────────────
  listTapLines: protectedProcedure
    .input(z.object({ locationId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      ctx.prisma.tapLine.findMany({
        where: { locationId: input.locationId },
        include: {
          barArea: { select: { id: true, name: true } },
          tapAssignments: {
            where: { effectiveEndTs: null },
            include: {
              kegInstance: {
                include: { inventoryItem: { select: { name: true } } },
              },
            },
          },
        },
        orderBy: { name: "asc" },
      })
    ),

  createTapLine: protectedProcedure
    .use(requireRole("manager"))
    .input(z.object({
      locationId: z.string().uuid(),
      name: z.string().min(1),
      barAreaId: z.string().uuid().optional(),
    }))
    .mutation(({ ctx, input }) => ctx.prisma.tapLine.create({ data: input })),

  updateTapLine: protectedProcedure
    .use(requireRole("manager"))
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).optional(),
      barAreaId: z.string().uuid().nullable().optional(),
    }))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.tapLine.update({ where: { id }, data });
    }),

  deleteTapLine: protectedProcedure
    .use(requireRole("business_admin"))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const refs = await Promise.all([
        ctx.prisma.tapAssignment.count({ where: { tapLineId: input.id } }),
        ctx.prisma.consumptionEvent.count({ where: { tapLineId: input.id } }),
        ctx.prisma.inventorySessionLine.count({ where: { tapLineId: input.id } }),
      ]);
      if (refs.some((c) => c > 0)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Cannot delete tap line — it has existing assignments, consumption events, or session lines.",
        });
      }
      return ctx.prisma.tapLine.delete({ where: { id: input.id } });
    }),

  // ── Tap Assignments ────────────────
  assignTap: protectedProcedure
    .input(z.object({
      locationId: z.string().uuid(),
      tapLineId: z.string().uuid(),
      kegInstanceId: z.string().uuid(),
      effectiveStartTs: z.coerce.date(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Close any existing open assignment on this tap
      await ctx.prisma.tapAssignment.updateMany({
        where: {
          tapLineId: input.tapLineId,
          effectiveEndTs: null,
        },
        data: { effectiveEndTs: input.effectiveStartTs },
      });

      return ctx.prisma.tapAssignment.create({ data: input });
    }),

  // ── Pour Profiles ──────────────────
  listPourProfiles: protectedProcedure
    .input(z.object({ locationId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      ctx.prisma.pourProfile.findMany({
        where: { locationId: input.locationId, active: true },
      })
    ),

  createPourProfile: protectedProcedure
    .use(requireRole("manager"))
    .input(z.object({
      locationId: z.string().uuid(),
      name: z.string().min(1),
      oz: z.number().positive(),
    }))
    .mutation(({ ctx, input }) => ctx.prisma.pourProfile.create({ data: input })),
});
