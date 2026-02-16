import { z } from "zod";

export const artworkCreateSchema = z.object({
  businessId: z.string().uuid(),
  artistId: z.string().uuid(),
  title: z.string().min(1).max(255),
  medium: z.string().optional(),
  dimensions: z.string().optional(),
  listPriceCents: z.number().int().positive(),
  locationInPub: z.string().optional(),
  agreementType: z.enum(["consignment", "owned"]).default("consignment"),
  saleMode: z.enum(["platform_sale", "direct_artist_sale", "either"]).default("platform_sale"),
  commissionPubPercent: z.number().min(0).max(100).optional(),
  dateHung: z.string().optional(), // ISO date string
  notes: z.string().optional(),
});

export const artworkUpdateSchema = z.object({
  id: z.string().uuid(),
  businessId: z.string().uuid(),
  artistId: z.string().uuid().optional(),
  title: z.string().min(1).max(255).optional(),
  medium: z.string().nullish(),
  dimensions: z.string().nullish(),
  listPriceCents: z.number().int().positive().optional(),
  locationInPub: z.string().nullish(),
  agreementType: z.enum(["consignment", "owned"]).optional(),
  saleMode: z.enum(["platform_sale", "direct_artist_sale", "either"]).optional(),
  commissionPubPercent: z.number().min(0).max(100).optional(),
  dateHung: z.string().nullish(),
  notes: z.string().nullish(),
});

export const artworkStatusUpdateSchema = z.object({
  id: z.string().uuid(),
  businessId: z.string().uuid(),
  status: z.enum([
    "on_wall",
    "reserved_pending_payment",
    "reserved",
    "sold",
    "removed",
    "removed_not_sold",
    "pending_payment_issue",
  ]),
});

export const artworkListSchema = z.object({
  businessId: z.string().uuid(),
  artistId: z.string().uuid().optional(),
  status: z.enum([
    "on_wall",
    "reserved_pending_payment",
    "reserved",
    "sold",
    "removed",
    "removed_not_sold",
    "pending_payment_issue",
  ]).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const artworkGetSchema = z.object({
  id: z.string().uuid(),
  businessId: z.string().uuid(),
});

export const artworkAddPhotoSchema = z.object({
  businessId: z.string().uuid(),
  artworkId: z.string().uuid(),
  base64Data: z.string(),
  filename: z.string(),
});

export const artworkRemovePhotoSchema = z.object({
  businessId: z.string().uuid(),
  photoId: z.string().uuid(),
});

export const artworkReorderPhotosSchema = z.object({
  businessId: z.string().uuid(),
  artworkId: z.string().uuid(),
  photoIds: z.array(z.string().uuid()),
});

export type ArtworkCreateInput = z.infer<typeof artworkCreateSchema>;
export type ArtworkUpdateInput = z.infer<typeof artworkUpdateSchema>;
export type ArtworkStatusUpdateInput = z.infer<typeof artworkStatusUpdateSchema>;
export type ArtworkListInput = z.infer<typeof artworkListSchema>;
