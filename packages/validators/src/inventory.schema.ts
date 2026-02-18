import { z } from "zod";
import { UOM } from "@barstock/types";

export const inventoryItemCreateSchema = z.object({
  locationId: z.string().uuid(),
  name: z.string().min(1).max(255),
  categoryId: z.string().uuid(),
  barcode: z.string().optional(),
  vendorSku: z.string().optional(),
  baseUom: z.nativeEnum(UOM),
  packSize: z.number().positive().optional(),
  packUom: z.nativeEnum(UOM).optional(),
  containerSize: z.number().positive().optional(),
  containerUom: z.nativeEnum(UOM).optional(),
});

export const inventoryItemUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  categoryId: z.string().uuid().optional(),
  barcode: z.string().nullable().optional(),
  vendorSku: z.string().nullable().optional(),
  baseUom: z.nativeEnum(UOM).optional(),
  packSize: z.number().positive().nullable().optional(),
  packUom: z.nativeEnum(UOM).nullable().optional(),
  containerSize: z.number().positive().nullable().optional(),
  containerUom: z.nativeEnum(UOM).nullable().optional(),
  active: z.boolean().optional(),
});

export const priceHistoryCreateSchema = z
  .object({
    inventoryItemId: z.string().uuid(),
    unitCost: z.number().min(0).optional(),
    currency: z.string().default("CAD"),
    effectiveFromTs: z.coerce.date(),
    effectiveToTs: z.coerce.date().optional(),
    entryMode: z.enum(["per_unit", "per_container"]).default("per_unit"),
    containerCost: z.number().min(0).optional(),
    containerSizeOz: z.number().positive().optional(),
  })
  .refine(
    (data) => {
      if (data.entryMode === "per_container") {
        return data.containerCost != null && data.containerSizeOz != null;
      }
      return data.unitCost != null;
    },
    {
      message:
        "Per-container mode requires containerCost and containerSizeOz; per-unit mode requires unitCost",
    }
  );

export const onHandQuerySchema = z.object({
  locationId: z.string().uuid(),
  asOf: z.coerce.date().optional(),
});

export type InventoryItemCreateInput = z.infer<
  typeof inventoryItemCreateSchema
>;
export type InventoryItemUpdateInput = z.infer<
  typeof inventoryItemUpdateSchema
>;
export type PriceHistoryCreateInput = z.infer<typeof priceHistoryCreateSchema>;
export type OnHandQueryInput = z.infer<typeof onHandQuerySchema>;
