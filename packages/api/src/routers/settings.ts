import { router, protectedProcedure, requireRole, requireBusinessAccess } from "../trpc";
import { settingsGetSchema, settingsUpdateSchema } from "@barstock/validators";
import { SettingsService } from "../services/settings.service";
import { AuditService } from "../services/audit.service";

export const settingsRouter = router({
  capabilities: protectedProcedure
    .use(requireBusinessAccess())
    .input(settingsGetSchema)
    .query(async ({ ctx, input }) => {
      const service = new SettingsService(ctx.prisma);
      const settings = await service.getSettings(input.businessId);
      return settings.capabilities;
    }),

  get: protectedProcedure
    .use(requireRole("business_admin"))
    .use(requireBusinessAccess())
    .input(settingsGetSchema)
    .query(async ({ ctx, input }) => {
      const service = new SettingsService(ctx.prisma);
      return service.getSettings(input.businessId);
    }),

  update: protectedProcedure
    .use(requireRole("business_admin"))
    .use(requireBusinessAccess())
    .input(settingsUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const settingsService = new SettingsService(ctx.prisma);
      const auditService = new AuditService(ctx.prisma);

      const result = await settingsService.updateSettings(input.businessId, {
        capabilities: input.capabilities,
      });

      await auditService.log({
        businessId: input.businessId,
        actorUserId: ctx.user.userId,
        actionType: "settings.updated",
        objectType: "business_settings",
        objectId: input.businessId,
        metadata: { capabilities: input.capabilities },
      });

      return result;
    }),
});
