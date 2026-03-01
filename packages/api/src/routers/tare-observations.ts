import { router, protectedProcedure, requireRole } from "../trpc";
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
          tareContributorCount: true,
          redesignSuspected: true,
        },
      });

      const result: Record<
        string,
        {
          tareWeightG: number;
          stdDev: number;
          sampleCount: number;
          confidence: number;
          contributorCount: number;
          redesignSuspected: boolean;
        }
      > = {};

      for (const mp of products) {
        result[mp.barcode] = {
          tareWeightG: Number(mp.emptyBottleWeightG),
          stdDev: mp.tareStdDev != null ? Number(mp.tareStdDev) : 0,
          sampleCount: mp.tareSampleCount,
          confidence: mp.tareConfidence,
          contributorCount: mp.tareContributorCount,
          redesignSuspected: mp.redesignSuspected,
        };
      }

      return result;
    }),

  /** List all master products flagged as possible redesigns (platform_admin only) */
  listRedesignSuspects: protectedProcedure
    .use(requireRole("platform_admin"))
    .query(async ({ ctx }) => {
      return ctx.prisma.masterProduct.findMany({
        where: { redesignSuspected: true },
        select: {
          barcode: true,
          name: true,
          emptyBottleWeightG: true,
          tareStdDev: true,
          tareSampleCount: true,
          tareConfidence: true,
          tareContributorCount: true,
          tareLastUpdatedAt: true,
        },
        orderBy: { tareLastUpdatedAt: "desc" },
      });
    }),

  /** Dismiss redesign flag for a barcode (platform_admin only) */
  dismissRedesign: protectedProcedure
    .use(requireRole("platform_admin"))
    .input(z.object({ barcode: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.masterProduct.updateMany({
        where: { barcode: input.barcode },
        data: { redesignSuspected: false },
      });
      return { success: true };
    }),
});
