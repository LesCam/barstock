import { router, protectedProcedure } from "../trpc";
import { z } from "zod";
import { SettingsService } from "../services/settings.service";
import { TareConsensusService } from "../services/tare-consensus.service";

export const tareObservationsRouter = router({
  /**
   * Contribute a tare weight observation to the global database.
   * Silently skips if business has sharing disabled (no error).
   */
  contribute: protectedProcedure
    .input(
      z.object({
        barcode: z.string().min(1),
        measuredWeightG: z.number().min(10).max(3000),
        sourceType: z.enum(["empty_confirmed", "manual_template", "imported"]),
        sessionId: z.string().uuid().optional(),
        containerSizeMl: z.number().positive().optional(),
        scaleDeviceId: z.string().optional(),
        isManualEntry: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check sharing opt-in — silently skip if disabled
      const settingsService = new SettingsService(ctx.prisma);
      const settings = await settingsService.getSettings(ctx.user.businessId);
      if (!settings.masterProductSharing.optedIn) return { skipped: true };

      await ctx.prisma.tareObservation.create({
        data: {
          barcode: input.barcode,
          measuredWeightG: input.measuredWeightG,
          sourceType: input.sourceType,
          sourceBusinessId: ctx.user.businessId,
          sourceUserId: ctx.user.userId,
          sessionId: input.sessionId,
          containerSizeMl: input.containerSizeMl,
          scaleDeviceId: input.scaleDeviceId,
          isManualEntry: input.isManualEntry,
        },
      });

      // Recalculate consensus
      const consensus = new TareConsensusService(ctx.prisma);
      await consensus.recalculate(input.barcode);

      return { skipped: false };
    }),

  /** Get tare suggestion for a single barcode */
  getSuggestion: protectedProcedure
    .input(z.object({ barcode: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const consensus = new TareConsensusService(ctx.prisma);
      return consensus.getSuggestion(input.barcode);
    }),

  /** Batch get tare suggestions for multiple barcodes */
  batchGetSuggestions: protectedProcedure
    .input(z.object({ barcodes: z.array(z.string().min(1)).max(200) }))
    .query(async ({ ctx, input }) => {
      if (input.barcodes.length === 0) return {};

      const products = await ctx.prisma.masterProduct.findMany({
        where: {
          barcode: { in: input.barcodes },
          tareSampleCount: { gt: 0 },
        },
        select: {
          barcode: true,
          emptyBottleWeightG: true,
          tareStdDev: true,
          tareSampleCount: true,
          tareConfidence: true,
        },
      });

      const result: Record<
        string,
        { tareWeightG: number; stdDev: number; sampleCount: number; confidence: number }
      > = {};

      for (const mp of products) {
        result[mp.barcode] = {
          tareWeightG: Number(mp.emptyBottleWeightG),
          stdDev: mp.tareStdDev != null ? Number(mp.tareStdDev) : 0,
          sampleCount: mp.tareSampleCount,
          confidence: mp.tareConfidence,
        };
      }

      return result;
    }),
});
