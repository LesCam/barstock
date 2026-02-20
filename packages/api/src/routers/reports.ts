import { router, protectedProcedure } from "../trpc";
import { varianceReportQuerySchema, onHandReportQuerySchema, usageReportQuerySchema, cogsReportQuerySchema, businessRollupQuerySchema, expectedOnHandQuerySchema, variancePatternsQuerySchema } from "@barstock/validators";
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

  cogs: protectedProcedure
    .input(cogsReportQuerySchema)
    .query(({ ctx, input }) => {
      const svc = new ReportService(ctx.prisma);
      return svc.getCOGSReport(input.locationId, input.fromDate, input.toDate);
    }),

  businessRollup: protectedProcedure
    .input(businessRollupQuerySchema)
    .query(({ ctx, input }) => {
      const svc = new ReportService(ctx.prisma);
      return svc.getBusinessRollup(input.businessId, input.asOfDate);
    }),

  expectedOnHand: protectedProcedure
    .input(expectedOnHandQuerySchema)
    .query(({ ctx, input }) => {
      const svc = new ReportService(ctx.prisma);
      return svc.getExpectedOnHandDashboard(input.locationId);
    }),

  variancePatterns: protectedProcedure
    .input(variancePatternsQuerySchema)
    .query(({ ctx, input }) => {
      const svc = new VarianceService(ctx.prisma);
      return svc.analyzeVariancePatterns(input.locationId, input.sessionCount);
    }),
});
