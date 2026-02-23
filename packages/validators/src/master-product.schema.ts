import { z } from "zod";
import { UOM } from "@barstock/types";

export const masterProductLookupSchema = z.object({
  barcode: z.string().min(1),
});

export const masterProductContributeSchema = z.object({
  barcode: z.string().min(1),
  name: z.string().min(1).max(255),
  categoryHint: z.string().max(100).optional(),
  baseUom: z.nativeEnum(UOM).optional(),
  containerSizeMl: z.number().positive().optional(),
  emptyBottleWeightG: z.number().positive().optional(),
  fullBottleWeightG: z.number().positive().optional(),
  densityGPerMl: z.number().positive().optional(),
});

export type MasterProductLookupInput = z.infer<typeof masterProductLookupSchema>;
export type MasterProductContributeInput = z.infer<typeof masterProductContributeSchema>;
