import { z } from "zod";

export const scaleProfileCreateSchema = z.object({
  locationId: z.string().uuid(),
  name: z.string().min(1).max(255),
});

export const scaleProfileUpdateSchema = z.object({
  profileId: z.string().uuid(),
  name: z.string().min(1).max(255),
});

export const scaleProfileHeartbeatSchema = z.object({
  profileId: z.string().uuid(),
  batteryLevel: z.number().int().min(0).max(100).optional(),
});

export type ScaleProfileCreateInput = z.infer<typeof scaleProfileCreateSchema>;
export type ScaleProfileUpdateInput = z.infer<typeof scaleProfileUpdateSchema>;
export type ScaleProfileHeartbeatInput = z.infer<typeof scaleProfileHeartbeatSchema>;
