import { router, protectedProcedure, checkLocationRole } from "../trpc";
import { sessionCreateSchema, sessionLineCreateSchema, sessionCloseSchema, expectedItemsForAreaSchema, itemCountHintsSchema, sessionJoinSchema, sessionHeartbeatSchema } from "@barstock/validators";
import { SessionService } from "../services/session.service";
import { AuditService } from "../services/audit.service";
import { AlertService } from "../services/alert.service";
import { Role } from "@barstock/types";
import type { VarianceReason } from "@barstock/types";
import { z } from "zod";
import { Prisma } from "@prisma/client";

export const sessionsRouter = router({
  create: protectedProcedure
    .input(sessionCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.inventorySession.create({
        data: { ...input, createdBy: ctx.user.userId },
      });

      // Auto-join creator as first participant
      await ctx.prisma.sessionParticipant.create({
        data: { sessionId: session.id, userId: ctx.user.userId },
      });

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "session.created",
        objectType: "inventory_session",
        objectId: session.id,
        metadata: { locationId: input.locationId },
      });

      return session;
    }),

  list: protectedProcedure
    .input(z.object({
      locationId: z.string().uuid(),
      openOnly: z.boolean().default(false),
      limit: z.number().int().min(1).max(500).optional(),
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
          ...(!isManager && {
            OR: [
              { createdBy: ctx.user.userId },
              { participants: { some: { userId: ctx.user.userId } } },
            ],
          }),
        },
        ...(input.limit && { take: input.limit }),
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
              inventoryItem: {
                select: {
                  name: true, baseUom: true, packSize: true,
                  category: { select: { id: true, name: true, countingMethod: true } },
                },
              },
              tapLine: { select: { name: true } },
              subArea: { select: { id: true, name: true, barArea: { select: { id: true, name: true } } } },
              countedByUser: { select: { email: true, firstName: true } },
            },
          },
          participants: {
            include: {
              user: { select: { id: true, email: true, firstName: true, lastName: true } },
              subArea: { select: { id: true, name: true } },
            },
            orderBy: { joinedAt: "asc" },
          },
        },
      })
    ),

  addLine: protectedProcedure
    .input(sessionLineCreateSchema)
    .mutation(({ ctx, input }) =>
      ctx.prisma.inventorySessionLine.create({
        data: { ...input, countedBy: ctx.user.userId },
      })
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

  join: protectedProcedure
    .input(sessionJoinSchema)
    .mutation(async ({ ctx, input }) => {
      // Validate session is open
      const session = await ctx.prisma.inventorySession.findUniqueOrThrow({
        where: { id: input.sessionId },
      });
      if (session.endedTs) throw new Error("Cannot join a closed session");

      return ctx.prisma.sessionParticipant.upsert({
        where: {
          sessionId_userId: {
            sessionId: input.sessionId,
            userId: ctx.user.userId,
          },
        },
        update: { lastActiveAt: new Date() },
        create: { sessionId: input.sessionId, userId: ctx.user.userId },
      });
    }),

  heartbeat: protectedProcedure
    .input(sessionHeartbeatSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.prisma.sessionParticipant.update({
          where: {
            sessionId_userId: {
              sessionId: input.sessionId,
              userId: ctx.user.userId,
            },
          },
          data: {
            lastActiveAt: new Date(),
            currentSubAreaId: input.currentSubAreaId ?? null,
          },
        });
      } catch {
        // Re-join silently if participant row was removed
        return ctx.prisma.sessionParticipant.create({
          data: {
            sessionId: input.sessionId,
            userId: ctx.user.userId,
            currentSubAreaId: input.currentSubAreaId ?? null,
          },
        });
      }
    }),

  listParticipants: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      ctx.prisma.sessionParticipant.findMany({
        where: { sessionId: input.sessionId },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          subArea: { select: { id: true, name: true } },
        },
        orderBy: { joinedAt: "asc" },
      })
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

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "session.closed",
        objectType: "inventory_session",
        objectId: input.sessionId,
        metadata: {
          adjustmentsCreated: result.adjustmentsCreated,
          adjustments: result.adjustments.map((a) => ({
            itemId: a.itemId,
            itemName: a.itemName,
            variance: a.variance,
            variancePercent: a.variancePercent,
            reason: a.reason,
          })),
        },
      });

      // Check for large adjustments and alert admins
      if (result.adjustments.length > 0) {
        try {
          const session = await ctx.prisma.inventorySession.findUnique({
            where: { id: input.sessionId },
            include: { location: { select: { name: true } } },
          });
          const alertSvc = new AlertService(ctx.prisma);
          await alertSvc.checkLargeAdjustment(
            ctx.user.businessId,
            result.adjustments,
            input.sessionId,
            session?.location.name ?? "Unknown"
          );
        } catch {
          // Don't fail session close if alert fails
        }
      }

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
          type: string | null;
          base_uom: string;
          counting_method: string | null;
          category_name: string | null;
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
          i.base_uom,
          c.counting_method::text,
          c.name AS category_name,
          r.sub_area_id,
          sa.name AS sub_area_name,
          r.created_at AS last_counted_at
        FROM ranked r
        INNER JOIN inventory_items i ON i.id = r.inventory_item_id
        LEFT JOIN inventory_item_categories c ON c.id = i.category_id
        INNER JOIN sub_areas sa ON sa.id = r.sub_area_id
        WHERE r.rn = 1
          AND r.sub_area_id = ANY(${subAreaIds}::uuid[])
        ORDER BY i.name ASC
      `);

      return items.map((item) => ({
        inventoryItemId: item.inventory_item_id,
        name: item.name,
        countingMethod: item.counting_method,
        categoryName: item.category_name,
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
          type: string | null;
          base_uom: string;
          counting_method: string | null;
          category_name: string | null;
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
          i.base_uom,
          c.counting_method::text,
          c.name AS category_name,
          dp.sub_area_id,
          sa.name AS sub_area_name,
          ba.name AS bar_area_name
        FROM inventory_items i
        LEFT JOIN inventory_item_categories c ON c.id = i.category_id
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
        countingMethod: item.counting_method,
        categoryName: item.category_name,
        baseUom: item.base_uom,
        subAreaId: item.sub_area_id,
        subAreaName: item.sub_area_name
          ? `${item.bar_area_name} — ${item.sub_area_name}`
          : "Unassigned",
      }));
    }),

  itemCountHints: protectedProcedure
    .input(itemCountHintsSchema)
    .query(async ({ ctx, input }) => {
      if (input.inventoryItemIds.length === 0) return [];

      const [lastCounts, avgUsage] = await Promise.all([
        ctx.prisma.$queryRaw<
          Array<{
            inventory_item_id: string;
            count_units: unknown;
            derived_oz: unknown;
            gross_weight_grams: unknown;
            created_at: Date;
          }>
        >(Prisma.sql`
          SELECT DISTINCT ON (sl.inventory_item_id)
            sl.inventory_item_id,
            sl.count_units,
            sl.derived_oz,
            sl.gross_weight_grams,
            sl.created_at
          FROM inventory_session_lines sl
          INNER JOIN inventory_sessions s ON s.id = sl.session_id
          WHERE s.location_id = ${input.locationId}::uuid
            AND sl.inventory_item_id = ANY(${input.inventoryItemIds}::uuid[])
          ORDER BY sl.inventory_item_id, sl.created_at DESC
        `),
        ctx.prisma.$queryRaw<
          Array<{
            inventory_item_id: string;
            avg_daily_usage: unknown;
          }>
        >(Prisma.sql`
          SELECT
            inventory_item_id,
            ABS(SUM(quantity_delta)) / 30.0 AS avg_daily_usage
          FROM consumption_events
          WHERE location_id = ${input.locationId}::uuid
            AND inventory_item_id = ANY(${input.inventoryItemIds}::uuid[])
            AND event_type = 'pos_sale'
            AND event_ts >= NOW() - INTERVAL '30 days'
          GROUP BY inventory_item_id
        `),
      ]);

      const usageMap = new Map(
        avgUsage.map((u) => [u.inventory_item_id, Number(u.avg_daily_usage)])
      );

      return lastCounts.map((lc) => {
        const countValue = lc.count_units != null
          ? Number(lc.count_units)
          : lc.gross_weight_grams != null
            ? Number(lc.gross_weight_grams)
            : lc.derived_oz != null
              ? Number(lc.derived_oz)
              : null;
        const isWeight = lc.gross_weight_grams != null && lc.count_units == null;

        return {
          inventoryItemId: lc.inventory_item_id,
          lastCountValue: countValue,
          lastCountDate: lc.created_at,
          avgDailyUsage: usageMap.get(lc.inventory_item_id) ?? null,
          isWeight,
        };
      });
    }),

  previewClose: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const svc = new SessionService(ctx.prisma);
      return svc.previewClose(input.sessionId);
    }),
});
