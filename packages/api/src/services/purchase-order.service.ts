import type { ExtendedPrismaClient } from "@barstock/database";
import { Prisma } from "@prisma/client";
import type {
  PurchaseOrderCreateInput,
  PurchaseOrderPickupInput,
  PurchaseOrderListInput,
  PurchaseOrderCloseInput,
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
}
