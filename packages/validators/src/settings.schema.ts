import { z } from "zod";

export const capabilityTogglesSchema = z.object({
  artSalesEnabled: z.boolean().default(false),
  staffArtEntryMode: z.boolean().default(false),
  curatorArtOnlyLockdown: z.boolean().default(true),
  staffPaymentConfirm: z.boolean().default(true),
  discountApprovalRule: z.boolean().default(true),
  directToArtistAllowed: z.boolean().default(false),
  proofPhotoRequired: z.boolean().default(true),
  proofPhotoRetentionDays: z.number().int().min(0).default(90),
  voiceCommandsEnabled: z.boolean().default(false),
});

export type CapabilityToggles = z.infer<typeof capabilityTogglesSchema>;

export const autoLockPolicySchema = z.object({
  enabled: z.boolean().default(false),
  timeoutSeconds: z.number().int().min(0).max(600).default(60),
  allowPin: z.boolean().default(true),
  allowBiometric: z.boolean().default(true),
});

export type AutoLockPolicy = z.infer<typeof autoLockPolicySchema>;

export const settingsUpdateSchema = z.object({
  businessId: z.string().uuid(),
  capabilities: capabilityTogglesSchema.partial().optional(),
  autoLock: autoLockPolicySchema.partial().optional(),
});

export const settingsGetSchema = z.object({
  businessId: z.string().uuid(),
});

export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
export type SettingsGetInput = z.infer<typeof settingsGetSchema>;
