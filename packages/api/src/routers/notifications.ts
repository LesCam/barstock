import { router, protectedProcedure } from "../trpc";
import { notificationListSchema, notificationMarkReadSchema } from "@barstock/validators";
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
});
