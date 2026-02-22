import type { SubscriptionTier } from "@barstock/types";
import type { CapabilityToggles } from "@barstock/validators";

export interface TierConfig {
  label: string;
  maxLocations: number | null;
  maxUsers: number | null;
  capabilities: Partial<CapabilityToggles>;
}

export const TIER_DEFAULTS: Record<SubscriptionTier, TierConfig> = {
  starter: {
    label: "Starter",
    maxLocations: 1,
    maxUsers: 5,
    capabilities: {
      artSalesEnabled: false,
      voiceCommandsEnabled: false,
      recipesEnabled: false,
      productGuideEnabled: false,
      benchmarkingEnabled: false,
      crossTenantAnalyticsEnabled: false,
    },
  },
  pro: {
    label: "Pro",
    maxLocations: 5,
    maxUsers: 25,
    capabilities: {
      artSalesEnabled: true,
      voiceCommandsEnabled: true,
      recipesEnabled: true,
      productGuideEnabled: true,
      benchmarkingEnabled: false,
      crossTenantAnalyticsEnabled: false,
    },
  },
  enterprise: {
    label: "Enterprise",
    maxLocations: null,
    maxUsers: null,
    capabilities: {
      artSalesEnabled: true,
      voiceCommandsEnabled: true,
      recipesEnabled: true,
      productGuideEnabled: true,
      benchmarkingEnabled: true,
      crossTenantAnalyticsEnabled: true,
    },
  },
};
