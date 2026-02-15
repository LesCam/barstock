import { prisma } from "@barstock/database";
import { decodeToken, buildUserPayload } from "./services/auth.service";
import type { Context } from "./context";

/**
 * Create tRPC context from an incoming request.
 * Extracts JWT from Authorization header and resolves user payload.
 */
export async function createContext(opts: {
  headers: Headers;
}): Promise<Context> {
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

  return { prisma, user };
}
