import type { ExtendedPrismaClient } from "@barstock/database";
import type { CapabilityToggles, AutoLockPolicy, AlertRules } from "@barstock/validators";

export interface BusinessSettingsData {
  capabilities: CapabilityToggles;
  autoLock: AutoLockPolicy;
  alertRules: AlertRules;
  lastAlertEvaluation?: string;
  endOfDayTime: string;
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
  alertRules: {
    variancePercent: { enabled: true, threshold: 10 },
    lowStock: { enabled: false, threshold: 5 },
    staleCountDays: { enabled: true, threshold: 7 },
    kegNearEmpty: { enabled: true, threshold: 10 },
    loginFailures: { enabled: true, threshold: 5 },
    largeAdjustment: { enabled: true, threshold: 20 },
    shrinkagePattern: { enabled: true, threshold: 3 },
    parReorderAlert: { enabled: false, threshold: 3 },
  },
  lastAlertEvaluation: undefined,
  endOfDayTime: "04:00",
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
      alertRules: {
        ...DEFAULT_SETTINGS.alertRules,
        ...stored.alertRules,
      },
      lastAlertEvaluation: stored.lastAlertEvaluation,
      endOfDayTime: stored.endOfDayTime ?? DEFAULT_SETTINGS.endOfDayTime,
    };
  }

  async updateSettings(
    businessId: string,
    patch: {
      capabilities?: Partial<CapabilityToggles>;
      autoLock?: Partial<AutoLockPolicy>;
      alertRules?: Partial<AlertRules>;
      lastAlertEvaluation?: string;
      endOfDayTime?: string;
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
      alertRules: {
        ...current.alertRules,
        ...patch.alertRules,
      },
      lastAlertEvaluation: patch.lastAlertEvaluation ?? current.lastAlertEvaluation,
      endOfDayTime: patch.endOfDayTime ?? current.endOfDayTime,
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
