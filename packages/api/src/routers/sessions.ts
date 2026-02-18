import { router, protectedProcedure, checkLocationRole } from "../trpc";
import { sessionCreateSchema, sessionLineCreateSchema, sessionCloseSchema, expectedItemsForAreaSchema } from "@barstock/validators";
import { SessionService } from "../services/session.service";
import { Role } from "@barstock/types";
import type { VarianceReason } from "@barstock/types";
import { z } from "zod";
import { Prisma } from "@prisma/client";

export const sessionsRouter = router({
  create: protectedProcedure
    .input(sessionCreateSchema)
    .mutation(async ({ ctx, input }) => {
      // Auto-close any open sessions for this location
      await ctx.prisma.inventorySession.updateMany({
        where: { locationId: input.locationId, endedTs: null },
        data: { endedTs: new Date(), closedBy: ctx.user.userId },
      });

      return ctx.prisma.inventorySession.create({
        data: { ...input, createdBy: ctx.user.userId },
      });
    }),

  list: protectedProcedure
    .input(z.object({
      locationId: z.string().uuid(),
      openOnly: z.boolean().default(false),
    }))
    .query(({ ctx, input }) => {
      // Staff see only their own sessions; manager+ see all
      const isManager = checkLocationRole(input.locationId, Role.manager, ctx.user)
        || ctx.user.highestRole === Role.business_admin
        || ctx.user.highestRole === Role.platform_admin;
      return ctx.prisma.inventorySession.findMany({
        where: {
          locationId: input.locationId,
          ...(input.openOnly && { endedTs: null }),
          ...(!isManager && { createdBy: ctx.user.userId }),
        },
        include: {
          createdByUser: { select: { email: true } },
          closedByUser: { select: { email: true } },
          _count: { select: { lines: true } },
        },
        orderBy: { startedTs: "desc" },
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) =>
      ctx.prisma.inventorySession.findUniqueOrThrow({
        where: { id: input.id },
        include: {
          lines: {
            include: {
              inventoryItem: { select: { name: true, type: true, baseUom: true, packSize: true } },
              tapLine: { select: { name: true } },
              subArea: { select: { id: true, name: true, barArea: { select: { id: true, name: true } } } },
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

  deleteLine: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.inventorySessionLine.delete({ where: { id: input.id } })
    ),

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

  expectedItemsForArea: protectedProcedure
    .input(expectedItemsForAreaSchema)
    .query(async ({ ctx, input }) => {
      // Get all sub-area IDs for the selected bar area
      const subAreas = await ctx.prisma.subArea.findMany({
        where: { barAreaId: input.barAreaId },
        select: { id: true },
      });
      const subAreaIds = input.subAreaId
        ? [input.subAreaId]
        : subAreas.map((sa) => sa.id);

      if (subAreaIds.length === 0) return [];

      // Find the most recent session line per inventory item where the sub_area_id
      // is in the selected bar area's sub-areas. This gives us items historically
      // associated with this area.
      const items = await ctx.prisma.$queryRaw<
        Array<{
          inventory_item_id: string;
          name: string;
          type: string;
          base_uom: string;
          sub_area_id: string;
          sub_area_name: string;
          last_counted_at: Date;
        }>
      >(Prisma.sql`
        WITH ranked AS (
          SELECT
            sl.inventory_item_id,
            sl.sub_area_id,
            sl.created_at,
            ROW_NUMBER() OVER (
              PARTITION BY sl.inventory_item_id
              ORDER BY sl.created_at DESC
            ) AS rn
          FROM inventory_session_lines sl
          INNER JOIN inventory_sessions s ON s.id = sl.session_id
          WHERE s.location_id = ${input.locationId}::uuid
            AND sl.sub_area_id IS NOT NULL
        )
        SELECT
          r.inventory_item_id,
          i.name,
          i.type,
          i.base_uom,
          r.sub_area_id,
          sa.name AS sub_area_name,
          r.created_at AS last_counted_at
        FROM ranked r
        INNER JOIN inventory_items i ON i.id = r.inventory_item_id
        INNER JOIN sub_areas sa ON sa.id = r.sub_area_id
        WHERE r.rn = 1
          AND r.sub_area_id = ANY(${subAreaIds}::uuid[])
        ORDER BY i.name ASC
      `);

      return items.map((item) => ({
        inventoryItemId: item.inventory_item_id,
        name: item.name,
        type: item.type,
        baseUom: item.base_uom,
        subAreaId: item.sub_area_id,
        subAreaName: item.sub_area_name,
        lastCountedAt: item.last_counted_at,
      }));
    }),

  expectedItemsForLocation: protectedProcedure
    .input(z.object({ locationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Return active inventory items for this location, listed once per
      // distinct sub-area they've historically been counted in.
      // e.g. "Bud Light Cans" appears under Walk-In AND Main Bar if counted in both.
      const items = await ctx.prisma.$queryRaw<
        Array<{
          id: string;
          name: string;
          type: string;
          base_uom: string;
          sub_area_id: string | null;
          sub_area_name: string | null;
          bar_area_name: string | null;
        }>
      >(Prisma.sql`
        WITH distinct_placements AS (
          SELECT DISTINCT ON (sl.inventory_item_id, sl.sub_area_id)
            sl.inventory_item_id,
            sl.sub_area_id
          FROM inventory_session_lines sl
          INNER JOIN inventory_sessions s ON s.id = sl.session_id
          WHERE s.location_id = ${input.locationId}::uuid
            AND sl.sub_area_id IS NOT NULL
        )
        SELECT
          i.id,
          i.name,
          i.type,
          i.base_uom,
          dp.sub_area_id,
          sa.name AS sub_area_name,
          ba.name AS bar_area_name
        FROM inventory_items i
        LEFT JOIN distinct_placements dp ON dp.inventory_item_id = i.id
        LEFT JOIN sub_areas sa ON sa.id = dp.sub_area_id
        LEFT JOIN bar_areas ba ON ba.id = sa.bar_area_id
        WHERE i.location_id = ${input.locationId}::uuid
          AND i.active = true
        ORDER BY ba.name NULLS LAST, sa.name NULLS LAST, i.name ASC
      `);

      return items.map((item) => ({
        inventoryItemId: item.id,
        name: item.name,
        type: item.type,
        baseUom: item.base_uom,
        subAreaId: item.sub_area_id,
        subAreaName: item.sub_area_name
          ? `${item.bar_area_name} — ${item.sub_area_name}`
          : "Unassigned",
      }));
    }),
});
