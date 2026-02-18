import type { ExtendedPrismaClient } from "@barstock/database";
import type { CapabilityToggles } from "@barstock/validators";

export interface BusinessSettingsData {
  capabilities: CapabilityToggles;
}

const DEFAULT_SETTINGS: BusinessSettingsData = {
  capabilities: {
    artSalesEnabled: false,
    staffArtEntryMode: false,
    curatorArtOnlyLockdown: true,
    staffPaymentConfirm: true,
    discountApprovalRule: true,
    directToArtistAllowed: false,
    proofPhotoRequired: true,
    proofPhotoRetentionDays: 90,
    voiceCommandsEnabled: false,
  },
};

export class SettingsService {
  constructor(private prisma: ExtendedPrismaClient) {}

  async getSettings(businessId: string): Promise<BusinessSettingsData> {
    const row = await this.prisma.businessSettings.findUnique({
      where: { businessId },
    });

    if (!row) return { ...DEFAULT_SETTINGS };

    const stored = row.settingsJson as Partial<BusinessSettingsData>;
    return {
      capabilities: {
        ...DEFAULT_SETTINGS.capabilities,
        ...stored.capabilities,
      },
    };
  }

  async updateSettings(
    businessId: string,
    patch: { capabilities?: Partial<CapabilityToggles> }
  ): Promise<BusinessSettingsData> {
    const current = await this.getSettings(businessId);
    const merged: BusinessSettingsData = {
      capabilities: {
        ...current.capabilities,
        ...patch.capabilities,
      },
    };

    await this.prisma.businessSettings.upsert({
      where: { businessId },
      create: { businessId, settingsJson: merged as any },
      update: { settingsJson: merged as any },
    });

    return merged;
  }

  async isCapabilityEnabled(
    businessId: string,
    key: keyof CapabilityToggles
  ): Promise<boolean> {
    const settings = await this.getSettings(businessId);
    return !!settings.capabilities[key];
  }
}
