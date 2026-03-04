import { router, protectedProcedure, checkLocationRole, requireRecentAuth, isPlatformAdmin } from "../trpc";
import { TRPCError } from "@trpc/server";
import { sessionCreateSchema, sessionLineCreateSchema, sessionCloseSchema, expectedItemsForAreaSchema, itemCountHintsSchema, sessionJoinSchema, sessionHeartbeatSchema, claimSubAreaSchema, releaseSubAreaSchema, sessionPlanSchema, respondAssignmentSchema, listAssignmentsSchema, flagForVerificationSchema, submitVerificationSchema, resolveVerificationSchema } from "@barstock/validators";
import { SessionService } from "../services/session.service";
import { SettingsService } from "../services/settings.service";
import { AuditService } from "../services/audit.service";
import { AlertService } from "../services/alert.service";
import { sessionEmitter } from "../lib/session-emitter";
import { Role } from "@barstock/types";
import type { VarianceReason } from "@barstock/types";
import { z } from "zod";
import { Prisma } from "@prisma/client";

/**
 * Greedy nearest-neighbor reorder using co-adjacency scores.
 * Starts with highest-priority item, then picks the next item with the
 * highest adjacency count to the current item (tie-break by priorityScore).
 */
function adjacencyReorder<T extends { inventoryItemId: string; priorityScore: number }>(
  items: T[],
  adjacency: Map<string, Map<string, number>>,
): T[] {
  if (items.length <= 1 || adjacency.size === 0) return items;

  const remaining = new Set(items.map((_, i) => i));
  const result: T[] = [];

  // Start with highest-priority item (first after composite sort)
  let currentIdx = 0;
  remaining.delete(currentIdx);
  result.push(items[currentIdx]);

  while (remaining.size > 0) {
    const currentId = items[currentIdx].inventoryItemId;
    const neighbors = adjacency.get(currentId);
    let bestIdx = -1;
    let bestScore = -1;

    for (const idx of remaining) {
      const itemId = items[idx].inventoryItemId;
      const adjCount = neighbors?.get(itemId) ?? 0;
      // Score: adjacency count * 1000 + priority score (adjacency dominates, priority breaks ties)
      const score = adjCount * 1000 + items[idx].priorityScore;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    }

    remaining.delete(bestIdx);
    result.push(items[bestIdx]);
    currentIdx = bestIdx;
  }

  return result;
}

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
          _count: { select: { lines: true, assignments: true } },
        },
        orderBy: { startedTs: "desc" },
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const session = await ctx.prisma.inventorySession.findUniqueOrThrow({
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
              verifiedByUser: { select: { email: true, firstName: true } },
            },
          },
          participants: {
            include: {
              user: { select: { id: true, email: true, firstName: true, lastName: true } },
              subArea: { select: { id: true, name: true } },
            },
            orderBy: { joinedAt: "asc" },
          },
          assignments: {
            include: {
              user: { select: { id: true, email: true, firstName: true, lastName: true } },
              subArea: { select: { id: true, name: true, barArea: { select: { name: true } } } },
            },
          },
        },
      });
      if (!isPlatformAdmin(ctx.user) && !ctx.user.locationIds.includes(session.locationId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Resource not found" });
      }
      return session;
    }),

  addLine: protectedProcedure
    .input(sessionLineCreateSchema)
    .mutation(async ({ ctx, input }) => {
      // Check for duplicate: same item counted by a different user in this session
      let warning: string | undefined;
      const existing = await ctx.prisma.inventorySessionLine.findFirst({
        where: {
          sessionId: input.sessionId,
          inventoryItemId: input.inventoryItemId,
          countedBy: { not: ctx.user.userId },
        },
        include: {
          countedByUser: { select: { firstName: true, email: true } },
        },
      });
      if (existing?.countedByUser) {
        const name =
          existing.countedByUser.firstName ||
          existing.countedByUser.email.split("@")[0];
        warning = `Already counted by ${name}`;
      }

      const line = await ctx.prisma.inventorySessionLine.create({
        data: { ...input, countedBy: ctx.user.userId },
        include: {
          inventoryItem: { select: { name: true } },
        },
      });

      try {
        const user = await ctx.prisma.user.findUnique({
          where: { id: ctx.user.userId },
          select: { firstName: true, email: true },
        });
        const displayName = user?.firstName || user?.email.split("@")[0] || "Unknown";
        sessionEmitter.notifySession(input.sessionId, {
          type: "line_added",
          payload: {
            lineId: line.id,
            itemName: line.inventoryItem.name,
            itemId: input.inventoryItemId,
            countedBy: ctx.user.userId,
            displayName,
            subAreaId: input.subAreaId ?? null,
          },
        });
      } catch {
        // Best-effort SSE
      }

      return { ...line, warning };
    }),

  updateLine: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      countUnits: z.number().optional(),
      grossWeightGrams: z.number().min(0).optional(),
      percentRemaining: z.number().min(0).max(100).optional(),
      notes: z.string().optional(),
      subAreaId: z.string().uuid().optional(),
      expectedUpdatedAt: z.string().datetime().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, expectedUpdatedAt, ...data } = input;

      // Optimistic locking: if caller provides expectedUpdatedAt, verify it matches
      if (expectedUpdatedAt) {
        const current = await ctx.prisma.inventorySessionLine.findUniqueOrThrow({
          where: { id },
          include: {
            countedByUser: { select: { firstName: true, email: true } },
          },
        });

        const currentTs = current.updatedAt.toISOString();
        if (currentTs !== expectedUpdatedAt) {
          const theirName = current.countedByUser?.firstName
            || current.countedByUser?.email.split("@")[0]
            || "Another user";
          const error = new Error(JSON.stringify({
            type: "CONFLICT",
            theirValues: {
              countUnits: current.countUnits != null ? Number(current.countUnits) : null,
              grossWeightGrams: current.grossWeightGrams != null ? Number(current.grossWeightGrams) : null,
              percentRemaining: current.percentRemaining != null ? Number(current.percentRemaining) : null,
            },
            theirName,
            currentUpdatedAt: currentTs,
          }));
          throw error;
        }
      }

      return ctx.prisma.inventorySessionLine.update({ where: { id }, data });
    }),

  deleteLine: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const line = await ctx.prisma.inventorySessionLine.delete({
        where: { id: input.id },
      });
      try {
        const user = await ctx.prisma.user.findUnique({
          where: { id: ctx.user.userId },
          select: { firstName: true, email: true },
        });
        const displayName = user?.firstName || user?.email.split("@")[0] || "Unknown";
        sessionEmitter.notifySession(line.sessionId, {
          type: "line_deleted",
          payload: {
            lineId: line.id,
            itemId: line.inventoryItemId,
            userId: ctx.user.userId,
            displayName,
          },
        });
      } catch {
        // Best-effort SSE
      }
      return line;
    }),

  join: protectedProcedure
    .input(sessionJoinSchema)
    .mutation(async ({ ctx, input }) => {
      // Validate session is open
      const session = await ctx.prisma.inventorySession.findUniqueOrThrow({
        where: { id: input.sessionId },
      });
      if (session.endedTs) throw new Error("Cannot join a closed session");

      const participant = await ctx.prisma.sessionParticipant.upsert({
        where: {
          sessionId_userId: {
            sessionId: input.sessionId,
            userId: ctx.user.userId,
          },
        },
        update: { lastActiveAt: new Date() },
        create: { sessionId: input.sessionId, userId: ctx.user.userId },
        include: {
          user: { select: { firstName: true, email: true } },
        },
      });

      // Auto-claim assigned sub-area if user has an assignment
      let assignedSubAreaId: string | null = null;
      try {
        const assignment = await ctx.prisma.sessionAssignment.findUnique({
          where: {
            sessionId_userId: {
              sessionId: input.sessionId,
              userId: ctx.user.userId,
            },
          },
        });
        if (assignment?.subAreaId) {
          assignedSubAreaId = assignment.subAreaId;
          const svc = new SessionService(ctx.prisma);
          try {
            await svc.claimSubArea(input.sessionId, assignment.subAreaId, ctx.user.userId);
          } catch {
            // Area might already be claimed — non-fatal
          }
        }
      } catch {
        // No assignment — fine
      }

      try {
        const displayName =
          participant.user.firstName ||
          participant.user.email.split("@")[0];
        sessionEmitter.notifySession(input.sessionId, {
          type: "participant_joined",
          payload: { userId: ctx.user.userId, displayName, assignedSubAreaId },
        });
      } catch {
        // Best-effort SSE
      }

      return participant;
    }),

  heartbeat: protectedProcedure
    .input(sessionHeartbeatSchema)
    .mutation(async ({ ctx, input }) => {
      // If changing sub-area, check exclusivity
      if (input.currentSubAreaId) {
        const svc = new SessionService(ctx.prisma);
        const claimer = await svc.checkSubAreaExclusivity(
          input.sessionId,
          input.currentSubAreaId,
          ctx.user.userId
        );
        if (claimer) {
          // Don't change sub-area — just update lastActiveAt
          try {
            return await ctx.prisma.sessionParticipant.update({
              where: {
                sessionId_userId: {
                  sessionId: input.sessionId,
                  userId: ctx.user.userId,
                },
              },
              data: { lastActiveAt: new Date() },
            });
          } catch {
            return ctx.prisma.sessionParticipant.create({
              data: {
                sessionId: input.sessionId,
                userId: ctx.user.userId,
              },
            });
          }
        }
      }

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
    .use(requireRecentAuth())
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
          await alertSvc.checkHighVarianceSession(
            ctx.user.businessId,
            result.adjustments,
            input.sessionId,
            session?.location.name ?? "Unknown"
          );
        } catch {
          // Don't fail session close if alert fails
        }
      }

      try {
        sessionEmitter.notifySession(input.sessionId, {
          type: "session_closed",
          payload: { closedBy: ctx.user.userId },
        });
      } catch {
        // Best-effort SSE
      }

      return result;
    }),

  claimSubArea: protectedProcedure
    .input(claimSubAreaSchema)
    .mutation(async ({ ctx, input }) => {
      const svc = new SessionService(ctx.prisma);
      const result = await svc.claimSubArea(
        input.sessionId,
        input.subAreaId,
        ctx.user.userId
      );

      // Look up sub-area name and user display name for SSE payload
      const [subArea, user] = await Promise.all([
        ctx.prisma.subArea.findUnique({
          where: { id: input.subAreaId },
          select: { name: true },
        }),
        ctx.prisma.user.findUnique({
          where: { id: ctx.user.userId },
          select: { firstName: true, email: true },
        }),
      ]);

      const displayName =
        user?.firstName || user?.email.split("@")[0] || "Unknown";

      try {
        sessionEmitter.notifySession(input.sessionId, {
          type: "area_claimed",
          payload: {
            userId: ctx.user.userId,
            displayName,
            subAreaId: input.subAreaId,
            subAreaName: subArea?.name ?? "Unknown",
          },
        });
      } catch {
        // Best-effort SSE
      }

      return {
        claimed: true,
        subAreaId: input.subAreaId,
        takenOver: result.takenOver,
      };
    }),

  releaseSubArea: protectedProcedure
    .input(releaseSubAreaSchema)
    .mutation(async ({ ctx, input }) => {
      // Get current sub-area before releasing
      const participant = await ctx.prisma.sessionParticipant.findUnique({
        where: {
          sessionId_userId: {
            sessionId: input.sessionId,
            userId: ctx.user.userId,
          },
        },
        select: { currentSubAreaId: true },
      });

      const svc = new SessionService(ctx.prisma);
      await svc.releaseSubArea(input.sessionId, ctx.user.userId);

      try {
        sessionEmitter.notifySession(input.sessionId, {
          type: "area_released",
          payload: {
            userId: ctx.user.userId,
            subAreaId: participant?.currentSubAreaId ?? null,
          },
        });
      } catch {
        // Best-effort SSE
      }

      return { released: true };
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
      const useSmart = input.sortMode === "smart";
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
          variance_flag_count: number;
          frequency_count: number;
          staleness_days: number;
          avg_daily_usage: number;
          priority_score: number;
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
        ),
        variance_flags AS (
          SELECT
            ce.inventory_item_id,
            COUNT(DISTINCT ce.id) AS flag_count
          FROM consumption_events ce
          WHERE ce.location_id = ${input.locationId}::uuid
            AND ce.event_type = 'inventory_count_adjustment'
            AND ce.reversal_of_event_id IS NULL
            AND ABS(ce.quantity_delta) > 5
            AND ce.created_at >= NOW() - INTERVAL '90 days'
          GROUP BY ce.inventory_item_id
        ),
        freq AS (
          SELECT
            sl2.inventory_item_id,
            COUNT(DISTINCT sl2.session_id) AS session_count
          FROM inventory_session_lines sl2
          INNER JOIN inventory_sessions s2 ON s2.id = sl2.session_id
          WHERE s2.location_id = ${input.locationId}::uuid
            AND s2.ended_ts IS NOT NULL
            AND s2.started_ts >= NOW() - INTERVAL '180 days'
          GROUP BY sl2.inventory_item_id
        ),
        staleness AS (
          SELECT sl3.inventory_item_id,
            EXTRACT(EPOCH FROM NOW() - MAX(sl3.created_at)) / 86400.0 AS days_since_count
          FROM inventory_session_lines sl3
          INNER JOIN inventory_sessions s3 ON s3.id = sl3.session_id
          WHERE s3.location_id = ${input.locationId}::uuid AND s3.ended_ts IS NOT NULL
          GROUP BY sl3.inventory_item_id
        ),
        depletion AS (
          SELECT ce2.inventory_item_id,
            ABS(SUM(CASE WHEN ce2.event_type = 'pos_sale' AND ce2.created_at >= NOW() - INTERVAL '30 days' THEN ce2.quantity_delta ELSE 0 END)) / 30.0 AS avg_daily
          FROM consumption_events ce2
          WHERE ce2.location_id = ${input.locationId}::uuid AND ce2.reversal_of_event_id IS NULL
          GROUP BY ce2.inventory_item_id
        )
        SELECT
          r.inventory_item_id,
          i.name,
          i.base_uom,
          c.counting_method::text,
          c.name AS category_name,
          r.sub_area_id,
          sa.name AS sub_area_name,
          r.created_at AS last_counted_at,
          COALESCE(vf.flag_count, 0)::int AS variance_flag_count,
          COALESCE(f.session_count, 0)::int AS frequency_count,
          COALESCE(st.days_since_count, 30)::float AS staleness_days,
          COALESCE(d.avg_daily, 0)::float AS avg_daily_usage,
          (
            (COALESCE(st.days_since_count, 30) / 30.0) * 0.30
            + CASE WHEN d.avg_daily > 0 THEN LEAST(d.avg_daily / GREATEST(1, 0.1), 1.0) * 0.25 ELSE 0 END
            + (COALESCE(vf.flag_count, 0)::float / GREATEST((SELECT MAX(flag_count) FROM variance_flags), 1)) * 0.25
            + (COALESCE(f.session_count, 0)::float / GREATEST((SELECT MAX(session_count) FROM freq), 1)) * 0.20
          )::float AS priority_score
        FROM ranked r
        INNER JOIN inventory_items i ON i.id = r.inventory_item_id
        LEFT JOIN inventory_item_categories c ON c.id = i.category_id
        INNER JOIN sub_areas sa ON sa.id = r.sub_area_id
        LEFT JOIN variance_flags vf ON vf.inventory_item_id = r.inventory_item_id
        LEFT JOIN freq f ON f.inventory_item_id = r.inventory_item_id
        LEFT JOIN staleness st ON st.inventory_item_id = r.inventory_item_id
        LEFT JOIN depletion d ON d.inventory_item_id = r.inventory_item_id
        WHERE r.rn = 1
          AND r.sub_area_id = ANY(${subAreaIds}::uuid[])
        ORDER BY
          ${useSmart ? Prisma.sql`priority_score DESC, i.name ASC` : Prisma.sql`i.name ASC`}
      `);

      let mapped = items.map((item) => ({
        inventoryItemId: item.inventory_item_id,
        name: item.name,
        countingMethod: item.counting_method,
        categoryName: item.category_name,
        baseUom: item.base_uom,
        subAreaId: item.sub_area_id,
        subAreaName: item.sub_area_name,
        lastCountedAt: item.last_counted_at,
        varianceFlagCount: item.variance_flag_count ?? 0,
        frequencyCount: item.frequency_count ?? 0,
        stalenessDays: item.staleness_days ?? 30,
        priorityScore: item.priority_score ?? 0,
      }));

      // Apply adjacency-based reorder in smart mode
      if (useSmart && mapped.length > 1) {
        try {
          const svc = new SessionService(ctx.prisma);
          const adjacency = await svc.getCoAdjacencyScores(
            input.locationId,
            input.subAreaId ?? null,
          );
          if (adjacency.size > 0) {
            mapped = adjacencyReorder(mapped, adjacency);
          }
        } catch {
          // Non-critical — keep composite sort order
        }
      }

      return mapped;
    }),

  expectedItemsForLocation: protectedProcedure
    .input(z.object({
      locationId: z.string().uuid(),
      sortMode: z.enum(["alphabetical", "smart"]).optional().default("alphabetical"),
    }))
    .query(async ({ ctx, input }) => {
      // Return active inventory items for this location, listed once per
      // distinct sub-area they've historically been counted in.
      // e.g. "Bud Light Cans" appears under Walk-In AND Main Bar if counted in both.
      const useSmart = input.sortMode === "smart";
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
          variance_flag_count: number;
          frequency_count: number;
          staleness_days: number;
          avg_daily_usage: number;
          priority_score: number;
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
        ),
        variance_flags AS (
          SELECT
            ce.inventory_item_id,
            COUNT(DISTINCT ce.id) AS flag_count
          FROM consumption_events ce
          WHERE ce.location_id = ${input.locationId}::uuid
            AND ce.event_type = 'inventory_count_adjustment'
            AND ce.reversal_of_event_id IS NULL
            AND ABS(ce.quantity_delta) > 5
            AND ce.created_at >= NOW() - INTERVAL '90 days'
          GROUP BY ce.inventory_item_id
        ),
        freq AS (
          SELECT
            sl2.inventory_item_id,
            COUNT(DISTINCT sl2.session_id) AS session_count
          FROM inventory_session_lines sl2
          INNER JOIN inventory_sessions s2 ON s2.id = sl2.session_id
          WHERE s2.location_id = ${input.locationId}::uuid
            AND s2.ended_ts IS NOT NULL
            AND s2.started_ts >= NOW() - INTERVAL '180 days'
          GROUP BY sl2.inventory_item_id
        ),
        staleness AS (
          SELECT sl3.inventory_item_id,
            EXTRACT(EPOCH FROM NOW() - MAX(sl3.created_at)) / 86400.0 AS days_since_count
          FROM inventory_session_lines sl3
          INNER JOIN inventory_sessions s3 ON s3.id = sl3.session_id
          WHERE s3.location_id = ${input.locationId}::uuid AND s3.ended_ts IS NOT NULL
          GROUP BY sl3.inventory_item_id
        ),
        depletion AS (
          SELECT ce2.inventory_item_id,
            ABS(SUM(CASE WHEN ce2.event_type = 'pos_sale' AND ce2.created_at >= NOW() - INTERVAL '30 days' THEN ce2.quantity_delta ELSE 0 END)) / 30.0 AS avg_daily
          FROM consumption_events ce2
          WHERE ce2.location_id = ${input.locationId}::uuid AND ce2.reversal_of_event_id IS NULL
          GROUP BY ce2.inventory_item_id
        )
        SELECT
          i.id,
          i.name,
          i.base_uom,
          c.counting_method::text,
          c.name AS category_name,
          dp.sub_area_id,
          sa.name AS sub_area_name,
          ba.name AS bar_area_name,
          COALESCE(vf.flag_count, 0)::int AS variance_flag_count,
          COALESCE(f.session_count, 0)::int AS frequency_count,
          COALESCE(st.days_since_count, 30)::float AS staleness_days,
          COALESCE(d.avg_daily, 0)::float AS avg_daily_usage,
          (
            (COALESCE(st.days_since_count, 30) / 30.0) * 0.30
            + CASE WHEN d.avg_daily > 0 THEN LEAST(d.avg_daily / GREATEST(1, 0.1), 1.0) * 0.25 ELSE 0 END
            + (COALESCE(vf.flag_count, 0)::float / GREATEST((SELECT MAX(flag_count) FROM variance_flags), 1)) * 0.25
            + (COALESCE(f.session_count, 0)::float / GREATEST((SELECT MAX(session_count) FROM freq), 1)) * 0.20
          )::float AS priority_score
        FROM inventory_items i
        LEFT JOIN inventory_item_categories c ON c.id = i.category_id
        LEFT JOIN distinct_placements dp ON dp.inventory_item_id = i.id
        LEFT JOIN sub_areas sa ON sa.id = dp.sub_area_id
        LEFT JOIN bar_areas ba ON ba.id = sa.bar_area_id
        LEFT JOIN variance_flags vf ON vf.inventory_item_id = i.id
        LEFT JOIN freq f ON f.inventory_item_id = i.id
        LEFT JOIN staleness st ON st.inventory_item_id = i.id
        LEFT JOIN depletion d ON d.inventory_item_id = i.id
        WHERE i.location_id = ${input.locationId}::uuid
          AND i.active = true
        ORDER BY
          ${useSmart ? Prisma.sql`priority_score DESC, i.name ASC` : Prisma.sql`ba.name NULLS LAST, sa.name NULLS LAST, i.name ASC`}
      `);

      let mapped = items.map((item) => ({
        inventoryItemId: item.id,
        name: item.name,
        countingMethod: item.counting_method,
        categoryName: item.category_name,
        baseUom: item.base_uom,
        subAreaId: item.sub_area_id,
        subAreaName: item.sub_area_name
          ? `${item.bar_area_name} — ${item.sub_area_name}`
          : "Unassigned",
        varianceFlagCount: item.variance_flag_count ?? 0,
        frequencyCount: item.frequency_count ?? 0,
        stalenessDays: item.staleness_days ?? 30,
        priorityScore: item.priority_score ?? 0,
      }));

      // Apply adjacency-based reorder in smart mode
      if (useSmart && mapped.length > 1) {
        try {
          const svc = new SessionService(ctx.prisma);
          const adjacency = await svc.getCoAdjacencyScores(input.locationId);
          if (adjacency.size > 0) {
            mapped = adjacencyReorder(mapped, adjacency);
          }
        } catch {
          // Non-critical — keep composite sort order
        }
      }

      return mapped;
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

  personalPacingTarget: protectedProcedure
    .input(z.object({ locationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.$queryRaw<
        Array<{ total_items: number; duration_minutes: number }>
      >(Prisma.sql`
        SELECT
          COUNT(sl.id)::int AS total_items,
          EXTRACT(EPOCH FROM (s.ended_ts - s.started_ts)) / 60.0 AS duration_minutes
        FROM inventory_sessions s
        INNER JOIN session_participants sp ON sp.session_id = s.id
        INNER JOIN inventory_session_lines sl ON sl.session_id = s.id AND sl.counted_by = ${ctx.user.userId}::uuid
        WHERE s.location_id = ${input.locationId}::uuid
          AND sp.user_id = ${ctx.user.userId}::uuid
          AND s.ended_ts IS NOT NULL
          AND s.started_ts >= NOW() - INTERVAL '90 days'
        GROUP BY s.id, s.started_ts, s.ended_ts
        ORDER BY s.started_ts DESC
        LIMIT 5
      `);

      if (rows.length === 0) {
        return { targetItemsPerHour: null, avgDurationMinutes: null, sessionCount: 0 };
      }

      const totalItems = rows.reduce((sum, r) => sum + r.total_items, 0);
      const totalMinutes = rows.reduce((sum, r) => sum + r.duration_minutes, 0);
      const avgItemsPerHour = totalMinutes > 0 ? (totalItems / totalMinutes) * 60 : null;
      const avgDurationMinutes = totalMinutes / rows.length;

      return {
        targetItemsPerHour: avgItemsPerHour ? Math.round(avgItemsPerHour * 10) / 10 : null,
        avgDurationMinutes: Math.round(avgDurationMinutes),
        sessionCount: rows.length,
      };
    }),

  // --- Session Planning ---

  plan: protectedProcedure
    .input(sessionPlanSchema)
    .mutation(async ({ ctx, input }) => {
      // Manager+ only
      const isManager = checkLocationRole(input.locationId, Role.manager, ctx.user)
        || ctx.user.highestRole === Role.business_admin
        || ctx.user.highestRole === Role.platform_admin;
      if (!isManager) throw new Error("Only managers can plan sessions");

      const session = await ctx.prisma.inventorySession.create({
        data: {
          locationId: input.locationId,
          sessionType: input.sessionType,
          startedTs: input.plannedAt,
          plannedAt: input.plannedAt,
          plannedBy: ctx.user.userId,
          createdBy: ctx.user.userId,
        },
      });

      // Create assignments
      for (const a of input.assignments) {
        await ctx.prisma.sessionAssignment.create({
          data: {
            sessionId: session.id,
            userId: a.userId,
            subAreaId: a.subAreaId ?? null,
            focusItems: a.focusItems,
          },
        });

        try {
          sessionEmitter.notifySession(session.id, {
            type: "assignment_created",
            payload: { userId: a.userId, subAreaId: a.subAreaId ?? null },
          });
        } catch {
          // Best-effort SSE
        }
      }

      // Create notification for each assignee
      for (const a of input.assignments) {
        try {
          await ctx.prisma.notification.create({
            data: {
              businessId: ctx.user.businessId,
              recipientUserId: a.userId,
              title: "New Session Assignment",
              body: `You've been assigned to a ${input.sessionType} session planned for ${new Date(input.plannedAt).toLocaleString()}`,
              metadataJson: { sessionId: session.id },
            },
          });
        } catch {
          // Best-effort notification
        }
      }

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "session.planned",
        objectType: "inventory_session",
        objectId: session.id,
        metadata: {
          locationId: input.locationId,
          assigneeCount: input.assignments.length,
        },
      });

      return session;
    }),

  respondAssignment: protectedProcedure
    .input(respondAssignmentSchema)
    .mutation(async ({ ctx, input }) => {
      const assignment = await ctx.prisma.sessionAssignment.findUniqueOrThrow({
        where: { id: input.assignmentId },
      });

      if (assignment.userId !== ctx.user.userId) {
        throw new Error("Can only respond to your own assignment");
      }

      const updated = await ctx.prisma.sessionAssignment.update({
        where: { id: input.assignmentId },
        data: { status: input.response },
      });

      try {
        sessionEmitter.notifySession(assignment.sessionId, {
          type: "assignment_responded",
          payload: {
            userId: ctx.user.userId,
            assignmentId: input.assignmentId,
            response: input.response,
          },
        });
      } catch {
        // Best-effort SSE
      }

      return updated;
    }),

  listAssignments: protectedProcedure
    .input(listAssignmentsSchema)
    .query(async ({ ctx, input }) => {
      const isManager = ctx.user.highestRole === Role.manager
        || ctx.user.highestRole === Role.business_admin
        || ctx.user.highestRole === Role.platform_admin;

      return ctx.prisma.sessionAssignment.findMany({
        where: {
          ...(input.sessionId && { sessionId: input.sessionId }),
          ...(input.status && { status: input.status }),
          // Staff see only own, managers see all
          ...(!isManager && { userId: ctx.user.userId }),
          ...(isManager && input.userId && { userId: input.userId }),
        },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          subArea: { select: { id: true, name: true, barArea: { select: { name: true } } } },
          session: { select: { id: true, sessionType: true, plannedAt: true, startedTs: true, endedTs: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  myUpcomingAssignments: protectedProcedure
    .query(async ({ ctx }) => {
      return ctx.prisma.sessionAssignment.findMany({
        where: {
          userId: ctx.user.userId,
          status: { in: ["assigned", "accepted"] },
          session: { endedTs: null },
        },
        include: {
          subArea: { select: { id: true, name: true, barArea: { select: { name: true } } } },
          session: {
            select: {
              id: true,
              sessionType: true,
              plannedAt: true,
              startedTs: true,
              locationId: true,
            },
          },
        },
        orderBy: { session: { plannedAt: "asc" } },
      });
    }),

  // --- Dual-Count Verification ---

  flagForVerification: protectedProcedure
    .input(flagForVerificationSchema)
    .mutation(async ({ ctx, input }) => {
      const line = await ctx.prisma.inventorySessionLine.findUniqueOrThrow({
        where: { id: input.lineId },
        include: {
          session: { select: { locationId: true } },
          inventoryItem: { select: { name: true } },
        },
      });

      // Manager+ check
      const isManager = checkLocationRole(line.session.locationId, Role.manager, ctx.user)
        || ctx.user.highestRole === Role.business_admin
        || ctx.user.highestRole === Role.platform_admin;
      if (!isManager) throw new Error("Only managers can flag items for verification");

      const updated = await ctx.prisma.inventorySessionLine.update({
        where: { id: input.lineId },
        data: { verificationStatus: "flagged" },
      });

      try {
        sessionEmitter.notifySession(line.sessionId, {
          type: "line_flagged",
          payload: {
            lineId: input.lineId,
            itemName: line.inventoryItem.name,
            flaggedBy: ctx.user.userId,
          },
        });
      } catch {
        // Best-effort SSE
      }

      return updated;
    }),

  submitVerification: protectedProcedure
    .input(submitVerificationSchema)
    .mutation(async ({ ctx, input }) => {
      const line = await ctx.prisma.inventorySessionLine.findUniqueOrThrow({
        where: { id: input.lineId },
        include: {
          session: { select: { locationId: true } },
          inventoryItem: { select: { name: true } },
        },
      });

      if (line.verificationStatus !== "flagged") {
        throw new Error("Line is not flagged for verification");
      }
      if (line.countedBy === ctx.user.userId) {
        throw new Error("Cannot verify your own count — must be a different user");
      }

      // Compare with original count
      const originalValue = line.countUnits != null ? Number(line.countUnits)
        : line.grossWeightGrams != null ? Number(line.grossWeightGrams)
        : 0;
      const verificationValue = input.countUnits ?? input.grossWeightGrams ?? 0;

      // Get verification threshold from business settings
      let threshold = 10;
      try {
        const location = await ctx.prisma.location.findUnique({
          where: { id: line.session.locationId },
          select: { businessId: true },
        });
        if (location) {
          const settingsSvc = new SettingsService(ctx.prisma);
          const settings = await settingsSvc.getSettings(location.businessId);
          threshold = settings.verification.verificationThreshold;
        }
      } catch {
        // Use default threshold
      }

      // Determine if counts match within threshold
      const diff = originalValue !== 0
        ? Math.abs((verificationValue - originalValue) / originalValue) * 100
        : verificationValue === 0 ? 0 : 100;
      const isMatch = diff <= threshold;

      const updated = await ctx.prisma.inventorySessionLine.update({
        where: { id: input.lineId },
        data: {
          verificationStatus: isMatch ? "verified" : "disputed",
          verifiedBy: ctx.user.userId,
          verificationCount: input.countUnits != null ? new Prisma.Decimal(input.countUnits) : null,
          verificationWeight: input.grossWeightGrams != null ? new Prisma.Decimal(input.grossWeightGrams) : null,
          verifiedAt: new Date(),
        },
      });

      try {
        sessionEmitter.notifySession(line.sessionId, {
          type: "verification_submitted",
          payload: {
            lineId: input.lineId,
            itemName: line.inventoryItem.name,
            verifiedBy: ctx.user.userId,
            status: isMatch ? "verified" : "disputed",
          },
        });
      } catch {
        // Best-effort SSE
      }

      return { ...updated, isMatch, differencePercent: diff };
    }),

  resolveVerification: protectedProcedure
    .input(resolveVerificationSchema)
    .mutation(async ({ ctx, input }) => {
      const line = await ctx.prisma.inventorySessionLine.findUniqueOrThrow({
        where: { id: input.lineId },
        include: {
          session: { select: { locationId: true } },
          inventoryItem: { select: { name: true } },
        },
      });

      // Manager+ check
      const isManager = checkLocationRole(line.session.locationId, Role.manager, ctx.user)
        || ctx.user.highestRole === Role.business_admin
        || ctx.user.highestRole === Role.platform_admin;
      if (!isManager) throw new Error("Only managers can resolve verifications");

      if (line.verificationStatus !== "disputed") {
        throw new Error("Line is not in disputed status");
      }

      // Determine final values based on resolution
      const data: Record<string, unknown> = { verificationStatus: "verified" };

      if (input.resolution === "verification") {
        // Use the verification count
        if (line.verificationCount != null) data.countUnits = line.verificationCount;
        if (line.verificationWeight != null) data.grossWeightGrams = line.verificationWeight;
      } else if (input.resolution === "average") {
        // Average original and verification
        if (line.countUnits != null && line.verificationCount != null) {
          data.countUnits = new Prisma.Decimal(
            (Number(line.countUnits) + Number(line.verificationCount)) / 2
          );
        }
        if (line.grossWeightGrams != null && line.verificationWeight != null) {
          data.grossWeightGrams = new Prisma.Decimal(
            (Number(line.grossWeightGrams) + Number(line.verificationWeight)) / 2
          );
        }
      }
      // resolution === "original" — keep existing values, just mark verified

      const updated = await ctx.prisma.inventorySessionLine.update({
        where: { id: input.lineId },
        data: data as any,
      });

      try {
        sessionEmitter.notifySession(line.sessionId, {
          type: "verification_resolved",
          payload: {
            lineId: input.lineId,
            itemName: line.inventoryItem.name,
            resolution: input.resolution,
            resolvedBy: ctx.user.userId,
          },
        });
      } catch {
        // Best-effort SSE
      }

      return updated;
    }),
});
