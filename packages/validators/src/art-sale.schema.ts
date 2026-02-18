import { z } from "zod";

export const artSaleCreateSchema = z.object({
  businessId: z.string().uuid(),
  artworkId: z.string().uuid(),
  salePriceCents: z.number().int().positive(),
  paymentMethod: z.enum(["cash", "debit", "credit", "etransfer", "other"]),
  buyerName: z.string().optional(),
  buyerContact: z.string().optional(),
  notes: z.string().optional(),
});

export const artSaleListSchema = z.object({
  businessId: z.string().uuid(),
  artistId: z.string().uuid().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export type ArtSaleCreateInput = z.infer<typeof artSaleCreateSchema>;
export type ArtSaleListInput = z.infer<typeof artSaleListSchema>;
