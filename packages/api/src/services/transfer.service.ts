import { Prisma } from "@prisma/client";
import type { ExtendedPrismaClient } from "@barstock/database";
import type { TransferCreateInput } from "@barstock/validators";

export interface TransferResult {
  fromEventId: string;
  toEventId: string;
}

export class TransferService {
  constructor(private prisma: ExtendedPrismaClient) {}

  async createTransfer(
    input: TransferCreateInput
  ): Promise<TransferResult> {
    const { locationId, inventoryItemId, fromSubAreaId, toSubAreaId, quantity, notes } = input;

    // Validate sub-areas exist and belong to this location
    const [fromSubArea, toSubArea, item] = await Promise.all([
      this.prisma.subArea.findUnique({
        where: { id: fromSubAreaId },
        include: { barArea: true },
      }),
      this.prisma.subArea.findUnique({
        where: { id: toSubAreaId },
        include: { barArea: true },
      }),
      this.prisma.inventoryItem.findUnique({
        where: { id: inventoryItemId },
      }),
    ]);

    if (!fromSubArea || fromSubArea.barArea.locationId !== locationId) {
      throw new Error("Source sub-area not found or does not belong to this location");
    }
    if (!toSubArea || toSubArea.barArea.locationId !== locationId) {
      throw new Error("Destination sub-area not found or does not belong to this location");
    }
    if (!item) {
      throw new Error("Inventory item not found");
    }

    const now = new Date();
    const transferNote = notes
      ? `Transfer: ${fromSubArea.barArea.name}/${fromSubArea.name} → ${toSubArea.barArea.name}/${toSubArea.name} — ${notes}`
      : `Transfer: ${fromSubArea.barArea.name}/${fromSubArea.name} → ${toSubArea.barArea.name}/${toSubArea.name}`;

    // Create two consumption events: negative from source, positive to destination
    const [fromEvent, toEvent] = await this.prisma.$transaction([
      this.prisma.consumptionEvent.create({
        data: {
          locationId,
          eventType: "transfer",
          sourceSystem: "manual",
          eventTs: now,
          inventoryItemId,
          quantityDelta: new Prisma.Decimal(-quantity),
          uom: item.baseUom,
          confidenceLevel: "measured",
          notes: transferNote,
        },
      }),
      this.prisma.consumptionEvent.create({
        data: {
          locationId,
          eventType: "transfer",
          sourceSystem: "manual",
          eventTs: now,
          inventoryItemId,
          quantityDelta: new Prisma.Decimal(quantity),
          uom: item.baseUom,
          confidenceLevel: "measured",
          notes: transferNote,
        },
      }),
    ]);

    return {
      fromEventId: fromEvent.id,
      toEventId: toEvent.id,
    };
  }
}
