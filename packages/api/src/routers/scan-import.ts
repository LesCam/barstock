import { router, protectedProcedure } from "../trpc";
import { z } from "zod";
import { scanImportEmitter } from "../lib/scan-import-emitter";

const scanImportItemSchema = z.object({
  scanSessionId: z.string().uuid(),
  barcode: z.string().min(1),
  name: z.string().min(1).max(255),
  categoryId: z.string().uuid(),
  categoryName: z.string(),
  baseUom: z.string(),
  containerSizeMl: z.number().positive().optional(),
  emptyBottleWeightG: z.number().positive().optional(),
  fullBottleWeightG: z.number().positive().optional(),
  densityGPerMl: z.number().positive().optional(),
});

export const scanImportRouter = router({
  addItem: protectedProcedure
    .input(scanImportItemSchema)
    .mutation(({ input }) => {
      const { scanSessionId, ...item } = input;
      scanImportEmitter.notifyScanSession(scanSessionId, {
        type: "item_added",
        payload: item,
      });
      return { success: true };
    }),

  removeItem: protectedProcedure
    .input(
      z.object({
        scanSessionId: z.string().uuid(),
        barcode: z.string().min(1),
      })
    )
    .mutation(({ input }) => {
      scanImportEmitter.notifyScanSession(input.scanSessionId, {
        type: "item_removed",
        payload: { barcode: input.barcode },
      });
      return { success: true };
    }),

  scanBarcode: protectedProcedure
    .input(z.object({ scanSessionId: z.string().uuid(), barcode: z.string().min(1) }))
    .mutation(({ input }) => {
      scanImportEmitter.notifyScanSession(input.scanSessionId, {
        type: "barcode_scanned",
        payload: { barcode: input.barcode },
      });
      return { success: true };
    }),
});
