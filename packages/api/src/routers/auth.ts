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
} from "../services/auth.service";

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
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
    }

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

  createUser: protectedProcedure
    .use(requireRole("business_admin"))
    .input(userCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const passwordHash = await hashPassword(input.password);
      return ctx.prisma.user.create({
        data: {
          email: input.email,
          passwordHash,
          role: input.role,
          locationId: input.locationId,
          businessId: input.businessId,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
        },
      });
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
      return ctx.prisma.user.update({ where: { id: userId }, data: updateData });
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
    .mutation(({ ctx, input }) =>
      ctx.prisma.userLocation.create({ data: input })
    ),

  revokeLocationAccess: protectedProcedure
    .use(requireRole("business_admin"))
    .input(z.object({ userId: z.string().uuid(), locationId: z.string().uuid() }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.userLocation.delete({
        where: { userId_locationId: input },
      })
    ),

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
});
