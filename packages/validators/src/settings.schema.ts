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
});

export type CapabilityToggles = z.infer<typeof capabilityTogglesSchema>;

export const settingsUpdateSchema = z.object({
  businessId: z.string().uuid(),
  capabilities: capabilityTogglesSchema.partial().optional(),
});

export const settingsGetSchema = z.object({
  businessId: z.string().uuid(),
});

export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
export type SettingsGetInput = z.infer<typeof settingsGetSchema>;
