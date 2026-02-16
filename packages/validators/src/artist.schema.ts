import { z } from "zod";

export const artistCreateSchema = z.object({
  businessId: z.string().uuid(),
  name: z.string().min(1).max(255),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  payoutMethod: z.enum(["etransfer", "cheque", "cash", "other"]).optional(),
  defaultCommissionPubPercent: z.number().min(0).max(100).default(50),
  bio: z.string().optional(),
  notes: z.string().optional(),
});

export const artistUpdateSchema = z.object({
  id: z.string().uuid(),
  businessId: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  contactEmail: z.string().email().nullish(),
  contactPhone: z.string().nullish(),
  payoutMethod: z.enum(["etransfer", "cheque", "cash", "other"]).nullish(),
  defaultCommissionPubPercent: z.number().min(0).max(100).optional(),
  bio: z.string().nullish(),
  notes: z.string().nullish(),
});

export const artistListSchema = z.object({
  businessId: z.string().uuid(),
  activeOnly: z.boolean().default(true),
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const artistDeactivateSchema = z.object({
  id: z.string().uuid(),
  businessId: z.string().uuid(),
});

export type ArtistCreateInput = z.infer<typeof artistCreateSchema>;
export type ArtistUpdateInput = z.infer<typeof artistUpdateSchema>;
export type ArtistListInput = z.infer<typeof artistListSchema>;
