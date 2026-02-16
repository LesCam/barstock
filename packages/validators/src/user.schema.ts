import { z } from "zod";
import { Role } from "@barstock/types";

const nonPlatformRoles = [
  Role.business_admin,
  Role.manager,
  Role.curator,
  Role.staff,
  Role.accounting,
] as const;

export const platformUserCreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(nonPlatformRoles),
  businessId: z.string().uuid(),
  locationId: z.string().uuid(),
});

export const platformUserUpdateSchema = z.object({
  role: z.enum(nonPlatformRoles).optional(),
  isActive: z.boolean().optional(),
});

export const platformUserListSchema = z.object({
  businessId: z.string().uuid(),
  activeOnly: z.boolean().default(true),
  search: z.string().optional(),
});

export type PlatformUserCreateInput = z.infer<typeof platformUserCreateSchema>;
export type PlatformUserUpdateInput = z.infer<typeof platformUserUpdateSchema>;
export type PlatformUserListInput = z.infer<typeof platformUserListSchema>;
