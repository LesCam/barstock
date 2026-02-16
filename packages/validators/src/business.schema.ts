import { z } from "zod";

const slugRegex = /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/;

export const businessCreateSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(2)
    .max(63)
    .regex(slugRegex, "Lowercase alphanumeric and hyphens only, 2-63 chars"),
});

export const businessUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z
    .string()
    .min(2)
    .max(63)
    .regex(slugRegex, "Lowercase alphanumeric and hyphens only, 2-63 chars")
    .optional(),
});

export const locationCreateSchema = z.object({
  name: z.string().min(1).max(255),
  timezone: z.string().default("America/Montreal"),
  closeoutHour: z.number().int().min(0).max(23).default(4),
  businessId: z.string().uuid(),
});

export const locationUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  timezone: z.string().optional(),
  closeoutHour: z.number().int().min(0).max(23).optional(),
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
