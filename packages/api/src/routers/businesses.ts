import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure, requireRole, requireBusinessAccess, isPlatformAdmin } from "../trpc";
import { businessCreateSchema, businessUpdateSchema } from "@barstock/validators";
import { z } from "zod";

export const businessesRouter = router({
  create: protectedProcedure
    .use(requireRole("platform_admin"))
    .input(businessCreateSchema)
    .mutation(({ ctx, input }) => ctx.prisma.business.create({ data: input })),

  list: protectedProcedure.query(async ({ ctx }) => {
    if (isPlatformAdmin(ctx.user)) {
      return ctx.prisma.business.findMany();
    }
    return ctx.prisma.business.findMany({ where: { id: ctx.user.businessId } });
  }),

  getById: protectedProcedure
    .use(requireBusinessAccess())
    .input(z.object({ businessId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      ctx.prisma.business.findUniqueOrThrow({ where: { id: input.businessId } })
    ),

  update: protectedProcedure
    .use(requireRole("business_admin"))
    .use(requireBusinessAccess())
    .input(z.object({ businessId: z.string().uuid() }).merge(businessUpdateSchema))
    .mutation(({ ctx, input }) => {
      const { businessId, ...data } = input;
      return ctx.prisma.business.update({ where: { id: businessId }, data });
    }),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const business = await ctx.prisma.business.findUnique({
        where: { slug: input.slug },
        select: { id: true, name: true, slug: true },
      });
      if (!business) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Business not found",
        });
      }
      return business;
    }),
});
