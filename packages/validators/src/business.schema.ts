import { z } from "zod";

const slugRegex = /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/;

/** Accepts any format, strips to digits, validates 10 digits (or 11 starting with 1) */
const phoneSchema = z
  .string()
  .transform((val) => val.replace(/\D/g, ""))
  .refine(
    (digits) => digits.length === 10 || (digits.length === 11 && digits[0] === "1"),
    { message: "Phone must be 10 digits, e.g. (555) 555-5555" }
  )
  .transform((digits) => (digits.length === 11 ? digits.slice(1) : digits));

export const businessCreateSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(2)
    .max(63)
    .regex(slugRegex, "Lowercase alphanumeric and hyphens only, 2-63 chars"),
  contactEmail: z.string().email().optional(),
  contactPhone: phoneSchema.optional(),
  address: z.string().max(500).optional(),
});

export const businessUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z
    .string()
    .min(2)
    .max(63)
    .regex(slugRegex, "Lowercase alphanumeric and hyphens only, 2-63 chars")
    .optional(),
  contactEmail: z.string().email().nullish(),
  contactPhone: phoneSchema.nullish(),
  address: z.string().max(500).nullish(),
  logoUrl: z.string().nullish(),
  active: z.boolean().optional(),
});

export const locationCreateSchema = z.object({
  name: z.string().min(1).max(255),
  timezone: z.string().default("America/Montreal"),
  closeoutHour: z.number().int().min(0).max(23).default(4),
  businessId: z.string().uuid(),
  address: z.string().max(500).optional(),
  city: z.string().max(255).optional(),
  province: z.string().max(255).optional(),
  postalCode: z.string().max(20).optional(),
  phone: phoneSchema.optional(),
});

export const locationUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  timezone: z.string().optional(),
  closeoutHour: z.number().int().min(0).max(23).optional(),
  address: z.string().max(500).nullish(),
  city: z.string().max(255).nullish(),
  province: z.string().max(255).nullish(),
  postalCode: z.string().max(20).nullish(),
  phone: phoneSchema.nullish(),
});

// ─── Bar Areas ──────────────────────────────────────────────

export const barAreaCreateSchema = z.object({
  locationId: z.string().uuid(),
  name: z.string().min(1).max(255),
  sortOrder: z.number().int().min(0).default(0),
});

export const barAreaUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const subAreaCreateSchema = z.object({
  barAreaId: z.string().uuid(),
  name: z.string().min(1).max(255),
  sortOrder: z.number().int().min(0).default(0),
});

export const subAreaUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export type BusinessCreateInput = z.infer<typeof businessCreateSchema>;
export type BusinessUpdateInput = z.infer<typeof businessUpdateSchema>;
export type LocationCreateInput = z.infer<typeof locationCreateSchema>;
export type LocationUpdateInput = z.infer<typeof locationUpdateSchema>;
export type BarAreaCreateInput = z.infer<typeof barAreaCreateSchema>;
export type BarAreaUpdateInput = z.infer<typeof barAreaUpdateSchema>;
export type SubAreaCreateInput = z.infer<typeof subAreaCreateSchema>;
export type SubAreaUpdateInput = z.infer<typeof subAreaUpdateSchema>;
