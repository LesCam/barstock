import { prisma } from "@barstock/database";
import { decodeToken, buildUserPayload } from "./services/auth.service";
import type { Context, UserPayload } from "./context";

/**
 * Create tRPC context from an incoming request.
 * Extracts JWT from Authorization header and resolves user payload.
 */
export async function createContext(opts: {
  headers: Headers;
  user?: UserPayload | null;
}): Promise<Context> {
  const ip =
    opts.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    opts.headers.get("x-real-ip") ??
    undefined;
  const userAgent = opts.headers.get("user-agent") ?? undefined;

  // If user already resolved (e.g. from NextAuth session), use directly
  if (opts.user) {
    return { prisma, user: opts.user, ip, userAgent };
  }

  const authHeader = opts.headers.get("authorization");
  let user = null;

  if (authHeader?.startsWith("Bearer ")) {
    try {
      const token = authHeader.slice(7);
      const decoded = decodeToken(token);
      if (decoded.type === "access" && typeof decoded.userId === "string") {
        user = await buildUserPayload(prisma, decoded.userId);
      }
    } catch {
      // Invalid token — user stays null (unauthenticated)
    }
  }

  return { prisma, user, ip, userAgent };
}
