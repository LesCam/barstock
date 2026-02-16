import { TRPCError } from "@trpc/server";
import {
  router,
  protectedProcedure,
  requireRole,
  requireBusinessAccess,
  requireCapability,
} from "../trpc";
import {
  artistCreateSchema,
  artistUpdateSchema,
  artistListSchema,
  artistDeactivateSchema,
} from "@barstock/validators";
import { ArtistService } from "../services/artist.service";
import { SettingsService } from "../services/settings.service";
import { ROLE_HIERARCHY } from "@barstock/types";
import type { UserPayload } from "../context";

function canCreateArtist(user: UserPayload, capabilities: { staffArtEntryMode: boolean }) {
  const highest = ROLE_HIERARCHY[user.highestRole];
  // business_admin (5), curator (3)
  if (highest >= ROLE_HIERARCHY.curator) return true;
  // staff (2) only if staffArtEntryMode
  if (highest >= ROLE_HIERARCHY.staff && capabilities.staffArtEntryMode) return true;
  return false;
}

function canUpdateArtist(
  user: UserPayload,
  capabilities: { staffArtEntryMode: boolean }
): "full" | "limited" | false {
  const highest = ROLE_HIERARCHY[user.highestRole];
  if (highest >= ROLE_HIERARCHY.business_admin) return "full";
  if (highest >= ROLE_HIERARCHY.curator) return "limited";
  if (highest >= ROLE_HIERARCHY.staff && capabilities.staffArtEntryMode) return "limited";
  return false;
}

export const artistsRouter = router({
  create: protectedProcedure
    .use(requireCapability("artSalesEnabled"))
    .use(requireRole("staff"))
    .use(requireBusinessAccess())
    .input(artistCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const settings = new SettingsService(ctx.prisma);
      const caps = (await settings.getSettings(input.businessId)).capabilities;

      if (!canCreateArtist(ctx.user, caps)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions to create artists" });
      }

      const service = new ArtistService(ctx.prisma);
      return service.create(input, ctx.user.userId);
    }),

  list: protectedProcedure
    .use(requireCapability("artSalesEnabled"))
    .use(requireBusinessAccess())
    .input(artistListSchema)
    .query(async ({ ctx, input }) => {
      const service = new ArtistService(ctx.prisma);
      return service.list(input);
    }),

  getById: protectedProcedure
    .use(requireCapability("artSalesEnabled"))
    .use(requireBusinessAccess())
    .input(artistDeactivateSchema.pick({ id: true, businessId: true }))
    .query(async ({ ctx, input }) => {
      const service = new ArtistService(ctx.prisma);
      return service.getById(input.id);
    }),

  update: protectedProcedure
    .use(requireCapability("artSalesEnabled"))
    .use(requireRole("staff"))
    .use(requireBusinessAccess())
    .input(artistUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const settings = new SettingsService(ctx.prisma);
      const caps = (await settings.getSettings(input.businessId)).capabilities;
      const access = canUpdateArtist(ctx.user, caps);

      if (!access) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions to update artists" });
      }

      if (access === "limited") {
        // curator/staff can only update bio, contact, notes
        const allowed = new Set(["id", "businessId", "bio", "contactEmail", "contactPhone", "notes"]);
        for (const key of Object.keys(input)) {
          if (!allowed.has(key) && (input as any)[key] !== undefined) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: `Cannot update field "${key}" with your role`,
            });
          }
        }
      }

      const service = new ArtistService(ctx.prisma);
      return service.update(input, ctx.user.userId);
    }),

  deactivate: protectedProcedure
    .use(requireCapability("artSalesEnabled"))
    .use(requireRole("business_admin"))
    .use(requireBusinessAccess())
    .input(artistDeactivateSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ArtistService(ctx.prisma);
      return service.deactivate(input.id, input.businessId, ctx.user.userId);
    }),
});
