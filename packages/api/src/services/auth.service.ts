import argon2 from "argon2";
import jwt from "jsonwebtoken";
import type { ExtendedPrismaClient } from "@barstock/database";
import type { Role } from "@barstock/types";
import type { UserPayload } from "../context";

const SECRET_KEY = process.env.SECRET_KEY || "change-me-in-production";
const ALGORITHM = "HS256";
const ACCESS_TOKEN_EXPIRE_MINUTES = parseInt(
  process.env.ACCESS_TOKEN_EXPIRE_MINUTES || "30"
);
const REFRESH_TOKEN_EXPIRE_DAYS = parseInt(
  process.env.REFRESH_TOKEN_EXPIRE_DAYS || "7"
);

export async function verifyPassword(
  plainPassword: string,
  hashedPassword: string
): Promise<boolean> {
  try {
    return await argon2.verify(hashedPassword, plainPassword);
  } catch {
    return false;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

export function createAccessToken(payload: UserPayload): string {
  return jwt.sign({ ...payload, type: "access" }, SECRET_KEY, {
    algorithm: ALGORITHM,
    expiresIn: `${ACCESS_TOKEN_EXPIRE_MINUTES}m`,
  });
}

export function createRefreshToken(payload: UserPayload): string {
  return jwt.sign(
    { userId: payload.userId, type: "refresh" },
    SECRET_KEY,
    {
      algorithm: ALGORITHM,
      expiresIn: `${REFRESH_TOKEN_EXPIRE_DAYS}d`,
    }
  );
}

export function decodeToken(token: string): Record<string, unknown> {
  try {
    return jwt.verify(token, SECRET_KEY, {
      algorithms: [ALGORITHM],
    }) as Record<string, unknown>;
  } catch {
    throw new Error("Invalid token");
  }
}

/**
 * Build the UserPayload from database user + user_locations
 */
export async function buildUserPayload(
  prisma: ExtendedPrismaClient,
  userId: string
): Promise<UserPayload> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      userLocations: true,
      location: true,
    },
  });

  const roles: Record<string, Role> = {};
  const locationIds: string[] = [];

  // Primary location
  roles[user.locationId] = user.role as Role;
  locationIds.push(user.locationId);

  // Additional locations from user_locations
  for (const ul of user.userLocations) {
    roles[ul.locationId] = ul.role as Role;
    if (!locationIds.includes(ul.locationId)) {
      locationIds.push(ul.locationId);
    }
  }

  // Resolve org
  const orgId = user.location.orgId ?? undefined;

  return {
    userId: user.id,
    email: user.email,
    roles,
    locationIds,
    orgId,
  };
}
