import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure, requireRole } from "../trpc";
import {
  platformUserCreateSchema,
  platformUserUpdateSchema,
  platformUserListSchema,
} from "@barstock/validators";
import { hashPassword } from "../services/auth.service";

export const usersRouter = router({
  listForBusiness: protectedProcedure
    .use(requireRole("business_admin"))
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
    .input(platformUserCreateSchema)
    .mutation(async ({ ctx, input }) => {
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
    .input(z.object({ userId: z.string().uuid() }).merge(platformUserUpdateSchema))
    .mutation(async ({ ctx, input }) => {
      const { userId, ...data } = input;
      return ctx.prisma.user.update({
        where: { id: userId },
        data,
      });
    }),

  deactivate: protectedProcedure
    .use(requireRole("platform_admin"))
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.user.update({
        where: { id: input.userId },
        data: { isActive: false },
      });
    }),
});
