import type { ExtendedPrismaClient } from "@barstock/database";
import type { AlertRules } from "@barstock/validators";
import { VarianceService } from "./variance.service";
import { InventoryService } from "./inventory.service";
import { NotificationService } from "./notification.service";
import { SettingsService } from "./settings.service";
import { Prisma } from "@prisma/client";

export interface AlertResult {
  title: string;
  body: string;
  linkUrl?: string;
  metadata: Record<string, unknown>;
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
      for (const admin of admins) {
        // Dedup: skip if identical notification sent in last 24h
        const recent = await this.prisma.notification.findFirst({
          where: {
            recipientUserId: admin.id,
            title: alert.title,
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        });
        if (recent) continue;

        await notifSvc.send({
          businessId,
          recipientUserId: admin.id,
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
      where: { locationId, status: "tapped" },
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
}
