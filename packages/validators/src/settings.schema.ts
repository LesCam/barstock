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
  recipesEnabled: z.boolean().default(true),
  productGuideEnabled: z.boolean().default(true),
  benchmarkingEnabled: z.boolean().default(false),
  crossTenantAnalyticsEnabled: z.boolean().default(false),
});

export type CapabilityToggles = z.infer<typeof capabilityTogglesSchema>;

export const autoLockPolicySchema = z.object({
  enabled: z.boolean().default(false),
  timeoutSeconds: z.number().int().min(0).max(600).default(60),
  allowPin: z.boolean().default(true),
  allowBiometric: z.boolean().default(true),
});

export type AutoLockPolicy = z.infer<typeof autoLockPolicySchema>;

export const alertRuleSchema = z.object({
  enabled: z.boolean().default(false),
  threshold: z.number().min(0),
  lastTriggeredAt: z.string().datetime().optional(),
});

export const alertRulesSchema = z.object({
  variancePercent: alertRuleSchema.default({ enabled: true, threshold: 10 }),
  lowStock: alertRuleSchema.default({ enabled: false, threshold: 5 }),
  staleCountDays: alertRuleSchema.default({ enabled: true, threshold: 7 }),
  kegNearEmpty: alertRuleSchema.default({ enabled: true, threshold: 10 }),
  loginFailures: alertRuleSchema.default({ enabled: true, threshold: 5 }),
  largeAdjustment: alertRuleSchema.default({ enabled: true, threshold: 20 }),
  shrinkagePattern: alertRuleSchema.default({ enabled: true, threshold: 3 }),
  parReorderAlert: alertRuleSchema.default({ enabled: false, threshold: 3 }),
  usageSpike: alertRuleSchema.default({ enabled: true, threshold: 2.5 }),
  depletionMismatch: alertRuleSchema.default({ enabled: true, threshold: 1.5 }),
  priceChange: alertRuleSchema.default({ enabled: true, threshold: 5 }),
});

export type AlertRules = z.infer<typeof alertRulesSchema>;

export const benchmarkingSettingsSchema = z.object({
  optedIn: z.boolean().default(false),
  optedInAt: z.string().datetime().nullable().default(null),
});

export type BenchmarkingSettings = z.infer<typeof benchmarkingSettingsSchema>;

export const masterProductSharingSchema = z.object({
  optedIn: z.boolean().default(false),
  optedInAt: z.string().datetime().nullable().default(null),
});

export type MasterProductSharingSettings = z.infer<typeof masterProductSharingSchema>;

export const subscriptionOverridesSchema = z.object({
  maxLocations: z.number().int().min(1).nullable().optional(),
  maxUsers: z.number().int().min(1).nullable().optional(),
});

export type SubscriptionOverrides = z.infer<typeof subscriptionOverridesSchema>;

export const settingsUpdateSchema = z.object({
  businessId: z.string().uuid(),
  capabilities: capabilityTogglesSchema.partial().optional(),
  autoLock: autoLockPolicySchema.partial().optional(),
  alertRules: alertRulesSchema.partial().optional(),
  lastAlertEvaluation: z.string().datetime().optional(),
  endOfDayTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  benchmarking: benchmarkingSettingsSchema.partial().optional(),
  masterProductSharing: masterProductSharingSchema.partial().optional(),
  subscriptionOverrides: subscriptionOverridesSchema.optional(),
});

export const settingsGetSchema = z.object({
  businessId: z.string().uuid(),
});

export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
export type SettingsGetInput = z.infer<typeof settingsGetSchema>;
