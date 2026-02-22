import { router, protectedProcedure, requireRole } from "../trpc";
import { varianceReportQuerySchema, onHandReportQuerySchema, usageReportQuerySchema, cogsReportQuerySchema, businessRollupQuerySchema, expectedOnHandQuerySchema, variancePatternsQuerySchema, varianceTrendQuerySchema, varianceHeatmapQuerySchema, varianceReasonDistributionQuerySchema, staffAccountabilityQuerySchema, usageOverTimeQuerySchema, recipeAnalyticsQuerySchema, recipeDetailQuerySchema, usageItemDetailQuerySchema, usageByVendorQuerySchema, pourCostQuerySchema, portfolioRollupQuerySchema, staffVarianceReasonBreakdownQuerySchema, staffItemVarianceQuerySchema, forecastDashboardQuerySchema, forecastAccuracyQuerySchema, forecastItemDetailQuerySchema } from "@barstock/validators";
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

  varianceTrend: protectedProcedure
    .input(varianceTrendQuerySchema)
    .query(({ ctx, input }) => {
      const svc = new VarianceService(ctx.prisma);
      return svc.getVarianceTrend(input.locationId, input.weeksBack);
    }),

  varianceHeatmap: protectedProcedure
    .input(varianceHeatmapQuerySchema)
    .query(({ ctx, input }) => {
      const svc = new VarianceService(ctx.prisma);
      return svc.getVarianceHeatmap(input.locationId, input.fromDate, input.toDate);
    }),

  varianceReasonDistribution: protectedProcedure
    .input(varianceReasonDistributionQuerySchema)
    .query(({ ctx, input }) => {
      const svc = new VarianceService(ctx.prisma);
      return svc.getVarianceReasonDistribution(input.locationId, input.fromDate, input.toDate);
    }),

  staffAccountability: protectedProcedure
    .input(staffAccountabilityQuerySchema)
    .query(({ ctx, input }) => {
      const svc = new VarianceService(ctx.prisma);
      return svc.getStaffAccountability(input.locationId, input.fromDate, input.toDate);
    }),

  usageOverTime: protectedProcedure
    .input(usageOverTimeQuerySchema)
    .query(({ ctx, input }) => {
      const svc = new ReportService(ctx.prisma);
      return svc.getUsageOverTime(
        input.locationId,
        input.fromDate,
        input.toDate,
        input.granularity,
        input.categoryId
      );
    }),

  recipeAnalytics: protectedProcedure
    .input(recipeAnalyticsQuerySchema)
    .query(({ ctx, input }) => {
      const svc = new ReportService(ctx.prisma);
      return svc.getRecipeAnalytics(
        input.locationId,
        input.fromDate,
        input.toDate,
        input.granularity
      );
    }),

  recipeDetail: protectedProcedure
    .input(recipeDetailQuerySchema)
    .query(({ ctx, input }) => {
      const svc = new ReportService(ctx.prisma);
      return svc.getRecipeDetail(
        input.locationId,
        input.recipeId,
        input.fromDate,
        input.toDate
      );
    }),

  usageItemDetail: protectedProcedure
    .input(usageItemDetailQuerySchema)
    .query(({ ctx, input }) => {
      const svc = new ReportService(ctx.prisma);
      return svc.getUsageItemDetail(
        input.locationId,
        input.itemId,
        input.fromDate,
        input.toDate,
        input.granularity
      );
    }),

  usageByVendor: protectedProcedure
    .input(usageByVendorQuerySchema)
    .query(({ ctx, input }) => {
      const svc = new ReportService(ctx.prisma);
      return svc.getUsageByVendor(
        input.locationId,
        input.fromDate,
        input.toDate,
        input.granularity,
        input.categoryId
      );
    }),

  pourCost: protectedProcedure
    .input(pourCostQuerySchema)
    .query(({ ctx, input }) => {
      const svc = new ReportService(ctx.prisma);
      return svc.getPourCost(input.locationId, input.fromDate, input.toDate);
    }),

  portfolioRollup: protectedProcedure
    .use(requireRole("business_admin"))
    .input(portfolioRollupQuerySchema)
    .query(({ ctx, input }) => {
      const svc = new ReportService(ctx.prisma);
      return svc.getPortfolioRollup(input.businessId, input.fromDate, input.toDate);
    }),

  staffVarianceReasonBreakdown: protectedProcedure
    .input(staffVarianceReasonBreakdownQuerySchema)
    .query(({ ctx, input }) => {
      const svc = new VarianceService(ctx.prisma);
      return svc.getStaffVarianceReasonBreakdown(input.locationId, input.userId, input.fromDate, input.toDate);
    }),

  staffItemVariance: protectedProcedure
    .input(staffItemVarianceQuerySchema)
    .query(({ ctx, input }) => {
      const svc = new VarianceService(ctx.prisma);
      return svc.getStaffItemVariance(input.locationId, input.userId, input.fromDate, input.toDate, input.limit);
    }),

  forecastDashboard: protectedProcedure
    .input(forecastDashboardQuerySchema)
    .query(({ ctx, input }) => {
      const svc = new ReportService(ctx.prisma);
      return svc.getForecastDashboard(input.locationId);
    }),

  forecastAccuracy: protectedProcedure
    .input(forecastAccuracyQuerySchema)
    .query(({ ctx, input }) => {
      const svc = new ReportService(ctx.prisma);
      return svc.getForecastAccuracy(input.locationId, input.sessionCount);
    }),

  forecastItemDetail: protectedProcedure
    .input(forecastItemDetailQuerySchema)
    .query(({ ctx, input }) => {
      const svc = new ReportService(ctx.prisma);
      return svc.getForecastItemDetail(input.locationId, input.itemId);
    }),
});
