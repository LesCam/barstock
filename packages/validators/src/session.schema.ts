import { z } from "zod";
import { SessionType, VarianceReason, AssignmentStatus } from "@barstock/types";

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
  countedBy: z.string().uuid().optional(),
});

export const sessionJoinSchema = z.object({
  sessionId: z.string().uuid(),
});

export const sessionHeartbeatSchema = z.object({
  sessionId: z.string().uuid(),
  currentSubAreaId: z.string().uuid().nullish(),
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

export const expectedItemsForAreaSchema = z.object({
  locationId: z.string().uuid(),
  barAreaId: z.string().uuid(),
  subAreaId: z.string().uuid().optional(),
  sortMode: z.enum(["alphabetical", "smart"]).optional().default("alphabetical"),
});

export const itemCountHintsSchema = z.object({
  locationId: z.string().uuid(),
  inventoryItemIds: z.array(z.string().uuid()).max(200),
});

export type SessionCreateInput = z.infer<typeof sessionCreateSchema>;
export type SessionLineCreateInput = z.infer<typeof sessionLineCreateSchema>;
export type SessionCloseInput = z.infer<typeof sessionCloseSchema>;
export type ExpectedItemsForAreaInput = z.infer<typeof expectedItemsForAreaSchema>;
export type ItemCountHintsInput = z.infer<typeof itemCountHintsSchema>;
export const claimSubAreaSchema = z.object({
  sessionId: z.string().uuid(),
  subAreaId: z.string().uuid(),
});

export const releaseSubAreaSchema = z.object({
  sessionId: z.string().uuid(),
});

// --- Session Planning ---
export const sessionPlanSchema = z.object({
  locationId: z.string().uuid(),
  sessionType: z.nativeEnum(SessionType),
  plannedAt: z.coerce.date(),
  assignments: z.array(
    z.object({
      userId: z.string().uuid(),
      subAreaId: z.string().uuid().optional(),
      focusItems: z.array(z.string().uuid()).default([]),
    })
  ).min(1),
});

export const respondAssignmentSchema = z.object({
  assignmentId: z.string().uuid(),
  response: z.enum(["accepted", "declined"]),
});

export const listAssignmentsSchema = z.object({
  sessionId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  status: z.nativeEnum(AssignmentStatus).optional(),
});

// --- Dual-Count Verification ---
export const flagForVerificationSchema = z.object({
  lineId: z.string().uuid(),
});

export const submitVerificationSchema = z.object({
  lineId: z.string().uuid(),
  countUnits: z.number().optional(),
  grossWeightGrams: z.number().min(0).optional(),
});

export const resolveVerificationSchema = z.object({
  lineId: z.string().uuid(),
  resolution: z.enum(["original", "verification", "average"]),
});

export type SessionJoinInput = z.infer<typeof sessionJoinSchema>;
export type SessionHeartbeatInput = z.infer<typeof sessionHeartbeatSchema>;
export type ClaimSubAreaInput = z.infer<typeof claimSubAreaSchema>;
export type ReleaseSubAreaInput = z.infer<typeof releaseSubAreaSchema>;
export type SessionPlanInput = z.infer<typeof sessionPlanSchema>;
export type RespondAssignmentInput = z.infer<typeof respondAssignmentSchema>;
export type ListAssignmentsInput = z.infer<typeof listAssignmentsSchema>;
export type FlagForVerificationInput = z.infer<typeof flagForVerificationSchema>;
export type SubmitVerificationInput = z.infer<typeof submitVerificationSchema>;
export type ResolveVerificationInput = z.infer<typeof resolveVerificationSchema>;
