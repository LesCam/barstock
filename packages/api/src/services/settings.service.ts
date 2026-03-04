import type { ExtendedPrismaClient } from "@barstock/database";
import type { CapabilityToggles, AutoLockPolicy, AlertRules, SubscriptionOverrides, VerificationSettings, AdaptiveDepletionSettings, ReceiptMatchingSettings, CountOptimizationSettings } from "@barstock/validators";

export interface BenchmarkingSettings {
  optedIn: boolean;
  optedInAt: string | null;
}

export interface MasterProductSharingSettings {
  optedIn: boolean;
  optedInAt: string | null;
}

export interface TareTrustSettings {
  trustScore: number;
  trustUpdatedAt: string | null;
}

export interface BusinessSettingsData {
  capabilities: CapabilityToggles;
  autoLock: AutoLockPolicy;
  alertRules: AlertRules;
  lastAlertEvaluation?: string;
  endOfDayTime: string;
  benchmarking: BenchmarkingSettings;
  masterProductSharing: MasterProductSharingSettings;
  subscriptionOverrides?: SubscriptionOverrides;
  verification: VerificationSettings;
  adaptiveDepletion: AdaptiveDepletionSettings;
  receiptMatching: ReceiptMatchingSettings;
  countOptimization: CountOptimizationSettings;
  tareTrust: TareTrustSettings;
}

export const DEFAULT_SETTINGS: BusinessSettingsData = {
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
    recipesEnabled: true,
    productGuideEnabled: true,
    benchmarkingEnabled: false,
    crossTenantAnalyticsEnabled: false,
  },
  autoLock: {
    enabled: false,
    timeoutSeconds: 60,
    allowPin: true,
    allowBiometric: true,
  },
  alertRules: {
    variancePercent: { enabled: true, threshold: 10 },
    lowStock: { enabled: true, threshold: 5 },
    staleCountDays: { enabled: true, threshold: 7 },
    kegNearEmpty: { enabled: true, threshold: 10 },
    loginFailures: { enabled: true, threshold: 5 },
    largeAdjustment: { enabled: true, threshold: 20 },
    shrinkagePattern: { enabled: true, threshold: 3 },
    parReorderAlert: { enabled: false, threshold: 3 },
    usageSpike: { enabled: true, threshold: 2.5 },
    depletionMismatch: { enabled: true, threshold: 1.5 },
    priceChange: { enabled: true, threshold: 5 },
    priceAnomaly: { enabled: true, threshold: 2 },
    varianceForecastRisk: { enabled: true, threshold: 10 },
    predictiveStockout: { enabled: true, threshold: 3 },
    privilegeEscalation: { enabled: false, threshold: 1 },
    mfaStateChange: { enabled: false, threshold: 1 },
    bulkDataAccess: { enabled: false, threshold: 5 },
  },
  lastAlertEvaluation: undefined,
  endOfDayTime: "04:00",
  benchmarking: {
    optedIn: false,
    optedInAt: null,
  },
  masterProductSharing: {
    optedIn: false,
    optedInAt: null,
  },
  verification: {
    autoFlagEnabled: false,
    verificationThreshold: 10,
  },
  adaptiveDepletion: {
    enabled: false,
    minSnapshots: 3,
    ratioFloor: 0.5,
    ratioCeiling: 2.0,
  },
  receiptMatching: {
    fuzzyThreshold: 0.3,
  },
  countOptimization: {
    breakAfterItems: 40,
    breakAfterMinutes: 45,
    fatigueDetectionEnabled: true,
    fatigueVarianceThresholdMultiplier: 1.5,
  },
  tareTrust: {
    trustScore: 50,
    trustUpdatedAt: null,
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
      alertRules: {
        ...DEFAULT_SETTINGS.alertRules,
        ...stored.alertRules,
      },
      lastAlertEvaluation: stored.lastAlertEvaluation,
      endOfDayTime: stored.endOfDayTime ?? DEFAULT_SETTINGS.endOfDayTime,
      benchmarking: {
        ...DEFAULT_SETTINGS.benchmarking,
        ...stored.benchmarking,
      },
      masterProductSharing: {
        ...DEFAULT_SETTINGS.masterProductSharing,
        ...stored.masterProductSharing,
      },
      subscriptionOverrides: stored.subscriptionOverrides,
      verification: {
        ...DEFAULT_SETTINGS.verification,
        ...stored.verification,
      },
      adaptiveDepletion: {
        ...DEFAULT_SETTINGS.adaptiveDepletion,
        ...stored.adaptiveDepletion,
      },
      receiptMatching: {
        ...DEFAULT_SETTINGS.receiptMatching,
        ...stored.receiptMatching,
      },
      countOptimization: {
        ...DEFAULT_SETTINGS.countOptimization,
        ...stored.countOptimization,
      },
      tareTrust: {
        ...DEFAULT_SETTINGS.tareTrust,
        ...stored.tareTrust,
      },
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
      benchmarking?: Partial<BenchmarkingSettings>;
      masterProductSharing?: Partial<MasterProductSharingSettings>;
      subscriptionOverrides?: SubscriptionOverrides;
      verification?: Partial<VerificationSettings>;
      adaptiveDepletion?: Partial<AdaptiveDepletionSettings>;
      receiptMatching?: Partial<ReceiptMatchingSettings>;
      countOptimization?: Partial<CountOptimizationSettings>;
      tareTrust?: Partial<TareTrustSettings>;
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
      benchmarking: {
        ...current.benchmarking,
        ...patch.benchmarking,
      },
      masterProductSharing: {
        ...current.masterProductSharing,
        ...patch.masterProductSharing,
      },
      subscriptionOverrides: patch.subscriptionOverrides ?? current.subscriptionOverrides,
      verification: {
        ...current.verification,
        ...patch.verification,
      },
      adaptiveDepletion: {
        ...current.adaptiveDepletion,
        ...patch.adaptiveDepletion,
      },
      receiptMatching: {
        ...current.receiptMatching,
        ...patch.receiptMatching,
      },
      countOptimization: {
        ...current.countOptimization,
        ...patch.countOptimization,
      },
      tareTrust: {
        ...current.tareTrust,
        ...patch.tareTrust,
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
