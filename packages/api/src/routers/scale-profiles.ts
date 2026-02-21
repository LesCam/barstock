import { router, protectedProcedure, requireRole } from "../trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  scaleProfileCreateSchema,
  scaleProfileUpdateSchema,
  scaleProfileHeartbeatSchema,
} from "@barstock/validators";
import { NotificationService } from "../services/notification.service";
import { AuditService } from "../services/audit.service";
import { Role } from "@barstock/types";

const CONNECTED_THRESHOLD_MS = 60_000; // 60 seconds
const BATTERY_ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
const LOW_BATTERY_THRESHOLD = 20;

export const scaleProfilesRouter = router({
  list: protectedProcedure
    .input(z.object({ locationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const profiles = await ctx.prisma.scaleProfile.findMany({
        where: { locationId: input.locationId },
        include: {
          lastConnectedByUser: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { name: "asc" },
      });

      const now = Date.now();
      return profiles.map((p) => ({
        ...p,
        isConnected:
          p.lastHeartbeatAt !== null &&
          now - p.lastHeartbeatAt.getTime() < CONNECTED_THRESHOLD_MS,
      }));
    }),

  create: protectedProcedure
    .use(requireRole(Role.business_admin))
    .input(scaleProfileCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.scaleProfile.findUnique({
        where: {
          locationId_name: {
            locationId: input.locationId,
            name: input.name,
          },
        },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A scale profile named "${input.name}" already exists at this location`,
        });
      }

      return ctx.prisma.scaleProfile.create({
        data: {
          locationId: input.locationId,
          name: input.name,
        },
      });
    }),

  update: protectedProcedure
    .use(requireRole(Role.business_admin))
    .input(scaleProfileUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.scaleProfile.findUniqueOrThrow({
        where: { id: input.profileId },
        include: { location: { select: { businessId: true } } },
      });

      if (profile.location.businessId !== ctx.user.businessId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your business" });
      }

      return ctx.prisma.scaleProfile.update({
        where: { id: input.profileId },
        data: { name: input.name },
      });
    }),

  delete: protectedProcedure
    .use(requireRole(Role.business_admin))
    .input(z.object({ profileId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.scaleProfile.findUniqueOrThrow({
        where: { id: input.profileId },
        include: { location: { select: { businessId: true } } },
      });

      if (profile.location.businessId !== ctx.user.businessId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your business" });
      }

      return ctx.prisma.scaleProfile.delete({
        where: { id: input.profileId },
      });
    }),

  heartbeat: protectedProcedure
    .input(scaleProfileHeartbeatSchema)
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.scaleProfile.findUniqueOrThrow({
        where: { id: input.profileId },
        include: { location: { select: { businessId: true } } },
      });

      const now = new Date();

      const updated = await ctx.prisma.scaleProfile.update({
        where: { id: input.profileId },
        data: {
          lastHeartbeatAt: now,
          lastConnectedByUserId: ctx.user.userId,
          batteryLevel: input.batteryLevel ?? undefined,
        },
      });

      // Low battery alert
      if (
        input.batteryLevel !== undefined &&
        input.batteryLevel < LOW_BATTERY_THRESHOLD
      ) {
        const shouldAlert =
          !profile.lastBatteryAlertAt ||
          now.getTime() - profile.lastBatteryAlertAt.getTime() >
            BATTERY_ALERT_COOLDOWN_MS;

        if (shouldAlert) {
          await ctx.prisma.scaleProfile.update({
            where: { id: input.profileId },
            data: { lastBatteryAlertAt: now },
          });

          const audit = new AuditService(ctx.prisma);
          await audit.log({
            businessId: profile.location.businessId,
            actorUserId: ctx.user.userId,
            actionType: "scale.low_battery",
            objectType: "scale_profile",
            objectId: profile.id,
            metadata: { batteryLevel: input.batteryLevel, scaleName: profile.name },
          });

          const notificationService = new NotificationService(ctx.prisma);

          // Notify all business admins at this location
          const admins = await ctx.prisma.userLocation.findMany({
            where: {
              locationId: profile.locationId,
              role: "business_admin",
            },
            select: { userId: true },
          });

          const recipientIds = new Set(admins.map((a) => a.userId));
          recipientIds.add(ctx.user.userId); // Also notify the connected user

          for (const recipientUserId of recipientIds) {
            await notificationService.send({
              businessId: profile.location.businessId,
              recipientUserId,
              title: `Low Battery: ${profile.name}`,
              body: `Scale "${profile.name}" battery is at ${input.batteryLevel}%. Please charge it soon.`,
              linkUrl: "/settings",
              metadata: { scaleProfileId: profile.id, batteryLevel: input.batteryLevel },
            });
          }
        }
      }

      return { ok: true };
    }),
});
