import { TRPCError } from "@trpc/server";
import {
  router,
  protectedProcedure,
  requireRole,
  requireBusinessAccess,
  requireCapability,
} from "../trpc";
import {
  artworkCreateSchema,
  artworkUpdateSchema,
  artworkStatusUpdateSchema,
  artworkListSchema,
  artworkGetSchema,
  artworkAddPhotoSchema,
  artworkRemovePhotoSchema,
  artworkReorderPhotosSchema,
} from "@barstock/validators";
import { ArtworkService } from "../services/artwork.service";
import { SettingsService } from "../services/settings.service";
import { ROLE_HIERARCHY } from "@barstock/types";
import type { UserPayload } from "../context";

function canCreateArtwork(user: UserPayload, caps: { staffArtEntryMode: boolean }) {
  const highest = ROLE_HIERARCHY[user.highestRole];
  if (highest >= ROLE_HIERARCHY.curator) return true;
  if (highest >= ROLE_HIERARCHY.staff && caps.staffArtEntryMode) return true;
  return false;
}

function canUpdateArtwork(
  user: UserPayload,
  caps: { staffArtEntryMode: boolean }
): "full" | "limited" | false {
  const highest = ROLE_HIERARCHY[user.highestRole];
  if (highest >= ROLE_HIERARCHY.business_admin) return "full";
  if (highest >= ROLE_HIERARCHY.curator) return "limited";
  if (highest >= ROLE_HIERARCHY.staff && caps.staffArtEntryMode) return "limited";
  return false;
}

export const artworksRouter = router({
  create: protectedProcedure
    .use(requireCapability("artSalesEnabled"))
    .use(requireRole("staff"))
    .use(requireBusinessAccess())
    .input(artworkCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const settings = new SettingsService(ctx.prisma);
      const caps = (await settings.getSettings(input.businessId)).capabilities;

      if (!canCreateArtwork(ctx.user, caps)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions to create artworks" });
      }

      const service = new ArtworkService(ctx.prisma);
      return service.create(input, ctx.user.userId);
    }),

  list: protectedProcedure
    .use(requireCapability("artSalesEnabled"))
    .use(requireBusinessAccess())
    .input(artworkListSchema)
    .query(async ({ ctx, input }) => {
      const service = new ArtworkService(ctx.prisma);
      return service.list(input);
    }),

  getById: protectedProcedure
    .use(requireCapability("artSalesEnabled"))
    .use(requireBusinessAccess())
    .input(artworkGetSchema)
    .query(async ({ ctx, input }) => {
      const service = new ArtworkService(ctx.prisma);
      return service.getById(input.id);
    }),

  update: protectedProcedure
    .use(requireCapability("artSalesEnabled"))
    .use(requireRole("staff"))
    .use(requireBusinessAccess())
    .input(artworkUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const settings = new SettingsService(ctx.prisma);
      const caps = (await settings.getSettings(input.businessId)).capabilities;
      const access = canUpdateArtwork(ctx.user, caps);

      if (!access) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions to update artworks" });
      }

      if (access === "limited") {
        // curator/staff cannot edit commissionPubPercent
        if (input.commissionPubPercent !== undefined) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Cannot update commissionPubPercent with your role",
          });
        }
      }

      const service = new ArtworkService(ctx.prisma);
      return service.update(input, ctx.user.userId);
    }),

  updateStatus: protectedProcedure
    .use(requireCapability("artSalesEnabled"))
    .use(requireRole("manager"))
    .use(requireBusinessAccess())
    .input(artworkStatusUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ArtworkService(ctx.prisma);
      return service.updateStatus(input, ctx.user.userId);
    }),

  addPhoto: protectedProcedure
    .use(requireCapability("artSalesEnabled"))
    .use(requireRole("staff"))
    .use(requireBusinessAccess())
    .input(artworkAddPhotoSchema)
    .mutation(async ({ ctx, input }) => {
      const settings = new SettingsService(ctx.prisma);
      const caps = (await settings.getSettings(input.businessId)).capabilities;

      if (!canCreateArtwork(ctx.user, caps)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions to add photos" });
      }

      const buffer = Buffer.from(input.base64Data, "base64");
      const service = new ArtworkService(ctx.prisma);
      return service.addPhoto(input.artworkId, buffer, input.filename, ctx.user.userId);
    }),

  removePhoto: protectedProcedure
    .use(requireCapability("artSalesEnabled"))
    .use(requireRole("curator"))
    .use(requireBusinessAccess())
    .input(artworkRemovePhotoSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ArtworkService(ctx.prisma);
      return service.removePhoto(input.photoId, ctx.user.userId);
    }),

  reorderPhotos: protectedProcedure
    .use(requireCapability("artSalesEnabled"))
    .use(requireRole("curator"))
    .use(requireBusinessAccess())
    .input(artworkReorderPhotosSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ArtworkService(ctx.prisma);
      return service.reorderPhotos(input.artworkId, input.photoIds, ctx.user.userId);
    }),
});
