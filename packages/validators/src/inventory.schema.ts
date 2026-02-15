import { z } from "zod";
import { InventoryItemType, UOM } from "@barstock/types";

export const inventoryItemCreateSchema = z.object({
  locationId: z.string().uuid(),
  name: z.string().min(1).max(255),
  type: z.nativeEnum(InventoryItemType),
  barcode: z.string().optional(),
  vendorSku: z.string().optional(),
  baseUom: z.nativeEnum(UOM),
  packSize: z.number().positive().optional(),
  packUom: z.nativeEnum(UOM).optional(),
});

export const inventoryItemUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  type: z.nativeEnum(InventoryItemType).optional(),
  barcode: z.string().nullable().optional(),
  vendorSku: z.string().nullable().optional(),
  baseUom: z.nativeEnum(UOM).optional(),
  packSize: z.number().positive().nullable().optional(),
  packUom: z.nativeEnum(UOM).nullable().optional(),
  active: z.boolean().optional(),
});

export const priceHistoryCreateSchema = z.object({
  inventoryItemId: z.string().uuid(),
  unitCost: z.number().min(0),
  currency: z.string().default("CAD"),
  effectiveFromTs: z.coerce.date(),
  effectiveToTs: z.coerce.date().optional(),
});

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
