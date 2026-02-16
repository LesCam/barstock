import { z } from "zod";

export const auditLogListSchema = z.object({
  businessId: z.string().uuid(),
  objectType: z.string().optional(),
  objectId: z.string().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export type AuditLogListInput = z.infer<typeof auditLogListSchema>;
