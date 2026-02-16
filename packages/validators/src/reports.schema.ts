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
export type BusinessRollupQueryInput = z.infer<typeof businessRollupQuerySchema>;
