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
  businessId: string;
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

    const where: Record<string, unknown> = { businessId };
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
