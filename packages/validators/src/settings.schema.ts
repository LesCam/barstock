import { z } from "zod";

export const capabilityTogglesSchema = z.object({
  artSalesEnabled: z.boolean().default(false),
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
