import { auth } from "@/lib/auth";
import { decodeToken } from "@barstock/api/src/services/auth.service";
import { ROLE_HIERARCHY } from "@barstock/types";
import type { Role } from "@barstock/types";

export interface AuthedUser {
  userId: string;
  roles: Record<string, string>;
  permissions: Record<string, Record<string, boolean>>;
  locationIds: string[];
  businessId: string;
  businessName?: string;
  highestRole: string;
}

type AuthResult = AuthedUser | Response;

/**
 * Dual auth: tries Bearer token first (mobile), falls back to cookie session (web).
 * Returns the authenticated user or a 401 Response.
 */
export async function requireAuth(request: Request): Promise<AuthResult> {
  // Try Bearer token (mobile / cron)
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const decoded = decodeToken(authHeader.slice(7));
      if (decoded.type === "access" && typeof decoded.userId === "string") {
        return decoded as unknown as AuthedUser;
      }
    } catch {
      // Invalid token — fall through to cookie auth
    }
  }

  // Fall back to cookie session (web)
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  return session.user as unknown as AuthedUser;
}

/** Type guard: true if requireAuth returned a failure Response */
export function isAuthFailure(result: AuthResult): result is Response {
  return result instanceof Response;
}

/**
 * Check that the user has at least one of the required roles (across any location).
 * Returns 403 Response on failure, or the user on success.
 */
export function requireRole(user: AuthedUser, allowedRoles: Role[]): Response | null {
  const minLevel = Math.min(...allowedRoles.map((r) => ROLE_HIERARCHY[r]));
  const hasRole = Object.values(user.roles).some(
    (r) => ROLE_HIERARCHY[r as Role] >= minLevel
  );
  if (!hasRole) {
    return new Response("Forbidden", { status: 403 });
  }
  return null;
}

/**
 * Verify a resource's businessId matches the user's session businessId.
 * Returns 404 Response on mismatch (avoids leaking existence), or null on success.
 */
export function requireTenantScope(user: AuthedUser, resourceBusinessId: string): Response | null {
  if (user.businessId !== resourceBusinessId) {
    return new Response("Not Found", { status: 404 });
  }
  return null;
}
