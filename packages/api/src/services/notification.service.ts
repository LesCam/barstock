import type { ExtendedPrismaClient } from "@barstock/database";
import { PushService } from "./push.service";
import { EmailService } from "./email.service";
import { notificationEmitter } from "../lib/notification-emitter";

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
    const notification = await this.prisma.notification.create({
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

    // Push notification (fire-and-forget)
    try {
      const pushSvc = new PushService(this.prisma);
      pushSvc.sendPush(params.recipientUserId, params.title, params.body, {
        notificationId: notification.id,
        linkUrl: params.linkUrl,
      });
    } catch {
      // best-effort
    }

    // Email for alert-type notifications (fire-and-forget)
    if (params.metadata?.rule) {
      try {
        const user = await this.prisma.user.findUnique({
          where: { id: params.recipientUserId },
          select: { email: true },
        });
        if (user?.email) {
          await EmailService.sendAlertEmail(
            user.email,
            params.title,
            params.body ?? "",
            params.linkUrl
          );
        }
      } catch {
        // best-effort
      }
    }

    // SSE broadcast (fire-and-forget)
    try {
      notificationEmitter.notifyUser(params.recipientUserId);
    } catch {
      // best-effort
    }

    return notification;
  }

  async getAlertHistory(
    businessId: string,
    ruleType?: string,
    fromDate?: Date,
    toDate?: Date,
    limit = 50
  ) {
    const conditions: string[] = [
      `business_id = $1`,
      `metadata_json->>'rule' IS NOT NULL`,
    ];
    const values: unknown[] = [businessId];
    let idx = 2;

    if (ruleType) {
      conditions.push(`metadata_json->>'rule' = $${idx}`);
      values.push(ruleType);
      idx++;
    }
    if (fromDate) {
      conditions.push(`created_at >= $${idx}`);
      values.push(fromDate);
      idx++;
    }
    if (toDate) {
      conditions.push(`created_at <= $${idx}`);
      values.push(toDate);
      idx++;
    }

    const rows = await this.prisma.$queryRawUnsafe<
      {
        id: string;
        title: string;
        body: string | null;
        link_url: string | null;
        rule: string;
        created_at: Date;
        is_read: boolean;
      }[]
    >(
      `SELECT id, title, body, link_url, metadata_json->>'rule' AS rule, created_at, is_read
       FROM notifications
       WHERE ${conditions.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT $${idx}`,
      ...values,
      limit
    );

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      linkUrl: r.link_url,
      rule: r.rule,
      createdAt: r.created_at,
      isRead: r.is_read,
    }));
  }

  async getAlertFrequency(businessId: string, weeksBack = 4) {
    const rows = await this.prisma.$queryRawUnsafe<
      { rule: string; day: Date; count: bigint }[]
    >(
      `SELECT metadata_json->>'rule' AS rule,
              date_trunc('day', created_at) AS day,
              COUNT(*) AS count
       FROM notifications
       WHERE business_id = $1
         AND metadata_json->>'rule' IS NOT NULL
         AND created_at >= NOW() - ($2 || ' weeks')::interval
       GROUP BY rule, day
       ORDER BY day`,
      businessId,
      weeksBack.toString()
    );

    return rows.map((r) => ({
      rule: r.rule,
      day: r.day,
      count: Number(r.count),
    }));
  }

  async getAlertTopItems(businessId: string) {
    const rows = await this.prisma.$queryRawUnsafe<
      { item_name: string; alert_count: bigint; rules: string }[]
    >(
      `SELECT item_name, COUNT(*) AS alert_count,
              string_agg(DISTINCT rule, ', ') AS rules
       FROM (
         SELECT metadata_json->>'itemName' AS item_name,
                metadata_json->>'rule' AS rule
         FROM notifications
         WHERE business_id = $1
           AND metadata_json->>'rule' IS NOT NULL
           AND metadata_json->>'itemName' IS NOT NULL
       ) sub
       GROUP BY item_name
       ORDER BY alert_count DESC
       LIMIT 10`,
      businessId
    );

    return rows.map((r) => ({
      itemName: r.item_name,
      alertCount: Number(r.alert_count),
      rules: r.rules.split(", "),
    }));
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
