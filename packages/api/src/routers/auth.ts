import { router, publicProcedure, protectedProcedure } from "../trpc";
import { requireRole } from "../trpc";
import { loginSchema, refreshTokenSchema, userCreateSchema, userUpdateSchema, userLocationCreateSchema, forgotPasswordSchema, resetPasswordSchema } from "@barstock/validators";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import crypto from "crypto";
import {
  verifyPassword,
  hashPassword,
  createAccessToken,
  createRefreshToken,
  decodeToken,
  buildUserPayload,
  deriveDefaultPermissions,
} from "../services/auth.service";
import { AuditService } from "../services/audit.service";
import { AlertService } from "../services/alert.service";
import { SettingsService } from "../services/settings.service";

export const authRouter = router({
  login: publicProcedure.input(loginSchema).mutation(async ({ ctx, input }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user || !user.isActive) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
    }

    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) {
      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: user.businessId,
        actorUserId: user.id,
        actionType: "auth.login_failed",
        objectType: "user",
        objectId: user.id,
        metadata: { reason: "invalid_password", email: input.email },
      });

      // Check if failed logins exceed threshold and alert admins
      try {
        const settingsSvc = new SettingsService(ctx.prisma);
        const settings = await settingsSvc.getSettings(user.businessId);
        const loginRule = (settings.alertRules as any).loginFailures;
        if (loginRule?.enabled) {
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
          const failCount = await ctx.prisma.auditLog.count({
            where: {
              actionType: "auth.login_failed",
              businessId: user.businessId,
              createdAt: { gte: oneHourAgo },
            },
          });
          if (failCount >= loginRule.threshold) {
            const alertSvc = new AlertService(ctx.prisma);
            await alertSvc.notifyAdmins(
              user.businessId,
              "Multiple failed login attempts",
              `${failCount} failed login attempt(s) in the last hour. Most recent: ${input.email}`,
              "/audit",
              { rule: "loginFailures", email: input.email, failCount }
            );
          }
        }
      } catch {
        // Don't fail the login flow if alert fails
      }

      throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
    }

    const payload = await buildUserPayload(ctx.prisma, user.id);
    const accessToken = createAccessToken(payload);
    const refreshToken = createRefreshToken(payload);

    const audit = new AuditService(ctx.prisma);
    await audit.log({
      businessId: user.businessId,
      actorUserId: user.id,
      actionType: "auth.login",
      objectType: "user",
      objectId: user.id,
      metadata: { method: "password" },
    });

    return {
      accessToken,
      refreshToken,
      tokenType: "bearer",
      expiresIn: 1800,
    };
  }),

  loginWithPin: publicProcedure
    .input(z.object({ pin: z.string().length(4), businessId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findFirst({
        where: { pin: input.pin, businessId: input.businessId, isActive: true },
      });

      if (!user) {
        const audit = new AuditService(ctx.prisma);
        await audit.log({
          businessId: input.businessId,
          actionType: "auth.login_pin_failed",
          objectType: "user",
          metadata: { reason: "invalid_pin" },
        });
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid PIN" });
      }

      const payload = await buildUserPayload(ctx.prisma, user.id);
      const accessToken = createAccessToken(payload);
      const refreshToken = createRefreshToken(payload);

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: user.businessId,
        actorUserId: user.id,
        actionType: "auth.login_pin",
        objectType: "user",
        objectId: user.id,
        metadata: { method: "pin" },
      });

      return {
        accessToken,
        refreshToken,
        tokenType: "bearer",
        expiresIn: 1800,
      };
    }),

  refresh: publicProcedure
    .input(refreshTokenSchema)
    .mutation(async ({ ctx, input }) => {
      const decoded = decodeToken(input.refreshToken);
      if (decoded.type !== "refresh") {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid token type" });
      }

      const payload = await buildUserPayload(ctx.prisma, decoded.userId as string);
      const accessToken = createAccessToken(payload);

      return { accessToken, tokenType: "bearer", expiresIn: 1800 };
    }),

  me: protectedProcedure.query(({ ctx }) => ctx.user),

  verifyPin: protectedProcedure
    .input(z.object({ pin: z.string().length(4) }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.user.userId },
        select: { pin: true },
      });

      if (!user?.pin || user.pin !== input.pin) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect PIN" });
      }

      return { valid: true };
    }),

  createUser: protectedProcedure
    .use(requireRole("business_admin"))
    .input(userCreateSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.pin) {
        const existing = await ctx.prisma.user.findFirst({
          where: { pin: input.pin, businessId: input.businessId, isActive: true },
        });
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "PIN already in use by another staff member" });
        }
      }
      const passwordHash = await hashPassword(input.password);
      const user = await ctx.prisma.user.create({
        data: {
          email: input.email,
          passwordHash,
          role: input.role,
          locationId: input.locationId,
          businessId: input.businessId,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          pin: input.pin,
        },
      });

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: input.businessId,
        actorUserId: ctx.user.userId,
        actionType: "user.created",
        objectType: "user",
        objectId: user.id,
        metadata: { email: input.email, role: input.role },
      });

      try {
        const alertSvc = new AlertService(ctx.prisma);
        await alertSvc.notifyAdmins(
          input.businessId,
          "New staff member added",
          `${ctx.user.email} added ${input.email} as ${input.role}`,
          "/staff",
          { userId: user.id, email: input.email, role: input.role }
        );
      } catch {
        // Don't fail user creation if alert fails
      }

      return user;
    }),

  listUsers: protectedProcedure
    .use(requireRole("business_admin"))
    .input(z.object({
      search: z.string().optional(),
      activeOnly: z.boolean().optional(),
    }).optional())
    .query(({ ctx, input }) => {
      const where: any = { businessId: ctx.user.businessId };
      if (input?.activeOnly) where.isActive = true;
      if (input?.search) {
        const term = input.search;
        where.OR = [
          { email: { contains: term, mode: "insensitive" } },
          { firstName: { contains: term, mode: "insensitive" } },
          { lastName: { contains: term, mode: "insensitive" } },
        ];
      }
      return ctx.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          pin: true,
          role: true,
          locationId: true,
          isActive: true,
          createdAt: true,
          location: { select: { name: true } },
          userLocations: { select: { locationId: true, role: true, location: { select: { name: true } } } },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  updateUser: protectedProcedure
    .use(requireRole("business_admin"))
    .input(z.object({ userId: z.string().uuid() }).merge(userUpdateSchema))
    .mutation(async ({ ctx, input }) => {
      const { userId, ...data } = input;
      const updateData: any = {};
      if (data.email) updateData.email = data.email;
      if (data.password) updateData.passwordHash = await hashPassword(data.password);
      if (data.isActive !== undefined) updateData.isActive = data.isActive;
      if (data.role) updateData.role = data.role;
      if (data.locationId) updateData.locationId = data.locationId;
      if (data.firstName !== undefined) updateData.firstName = data.firstName;
      if (data.lastName !== undefined) updateData.lastName = data.lastName;
      if (data.phone !== undefined) updateData.phone = data.phone;
      if (data.pin !== undefined) {
        if (data.pin) {
          const existing = await ctx.prisma.user.findFirst({
            where: { pin: data.pin, businessId: ctx.user.businessId, isActive: true, id: { not: userId } },
          });
          if (existing) {
            throw new TRPCError({ code: "CONFLICT", message: "PIN already in use by another staff member" });
          }
        }
        updateData.pin = data.pin;
      }
      const user = await ctx.prisma.user.update({ where: { id: userId }, data: updateData });

      const audit = new AuditService(ctx.prisma);
      // Exclude password from metadata
      const { password: _, ...metaFields } = data;
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "user.updated",
        objectType: "user",
        objectId: userId,
        metadata: metaFields,
      });

      return user;
    }),

  getUserDetail: protectedProcedure
    .use(requireRole("business_admin"))
    .input(z.object({ userId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      ctx.prisma.user.findUniqueOrThrow({
        where: { id: input.userId, businessId: ctx.user.businessId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          pin: true,
          role: true,
          locationId: true,
          isActive: true,
          createdAt: true,
          location: { select: { id: true, name: true } },
          userLocations: { select: { locationId: true, role: true, location: { select: { id: true, name: true } } } },
        },
      })
    ),

  grantLocationAccess: protectedProcedure
    .use(requireRole("business_admin"))
    .input(userLocationCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prisma.userLocation.create({ data: input });

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "user.location_access.granted",
        objectType: "user_location",
        objectId: input.userId,
        metadata: { locationId: input.locationId, role: input.role },
      });

      try {
        const alertSvc = new AlertService(ctx.prisma);
        await alertSvc.notifyAdmins(
          ctx.user.businessId,
          "Location access granted",
          `${ctx.user.email} granted ${input.role} access to a location for user ${input.userId}`,
          "/staff",
          { userId: input.userId, locationId: input.locationId, role: input.role }
        );
      } catch {
        // Don't fail grant if alert fails
      }

      return result;
    }),

  revokeLocationAccess: protectedProcedure
    .use(requireRole("business_admin"))
    .input(z.object({ userId: z.string().uuid(), locationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prisma.userLocation.delete({
        where: { userId_locationId: input },
      });

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "user.location_access.revoked",
        objectType: "user_location",
        objectId: input.userId,
        metadata: { locationId: input.locationId },
      });

      try {
        const alertSvc = new AlertService(ctx.prisma);
        await alertSvc.notifyAdmins(
          ctx.user.businessId,
          "Location access revoked",
          `${ctx.user.email} revoked location access for user ${input.userId}`,
          "/staff",
          { userId: input.userId, locationId: input.locationId }
        );
      } catch {
        // Don't fail revoke if alert fails
      }

      return result;
    }),

  switchPrimaryLocation: protectedProcedure
    .use(requireRole("business_admin"))
    .input(z.object({ userId: z.string().uuid(), newPrimaryId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUniqueOrThrow({
        where: { id: input.userId, businessId: ctx.user.businessId },
        select: { locationId: true, role: true },
      });

      const oldPrimaryId = user.locationId;
      if (oldPrimaryId === input.newPrimaryId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Already the primary location" });
      }

      // Check existing userLocation entries
      const [existingOldGrant, existingNewGrant] = await Promise.all([
        ctx.prisma.userLocation.findUnique({
          where: { userId_locationId: { userId: input.userId, locationId: oldPrimaryId } },
        }),
        ctx.prisma.userLocation.findUnique({
          where: { userId_locationId: { userId: input.userId, locationId: input.newPrimaryId } },
        }),
      ]);

      await ctx.prisma.$transaction(async (tx) => {
        // 1. Set new primary
        await tx.user.update({
          where: { id: input.userId },
          data: { locationId: input.newPrimaryId },
        });
        // 2. Preserve old primary as additional access (only if not already granted)
        if (!existingOldGrant) {
          await tx.userLocation.create({
            data: { userId: input.userId, locationId: oldPrimaryId, role: user.role },
          });
        }
        // 3. Remove new primary from userLocations (it's now the primary)
        if (existingNewGrant) {
          await tx.userLocation.delete({
            where: { userId_locationId: { userId: input.userId, locationId: input.newPrimaryId } },
          });
        }
      });

      return { success: true };
    }),

  requestPasswordReset: publicProcedure
    .input(forgotPasswordSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { email: input.email },
      });

      // Always return success to avoid leaking user existence
      if (!user) {
        return { success: true };
      }

      // Delete any existing tokens for this user
      await ctx.prisma.passwordResetToken.deleteMany({
        where: { userId: user.id },
      });

      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await ctx.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token,
          expiresAt,
        },
      });

      const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${token}`;
      console.log(`\n[PASSWORD RESET] Reset link for ${input.email}:\n${resetUrl}\n`);

      return { success: true };
    }),

  resetPassword: publicProcedure
    .input(resetPasswordSchema)
    .mutation(async ({ ctx, input }) => {
      const resetToken = await ctx.prisma.passwordResetToken.findUnique({
        where: { token: input.token },
      });

      if (!resetToken || resetToken.expiresAt < new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid or expired reset token",
        });
      }

      const passwordHash = await hashPassword(input.password);

      await ctx.prisma.$transaction([
        ctx.prisma.user.update({
          where: { id: resetToken.userId },
          data: { passwordHash },
        }),
        ctx.prisma.passwordResetToken.delete({
          where: { id: resetToken.id },
        }),
      ]);

      return { success: true };
    }),

  setUserPermission: protectedProcedure
    .use(requireRole("business_admin"))
    .input(z.object({
      userId: z.string().uuid(),
      locationId: z.string().uuid(),
      permissionKey: z.string(),
      value: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const targetUser = await ctx.prisma.user.findUniqueOrThrow({
        where: { id: input.userId, businessId: ctx.user.businessId },
      });

      const existing = await ctx.prisma.userLocation.findUnique({
        where: { userId_locationId: { userId: input.userId, locationId: input.locationId } },
      });

      const newPerms = {
        ...((existing?.permissions as Record<string, boolean>) ?? {}),
        [input.permissionKey]: input.value,
      };

      if (existing) {
        await ctx.prisma.userLocation.update({
          where: { userId_locationId: { userId: input.userId, locationId: input.locationId } },
          data: { permissions: newPerms },
        });
      } else {
        // Primary location without a user_locations row — create one
        await ctx.prisma.userLocation.create({
          data: {
            userId: input.userId,
            locationId: input.locationId,
            role: targetUser.role,
            permissions: newPerms,
          },
        });
      }

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "user.permission.updated",
        objectType: "user_location",
        objectId: input.userId,
        metadata: { locationId: input.locationId, permissionKey: input.permissionKey, value: input.value },
      });

      try {
        const alertSvc = new AlertService(ctx.prisma);
        await alertSvc.notifyAdmins(
          ctx.user.businessId,
          "User permission updated",
          `${ctx.user.email} ${input.value ? "granted" : "revoked"} ${input.permissionKey} for user ${input.userId}`,
          "/staff",
          { userId: input.userId, permissionKey: input.permissionKey, value: input.value }
        );
      } catch {
        // Don't fail permission update if alert fails
      }

      return { success: true };
    }),

  getUserPermissions: protectedProcedure
    .use(requireRole("business_admin"))
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const targetUser = await ctx.prisma.user.findUniqueOrThrow({
        where: { id: input.userId, businessId: ctx.user.businessId },
        include: { userLocations: true },
      });

      const result: Record<string, Record<string, boolean>> = {};

      // Primary location defaults
      result[targetUser.locationId] = deriveDefaultPermissions(targetUser.role as any);

      // Merge stored overrides from user_locations
      for (const ul of targetUser.userLocations) {
        const defaults = deriveDefaultPermissions(ul.role as any);
        const stored = (ul.permissions as Record<string, boolean>) ?? {};
        result[ul.locationId] = { ...defaults, ...stored };
      }

      // Primary location may also have a user_locations row
      const primaryUl = targetUser.userLocations.find((ul) => ul.locationId === targetUser.locationId);
      if (primaryUl) {
        const stored = (primaryUl.permissions as Record<string, boolean>) ?? {};
        result[targetUser.locationId] = { ...result[targetUser.locationId], ...stored };
      }

      return result;
    }),
});
