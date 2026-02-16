import type { ExtendedPrismaClient } from "@barstock/database";
import type {
  ArtworkCreateInput,
  ArtworkUpdateInput,
  ArtworkStatusUpdateInput,
  ArtworkListInput,
} from "@barstock/validators";
import type { ArtworkStatusT } from "@prisma/client";
import { AuditService } from "./audit.service";
import { createStorageAdapter } from "./storage";
import { TRPCError } from "@trpc/server";

const VALID_TRANSITIONS: Record<string, string[]> = {
  on_wall: ["reserved_pending_payment", "reserved", "sold", "removed", "removed_not_sold"],
  reserved_pending_payment: ["on_wall", "reserved", "sold", "pending_payment_issue"],
  reserved: ["on_wall", "sold", "removed"],
  pending_payment_issue: ["on_wall", "reserved_pending_payment", "sold", "removed"],
  sold: [], // terminal
  removed: ["on_wall"],
  removed_not_sold: ["on_wall"],
};

const MAX_PHOTOS = 3;

export class ArtworkService {
  private audit: AuditService;

  constructor(private prisma: ExtendedPrismaClient) {
    this.audit = new AuditService(prisma);
  }

  async create(data: ArtworkCreateInput, actorUserId: string) {
    let commissionPubPercent = data.commissionPubPercent;

    if (commissionPubPercent === undefined) {
      const artist = await this.prisma.artist.findUniqueOrThrow({
        where: { id: data.artistId },
        select: { defaultCommissionPubPercent: true },
      });
      commissionPubPercent = Number(artist.defaultCommissionPubPercent);
    }

    const artwork = await this.prisma.artwork.create({
      data: {
        businessId: data.businessId,
        artistId: data.artistId,
        title: data.title,
        medium: data.medium,
        dimensions: data.dimensions,
        listPriceCents: data.listPriceCents,
        locationInPub: data.locationInPub,
        agreementType: data.agreementType,
        saleMode: data.saleMode,
        commissionPubPercent,
        dateHung: data.dateHung ? new Date(data.dateHung) : undefined,
        notes: data.notes,
      },
    });

    await this.audit.log({
      businessId: data.businessId,
      actorUserId,
      actionType: "artwork.created",
      objectType: "artwork",
      objectId: artwork.id,
      metadata: { title: data.title, artistId: data.artistId },
    });

    return artwork;
  }

  async update(data: ArtworkUpdateInput, actorUserId: string) {
    const { id, businessId, ...fields } = data;

    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        if (key === "dateHung" && value !== null) {
          updateData[key] = new Date(value as string);
        } else {
          updateData[key] = value;
        }
      }
    }

    const artwork = await this.prisma.artwork.update({
      where: { id },
      data: updateData,
    });

    await this.audit.log({
      businessId,
      actorUserId,
      actionType: "artwork.updated",
      objectType: "artwork",
      objectId: id,
      metadata: updateData,
    });

    return artwork;
  }

  async updateStatus(data: ArtworkStatusUpdateInput, actorUserId: string) {
    const current = await this.prisma.artwork.findUniqueOrThrow({
      where: { id: data.id },
      select: { status: true, businessId: true },
    });

    const allowed = VALID_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(data.status)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Cannot transition from "${current.status}" to "${data.status}"`,
      });
    }

    const artwork = await this.prisma.artwork.update({
      where: { id: data.id },
      data: { status: data.status as ArtworkStatusT },
    });

    await this.audit.log({
      businessId: current.businessId,
      actorUserId,
      actionType: "artwork.status_changed",
      objectType: "artwork",
      objectId: data.id,
      metadata: { from: current.status, to: data.status },
    });

    return artwork;
  }

  async list(params: ArtworkListInput) {
    const { businessId, artistId, status, cursor, limit } = params;

    const where: Record<string, unknown> = { businessId };
    if (artistId) where.artistId = artistId;
    if (status) where.status = status;

    const items = await this.prisma.artwork.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: "desc" },
      include: {
        artist: { select: { id: true, name: true } },
        photos: { orderBy: { sortOrder: "asc" }, take: 1 },
      },
    });

    let nextCursor: string | undefined;
    if (items.length > limit) {
      const next = items.pop()!;
      nextCursor = next.id;
    }

    return { items, nextCursor };
  }

  async getById(id: string) {
    return this.prisma.artwork.findUniqueOrThrow({
      where: { id },
      include: {
        artist: true,
        photos: { orderBy: { sortOrder: "asc" } },
      },
    });
  }

  async addPhoto(
    artworkId: string,
    buffer: Buffer,
    filename: string,
    actorUserId: string
  ) {
    const photoCount = await this.prisma.artworkPhoto.count({
      where: { artworkId },
    });

    if (photoCount >= MAX_PHOTOS) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Maximum of ${MAX_PHOTOS} photos per artwork`,
      });
    }

    const storage = createStorageAdapter();
    const key = `artworks/${artworkId}/${Date.now()}-${filename}`;
    const url = await storage.upload(buffer, key);

    const photo = await this.prisma.artworkPhoto.create({
      data: {
        artworkId,
        storageKey: key,
        url,
        sortOrder: photoCount,
      },
    });

    const artwork = await this.prisma.artwork.findUnique({
      where: { id: artworkId },
      select: { businessId: true },
    });

    if (artwork) {
      await this.audit.log({
        businessId: artwork.businessId,
        actorUserId,
        actionType: "artwork.photo_added",
        objectType: "artwork_photo",
        objectId: photo.id,
        metadata: { artworkId, filename },
      });
    }

    return photo;
  }

  async removePhoto(photoId: string, actorUserId: string) {
    const photo = await this.prisma.artworkPhoto.findUniqueOrThrow({
      where: { id: photoId },
      include: { artwork: { select: { businessId: true } } },
    });

    const storage = createStorageAdapter();
    await storage.delete(photo.storageKey);
    if (photo.thumbnailKey) {
      await storage.delete(photo.thumbnailKey);
    }

    await this.prisma.artworkPhoto.delete({ where: { id: photoId } });

    await this.audit.log({
      businessId: photo.artwork.businessId,
      actorUserId,
      actionType: "artwork.photo_removed",
      objectType: "artwork_photo",
      objectId: photoId,
      metadata: { artworkId: photo.artworkId },
    });
  }

  async reorderPhotos(artworkId: string, photoIds: string[], actorUserId: string) {
    await this.prisma.$transaction(
      photoIds.map((id, index) =>
        this.prisma.artworkPhoto.update({
          where: { id },
          data: { sortOrder: index },
        })
      )
    );

    const artwork = await this.prisma.artwork.findUnique({
      where: { id: artworkId },
      select: { businessId: true },
    });

    if (artwork) {
      await this.audit.log({
        businessId: artwork.businessId,
        actorUserId,
        actionType: "artwork.photos_reordered",
        objectType: "artwork",
        objectId: artworkId,
        metadata: { photoIds },
      });
    }
  }
}
