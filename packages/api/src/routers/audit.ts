import { router, protectedProcedure, requireRole, requireBusinessAccess, isPlatformAdmin } from "../trpc";
import { auditLogListSchema } from "@barstock/validators";
import { AuditService } from "../services/audit.service";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const optionalBusinessId = z.object({ businessId: z.string().uuid().optional() });

/** Ensure non-platform-admins always scope to their own business */
function resolveBusinessId(user: any, inputBusinessId?: string): string | undefined {
  if (isPlatformAdmin(user)) return inputBusinessId; // undefined = all businesses
  if (!user.businessId) throw new TRPCError({ code: "FORBIDDEN" });
  return user.businessId;
}

export const auditRouter = router({
  list: protectedProcedure
    .use(requireRole("business_admin"))
    .input(auditLogListSchema)
    .query(async ({ ctx, input }) => {
      const businessId = resolveBusinessId(ctx.user, input.businessId);
      const service = new AuditService(ctx.prisma);
      return service.list({ ...input, businessId });
    }),

  actionTypes: protectedProcedure
    .use(requireRole("business_admin"))
    .input(optionalBusinessId)
    .query(async ({ ctx, input }) => {
      const businessId = resolveBusinessId(ctx.user, input.businessId);
      const where: Record<string, unknown> = {};
      if (businessId) where.businessId = businessId;
      const rows = await ctx.prisma.auditLog.findMany({
        where,
        select: { actionType: true },
        distinct: ["actionType"],
        orderBy: { actionType: "asc" },
      });
      return rows.map((r) => r.actionType);
    }),

  objectTypes: protectedProcedure
    .use(requireRole("business_admin"))
    .input(optionalBusinessId)
    .query(async ({ ctx, input }) => {
      const businessId = resolveBusinessId(ctx.user, input.businessId);
      const where: Record<string, unknown> = {};
      if (businessId) where.businessId = businessId;
      const rows = await ctx.prisma.auditLog.findMany({
        where,
        select: { objectType: true },
        distinct: ["objectType"],
        orderBy: { objectType: "asc" },
      });
      return rows.map((r) => r.objectType).filter(Boolean) as string[];
    }),

  actors: protectedProcedure
    .use(requireRole("business_admin"))
    .input(optionalBusinessId)
    .query(async ({ ctx, input }) => {
      const businessId = resolveBusinessId(ctx.user, input.businessId);
      const where: Record<string, unknown> = { actorUserId: { not: null } };
      if (businessId) where.businessId = businessId;
      const rows = await ctx.prisma.auditLog.findMany({
        where,
        select: { actorUser: { select: { id: true, email: true, firstName: true, lastName: true } } },
        distinct: ["actorUserId"],
      });
      return rows
        .map((r) => r.actorUser!)
        .filter(Boolean);
    }),

  businesses: protectedProcedure
    .use(requireRole("platform_admin"))
    .query(async ({ ctx }) => {
      const rows = await ctx.prisma.business.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
      return rows;
    }),
});
