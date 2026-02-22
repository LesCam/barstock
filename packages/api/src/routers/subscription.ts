import { router, protectedProcedure, requireRole, requireBusinessAccess } from "../trpc";
import { SubscriptionService } from "../services/subscription.service";
import { TIER_DEFAULTS } from "../services/subscription.constants";
import { AuditService } from "../services/audit.service";
import { z } from "zod";

export const subscriptionRouter = router({
  getLimits: protectedProcedure
    .use(requireBusinessAccess())
    .input(z.object({ businessId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const svc = new SubscriptionService(ctx.prisma);
      return svc.getEffectiveLimits(input.businessId);
    }),

  getTierDefaults: protectedProcedure.query(() => TIER_DEFAULTS),

  changeTier: protectedProcedure
    .use(requireRole("platform_admin"))
    .input(
      z.object({
        businessId: z.string().uuid(),
        tier: z.enum(["starter", "pro", "enterprise"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const svc = new SubscriptionService(ctx.prisma);
      await svc.changeTier(input.businessId, input.tier);

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: input.businessId,
        actorUserId: ctx.user.userId,
        actionType: "subscription.tier_changed",
        objectType: "business",
        objectId: input.businessId,
        metadata: { newTier: input.tier },
      });

      return { success: true };
    }),

  setOverrides: protectedProcedure
    .use(requireRole("platform_admin"))
    .input(
      z.object({
        businessId: z.string().uuid(),
        maxLocations: z.number().int().min(1).nullable().optional(),
        maxUsers: z.number().int().min(1).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { businessId, ...overrides } = input;
      const svc = new SubscriptionService(ctx.prisma);
      await svc.setLimitOverrides(businessId, overrides);

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId,
        actorUserId: ctx.user.userId,
        actionType: "subscription.overrides_set",
        objectType: "business",
        objectId: businessId,
        metadata: overrides,
      });

      return { success: true };
    }),
});
