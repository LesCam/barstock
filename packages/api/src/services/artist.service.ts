import type { ExtendedPrismaClient } from "@barstock/database";
import type { ArtistCreateInput, ArtistUpdateInput, ArtistListInput } from "@barstock/validators";
import { AuditService } from "./audit.service";

export class ArtistService {
  private audit: AuditService;

  constructor(private prisma: ExtendedPrismaClient) {
    this.audit = new AuditService(prisma);
  }

  async create(data: ArtistCreateInput, actorUserId: string) {
    const artist = await this.prisma.artist.create({
      data: {
        businessId: data.businessId,
        name: data.name,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        payoutMethod: data.payoutMethod,
        defaultCommissionPubPercent: data.defaultCommissionPubPercent,
        bio: data.bio,
        notes: data.notes,
      },
    });

    await this.audit.log({
      businessId: data.businessId,
      actorUserId,
      actionType: "artist.created",
      objectType: "artist",
      objectId: artist.id,
      metadata: { name: data.name },
    });

    return artist;
  }

  async update(data: ArtistUpdateInput, actorUserId: string) {
    const { id, businessId, ...updateData } = data;

    const artist = await this.prisma.artist.update({
      where: { id },
      data: updateData,
    });

    await this.audit.log({
      businessId,
      actorUserId,
      actionType: "artist.updated",
      objectType: "artist",
      objectId: id,
      metadata: updateData,
    });

    return artist;
  }

  async list(params: ArtistListInput) {
    const { businessId, activeOnly, cursor, limit } = params;

    const where: Record<string, unknown> = { businessId };
    if (activeOnly) where.active = true;

    const items = await this.prisma.artist.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { name: "asc" },
      include: {
        _count: { select: { artworks: true } },
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
    return this.prisma.artist.findUniqueOrThrow({
      where: { id },
      include: {
        _count: { select: { artworks: true } },
      },
    });
  }

  async deactivate(id: string, businessId: string, actorUserId: string) {
    const artist = await this.prisma.artist.update({
      where: { id },
      data: { active: false },
    });

    await this.audit.log({
      businessId,
      actorUserId,
      actionType: "artist.deactivated",
      objectType: "artist",
      objectId: id,
    });

    return artist;
  }
}
