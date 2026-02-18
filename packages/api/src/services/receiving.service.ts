import { Prisma } from "@prisma/client";
import type { ExtendedPrismaClient } from "@barstock/database";
import { NotificationService } from "./notification.service";

export interface ReceiveStockInput {
  locationId: string;
  inventoryItemId: string;
  quantity: number;
  vendorId?: string;
  notes?: string;
}

export interface ReceiveStockResult {
  eventId: string;
  notificationSent: boolean;
}

export class ReceivingService {
  constructor(private prisma: ExtendedPrismaClient) {}

  async receiveStock(
    input: ReceiveStockInput,
    userId: string
  ): Promise<ReceiveStockResult> {
    const { locationId, inventoryItemId, quantity, vendorId, notes } = input;

    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: inventoryItemId },
    });
    if (!item) throw new Error("Inventory item not found");

    // Build notes string
    let eventNotes = `Received ${quantity} ${item.baseUom}`;
    if (vendorId) {
      const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
      if (vendor) eventNotes += ` from ${vendor.name}`;
    }
    if (notes) eventNotes += ` — ${notes}`;

    // Create positive consumption event for receiving
    const event = await this.prisma.consumptionEvent.create({
      data: {
        locationId,
        eventType: "receiving",
        sourceSystem: "manual",
        eventTs: new Date(),
        inventoryItemId,
        quantityDelta: new Prisma.Decimal(quantity),
        uom: item.baseUom,
        confidenceLevel: "measured",
        notes: eventNotes,
      },
    });

    // Notify business owners
    let notificationSent = false;
    try {
      const location = await this.prisma.location.findUnique({
        where: { id: locationId },
        select: { businessId: true, name: true },
      });
      if (location) {
        const receivingUser = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { email: true },
        });

        // Find all business_admin users for this business
        const admins = await this.prisma.userLocation.findMany({
          where: {
            location: { businessId: location.businessId },
            role: "business_admin",
          },
          select: { userId: true },
          distinct: ["userId"],
        });

        const notifService = new NotificationService(this.prisma);
        for (const admin of admins) {
          await notifService.send({
            businessId: location.businessId,
            recipientUserId: admin.userId,
            title: "Stock Received",
            body: `${receivingUser?.email ?? "Staff"} received ${quantity} ${item.baseUom} of ${item.name} at ${location.name}`,
          });
        }
        notificationSent = admins.length > 0;
      }
    } catch {
      // Don't fail the receive if notification fails
    }

    return { eventId: event.id, notificationSent };
  }
}
