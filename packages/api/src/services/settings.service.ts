import type { ExtendedPrismaClient } from "@barstock/database";
import type { CapabilityToggles, AutoLockPolicy } from "@barstock/validators";

export interface BusinessSettingsData {
  capabilities: CapabilityToggles;
  autoLock: AutoLockPolicy;
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
  autoLock: {
    enabled: false,
    timeoutSeconds: 60,
    allowPin: true,
    allowBiometric: true,
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
      autoLock: {
        ...DEFAULT_SETTINGS.autoLock,
        ...stored.autoLock,
      },
    };
  }

  async updateSettings(
    businessId: string,
    patch: {
      capabilities?: Partial<CapabilityToggles>;
      autoLock?: Partial<AutoLockPolicy>;
    }
  ): Promise<BusinessSettingsData> {
    const current = await this.getSettings(businessId);
    const merged: BusinessSettingsData = {
      capabilities: {
        ...current.capabilities,
        ...patch.capabilities,
      },
      autoLock: {
        ...current.autoLock,
        ...patch.autoLock,
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
