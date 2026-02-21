import { z } from "zod";

export const notificationListSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export const notificationMarkReadSchema = z.object({
  id: z.string().uuid(),
});

export const pushTokenRegisterSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(["ios", "android"]),
});

export const pushTokenUnregisterSchema = z.object({
  token: z.string().min(1),
});

export type NotificationListInput = z.infer<typeof notificationListSchema>;
export type NotificationMarkReadInput = z.infer<typeof notificationMarkReadSchema>;
export type PushTokenRegisterInput = z.infer<typeof pushTokenRegisterSchema>;
export type PushTokenUnregisterInput = z.infer<typeof pushTokenUnregisterSchema>;
