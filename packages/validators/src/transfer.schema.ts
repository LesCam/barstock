import { z } from "zod";

export const transferCreateSchema = z.object({
  locationId: z.string().uuid(),
  inventoryItemId: z.string().uuid(),
  fromSubAreaId: z.string().uuid(),
  toSubAreaId: z.string().uuid(),
  quantity: z.number().positive(),
  notes: z.string().optional(),
});

export const transferListSchema = z.object({
  locationId: z.string().uuid(),
  limit: z.number().min(1).max(100).default(50),
});

export type TransferCreateInput = z.infer<typeof transferCreateSchema>;
export type TransferListInput = z.infer<typeof transferListSchema>;
