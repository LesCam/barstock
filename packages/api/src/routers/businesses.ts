import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure, requireRole, requireBusinessAccess, isPlatformAdmin, forceBusinessId, requireRecentAuth } from "../trpc";
import { businessCreateSchema, businessUpdateSchema, provisionBusinessSchema } from "@barstock/validators";
import { createStorageAdapter } from "../services/storage";
import { hashPassword } from "../services/auth.service";
import { DEFAULT_SETTINGS } from "../services/settings.service";
import { TIER_DEFAULTS } from "../services/subscription.constants";
import { z } from "zod";

const DEFAULT_CATEGORIES = [
  { name: "Packaged Beer", countingMethod: "unit_count" as const, sortOrder: 0 },
  { name: "Keg Beer", countingMethod: "keg" as const, sortOrder: 1 },
  { name: "Liquor", countingMethod: "weighable" as const, defaultDensity: 0.95, sortOrder: 2 },
  { name: "Wine", countingMethod: "weighable" as const, defaultDensity: 0.99, sortOrder: 3 },
  { name: "Food", countingMethod: "unit_count" as const, sortOrder: 4 },
  { name: "Misc", countingMethod: "unit_count" as const, sortOrder: 5 },
];

const DEFAULT_KEG_SIZES = [
  { name: "Half Barrel (15.5 gal)", totalOz: 1984 },
  { name: "Sixtel (5.16 gal)", totalOz: 661 },
  { name: "Quarter Barrel (7.75 gal)", totalOz: 992 },
];

export const businessesRouter = router({
  create: protectedProcedure
    .use(requireRole("platform_admin"))
    .input(businessCreateSchema)
    .mutation(({ ctx, input }) => ctx.prisma.business.create({ data: input })),

  provision: protectedProcedure
    .use(requireRole("platform_admin"))
    .input(provisionBusinessSchema)
    .mutation(async ({ ctx, input }) => {
      const {
        locationName,
        timezone,
        closeoutHour,
        adminEmail,
        adminPassword,
        adminFirstName,
        adminLastName,
        subscriptionTier,
        ...businessData
      } = input;

      const passwordHash = await hashPassword(adminPassword);

      return ctx.prisma.$transaction(async (tx) => {
        // 1. Create business
        const business = await tx.business.create({
          data: { ...businessData, subscriptionTier },
        });

        // 2. Create first location
        const location = await tx.location.create({
          data: {
            name: locationName,
            timezone,
            closeoutHour,
            businessId: business.id,
          },
        });

        // 3. Create default categories
        await tx.inventoryItemCategory.createMany({
          data: DEFAULT_CATEGORIES.map((cat) => ({
            businessId: business.id,
            name: cat.name,
            countingMethod: cat.countingMethod,
            defaultDensity: cat.defaultDensity ?? null,
            sortOrder: cat.sortOrder,
          })),
        });

        // 4. Create default keg sizes
        await tx.kegSize.createMany({
          data: DEFAULT_KEG_SIZES.map((ks) => ({
            businessId: business.id,
            name: ks.name,
            totalOz: ks.totalOz,
          })),
        });

        // 5. Create business settings with tier capabilities
        const tierCapabilities = TIER_DEFAULTS[subscriptionTier]?.capabilities ?? {};
        const initialSettings = {
          ...DEFAULT_SETTINGS,
          capabilities: {
            ...DEFAULT_SETTINGS.capabilities,
            ...tierCapabilities,
          },
        };
        await tx.businessSettings.create({
          data: {
            businessId: business.id,
            settingsJson: initialSettings as any,
          },
        });

        // 6. Create admin user
        const user = await tx.user.create({
          data: {
            email: adminEmail,
            firstName: adminFirstName ?? null,
            lastName: adminLastName ?? null,
            passwordHash,
            role: "business_admin",
            locationId: location.id,
            businessId: business.id,
          },
        });

        // 7. Create user-location mapping
        await tx.userLocation.create({
          data: {
            userId: user.id,
            locationId: location.id,
            role: "business_admin",
          },
        });

        return {
          business: { id: business.id, name: business.name, slug: business.slug },
          location: { id: location.id, name: location.name },
          user: { id: user.id, email: user.email },
        };
      });
    }),

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
    .use(forceBusinessId())
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
    .use(requireRecentAuth())
    .use(forceBusinessId())
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
    .use(requireRecentAuth())
    .use(forceBusinessId())
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
