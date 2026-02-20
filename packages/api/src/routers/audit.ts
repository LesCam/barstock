import { router, protectedProcedure, requireRole, requireBusinessAccess } from "../trpc";
import { auditLogListSchema } from "@barstock/validators";
import { AuditService } from "../services/audit.service";
import { z } from "zod";

export const auditRouter = router({
  list: protectedProcedure
    .use(requireRole("business_admin"))
    .use(requireBusinessAccess())
    .input(auditLogListSchema)
    .query(async ({ ctx, input }) => {
      const service = new AuditService(ctx.prisma);
      return service.list(input);
    }),

  actionTypes: protectedProcedure
    .use(requireRole("business_admin"))
    .input(z.object({ businessId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.auditLog.findMany({
        where: { businessId: input.businessId },
        select: { actionType: true },
        distinct: ["actionType"],
        orderBy: { actionType: "asc" },
      });
      return rows.map((r) => r.actionType);
    }),

  actors: protectedProcedure
    .use(requireRole("business_admin"))
    .input(z.object({ businessId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.auditLog.findMany({
        where: { businessId: input.businessId, actorUserId: { not: null } },
        select: { actorUser: { select: { id: true, email: true, firstName: true, lastName: true } } },
        distinct: ["actorUserId"],
      });
      return rows
        .map((r) => r.actorUser!)
        .filter(Boolean);
    }),
});
