import type { ExtendedPrismaClient } from "@barstock/database";
import type { ArtSaleCreateInput, ArtSaleListInput } from "@barstock/validators";
import type { PaymentMethodT } from "@prisma/client";
import { AuditService } from "./audit.service";
import { TRPCError } from "@trpc/server";

export class ArtSaleService {
  private audit: AuditService;

  constructor(private prisma: ExtendedPrismaClient) {
    this.audit = new AuditService(prisma);
  }

  async recordSale(input: ArtSaleCreateInput, userId: string) {
    const artwork = await this.prisma.artwork.findUniqueOrThrow({
      where: { id: input.artworkId },
      include: { artist: true },
    });

    if (artwork.businessId !== input.businessId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Artwork does not belong to this business",
      });
    }

    if (artwork.status !== "on_wall") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Cannot sell artwork with status "${artwork.status}". Must be "on_wall".`,
      });
    }

    const commissionPercent = Number(artwork.commissionPubPercent);
    const pubCutCents = Math.round(input.salePriceCents * commissionPercent / 100);
    const artistCutCents = input.salePriceCents - pubCutCents;

    const sale = await this.prisma.$transaction(async (tx) => {
      const created = await tx.artSale.create({
        data: {
          businessId: input.businessId,
          artworkId: input.artworkId,
          artistId: artwork.artistId,
          salePriceCents: input.salePriceCents,
          commissionPubPercent: commissionPercent,
          pubCutCents,
          artistCutCents,
          paymentMethod: input.paymentMethod as PaymentMethodT,
          buyerName: input.buyerName,
          buyerContact: input.buyerContact,
          notes: input.notes,
          recordedByUserId: userId,
        },
      });

      await tx.artwork.update({
        where: { id: input.artworkId },
        data: { status: "sold" },
      });

      return created;
    });

    await this.audit.log({
      businessId: input.businessId,
      actorUserId: userId,
      actionType: "art_sale.recorded",
      objectType: "art_sale",
      objectId: sale.id,
      metadata: {
        artworkId: input.artworkId,
        artistId: artwork.artistId,
        salePriceCents: input.salePriceCents,
        pubCutCents,
        artistCutCents,
      },
    });

    return sale;
  }

  async list(params: ArtSaleListInput) {
    const { businessId, artistId, artworkId, cursor, limit } = params;

    const where: Record<string, unknown> = { businessId };
    if (artistId) where.artistId = artistId;
    if (artworkId) where.artworkId = artworkId;

    const items = await this.prisma.artSale.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { soldAt: "desc" },
      include: {
        artwork: { select: { id: true, title: true } },
        artist: { select: { id: true, name: true } },
        recordedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    let nextCursor: string | undefined;
    if (items.length > limit) {
      const next = items.pop()!;
      nextCursor = next.id;
    }

    return { items, nextCursor };
  }
}
