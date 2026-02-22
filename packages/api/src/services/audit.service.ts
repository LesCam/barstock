import type { ExtendedPrismaClient } from "@barstock/database";

interface LogEntry {
  businessId: string;
  actorUserId?: string;
  actionType: string;
  objectType: string;
  objectId?: string;
  metadata?: Record<string, unknown>;
}

interface ListParams {
  businessId?: string;
  objectType?: string;
  objectId?: string;
  actionType?: string;
  actorUserId?: string;
  fromDate?: Date;
  toDate?: Date;
  cursor?: string;
  limit: number;
}

export class AuditService {
  constructor(private prisma: ExtendedPrismaClient) {}

  async log(entry: LogEntry) {
    return this.prisma.auditLog.create({
      data: {
        businessId: entry.businessId,
        actorUserId: entry.actorUserId,
        actionType: entry.actionType,
        objectType: entry.objectType,
        objectId: entry.objectId,
        metadataJson: entry.metadata ?? undefined,
      },
    });
  }

  async list(params: ListParams) {
    const { businessId, objectType, objectId, actionType, actorUserId, fromDate, toDate, cursor, limit } = params;

    const where: Record<string, unknown> = {};
    if (businessId) where.businessId = businessId;
    if (objectType) where.objectType = objectType;
    if (objectId) where.objectId = objectId;
    if (actionType) where.actionType = actionType;
    if (actorUserId) where.actorUserId = actorUserId;
    if (fromDate || toDate) {
      where.createdAt = {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate ? { lte: toDate } : {}),
      };
    }

    const items = await this.prisma.auditLog.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: "desc" },
      include: {
        actorUser: { select: { id: true, email: true, firstName: true, lastName: true } },
        business: { select: { id: true, name: true } },
      },
    });

    let nextCursor: string | undefined;
    if (items.length > limit) {
      const next = items.pop()!;
      nextCursor = next.id;
    }

    return { items, nextCursor };
  }

  async getUserActivity(params: {
    businessId: string;
    userId?: string;
    fromDate?: Date;
    toDate?: Date;
    limit: number;
  }) {
    const where: Record<string, unknown> = { businessId: params.businessId };
    if (params.userId) where.actorUserId = params.userId;
    if (params.fromDate || params.toDate) {
      where.createdAt = {
        ...(params.fromDate ? { gte: params.fromDate } : {}),
        ...(params.toDate ? { lte: params.toDate } : {}),
      };
    }

    const items = await this.prisma.auditLog.findMany({
      where,
      take: params.limit,
      orderBy: { createdAt: "desc" },
      include: {
        actorUser: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    return items.map((item) => ({
      id: item.id,
      userId: item.actorUserId,
      displayName: item.actorUser
        ? [item.actorUser.firstName, item.actorUser.lastName]
            .filter(Boolean)
            .join(" ") || item.actorUser.email
        : "System",
      actionType: item.actionType,
      objectType: item.objectType,
      objectId: item.objectId,
      metadata: item.metadataJson,
      createdAt: item.createdAt,
    }));
  }

  async getActivitySummary(
    businessId: string,
    fromDate?: Date,
    toDate?: Date
  ) {
    const conditions: string[] = [
      `a.business_id = $1`,
      `a.actor_user_id IS NOT NULL`,
    ];
    const values: unknown[] = [businessId];
    let idx = 2;

    if (fromDate) {
      conditions.push(`a.created_at >= $${idx}`);
      values.push(fromDate);
      idx++;
    }
    if (toDate) {
      conditions.push(`a.created_at <= $${idx}`);
      values.push(toDate);
      idx++;
    }

    const rows = await this.prisma.$queryRawUnsafe<
      {
        user_id: string;
        email: string;
        first_name: string | null;
        last_name: string | null;
        total_actions: bigint;
        unique_action_types: bigint;
        last_active_at: Date;
        top_action: string;
      }[]
    >(
      `SELECT
         a.actor_user_id AS user_id,
         u.email,
         u.first_name,
         u.last_name,
         COUNT(*) AS total_actions,
         COUNT(DISTINCT a.action_type) AS unique_action_types,
         MAX(a.created_at) AS last_active_at,
         MODE() WITHIN GROUP (ORDER BY a.action_type) AS top_action
       FROM audit_logs a
       JOIN users u ON u.id = a.actor_user_id
       WHERE ${conditions.join(" AND ")}
       GROUP BY a.actor_user_id, u.email, u.first_name, u.last_name
       ORDER BY total_actions DESC`,
      ...values
    );

    return rows.map((r) => ({
      userId: r.user_id,
      displayName:
        [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email,
      email: r.email,
      totalActions: Number(r.total_actions),
      uniqueActionTypes: Number(r.unique_action_types),
      lastActiveAt: r.last_active_at,
      topAction: r.top_action,
    }));
  }
}
