import { router, publicProcedure, protectedProcedure } from "../trpc";
import { requireRole } from "../trpc";
import { loginSchema, refreshTokenSchema, userCreateSchema, userUpdateSchema, userLocationCreateSchema } from "@barstock/validators";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
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
    .use(requireRole("admin"))
    .input(userCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const passwordHash = await hashPassword(input.password);
      return ctx.prisma.user.create({
        data: {
          email: input.email,
          passwordHash,
          role: input.role,
          locationId: input.locationId,
        },
      });
    }),

  listUsers: protectedProcedure
    .use(requireRole("admin"))
    .query(({ ctx }) => ctx.prisma.user.findMany({
      where: { locationId: { in: ctx.user.locationIds } },
      select: {
        id: true,
        email: true,
        role: true,
        locationId: true,
        isActive: true,
        createdAt: true,
      },
    })),

  updateUser: protectedProcedure
    .use(requireRole("admin"))
    .input(z.object({ userId: z.string().uuid() }).merge(userUpdateSchema))
    .mutation(async ({ ctx, input }) => {
      const { userId, ...data } = input;
      const updateData: any = {};
      if (data.email) updateData.email = data.email;
      if (data.password) updateData.passwordHash = await hashPassword(data.password);
      if (data.isActive !== undefined) updateData.isActive = data.isActive;
      return ctx.prisma.user.update({ where: { id: userId }, data: updateData });
    }),

  grantLocationAccess: protectedProcedure
    .use(requireRole("admin"))
    .input(userLocationCreateSchema)
    .mutation(({ ctx, input }) =>
      ctx.prisma.userLocation.create({ data: input })
    ),

  revokeLocationAccess: protectedProcedure
    .use(requireRole("admin"))
    .input(z.object({ userId: z.string().uuid(), locationId: z.string().uuid() }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.userLocation.delete({
        where: { userId_locationId: input },
      })
    ),
});
