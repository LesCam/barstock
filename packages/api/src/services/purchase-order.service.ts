import type { ExtendedPrismaClient } from "@barstock/database";
import { Prisma } from "@prisma/client";
import type {
  PurchaseOrderCreateInput,
  PurchaseOrderPickupInput,
  PurchaseOrderListInput,
  PurchaseOrderCloseInput,
  OrderTrendsQueryInput,
} from "@barstock/validators";

export class PurchaseOrderService {
  constructor(private prisma: ExtendedPrismaClient) {}

  async create(input: PurchaseOrderCreateInput, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        data: {
          locationId: input.locationId,
          vendorId: input.vendorId,
          createdBy: userId,
          notes: input.notes,
          status: "open",
          lines: {
            create: input.lines.map((line) => ({
              inventoryItemId: line.inventoryItemId,
              orderedQty: line.orderedQty,
              orderedUom: line.orderedUom,
            })),
          },
        },
        include: {
          lines: {
            include: {
              inventoryItem: {
                select: { id: true, name: true, packSize: true, baseUom: true, vendorSku: true },
              },
            },
          },
          vendor: { select: { id: true, name: true } },
        },
      });
      return po;
    });
  }

  async list(input: PurchaseOrderListInput) {
    const where: Prisma.PurchaseOrderWhereInput = {
      locationId: input.locationId,
    };
    if (input.status) where.status = input.status;
    if (input.vendorId) where.vendorId = input.vendorId;

    return this.prisma.purchaseOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        vendor: { select: { id: true, name: true, contactPhone: true } },
        creator: { select: { id: true, email: true, firstName: true, lastName: true } },
        lines: {
          include: {
            inventoryItem: {
              select: { id: true, name: true, packSize: true, baseUom: true, vendorSku: true },
            },
          },
        },
      },
    });
  }

  async getById(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        vendor: { select: { id: true, name: true, contactEmail: true, contactPhone: true } },
        creator: { select: { id: true, email: true, firstName: true, lastName: true } },
        location: { select: { id: true, name: true } },
        lines: {
          include: {
            inventoryItem: {
              select: { id: true, name: true, packSize: true, baseUom: true, vendorSku: true },
            },
          },
        },
      },
    });
    if (!po) throw new Error("Purchase order not found");
    return po;
  }

  async recordPickup(input: PurchaseOrderPickupInput, userId: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id: input.purchaseOrderId },
      include: {
        lines: {
          include: {
            inventoryItem: { select: { id: true, baseUom: true, packSize: true, name: true } },
          },
        },
      },
    });

    if (!po) throw new Error("Purchase order not found");
    if (po.status === "closed") throw new Error("Purchase order is already closed");

    const eventIds: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const pickup of input.lines) {
        const line = po.lines.find((l) => l.id === pickup.lineId);
        if (!line) continue;
        if (pickup.pickedUpQty <= 0) continue;

        // Update the line's pickedUpQty
        await tx.purchaseOrderLine.update({
          where: { id: line.id },
          data: {
            pickedUpQty: {
              increment: new Prisma.Decimal(pickup.pickedUpQty),
            },
          },
        });

        // Convert to units for receiving event
        const packSize = line.inventoryItem.packSize
          ? Number(line.inventoryItem.packSize)
          : 1;
        const unitsReceived =
          line.orderedUom === "package"
            ? pickup.pickedUpQty * packSize
            : pickup.pickedUpQty;

        // Create receiving consumption event
        const event = await tx.consumptionEvent.create({
          data: {
            locationId: po.locationId,
            eventType: "receiving",
            sourceSystem: "manual",
            eventTs: new Date(),
            inventoryItemId: line.inventoryItemId,
            quantityDelta: new Prisma.Decimal(unitsReceived),
            uom: line.inventoryItem.baseUom,
            confidenceLevel: "measured",
            notes: `PO pickup: ${pickup.pickedUpQty} ${line.orderedUom === "package" ? "cases" : "units"} of ${line.inventoryItem.name}`,
          },
        });
        eventIds.push(event.id);
      }

      // Update PO status
      const updatedLines = await tx.purchaseOrderLine.findMany({
        where: { purchaseOrderId: po.id },
      });

      const allFulfilled = updatedLines.every(
        (l) => Number(l.pickedUpQty) >= Number(l.orderedQty)
      );
      const anyFulfilled = updatedLines.some(
        (l) => Number(l.pickedUpQty) > 0
      );

      if (allFulfilled) {
        await tx.purchaseOrder.update({
          where: { id: po.id },
          data: { status: "closed", closedAt: new Date() },
        });
      } else if (anyFulfilled) {
        await tx.purchaseOrder.update({
          where: { id: po.id },
          data: { status: "partially_fulfilled" },
        });
      }
    });

    return { eventIds, count: eventIds.length };
  }

  async close(input: PurchaseOrderCloseInput) {
    return this.prisma.purchaseOrder.update({
      where: { id: input.purchaseOrderId },
      data: { status: "closed", closedAt: new Date() },
    });
  }

  async generateTextOrder(id: string): Promise<string> {
    const po = await this.getById(id);

    const date = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const lines = po.lines.map((line) => {
      const packSize = line.inventoryItem.packSize
        ? Number(line.inventoryItem.packSize)
        : null;
      const uomLabel =
        line.orderedUom === "package" && packSize
          ? `cases (${packSize}/cs)`
          : "units";
      const sku = line.inventoryItem.vendorSku
        ? ` (SKU: ${line.inventoryItem.vendorSku})`
        : "";
      return `${line.inventoryItem.name} - ${Number(line.orderedQty)} ${uomLabel}${sku}`;
    });

    const parts = [
      `Order for ${po.vendor.name}`,
      date,
      "",
      ...lines,
    ];

    if (po.notes) {
      parts.push("", `Notes: ${po.notes}`);
    }

    return parts.join("\n");
  }

  async getOrderTrends(input: OrderTrendsQueryInput) {
    const { locationId, monthsBack } = input;
    const since = new Date();
    since.setMonth(since.getMonth() - monthsBack);

    // Monthly spend
    const monthlySpend = await this.prisma.$queryRaw<
      { month: Date; total_spend: number; order_count: number }[]
    >`
      SELECT
        date_trunc('month', po.created_at) AS month,
        COALESCE(SUM(pol.ordered_qty * ii.unit_cost), 0)::float AS total_spend,
        COUNT(DISTINCT po.id)::int AS order_count
      FROM purchase_orders po
      JOIN purchase_order_lines pol ON pol.purchase_order_id = po.id
      JOIN inventory_items ii ON ii.id = pol.inventory_item_id
      WHERE po.location_id = ${locationId}::uuid
        AND po.created_at >= ${since}
      GROUP BY date_trunc('month', po.created_at)
      ORDER BY month
    `;

    // By vendor
    const byVendor = await this.prisma.$queryRaw<
      { vendor_id: string; vendor_name: string; order_count: number; total_spend: number; last_order: Date }[]
    >`
      SELECT
        v.id AS vendor_id,
        v.name AS vendor_name,
        COUNT(DISTINCT po.id)::int AS order_count,
        COALESCE(SUM(pol.ordered_qty * ii.unit_cost), 0)::float AS total_spend,
        MAX(po.created_at) AS last_order
      FROM purchase_orders po
      JOIN vendors v ON v.id = po.vendor_id
      JOIN purchase_order_lines pol ON pol.purchase_order_id = po.id
      JOIN inventory_items ii ON ii.id = pol.inventory_item_id
      WHERE po.location_id = ${locationId}::uuid
        AND po.created_at >= ${since}
      GROUP BY v.id, v.name
      ORDER BY total_spend DESC
      LIMIT 20
    `;

    // Top ordered items
    const topItems = await this.prisma.$queryRaw<
      { item_id: string; item_name: string; total_ordered: number; times_ordered: number }[]
    >`
      SELECT
        ii.id AS item_id,
        ii.name AS item_name,
        SUM(pol.ordered_qty)::float AS total_ordered,
        COUNT(DISTINCT po.id)::int AS times_ordered
      FROM purchase_orders po
      JOIN purchase_order_lines pol ON pol.purchase_order_id = po.id
      JOIN inventory_items ii ON ii.id = pol.inventory_item_id
      WHERE po.location_id = ${locationId}::uuid
        AND po.created_at >= ${since}
      GROUP BY ii.id, ii.name
      ORDER BY total_ordered DESC
      LIMIT 20
    `;

    // Avg fulfillment time (closed orders only)
    const fulfillment = await this.prisma.$queryRaw<
      { avg_days: number | null }[]
    >`
      SELECT
        AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 86400)::float AS avg_days
      FROM purchase_orders
      WHERE location_id = ${locationId}::uuid
        AND created_at >= ${since}
        AND status = 'closed'
        AND closed_at IS NOT NULL
    `;

    const totalSpend = monthlySpend.reduce((sum, m) => sum + m.total_spend, 0);
    const totalOrders = monthlySpend.reduce((sum, m) => sum + m.order_count, 0);

    return {
      totalSpend,
      totalOrders,
      avgFulfillmentDays: fulfillment[0]?.avg_days ?? null,
      topVendor: byVendor[0]?.vendor_name ?? null,
      monthlySpend: monthlySpend.map((m) => ({
        month: m.month.toISOString(),
        totalSpend: m.total_spend,
        orderCount: m.order_count,
      })),
      byVendor: byVendor.map((v) => ({
        vendorId: v.vendor_id,
        vendorName: v.vendor_name,
        orderCount: v.order_count,
        totalSpend: v.total_spend,
        lastOrder: v.last_order.toISOString(),
      })),
      topItems: topItems.map((i) => ({
        itemId: i.item_id,
        itemName: i.item_name,
        totalOrdered: i.total_ordered,
        timesOrdered: i.times_ordered,
      })),
    };
  }
}
