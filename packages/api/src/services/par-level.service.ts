import type { ExtendedPrismaClient } from "@barstock/database";
import { Prisma } from "@prisma/client";
import type {
  ParLevelCreateInput,
  ParLevelUpdateInput,
  ParLevelBulkUpsertInput,
} from "@barstock/validators";

export interface ParLevelDashboardItem {
  inventoryItemId: string;
  itemName: string;
  categoryName: string | null;
  categoryId: string | null;
  vendorId: string | null;
  vendorName: string | null;
  vendorEmail: string | null;
  vendorPhone: string | null;
  vendorSku: string | null;
  uom: string;
  parUom: "unit" | "package";
  packSize: number | null;
  packUom: string | null;
  currentOnHand: number;
  avgDailyUsage: number | null;
  parLevelId: string | null;
  parLevel: number | null;
  minLevel: number | null;
  reorderQty: number | null;
  leadTimeDays: number | null;
  safetyStockDays: number | null;
  daysToStockout: number | null;
  suggestedOrderQty: number | null;
  needsReorder: boolean;
  unitCost: number | null;
  estimatedOrderCost: number | null;
  status: "green" | "yellow" | "red" | "none";
}

export interface ReorderSuggestion {
  vendorId: string;
  vendorName: string;
  vendorEmail: string | null;
  vendorPhone: string | null;
  itemCount: number;
  totalEstimatedCost: number;
  items: Array<{
    inventoryItemId: string;
    itemName: string;
    vendorSku: string | null;
    uom: string;
    parUom: "unit" | "package";
    packSize: number | null;
    currentOnHand: number;
    parLevel: number;
    minLevel: number;
    orderQty: number;
    unitCost: number | null;
    estimatedCost: number | null;
  }>;
}

export class ParLevelService {
  constructor(private prisma: ExtendedPrismaClient) {}

  async list(
    locationId: string,
    vendorId?: string,
    categoryId?: string,
    belowParOnly?: boolean
  ): Promise<ParLevelDashboardItem[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        inventory_item_id: string;
        item_name: string;
        category_name: string | null;
        category_id: string | null;
        vendor_id: string | null;
        vendor_name: string | null;
        vendor_email: string | null;
        vendor_phone: string | null;
        vendor_sku: string | null;
        base_uom: string;
        pack_size: string | null;
        pack_uom: string | null;
        current_on_hand: string | null;
        avg_daily: string | null;
        par_level_id: string | null;
        par_level: string | null;
        min_level: string | null;
        reorder_qty: string | null;
        par_uom: string | null;
        lead_time_days: number | null;
        safety_stock_days: number | null;
        unit_cost: string | null;
      }>
    >(Prisma.sql`
      WITH on_hand AS (
        SELECT inventory_item_id, SUM(quantity_delta) AS total
        FROM consumption_events
        WHERE location_id = ${locationId}::uuid
        GROUP BY inventory_item_id
      ),
      avg_usage AS (
        SELECT inventory_item_id, ABS(SUM(quantity_delta)) / 30.0 AS avg_daily
        FROM consumption_events
        WHERE location_id = ${locationId}::uuid
          AND event_type = 'pos_sale'
          AND event_ts >= NOW() - INTERVAL '30 days'
        GROUP BY inventory_item_id
      ),
      latest_cost AS (
        SELECT DISTINCT ON (inventory_item_id)
          inventory_item_id, unit_cost
        FROM price_history
        ORDER BY inventory_item_id, effective_from_ts DESC
      )
      SELECT
        i.id AS inventory_item_id,
        i.name AS item_name,
        c.name AS category_name,
        c.id AS category_id,
        v.id AS vendor_id,
        v.name AS vendor_name,
        v.contact_email AS vendor_email,
        v.contact_phone AS vendor_phone,
        i.vendor_sku,
        i.base_uom,
        i.pack_size,
        i.pack_uom,
        COALESCE(oh.total, 0) AS current_on_hand,
        au.avg_daily,
        pl.id AS par_level_id,
        pl.par_level,
        pl.min_level,
        pl.reorder_qty,
        pl.par_uom,
        pl.lead_time_days,
        pl.safety_stock_days,
        lc.unit_cost
      FROM inventory_items i
      LEFT JOIN inventory_item_categories c ON c.id = i.category_id
      LEFT JOIN vendors v ON v.id = i.vendor_id
      LEFT JOIN on_hand oh ON oh.inventory_item_id = i.id
      LEFT JOIN avg_usage au ON au.inventory_item_id = i.id
      LEFT JOIN par_levels pl ON pl.inventory_item_id = i.id
        AND pl.location_id = ${locationId}::uuid
        AND pl.active = true
      LEFT JOIN latest_cost lc ON lc.inventory_item_id = i.id
      WHERE i.location_id = ${locationId}::uuid AND i.active = true
      ORDER BY i.name
    `);

    const items: ParLevelDashboardItem[] = rows.map((row) => {
      const currentOnHandUnits = Number(row.current_on_hand ?? 0);
      const avgDailyUsage = row.avg_daily != null ? Number(row.avg_daily) : null;
      const parLevel = row.par_level != null ? Number(row.par_level) : null;
      const minLevel = row.min_level != null ? Number(row.min_level) : null;
      const reorderQty = row.reorder_qty != null ? Number(row.reorder_qty) : null;
      const parUom = (row.par_uom as "unit" | "package") ?? "unit";
      const packSize = row.pack_size != null ? Number(row.pack_size) : null;
      const packUom = row.pack_uom;
      const leadTimeDays = row.lead_time_days;
      const safetyStockDays = row.safety_stock_days;
      const unitCost = row.unit_cost != null ? Number(row.unit_cost) : null;

      // Convert on-hand to par UOM for comparison
      const currentOnHand =
        parUom === "package" && packSize && packSize > 0
          ? currentOnHandUnits / packSize
          : currentOnHandUnits;

      // Days to stockout (always computed in units)
      const daysToStockout =
        avgDailyUsage != null && avgDailyUsage > 0
          ? Math.max(0, Math.floor(currentOnHandUnits / avgDailyUsage))
          : null;

      // Suggested order qty in par UOM
      let suggestedOrderQty: number | null = null;
      if (parLevel != null) {
        if (reorderQty != null) {
          suggestedOrderQty = currentOnHand < parLevel ? reorderQty : 0;
        } else {
          suggestedOrderQty = Math.max(0, parLevel - currentOnHand);
        }
      }

      const needsReorder = minLevel != null && currentOnHand <= minLevel;

      // Cost: convert suggestedOrderQty back to units for cost calculation
      let estimatedOrderCost: number | null = null;
      if (suggestedOrderQty != null && unitCost != null) {
        const orderUnits =
          parUom === "package" && packSize && packSize > 0
            ? suggestedOrderQty * packSize
            : suggestedOrderQty;
        estimatedOrderCost = orderUnits * unitCost;
      }

      // Status
      let status: "green" | "yellow" | "red" | "none" = "none";
      if (parLevel != null && minLevel != null) {
        if (currentOnHand <= minLevel) {
          status = "red";
        } else if (currentOnHand <= parLevel) {
          status = "yellow";
        } else {
          status = "green";
        }
      }

      return {
        inventoryItemId: row.inventory_item_id,
        itemName: row.item_name,
        categoryName: row.category_name,
        categoryId: row.category_id,
        vendorId: row.vendor_id,
        vendorName: row.vendor_name,
        vendorEmail: row.vendor_email,
        vendorPhone: row.vendor_phone,
        vendorSku: row.vendor_sku,
        uom: row.base_uom,
        parUom,
        packSize,
        packUom,
        currentOnHand,
        avgDailyUsage,
        parLevelId: row.par_level_id,
        parLevel,
        minLevel,
        reorderQty,
        leadTimeDays,
        safetyStockDays,
        daysToStockout,
        suggestedOrderQty,
        needsReorder,
        unitCost,
        estimatedOrderCost,
        status,
      };
    });

    // Apply filters
    let filtered = items;
    if (vendorId) {
      filtered = filtered.filter((i) => i.vendorId === vendorId);
    }
    if (categoryId) {
      filtered = filtered.filter((i) => i.categoryId === categoryId);
    }
    if (belowParOnly) {
      filtered = filtered.filter((i) => i.needsReorder);
    }

    return filtered;
  }

  async getReorderSuggestions(
    locationId: string,
    vendorId?: string
  ): Promise<ReorderSuggestion[]> {
    const allItems = await this.list(locationId);
    const reorderItems = allItems.filter(
      (i) => i.needsReorder && i.vendorId && i.parLevelId
    );

    if (vendorId) {
      const filtered = reorderItems.filter((i) => i.vendorId === vendorId);
      return this.groupByVendor(filtered);
    }

    return this.groupByVendor(reorderItems);
  }

  private groupByVendor(items: ParLevelDashboardItem[]): ReorderSuggestion[] {
    const vendorMap = new Map<string, ReorderSuggestion>();

    for (const item of items) {
      if (!item.vendorId) continue;
      const orderQty = item.suggestedOrderQty ?? Math.max(0, (item.parLevel ?? 0) - item.currentOnHand);
      const estimatedCost = item.unitCost != null ? orderQty * item.unitCost : null;

      if (!vendorMap.has(item.vendorId)) {
        vendorMap.set(item.vendorId, {
          vendorId: item.vendorId,
          vendorName: item.vendorName ?? "(Unknown)",
          vendorEmail: item.vendorEmail,
          vendorPhone: item.vendorPhone,
          itemCount: 0,
          totalEstimatedCost: 0,
          items: [],
        });
      }

      const vendor = vendorMap.get(item.vendorId)!;
      vendor.itemCount++;
      if (estimatedCost != null) {
        vendor.totalEstimatedCost += estimatedCost;
      }
      vendor.items.push({
        inventoryItemId: item.inventoryItemId,
        itemName: item.itemName,
        vendorSku: item.vendorSku,
        uom: item.uom,
        parUom: item.parUom,
        packSize: item.packSize,
        currentOnHand: item.currentOnHand,
        parLevel: item.parLevel ?? 0,
        minLevel: item.minLevel ?? 0,
        orderQty,
        unitCost: item.unitCost,
        estimatedCost,
      });
    }

    return Array.from(vendorMap.values()).sort((a, b) =>
      a.vendorName.localeCompare(b.vendorName)
    );
  }

  async create(input: ParLevelCreateInput) {
    return this.prisma.parLevel.create({
      data: {
        inventoryItemId: input.inventoryItemId,
        vendorId: input.vendorId,
        locationId: input.locationId,
        parLevel: input.parLevel,
        minLevel: input.minLevel,
        reorderQty: input.reorderQty ?? undefined,
        parUom: input.parUom,
        leadTimeDays: input.leadTimeDays,
        safetyStockDays: input.safetyStockDays,
      },
    });
  }

  async update(id: string, input: ParLevelUpdateInput) {
    return this.prisma.parLevel.update({
      where: { id },
      data: {
        ...input,
        reorderQty: input.reorderQty ?? undefined,
      },
    });
  }

  async delete(id: string) {
    return this.prisma.parLevel.update({
      where: { id },
      data: { active: false },
    });
  }

  async bulkUpsert(input: ParLevelBulkUpsertInput) {
    const results = await this.prisma.$transaction(
      input.items.map((item) =>
        this.prisma.parLevel.upsert({
          where: {
            inventoryItemId_vendorId_locationId: {
              inventoryItemId: item.inventoryItemId,
              vendorId: item.vendorId,
              locationId: input.locationId,
            },
          },
          create: {
            inventoryItemId: item.inventoryItemId,
            vendorId: item.vendorId,
            locationId: input.locationId,
            parLevel: item.parLevel,
            minLevel: item.minLevel,
            reorderQty: item.reorderQty ?? undefined,
            parUom: item.parUom,
            leadTimeDays: item.leadTimeDays,
            safetyStockDays: item.safetyStockDays,
          },
          update: {
            parLevel: item.parLevel,
            minLevel: item.minLevel,
            reorderQty: item.reorderQty ?? undefined,
            parUom: item.parUom,
            leadTimeDays: item.leadTimeDays,
            safetyStockDays: item.safetyStockDays,
            active: true,
          },
        })
      )
    );
    return results;
  }
}
