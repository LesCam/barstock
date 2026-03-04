import { router, publicProcedure, protectedProcedure } from "../trpc";
import { requireRole } from "../trpc";
import { loginSchema, refreshTokenSchema, userCreateSchema, userUpdateSchema, userLocationCreateSchema, forgotPasswordSchema, resetPasswordSchema, staffInviteCreateSchema, acceptInviteSchema } from "@barstock/validators";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import crypto from "crypto";
import {
  verifyPassword,
  hashPassword,
  hashPin,
  verifyPinHash,
  isPinTaken,
  findUserByPin,
  createAccessToken,
  createRefreshToken,
  decodeToken,
  buildUserPayload,
  deriveDefaultPermissions,
} from "../services/auth.service";
import { AuditService } from "../services/audit.service";
import { AlertService } from "../services/alert.service";
import { EmailService } from "../services/email.service";
import { SettingsService } from "../services/settings.service";
import { SubscriptionService } from "../services/subscription.service";

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
              actionType: { in: ["auth.login_failed", "auth.login_pin_failed"] },
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
      const userId = await findUserByPin(ctx.prisma, input.businessId, input.pin);
      const user = userId
        ? await ctx.prisma.user.findUnique({ where: { id: userId } })
        : null;

      if (!user) {
        const audit = new AuditService(ctx.prisma);
        await audit.log({
          businessId: input.businessId,
          actionType: "auth.login_pin_failed",
          objectType: "user",
          metadata: { reason: "invalid_pin" },
        });

        // Check if failed logins exceed threshold and alert admins
        try {
          const settingsSvc = new SettingsService(ctx.prisma);
          const settings = await settingsSvc.getSettings(input.businessId);
          const loginRule = (settings.alertRules as any).loginFailures;
          if (loginRule?.enabled) {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            const failCount = await ctx.prisma.auditLog.count({
              where: {
                actionType: { in: ["auth.login_failed", "auth.login_pin_failed"] },
                businessId: input.businessId,
                createdAt: { gte: oneHourAgo },
              },
            });
            if (failCount >= loginRule.threshold) {
              const alertSvc = new AlertService(ctx.prisma);
              await alertSvc.notifyAdmins(
                input.businessId,
                "Multiple failed login attempts",
                `${failCount} failed login attempt(s) in the last hour (PIN).`,
                "/audit",
                { rule: "loginFailures", method: "pin", failCount }
              );
            }
          }
        } catch {
          // Don't fail the login flow if alert fails
        }

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

      if (!user?.pin || !(await verifyPinHash(input.pin, user.pin))) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect PIN" });
      }

      return { valid: true };
    }),

  createUser: protectedProcedure
    .use(requireRole("business_admin"))
    .input(userCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const subService = new SubscriptionService(ctx.prisma);
      await subService.enforceUserLimit(input.businessId);

      if (input.pin) {
        if (await isPinTaken(ctx.prisma, input.businessId, input.pin)) {
          throw new TRPCError({ code: "CONFLICT", message: "PIN already in use by another staff member" });
        }
      }
      const passwordHash = await hashPassword(input.password);
      const pinHash = input.pin ? await hashPin(input.pin) : undefined;
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
          pin: pinHash,
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

      // Fetch current state to detect deactivation
      const currentUser = await ctx.prisma.user.findUniqueOrThrow({
        where: { id: userId, businessId: ctx.user.businessId },
        select: { isActive: true, email: true },
      });

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
          if (await isPinTaken(ctx.prisma, ctx.user.businessId, data.pin, userId)) {
            throw new TRPCError({ code: "CONFLICT", message: "PIN already in use by another staff member" });
          }
          updateData.pin = await hashPin(data.pin);
        } else {
          updateData.pin = null;
        }
      }
      const user = await ctx.prisma.user.update({ where: { id: userId }, data: updateData });

      const audit = new AuditService(ctx.prisma);
      // Exclude password and pin from metadata
      const { password: _, pin: _pin, ...metaFields } = data;
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "user.updated",
        objectType: "user",
        objectId: userId,
        metadata: metaFields,
      });

      // Alert admins when a staff member is deactivated
      if (data.isActive === false && currentUser.isActive === true) {
        try {
          const alertSvc = new AlertService(ctx.prisma);
          await alertSvc.notifyAdmins(
            ctx.user.businessId,
            "Staff member deactivated",
            `${ctx.user.email} deactivated ${currentUser.email}`,
            "/staff",
            { userId, email: currentUser.email }
          );
        } catch {
          // Don't fail update if alert fails
        }
      }

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
      // Log that a reset was requested, but never log the token or URL
      console.log("[PASSWORD RESET] Reset token created");

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

      const resetUser = await ctx.prisma.user.findUniqueOrThrow({
        where: { id: resetToken.userId },
        select: { businessId: true, email: true },
      });

      await ctx.prisma.$transaction([
        ctx.prisma.user.update({
          where: { id: resetToken.userId },
          data: { passwordHash },
        }),
        ctx.prisma.passwordResetToken.delete({
          where: { id: resetToken.id },
        }),
      ]);

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: resetUser.businessId,
        actorUserId: resetToken.userId,
        actionType: "auth.password_reset",
        objectType: "user",
        objectId: resetToken.userId,
        metadata: { email: resetUser.email },
      });

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

  // ── Staff Invites ──────────────────────────────────────────

  sendInvite: protectedProcedure
    .use(requireRole("business_admin"))
    .input(staffInviteCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const subService = new SubscriptionService(ctx.prisma);
      await subService.enforceUserLimit(input.businessId);

      // Reject if email already belongs to an active user in this business
      const existingUser = await ctx.prisma.user.findFirst({
        where: { email: input.email, businessId: input.businessId, isActive: true },
      });
      if (existingUser) {
        throw new TRPCError({ code: "CONFLICT", message: "A user with this email already exists in your business" });
      }

      // Auto-cancel any prior pending invite for same email+business
      await ctx.prisma.staffInvite.updateMany({
        where: {
          email: input.email,
          businessId: input.businessId,
          acceptedAt: null,
          cancelledAt: null,
        },
        data: { cancelledAt: new Date() },
      });

      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h

      const invite = await ctx.prisma.staffInvite.create({
        data: {
          businessId: input.businessId,
          email: input.email,
          role: input.role,
          locationIds: input.locationIds,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          token,
          expiresAt,
          invitedBy: ctx.user.userId,
        },
      });

      const business = await ctx.prisma.business.findUniqueOrThrow({
        where: { id: input.businessId },
        select: { name: true },
      });

      const inviteUrl = `${process.env.NEXTAUTH_URL}/accept-invite?token=${token}`;
      await EmailService.sendInviteEmail(
        input.email,
        business.name,
        ctx.user.email,
        inviteUrl
      );

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: input.businessId,
        actorUserId: ctx.user.userId,
        actionType: "user.invite_sent",
        objectType: "staff_invite",
        objectId: invite.id,
        metadata: { email: input.email, role: input.role },
      });

      return { id: invite.id, email: invite.email };
    }),

  listInvites: protectedProcedure
    .use(requireRole("business_admin"))
    .query(async ({ ctx }) => {
      const invites = await ctx.prisma.staffInvite.findMany({
        where: { businessId: ctx.user.businessId },
        include: {
          invitedByUser: { select: { firstName: true, lastName: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      const now = new Date();
      return invites.map((inv) => {
        let status: "pending" | "accepted" | "expired" | "cancelled";
        if (inv.acceptedAt) status = "accepted";
        else if (inv.cancelledAt) status = "cancelled";
        else if (inv.expiresAt < now) status = "expired";
        else status = "pending";

        const inviterName = inv.invitedByUser.firstName
          ? `${inv.invitedByUser.firstName} ${inv.invitedByUser.lastName ?? ""}`.trim()
          : inv.invitedByUser.email;

        return {
          id: inv.id,
          email: inv.email,
          role: inv.role,
          firstName: inv.firstName,
          lastName: inv.lastName,
          status,
          expiresAt: inv.expiresAt,
          createdAt: inv.createdAt,
          invitedBy: inviterName,
        };
      });
    }),

  cancelInvite: protectedProcedure
    .use(requireRole("business_admin"))
    .input(z.object({ inviteId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const invite = await ctx.prisma.staffInvite.findUniqueOrThrow({
        where: { id: input.inviteId },
      });

      if (invite.businessId !== ctx.user.businessId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found" });
      }
      if (invite.acceptedAt || invite.cancelledAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invite is no longer pending" });
      }

      await ctx.prisma.staffInvite.update({
        where: { id: input.inviteId },
        data: { cancelledAt: new Date() },
      });

      return { success: true };
    }),

  resendInvite: protectedProcedure
    .use(requireRole("business_admin"))
    .input(z.object({ inviteId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const oldInvite = await ctx.prisma.staffInvite.findUniqueOrThrow({
        where: { id: input.inviteId },
      });

      if (oldInvite.businessId !== ctx.user.businessId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found" });
      }

      // Cancel old invite
      await ctx.prisma.staffInvite.update({
        where: { id: input.inviteId },
        data: { cancelledAt: new Date() },
      });

      // Create fresh invite
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

      const newInvite = await ctx.prisma.staffInvite.create({
        data: {
          businessId: oldInvite.businessId,
          email: oldInvite.email,
          role: oldInvite.role,
          locationIds: oldInvite.locationIds,
          firstName: oldInvite.firstName,
          lastName: oldInvite.lastName,
          phone: oldInvite.phone,
          token,
          expiresAt,
          invitedBy: ctx.user.userId,
        },
      });

      const business = await ctx.prisma.business.findUniqueOrThrow({
        where: { id: oldInvite.businessId },
        select: { name: true },
      });

      const inviteUrl = `${process.env.NEXTAUTH_URL}/accept-invite?token=${token}`;
      await EmailService.sendInviteEmail(
        oldInvite.email,
        business.name,
        ctx.user.email,
        inviteUrl
      );

      return { id: newInvite.id, email: newInvite.email };
    }),

  getInviteInfo: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const invite = await ctx.prisma.staffInvite.findUnique({
        where: { token: input.token },
        include: { business: { select: { name: true } } },
      });

      if (!invite) {
        return { valid: false, reason: "not_found" as const };
      }
      if (invite.acceptedAt) {
        return { valid: false, reason: "accepted" as const };
      }
      if (invite.cancelledAt) {
        return { valid: false, reason: "cancelled" as const };
      }
      if (invite.expiresAt < new Date()) {
        return { valid: false, reason: "expired" as const };
      }

      return {
        valid: true,
        email: invite.email,
        firstName: invite.firstName,
        lastName: invite.lastName,
        businessName: invite.business.name,
        role: invite.role,
      };
    }),

  acceptInvite: publicProcedure
    .input(acceptInviteSchema)
    .mutation(async ({ ctx, input }) => {
      const invite = await ctx.prisma.staffInvite.findUnique({
        where: { token: input.token },
      });

      if (!invite) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found" });
      }
      if (invite.acceptedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This invite has already been accepted" });
      }
      if (invite.cancelledAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This invite has been cancelled" });
      }
      if (invite.expiresAt < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This invite has expired" });
      }

      // Check email not already taken
      const existingUser = await ctx.prisma.user.findUnique({
        where: { email: invite.email },
      });
      if (existingUser) {
        throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists" });
      }

      // Check PIN unique within business
      if (input.pin && await isPinTaken(ctx.prisma, invite.businessId, input.pin)) {
        throw new TRPCError({ code: "CONFLICT", message: "This PIN is already in use. Please choose a different one." });
      }

      // Re-check user limit at accept time
      const subService = new SubscriptionService(ctx.prisma);
      await subService.enforceUserLimit(invite.businessId);

      const passwordHash = await hashPassword(input.password);
      const primaryLocationId = invite.locationIds[0];

      const user = await ctx.prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            email: invite.email,
            passwordHash,
            role: invite.role,
            locationId: primaryLocationId,
            businessId: invite.businessId,
            firstName: input.firstName ?? invite.firstName,
            lastName: input.lastName ?? invite.lastName,
            phone: invite.phone,
            pin: input.pin ? await hashPin(input.pin) : null,
          },
        });

        // Create UserLocation rows for all locations
        for (const locId of invite.locationIds) {
          await tx.userLocation.create({
            data: {
              userId: newUser.id,
              locationId: locId,
              role: invite.role,
            },
          });
        }

        // Mark invite as accepted
        await tx.staffInvite.update({
          where: { id: invite.id },
          data: { acceptedAt: new Date() },
        });

        return newUser;
      });

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: invite.businessId,
        actorUserId: user.id,
        actionType: "user.invite_accepted",
        objectType: "user",
        objectId: user.id,
        metadata: { email: invite.email, role: invite.role, inviteId: invite.id },
      });

      // Notify admins
      try {
        const alertSvc = new AlertService(ctx.prisma);
        await alertSvc.notifyAdmins(
          invite.businessId,
          "Staff invite accepted",
          `${invite.email} accepted their invite and joined as ${invite.role}`,
          "/staff",
          { userId: user.id, email: invite.email, role: invite.role }
        );
      } catch {
        // Don't fail accept if alert fails
      }

      // Auto-login: return tokens
      const payload = await buildUserPayload(ctx.prisma, user.id);
      const accessToken = createAccessToken(payload);
      const refreshToken = createRefreshToken(payload);

      return {
        accessToken,
        refreshToken,
        tokenType: "bearer",
        expiresIn: 1800,
      };
    }),
});
