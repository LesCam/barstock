import { z } from "zod";
import { SessionType, VarianceReason } from "@barstock/types";

export const sessionCreateSchema = z.object({
  locationId: z.string().uuid(),
  sessionType: z.nativeEnum(SessionType),
  startedTs: z.coerce.date(),
});

export const sessionLineCreateSchema = z.object({
  sessionId: z.string().uuid(),
  inventoryItemId: z.string().uuid(),
  countUnits: z.number().optional(),
  tapLineId: z.string().uuid().optional(),
  kegInstanceId: z.string().uuid().optional(),
  percentRemaining: z.number().min(0).max(100).optional(),
  grossWeightGrams: z.number().min(0).optional(),
  isManual: z.boolean().default(false),
  notes: z.string().optional(),
  subAreaId: z.string().uuid().optional(),
});

export const sessionCloseSchema = z.object({
  varianceReasons: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        reason: z.nativeEnum(VarianceReason),
        notes: z.string().optional(),
      })
    )
    .optional(),
});

export type SessionCreateInput = z.infer<typeof sessionCreateSchema>;
export type SessionLineCreateInput = z.infer<typeof sessionLineCreateSchema>;
export type SessionCloseInput = z.infer<typeof sessionCloseSchema>;
