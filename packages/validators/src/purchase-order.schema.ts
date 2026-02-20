import { z } from "zod";

const parUom = z.enum(["unit", "package"]);

export const purchaseOrderCreateSchema = z.object({
  locationId: z.string().uuid(),
  vendorId: z.string().uuid(),
  notes: z.string().optional(),
  lines: z.array(
    z.object({
      inventoryItemId: z.string().uuid(),
      orderedQty: z.number().min(0),
      orderedUom: parUom.default("unit"),
    })
  ),
});

export const purchaseOrderPickupSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  lines: z.array(
    z.object({
      lineId: z.string().uuid(),
      pickedUpQty: z.number().min(0),
    })
  ),
});

export const purchaseOrderListSchema = z.object({
  locationId: z.string().uuid(),
  status: z.enum(["open", "partially_fulfilled", "closed"]).optional(),
  vendorId: z.string().uuid().optional(),
});

export const purchaseOrderCloseSchema = z.object({
  purchaseOrderId: z.string().uuid(),
});

export type PurchaseOrderCreateInput = z.infer<typeof purchaseOrderCreateSchema>;
export type PurchaseOrderPickupInput = z.infer<typeof purchaseOrderPickupSchema>;
export type PurchaseOrderListInput = z.infer<typeof purchaseOrderListSchema>;
export type PurchaseOrderCloseInput = z.infer<typeof purchaseOrderCloseSchema>;
