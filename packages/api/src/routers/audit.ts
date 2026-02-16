import { router, protectedProcedure, requireRole, requireBusinessAccess } from "../trpc";
import { auditLogListSchema } from "@barstock/validators";
import { AuditService } from "../services/audit.service";

export const auditRouter = router({
  list: protectedProcedure
    .use(requireRole("business_admin"))
    .use(requireBusinessAccess())
    .input(auditLogListSchema)
    .query(async ({ ctx, input }) => {
      const service = new AuditService(ctx.prisma);
      return service.list(input);
    }),
});
