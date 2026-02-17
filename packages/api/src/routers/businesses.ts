import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure, requireRole, requireBusinessAccess, isPlatformAdmin } from "../trpc";
import { businessCreateSchema, businessUpdateSchema } from "@barstock/validators";
import { createStorageAdapter } from "../services/storage";
import { z } from "zod";

export const businessesRouter = router({
  create: protectedProcedure
    .use(requireRole("platform_admin"))
    .input(businessCreateSchema)
    .mutation(({ ctx, input }) => ctx.prisma.business.create({ data: input })),

  list: protectedProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          activeOnly: z.boolean().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      if (isPlatformAdmin(ctx.user)) {
        const where: any = {};
        if (input?.activeOnly) {
          where.active = true;
        }
        if (input?.search) {
          where.OR = [
            { name: { contains: input.search, mode: "insensitive" } },
            { slug: { contains: input.search, mode: "insensitive" } },
            { contactEmail: { contains: input.search, mode: "insensitive" } },
          ];
        }
        return ctx.prisma.business.findMany({
          where,
          include: {
            _count: { select: { locations: true, users: true } },
          },
          orderBy: { createdAt: "asc" },
        });
      }
      return ctx.prisma.business.findMany({ where: { id: ctx.user.businessId } });
    }),

  getById: protectedProcedure
    .use(requireBusinessAccess())
    .input(z.object({ businessId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      ctx.prisma.business.findUniqueOrThrow({
        where: { id: input.businessId },
        include: {
          locations: true,
          businessSettings: true,
          _count: { select: { users: true } },
        },
      })
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
        select: { id: true, name: true, slug: true, logoUrl: true },
      });
      if (!business) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Business not found",
        });
      }
      return business;
    }),

  getPublicInfo: publicProcedure
    .input(z.object({ businessId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const business = await ctx.prisma.business.findUnique({
        where: { id: input.businessId },
        select: { id: true, name: true, slug: true, logoUrl: true },
      });
      if (!business) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Business not found",
        });
      }
      return business;
    }),

  uploadLogo: protectedProcedure
    .use(requireRole("business_admin"))
    .use(requireBusinessAccess())
    .input(
      z.object({
        businessId: z.string().uuid(),
        base64Data: z.string(),
        filename: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.base64Data, "base64");
      const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `logos/${input.businessId}/${Date.now()}-${safeName}`;
      const storage = createStorageAdapter();

      // Delete old logo if exists
      const existing = await ctx.prisma.business.findUnique({
        where: { id: input.businessId },
        select: { logoKey: true },
      });
      if (existing?.logoKey) {
        await storage.delete(existing.logoKey);
      }

      const logoUrl = await storage.upload(buffer, key);
      await ctx.prisma.business.update({
        where: { id: input.businessId },
        data: { logoUrl, logoKey: key },
      });

      return { logoUrl };
    }),
});
