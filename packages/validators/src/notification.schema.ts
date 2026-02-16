import { z } from "zod";

export const notificationListSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export const notificationMarkReadSchema = z.object({
  id: z.string().uuid(),
});

export type NotificationListInput = z.infer<typeof notificationListSchema>;
export type NotificationMarkReadInput = z.infer<typeof notificationMarkReadSchema>;
