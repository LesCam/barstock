import { router, protectedProcedure, requireRole, requireBusinessAccess } from "../trpc";
import { settingsGetSchema, settingsUpdateSchema } from "@barstock/validators";
import { SettingsService } from "../services/settings.service";
import { AuditService } from "../services/audit.service";
import { AlertService } from "../services/alert.service";

export const settingsRouter = router({
  capabilities: protectedProcedure
    .use(requireBusinessAccess())
    .input(settingsGetSchema)
    .query(async ({ ctx, input }) => {
      const service = new SettingsService(ctx.prisma);
      const settings = await service.getSettings(input.businessId);
      return settings.capabilities;
    }),

  autoLockPolicy: protectedProcedure
    .use(requireBusinessAccess())
    .input(settingsGetSchema)
    .query(async ({ ctx, input }) => {
      const service = new SettingsService(ctx.prisma);
      const settings = await service.getSettings(input.businessId);
      return settings.autoLock;
    }),

  alertRules: protectedProcedure
    .use(requireBusinessAccess())
    .input(settingsGetSchema)
    .query(async ({ ctx, input }) => {
      const service = new SettingsService(ctx.prisma);
      const settings = await service.getSettings(input.businessId);
      return settings.alertRules;
    }),

  endOfDayTime: protectedProcedure
    .use(requireBusinessAccess())
    .input(settingsGetSchema)
    .query(async ({ ctx, input }) => {
      const service = new SettingsService(ctx.prisma);
      const settings = await service.getSettings(input.businessId);
      return settings.endOfDayTime;
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
        autoLock: input.autoLock,
        alertRules: input.alertRules,
        endOfDayTime: input.endOfDayTime,
      });

      await auditService.log({
        businessId: input.businessId,
        actorUserId: ctx.user.userId,
        actionType: "settings.updated",
        objectType: "business_settings",
        objectId: input.businessId,
        metadata: { capabilities: input.capabilities, autoLock: input.autoLock, alertRules: input.alertRules },
      });

      try {
        const alertSvc = new AlertService(ctx.prisma);
        await alertSvc.notifyAdmins(
          input.businessId,
          "Settings updated",
          `${ctx.user.email} updated business settings`,
          "/settings",
          { actorEmail: ctx.user.email }
        );
      } catch {
        // Don't fail settings update if alert fails
      }

      return result;
    }),
});
