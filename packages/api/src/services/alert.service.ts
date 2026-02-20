import type { ExtendedPrismaClient } from "@barstock/database";
import { VarianceService } from "./variance.service";
import { InventoryService } from "./inventory.service";
import { NotificationService } from "./notification.service";
import { SettingsService } from "./settings.service";
import { ParLevelService } from "./par-level.service";
import { deriveDefaultPermissions } from "./auth.service";
import { Prisma } from "@prisma/client";
import type { Role } from "@barstock/types";

export interface AlertResult {
  title: string;
  body: string;
  linkUrl?: string;
  metadata: Record<string, unknown>;
}

export interface AdjustmentItem {
  itemId: string;
  itemName: string;
  variance: number;
  variancePercent: number;
  reason: string | null;
}

export class AlertService {
  constructor(private prisma: ExtendedPrismaClient) {}

  async evaluateRules(businessId: string): Promise<AlertResult[]> {
    const settingsSvc = new SettingsService(this.prisma);
    const settings = await settingsSvc.getSettings(businessId);
    const rules = settings.alertRules;

    const locations = await this.prisma.location.findMany({
      where: { businessId },
      select: { id: true, name: true },
    });

    const alerts: AlertResult[] = [];

    for (const loc of locations) {
      if (rules.variancePercent.enabled) {
        const varAlerts = await this.checkVariance(loc.id, loc.name, rules.variancePercent.threshold);
        alerts.push(...varAlerts);
      }

      if (rules.lowStock.enabled) {
        const stockAlerts = await this.checkLowStock(loc.id, loc.name, rules.lowStock.threshold);
        alerts.push(...stockAlerts);
      }

      if (rules.staleCountDays.enabled) {
        const staleAlerts = await this.checkStaleCounts(loc.id, loc.name, rules.staleCountDays.threshold);
        alerts.push(...staleAlerts);
      }

      if (rules.kegNearEmpty.enabled) {
        const kegAlerts = await this.checkKegNearEmpty(loc.id, loc.name, rules.kegNearEmpty.threshold);
        alerts.push(...kegAlerts);
      }

      if (rules.shrinkagePattern?.enabled) {
        const patternAlerts = await this.checkShrinkagePatterns(loc.id, loc.name, rules.shrinkagePattern.threshold);
        alerts.push(...patternAlerts);
      }

      if ((rules as any).parReorderAlert?.enabled) {
        const parAlerts = await this.checkParLevels(loc.id, loc.name, (rules as any).parReorderAlert.threshold);
        alerts.push(...parAlerts);
      }
    }

    return alerts;
  }

  async evaluateAndNotify(businessId: string): Promise<number> {
    const alerts = await this.evaluateRules(businessId);
    if (alerts.length === 0) return 0;

    const notifSvc = new NotificationService(this.prisma);

    // Find business_admin users to receive alerts
    const admins = await this.prisma.user.findMany({
      where: { businessId, role: "business_admin", isActive: true },
      select: { id: true },
    });

    let sent = 0;
    for (const alert of alerts) {
      // For par reorder alerts, also notify orderers
      const recipientIds = new Set(admins.map((a) => a.id));

      if (alert.metadata.rule === "parReorderAlert" && alert.metadata.locationId) {
        const locationId = alert.metadata.locationId as string;
        const ordererIds = await this.getOrdererRecipients(businessId, locationId);
        for (const id of ordererIds) {
          recipientIds.add(id);
        }
      }

      for (const recipientId of recipientIds) {
        // Dedup: skip if identical notification sent in last 24h
        const recent = await this.prisma.notification.findFirst({
          where: {
            recipientUserId: recipientId,
            title: alert.title,
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        });
        if (recent) continue;

        await notifSvc.send({
          businessId,
          recipientUserId: recipientId,
          title: alert.title,
          body: alert.body,
          linkUrl: alert.linkUrl,
          metadata: alert.metadata,
        });
        sent++;
      }
    }

    return sent;
  }

  /**
   * Find users who should receive par reorder alerts for a location:
   * 1. Users assigned as vendor orderers for vendors at this location
   * 2. If no vendor orderers exist, fall back to users with canOrder permission
   */
  private async getOrdererRecipients(businessId: string, locationId: string): Promise<string[]> {
    // Find vendor orderers for vendors that have items at this location
    const vendorOrderers = await this.prisma.vendorOrderer.findMany({
      where: {
        vendor: {
          businessId,
          active: true,
        },
        user: { isActive: true },
      },
      select: { userId: true },
    });

    if (vendorOrderers.length > 0) {
      return vendorOrderers.map((vo) => vo.userId);
    }

    // Fallback: users with canOrder permission at this location
    const usersAtLocation = await this.prisma.userLocation.findMany({
      where: {
        locationId,
        user: { businessId, isActive: true },
      },
      include: { user: { select: { id: true, role: true } } },
    });

    const ordererIds: string[] = [];
    for (const ul of usersAtLocation) {
      const defaults = deriveDefaultPermissions(ul.role as Role);
      const stored = (ul.permissions as Record<string, boolean>) ?? {};
      const merged = { ...defaults, ...stored };
      if (merged.canOrder) {
        ordererIds.push(ul.user.id);
      }
    }

    return ordererIds;
  }

  async notifyAdmins(
    businessId: string,
    title: string,
    body: string,
    linkUrl: string,
    metadata?: Record<string, unknown>
  ): Promise<number> {
    const notifSvc = new NotificationService(this.prisma);

    const admins = await this.prisma.user.findMany({
      where: { businessId, role: "business_admin", isActive: true },
      select: { id: true },
    });

    let sent = 0;
    for (const admin of admins) {
      // Dedup: skip if identical notification sent in last 24h
      const recent = await this.prisma.notification.findFirst({
        where: {
          recipientUserId: admin.id,
          title,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });
      if (recent) continue;

      await notifSvc.send({
        businessId,
        recipientUserId: admin.id,
        title,
        body,
        linkUrl,
        metadata,
      });
      sent++;
    }

    return sent;
  }

  async checkLargeAdjustment(
    businessId: string,
    adjustments: AdjustmentItem[],
    sessionId: string,
    locationName: string
  ): Promise<void> {
    const settingsSvc = new SettingsService(this.prisma);
    const settings = await settingsSvc.getSettings(businessId);
    const largeAdjRule = settings.alertRules.largeAdjustment;
    if (!largeAdjRule?.enabled) return;

    const threshold = largeAdjRule.threshold;
    const flagged = adjustments.filter(
      (a) => Math.abs(a.variancePercent) >= threshold
    );
    if (flagged.length === 0) return;

    const itemList = flagged
      .slice(0, 5)
      .map((a) => `${a.itemName} (${a.variancePercent.toFixed(1)}%)`)
      .join(", ");

    await this.notifyAdmins(
      businessId,
      "Large inventory adjustment detected",
      `${flagged.length} item(s) exceeded ${threshold}% variance at ${locationName}: ${itemList}`,
      `/sessions/${sessionId}`,
      { rule: "largeAdjustment", sessionId, flaggedCount: flagged.length }
    );
  }

  private async checkVariance(locationId: string, locationName: string, thresholdPercent: number): Promise<AlertResult[]> {
    const svc = new VarianceService(this.prisma);
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    try {
      const report = await svc.calculateVarianceReport(locationId, yesterday, now);
      const flagged = report.items.filter(
        (i) => Math.abs(i.variancePercent) >= thresholdPercent
      );

      if (flagged.length === 0) return [];

      return [{
        title: `High variance at ${locationName}`,
        body: `${flagged.length} item(s) with variance above ${thresholdPercent}%. Top: ${flagged.slice(0, 3).map((i) => `${i.itemName} (${i.variancePercent.toFixed(1)}%)`).join(", ")}`,
        linkUrl: "/reports",
        metadata: { rule: "variancePercent", locationId, flaggedCount: flagged.length },
      }];
    } catch {
      return [];
    }
  }

  private async checkLowStock(locationId: string, locationName: string, threshold: number): Promise<AlertResult[]> {
    const svc = new InventoryService(this.prisma);
    const onHand = await svc.calculateOnHand(locationId);
    const low = onHand.filter((i) => i.quantity <= threshold && i.quantity >= 0);

    if (low.length === 0) return [];

    return [{
      title: `Low stock at ${locationName}`,
      body: `${low.length} item(s) at or below ${threshold} units. Items: ${low.slice(0, 3).map((i) => i.itemName).join(", ")}`,
      linkUrl: "/inventory",
      metadata: { rule: "lowStock", locationId, itemCount: low.length },
    }];
  }

  private async checkStaleCounts(locationId: string, locationName: string, thresholdDays: number): Promise<AlertResult[]> {
    const cutoff = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000);

    const staleItems = await this.prisma.$queryRaw<
      Array<{ item_name: string; last_counted: Date | null }>
    >(Prisma.sql`
      SELECT
        i.name AS item_name,
        MAX(sl.created_at) AS last_counted
      FROM inventory_items i
      LEFT JOIN inventory_session_lines sl ON sl.inventory_item_id = i.id
      WHERE i.location_id = ${locationId}::uuid
        AND i.active = true
      GROUP BY i.id, i.name
      HAVING MAX(sl.created_at) IS NULL OR MAX(sl.created_at) < ${cutoff}
    `);

    if (staleItems.length === 0) return [];

    return [{
      title: `Stale counts at ${locationName}`,
      body: `${staleItems.length} item(s) not counted in ${thresholdDays}+ days. Items: ${staleItems.slice(0, 3).map((i) => i.item_name).join(", ")}`,
      linkUrl: "/sessions",
      metadata: { rule: "staleCountDays", locationId, itemCount: staleItems.length },
    }];
  }

  private async checkKegNearEmpty(locationId: string, locationName: string, thresholdPercent: number): Promise<AlertResult[]> {
    // Find tapped kegs and calculate remaining % via consumption events
    const kegs = await this.prisma.kegInstance.findMany({
      where: { locationId, status: "in_service" },
      select: {
        id: true,
        startingOz: true,
        inventoryItem: { select: { name: true } },
        consumptionEvents: {
          select: { quantityDelta: true },
        },
      },
    });

    const nearEmpty: string[] = [];
    for (const keg of kegs) {
      const consumed = keg.consumptionEvents.reduce(
        (sum, e) => sum + Math.abs(Number(e.quantityDelta)),
        0
      );
      const startOz = Number(keg.startingOz);
      const remainingPct = startOz > 0 ? ((startOz - consumed) / startOz) * 100 : 0;
      if (remainingPct <= thresholdPercent) {
        nearEmpty.push(keg.inventoryItem.name);
      }
    }

    if (nearEmpty.length === 0) return [];

    return [{
      title: `Kegs near empty at ${locationName}`,
      body: `${nearEmpty.length} keg(s) below ${thresholdPercent}% remaining. Kegs: ${nearEmpty.slice(0, 3).join(", ")}`,
      linkUrl: "/draft",
      metadata: { rule: "kegNearEmpty", locationId, kegCount: nearEmpty.length },
    }];
  }

  private async checkShrinkagePatterns(locationId: string, locationName: string, threshold: number): Promise<AlertResult[]> {
    const svc = new VarianceService(this.prisma);

    try {
      const patterns = await svc.analyzeVariancePatterns(locationId, 10);
      const flagged = patterns.filter(
        (p) =>
          p.sessionsAppeared >= threshold &&
          (p.isShrinkageSuspect || p.trend === "worsening")
      );

      if (flagged.length === 0) return [];

      const itemList = flagged
        .slice(0, 5)
        .map((p) => `${p.itemName} (avg ${p.avgVariance.toFixed(1)}, ${p.trend})`)
        .join(", ");

      return [{
        title: `Shrinkage patterns at ${locationName}`,
        body: `${flagged.length} item(s) showing persistent negative variance: ${itemList}`,
        linkUrl: "/reports",
        metadata: { rule: "shrinkagePattern", locationId, flaggedCount: flagged.length },
      }];
    } catch {
      return [];
    }
  }

  private async checkParLevels(locationId: string, locationName: string, thresholdDays: number): Promise<AlertResult[]> {
    const svc = new ParLevelService(this.prisma);
    const items = await svc.list(locationId);
    const alerts: AlertResult[] = [];

    // Items at or below min level
    const needsReorder = items.filter((i) => i.needsReorder);
    if (needsReorder.length > 0) {
      alerts.push({
        title: `Reorder needed at ${locationName}`,
        body: `${needsReorder.length} item(s) at or below minimum level: ${needsReorder.slice(0, 3).map((i) => i.itemName).join(", ")}`,
        linkUrl: "/par",
        metadata: { rule: "parReorderAlert", locationId, itemCount: needsReorder.length },
      });
    }

    // Items approaching stockout within threshold days
    if (thresholdDays > 0) {
      const approaching = items.filter(
        (i) =>
          i.daysToStockout != null &&
          i.daysToStockout <= thresholdDays &&
          !i.needsReorder
      );
      if (approaching.length > 0) {
        alerts.push({
          title: `Stock running low at ${locationName}`,
          body: `${approaching.length} item(s) will stockout within ${thresholdDays} days: ${approaching.slice(0, 3).map((i) => `${i.itemName} (${i.daysToStockout}d)`).join(", ")}`,
          linkUrl: "/par",
          metadata: { rule: "parReorderAlert", locationId, itemCount: approaching.length, type: "approaching" },
        });
      }
    }

    return alerts;
  }

  async checkHighVarianceSession(
    businessId: string,
    adjustments: AdjustmentItem[],
    sessionId: string,
    locationName: string
  ): Promise<void> {
    const settingsSvc = new SettingsService(this.prisma);
    const settings = await settingsSvc.getSettings(businessId);
    if (!settings.alertRules.largeAdjustment?.enabled) return;

    if (adjustments.length === 0) return;

    const withVariance = adjustments.filter(
      (a) => Math.abs(a.variancePercent) > 0
    );
    const ratio = withVariance.length / adjustments.length;

    if (ratio <= 0.6) return;

    await this.notifyAdmins(
      businessId,
      "Unusually high session variance",
      `${withVariance.length} of ${adjustments.length} items (${(ratio * 100).toFixed(0)}%) had variance at ${locationName}`,
      `/sessions/${sessionId}`,
      { rule: "largeAdjustment", sessionId, varianceRatio: ratio }
    );
  }
}
