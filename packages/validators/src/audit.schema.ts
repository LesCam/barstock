import { z } from "zod";

export const auditLogListSchema = z.object({
  businessId: z.string().uuid().optional(),
  objectType: z.string().optional(),
  objectId: z.string().optional(),
  actionType: z.string().optional(),
  actorUserId: z.string().uuid().optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export type AuditLogListInput = z.infer<typeof auditLogListSchema>;

export const userActivityQuerySchema = z.object({
  businessId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  limit: z.number().int().min(1).max(200).default(100),
});

export const activitySummaryQuerySchema = z.object({
  businessId: z.string().uuid(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
});

export type UserActivityQueryInput = z.infer<typeof userActivityQuerySchema>;
export type ActivitySummaryQueryInput = z.infer<typeof activitySummaryQuerySchema>;
