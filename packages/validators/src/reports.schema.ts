import { z } from "zod";

export const varianceReportQuerySchema = z.object({
  locationId: z.string().uuid(),
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
});

export const onHandReportQuerySchema = z.object({
  locationId: z.string().uuid(),
  asOfDate: z.coerce.date().optional(),
});

export const usageReportQuerySchema = z.object({
  locationId: z.string().uuid(),
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
});

export const cogsReportQuerySchema = z.object({
  locationId: z.string().uuid(),
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
});

export const businessRollupQuerySchema = z.object({
  businessId: z.string().uuid(),
  reportType: z.enum(["variance", "on_hand", "usage", "valuation"]),
  asOfDate: z.coerce.date().optional(),
});

export type VarianceReportQueryInput = z.infer<
  typeof varianceReportQuerySchema
>;
export type OnHandReportQueryInput = z.infer<typeof onHandReportQuerySchema>;
export type UsageReportQueryInput = z.infer<typeof usageReportQuerySchema>;
export type COGSReportQueryInput = z.infer<typeof cogsReportQuerySchema>;
export type BusinessRollupQueryInput = z.infer<typeof businessRollupQuerySchema>;

export const expectedOnHandQuerySchema = z.object({
  locationId: z.string().uuid(),
});

export const variancePatternsQuerySchema = z.object({
  locationId: z.string().uuid(),
  sessionCount: z.number().int().min(3).max(50).default(10),
});

export type ExpectedOnHandQueryInput = z.infer<typeof expectedOnHandQuerySchema>;
export type VariancePatternsQueryInput = z.infer<typeof variancePatternsQuerySchema>;

export const varianceTrendQuerySchema = z.object({
  locationId: z.string().uuid(),
  weeksBack: z.number().int().min(2).max(52).default(4),
});

export const varianceHeatmapQuerySchema = z.object({
  locationId: z.string().uuid(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
});

export const varianceReasonDistributionQuerySchema = z.object({
  locationId: z.string().uuid(),
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
});

export const staffAccountabilityQuerySchema = z.object({
  locationId: z.string().uuid(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
});

export const usageOverTimeQuerySchema = z.object({
  locationId: z.string().uuid(),
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
  granularity: z.enum(["day", "week", "month"]).default("day"),
  categoryId: z.string().uuid().optional(),
});

export type UsageOverTimeQueryInput = z.infer<typeof usageOverTimeQuerySchema>;

export const recipeAnalyticsQuerySchema = z.object({
  locationId: z.string().uuid(),
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
  granularity: z.enum(["day", "week", "month"]).default("day"),
});

export const recipeDetailQuerySchema = z.object({
  locationId: z.string().uuid(),
  recipeId: z.string().uuid(),
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
});

export type RecipeAnalyticsQueryInput = z.infer<typeof recipeAnalyticsQuerySchema>;
export type RecipeDetailQueryInput = z.infer<typeof recipeDetailQuerySchema>;

export const usageItemDetailQuerySchema = z.object({
  locationId: z.string().uuid(),
  itemId: z.string().uuid(),
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
  granularity: z.enum(["day", "week", "month"]).default("day"),
});

export const usageByVendorQuerySchema = z.object({
  locationId: z.string().uuid(),
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
  granularity: z.enum(["day", "week", "month"]).default("day"),
  categoryId: z.string().uuid().optional(),
});

export const pourCostQuerySchema = z.object({
  locationId: z.string().uuid(),
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
});
