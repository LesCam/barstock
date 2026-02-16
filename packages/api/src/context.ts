import type { ExtendedPrismaClient } from "@barstock/database";
import type { Role } from "@barstock/types";

export interface UserPayload {
  userId: string;
  email: string;
  roles: Record<string, Role>; // locationId -> role
  locationIds: string[];
  businessId: string;
  businessName?: string;
  highestRole: Role;
}

export interface Context {
  prisma: ExtendedPrismaClient;
  user: UserPayload | null;
}

export type AuthedContext = Context & { user: UserPayload };
