import type { ExtendedPrismaClient } from "@barstock/database";

interface SendParams {
  businessId: string;
  recipientUserId: string;
  title: string;
  body?: string;
  linkUrl?: string;
  imageUrl?: string;
  metadata?: Record<string, unknown>;
}

interface ListParams {
  cursor?: string;
  limit: number;
}

export class NotificationService {
  constructor(private prisma: ExtendedPrismaClient) {}

  async send(params: SendParams) {
    return this.prisma.notification.create({
      data: {
        businessId: params.businessId,
        recipientUserId: params.recipientUserId,
        title: params.title,
        body: params.body,
        linkUrl: params.linkUrl,
        imageUrl: params.imageUrl,
        metadataJson: params.metadata ?? undefined,
      },
    });
  }

  async list(userId: string, params: ListParams) {
    const { cursor, limit } = params;

    const items = await this.prisma.notification.findMany({
      where: { recipientUserId: userId },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: "desc" },
    });

    let nextCursor: string | undefined;
    if (items.length > limit) {
      const next = items.pop()!;
      nextCursor = next.id;
    }

    return { items, nextCursor };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { recipientUserId: userId, isRead: false },
    });
  }

  async markRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, recipientUserId: userId },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { recipientUserId: userId, isRead: false },
      data: { isRead: true },
    });
  }
}
