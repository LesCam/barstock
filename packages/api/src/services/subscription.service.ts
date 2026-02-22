import { TRPCError } from "@trpc/server";
import type { ExtendedPrismaClient } from "@barstock/database";
import type { SubscriptionTier } from "@barstock/types";
import { TIER_DEFAULTS } from "./subscription.constants";
import { SettingsService, DEFAULT_SETTINGS } from "./settings.service";

export interface EffectiveLimits {
  tier: SubscriptionTier;
  tierLabel: string;
  maxLocations: number | null;
  maxUsers: number | null;
  currentLocations: number;
  currentUsers: number;
}

export class SubscriptionService {
  constructor(private prisma: ExtendedPrismaClient) {}

  async getEffectiveLimits(businessId: string): Promise<EffectiveLimits> {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { subscriptionTier: true },
    });

    const tier = business.subscriptionTier as SubscriptionTier;
    const tierConfig = TIER_DEFAULTS[tier];

    const settingsService = new SettingsService(this.prisma);
    const settings = await settingsService.getSettings(businessId);
    const overrides = settings.subscriptionOverrides;

    const maxLocations =
      overrides?.maxLocations !== undefined
        ? overrides.maxLocations
        : tierConfig.maxLocations;
    const maxUsers =
      overrides?.maxUsers !== undefined
        ? overrides.maxUsers
        : tierConfig.maxUsers;

    const [currentLocations, currentUsers] = await Promise.all([
      this.prisma.location.count({
        where: { businessId, active: true },
      }),
      this.prisma.user.count({
        where: { businessId, isActive: true },
      }),
    ]);

    return {
      tier,
      tierLabel: tierConfig.label,
      maxLocations,
      maxUsers,
      currentLocations,
      currentUsers,
    };
  }

  async enforceLocationLimit(businessId: string): Promise<void> {
    const limits = await this.getEffectiveLimits(businessId);
    if (
      limits.maxLocations !== null &&
      limits.currentLocations >= limits.maxLocations
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Location limit reached (${limits.currentLocations}/${limits.maxLocations}). Upgrade your plan or contact support.`,
      });
    }
  }

  async enforceUserLimit(businessId: string): Promise<void> {
    const limits = await this.getEffectiveLimits(businessId);
    if (
      limits.maxUsers !== null &&
      limits.currentUsers >= limits.maxUsers
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `User limit reached (${limits.currentUsers}/${limits.maxUsers}). Upgrade your plan or contact support.`,
      });
    }
  }

  async changeTier(
    businessId: string,
    newTier: SubscriptionTier
  ): Promise<void> {
    const tierConfig = TIER_DEFAULTS[newTier];

    await this.prisma.$transaction(async (tx) => {
      await tx.business.update({
        where: { id: businessId },
        data: { subscriptionTier: newTier },
      });

      // Sync tier capabilities into settings
      const settingsService = new SettingsService(tx as any);
      await settingsService.updateSettings(businessId, {
        capabilities: tierConfig.capabilities,
      });
    });
  }

  async setLimitOverrides(
    businessId: string,
    overrides: { maxLocations?: number | null; maxUsers?: number | null }
  ): Promise<void> {
    const settingsService = new SettingsService(this.prisma);
    await settingsService.updateSettings(businessId, {
      subscriptionOverrides: overrides,
    });
  }
}
