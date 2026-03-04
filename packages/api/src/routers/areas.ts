import { router, protectedProcedure, requireRole, requireLocationAccess, isPlatformAdmin, requireRecentAuth } from "../trpc";
import {
  barAreaCreateSchema,
  barAreaUpdateSchema,
  subAreaCreateSchema,
  subAreaUpdateSchema,
} from "@barstock/validators";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

/** Verify the user has access to the location that owns this barArea */
async function verifyBarAreaAccess(
  prisma: any,
  barAreaId: string,
  user: { locationIds: string[] },
  platformAdmin: boolean,
) {
  const area = await prisma.barArea.findUniqueOrThrow({
    where: { id: barAreaId },
    select: { locationId: true },
  });
  if (!platformAdmin && !user.locationIds.includes(area.locationId)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Resource not found" });
  }
}

/** Verify the user has access to the location that owns this subArea (via barArea) */
async function verifySubAreaAccess(
  prisma: any,
  subAreaId: string,
  user: { locationIds: string[] },
  platformAdmin: boolean,
) {
  const sub = await prisma.subArea.findUniqueOrThrow({
    where: { id: subAreaId },
    select: { barArea: { select: { locationId: true } } },
  });
  if (!platformAdmin && !user.locationIds.includes(sub.barArea.locationId)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Resource not found" });
  }
}

export const areasRouter = router({
  // ─── Bar Areas ──────────────────────────────────────────────

  createBarArea: protectedProcedure
    .use(requireRole("manager"))
    .use(requireLocationAccess())
    .input(barAreaCreateSchema)
    .mutation(({ ctx, input }) =>
      ctx.prisma.barArea.create({ data: input })
    ),

  listBarAreas: protectedProcedure
    .input(z.object({ locationId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      ctx.prisma.barArea.findMany({
        where: { locationId: input.locationId },
        include: { subAreas: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" },
      })
    ),

  updateBarArea: protectedProcedure
    .use(requireRole("manager"))
    .input(z.object({ id: z.string().uuid() }).merge(barAreaUpdateSchema))
    .mutation(async ({ ctx, input }) => {
      await verifyBarAreaAccess(ctx.prisma, input.id, ctx.user, isPlatformAdmin(ctx.user));
      const { id, ...data } = input;
      return ctx.prisma.barArea.update({ where: { id }, data });
    }),

  deleteBarArea: protectedProcedure
    .use(requireRole("business_admin"))
    .use(requireRecentAuth())
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifyBarAreaAccess(ctx.prisma, input.id, ctx.user, isPlatformAdmin(ctx.user));
      // Check if any session lines reference sub-areas of this bar area
      const referencedLines = await ctx.prisma.inventorySessionLine.count({
        where: { subArea: { barAreaId: input.id } },
      });
      if (referencedLines > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Cannot delete bar area: ${referencedLines} session line(s) reference its sub-areas`,
        });
      }
      return ctx.prisma.barArea.delete({ where: { id: input.id } });
    }),

  // ─── Sub-Areas ────────────────────────────────────────────

  createSubArea: protectedProcedure
    .use(requireRole("manager"))
    .input(subAreaCreateSchema)
    .mutation(async ({ ctx, input }) => {
      await verifyBarAreaAccess(ctx.prisma, input.barAreaId, ctx.user, isPlatformAdmin(ctx.user));
      return ctx.prisma.subArea.create({ data: input });
    }),

  listSubAreas: protectedProcedure
    .input(z.object({ barAreaId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      ctx.prisma.subArea.findMany({
        where: { barAreaId: input.barAreaId },
        orderBy: { sortOrder: "asc" },
      })
    ),

  updateSubArea: protectedProcedure
    .use(requireRole("manager"))
    .input(z.object({ id: z.string().uuid() }).merge(subAreaUpdateSchema))
    .mutation(async ({ ctx, input }) => {
      await verifySubAreaAccess(ctx.prisma, input.id, ctx.user, isPlatformAdmin(ctx.user));
      const { id, ...data } = input;
      return ctx.prisma.subArea.update({ where: { id }, data });
    }),

  deleteSubArea: protectedProcedure
    .use(requireRole("business_admin"))
    .use(requireRecentAuth())
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifySubAreaAccess(ctx.prisma, input.id, ctx.user, isPlatformAdmin(ctx.user));
      const referencedLines = await ctx.prisma.inventorySessionLine.count({
        where: { subAreaId: input.id },
      });
      if (referencedLines > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Cannot delete sub-area: ${referencedLines} session line(s) reference it`,
        });
      }
      return ctx.prisma.subArea.delete({ where: { id: input.id } });
    }),
});
