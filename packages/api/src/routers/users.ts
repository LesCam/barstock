import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure, requireRole, forceBusinessId, requireRecentAuth } from "../trpc";
import {
  platformUserCreateSchema,
  platformUserUpdateSchema,
  platformUserListSchema,
} from "@barstock/validators";
import { hashPassword, invalidateUserSessions } from "../services/auth.service";
import { AuditService } from "../services/audit.service";
import { SubscriptionService } from "../services/subscription.service";

export const usersRouter = router({
  listForBusiness: protectedProcedure
    .use(requireRole("business_admin"))
    .use(forceBusinessId())
    .input(z.object({ businessId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.user.findMany({
        where: { businessId: input.businessId, isActive: true },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
        },
        orderBy: { email: "asc" },
      });
    }),

  listByBusiness: protectedProcedure
    .use(requireRole("platform_admin"))
    .input(platformUserListSchema)
    .query(async ({ ctx, input }) => {
      const where: any = { businessId: input.businessId };
      if (input.activeOnly) {
        where.isActive = true;
      }
      if (input.search) {
        where.email = { contains: input.search, mode: "insensitive" };
      }
      return ctx.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          role: true,
          locationId: true,
          isActive: true,
          createdAt: true,
          location: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  create: protectedProcedure
    .use(requireRole("platform_admin"))
    .use(requireRecentAuth())
    .input(platformUserCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const subService = new SubscriptionService(ctx.prisma);
      await subService.enforceUserLimit(input.businessId);

      // Verify location belongs to business
      const location = await ctx.prisma.location.findUnique({
        where: { id: input.locationId },
      });
      if (!location || location.businessId !== input.businessId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Location does not belong to this business",
        });
      }

      const existing = await ctx.prisma.user.findUnique({
        where: { email: input.email },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A user with this email already exists",
        });
      }

      const passwordHash = await hashPassword(input.password);
      return ctx.prisma.user.create({
        data: {
          email: input.email,
          passwordHash,
          role: input.role,
          locationId: input.locationId,
          businessId: input.businessId,
        },
      });
    }),

  update: protectedProcedure
    .use(requireRole("platform_admin"))
    .use(requireRecentAuth())
    .input(z.object({ userId: z.string().uuid() }).merge(platformUserUpdateSchema))
    .mutation(async ({ ctx, input }) => {
      const { userId, ...data } = input;
      const user = await ctx.prisma.user.update({
        where: { id: userId },
        data,
        select: { id: true, email: true, role: true, isActive: true, businessId: true },
      });

      if (data.role || data.isActive === false) {
        await invalidateUserSessions(ctx.prisma, userId);
        const audit = new AuditService(ctx.prisma);
        const reason = data.role ? "role_change" : "deactivation";
        await audit.log({
          businessId: user.businessId,
          actorUserId: ctx.user.userId,
          actionType: "auth.sessions_invalidated",
          objectType: "user",
          objectId: userId,
          metadata: { reason },
        });
      }

      return user;
    }),

  deactivate: protectedProcedure
    .use(requireRole("platform_admin"))
    .use(requireRecentAuth())
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.update({
        where: { id: input.userId },
        data: { isActive: false },
        select: { id: true, email: true, role: true, isActive: true, businessId: true },
      });

      await invalidateUserSessions(ctx.prisma, input.userId);
      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "auth.sessions_invalidated",
        objectType: "user",
        objectId: input.userId,
        metadata: { reason: "deactivation" },
      });

      return user;
    }),
});
