import type { ExtendedPrismaClient } from "@barstock/database";
import type { Role } from "@barstock/types";

export interface UserPayload {
  userId: string;
  email: string;
  roles: Record<string, Role>; // locationId -> role
  permissions: Record<string, Record<string, boolean>>; // locationId -> { permKey: bool }
  locationIds: string[];
  businessId: string;
  businessName?: string;
  highestRole: Role;
  tokenVersion: number;
  authAt: number;
}

export interface Context {
  prisma: ExtendedPrismaClient;
  user: UserPayload | null;
  requestId: string;
  ip?: string;
  userAgent?: string;
}

export type AuthedContext = Context & { user: UserPayload };
