import { router, protectedProcedure } from "../trpc";
import {
  notificationListSchema,
  notificationMarkReadSchema,
  pushTokenRegisterSchema,
  pushTokenUnregisterSchema,
} from "@barstock/validators";
import { NotificationService } from "../services/notification.service";

export const notificationsRouter = router({
  list: protectedProcedure
    .input(notificationListSchema)
    .query(async ({ ctx, input }) => {
      const service = new NotificationService(ctx.prisma);
      return service.list(ctx.user.userId, input);
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const service = new NotificationService(ctx.prisma);
    return service.unreadCount(ctx.user.userId);
  }),

  markRead: protectedProcedure
    .input(notificationMarkReadSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new NotificationService(ctx.prisma);
      return service.markRead(input.id, ctx.user.userId);
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const service = new NotificationService(ctx.prisma);
    return service.markAllRead(ctx.user.userId);
  }),

  registerPushToken: protectedProcedure
    .input(pushTokenRegisterSchema)
    .mutation(async ({ ctx, input }) => {
      // If token exists for another user, reassign it
      const existing = await ctx.prisma.deviceToken.findUnique({
        where: { token: input.token },
      });

      if (existing) {
        if (existing.userId === ctx.user.userId) {
          // Already registered for this user — touch updatedAt
          await ctx.prisma.deviceToken.update({
            where: { id: existing.id },
            data: { updatedAt: new Date() },
          });
          return { ok: true };
        }
        // Reassign to current user
        await ctx.prisma.deviceToken.update({
          where: { id: existing.id },
          data: { userId: ctx.user.userId, platform: input.platform },
        });
        return { ok: true };
      }

      await ctx.prisma.deviceToken.create({
        data: {
          userId: ctx.user.userId,
          token: input.token,
          platform: input.platform,
        },
      });
      return { ok: true };
    }),

  unregisterPushToken: protectedProcedure
    .input(pushTokenUnregisterSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.deviceToken.deleteMany({
        where: { userId: ctx.user.userId, token: input.token },
      });
      return { ok: true };
    }),
});
