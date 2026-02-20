import { z } from "zod";

export const vendorCreateSchema = z.object({
  businessId: z.string().uuid(),
  name: z.string().min(1).max(255),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  postalCode: z.string().optional(),
});

export const vendorListSchema = z.object({
  businessId: z.string().uuid(),
  activeOnly: z.boolean().default(true),
});

export const vendorGetByIdSchema = z.object({
  id: z.string().uuid(),
});

export const vendorUpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  contactEmail: z.string().email().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  province: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

export const vendorOrdererSchema = z.object({
  vendorId: z.string().uuid(),
  userId: z.string().uuid(),
});

export type VendorCreateInput = z.infer<typeof vendorCreateSchema>;
export type VendorListInput = z.infer<typeof vendorListSchema>;
export type VendorGetByIdInput = z.infer<typeof vendorGetByIdSchema>;
export type VendorUpdateInput = z.infer<typeof vendorUpdateSchema>;
export type VendorOrdererInput = z.infer<typeof vendorOrdererSchema>;
