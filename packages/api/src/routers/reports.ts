import { router, protectedProcedure } from "../trpc";
import { varianceReportQuerySchema, onHandReportQuerySchema, usageReportQuerySchema, orgRollupQuerySchema } from "@barstock/validators";
import { VarianceService } from "../services/variance.service";
import { ReportService } from "../services/report.service";

export const reportsRouter = router({
  variance: protectedProcedure
    .input(varianceReportQuerySchema)
    .query(({ ctx, input }) => {
      const svc = new VarianceService(ctx.prisma);
      return svc.calculateVarianceReport(input.locationId, input.fromDate, input.toDate);
    }),

  onHand: protectedProcedure
    .input(onHandReportQuerySchema)
    .query(({ ctx, input }) => {
      const svc = new ReportService(ctx.prisma);
      return svc.getOnHandReport(input.locationId, input.asOfDate);
    }),

  usage: protectedProcedure
    .input(usageReportQuerySchema)
    .query(({ ctx, input }) => {
      const svc = new ReportService(ctx.prisma);
      return svc.getUsageReport(input.locationId, input.fromDate, input.toDate);
    }),

  orgRollup: protectedProcedure
    .input(orgRollupQuerySchema)
    .query(({ ctx, input }) => {
      const svc = new ReportService(ctx.prisma);
      return svc.getOrgRollup(input.orgId, input.asOfDate);
    }),
});
