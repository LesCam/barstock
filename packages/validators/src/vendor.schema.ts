import { z } from "zod";

export const vendorCreateSchema = z.object({
  businessId: z.string().uuid(),
  name: z.string().min(1).max(255),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
});

export const vendorListSchema = z.object({
  businessId: z.string().uuid(),
  activeOnly: z.boolean().default(true),
});

export type VendorCreateInput = z.infer<typeof vendorCreateSchema>;
export type VendorListInput = z.infer<typeof vendorListSchema>;
