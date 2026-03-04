import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";
import type { UserPayload } from "./context";
import { Role, ROLE_HIERARCHY } from "@barstock/types";
import type { CapabilityToggles } from "@barstock/validators";
import { SettingsService } from "./services/settings.service";
import { getClientMessage } from "./lib/error-handler";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error, ctx }) {
    const requestId = ctx?.requestId ?? "unknown";
    const message = getClientMessage(error);
    return {
      ...shape,
      message,
      data: {
        ...shape.data,
        requestId,
        stack: undefined,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

/** Check if user is a platform admin */
export function isPlatformAdmin(user: UserPayload): boolean {
  return Object.values(user.roles).some((r) => r === Role.platform_admin);
}

/** Require authenticated user */
const isAuthed = middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  const dbUser = await ctx.prisma.user.findUnique({
    where: { id: ctx.user.userId },
    select: { tokenVersion: true, isActive: true },
  });
  if (!dbUser || !dbUser.isActive || dbUser.tokenVersion !== ctx.user.tokenVersion) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Session invalidated" });
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(isAuthed);

/** Require minimum role across any location */
export function requireRole(minRole: Role) {
  return middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    const roles = ctx.user.roles as Record<string, Role>;
    const minLevel = ROLE_HIERARCHY[minRole];
    const hasRole = Object.values(roles).some(
      (r) => ROLE_HIERARCHY[r] >= minLevel
    );

    if (!hasRole) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Requires ${minRole} role or higher`,
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

/** Require that the businessId in input matches the user's businessId. Platform admins bypass. */
export function requireBusinessAccess() {
  return middleware(async ({ ctx, next, getRawInput }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    if (isPlatformAdmin(ctx.user)) {
      return next({ ctx: { ...ctx, user: ctx.user } });
    }

    const rawInput = await getRawInput() as Record<string, unknown> | undefined;
    const businessId = rawInput?.businessId as string | undefined;

    if (businessId && businessId !== ctx.user.businessId) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Resource not found",
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

/** Require access to a specific location */
export function requireLocationAccess() {
  return middleware(async ({ ctx, next, getRawInput }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    if (isPlatformAdmin(ctx.user)) {
      return next({ ctx: { ...ctx, user: ctx.user } });
    }

    const rawInput = await getRawInput() as Record<string, unknown> | undefined;
    const locationId = rawInput?.locationId as string | undefined;

    if (locationId && !ctx.user.locationIds.includes(locationId)) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Resource not found",
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

/** Require a capability toggle to be enabled for the user's business */
export function requireCapability(key: keyof CapabilityToggles) {
  return middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    // Platform admins bypass capability checks
    if (isPlatformAdmin(ctx.user)) {
      return next({ ctx: { ...ctx, user: ctx.user } });
    }

    const settingsService = new SettingsService(ctx.prisma);
    const enabled = await settingsService.isCapabilityEnabled(
      ctx.user.businessId,
      key
    );

    if (!enabled) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Capability "${key}" is not enabled for this business`,
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

/** Require a permission key to be true for the user in any of their locations */
export function requirePermission(key: string) {
  return middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    // Platform admins and business admins bypass permission checks
    if (isPlatformAdmin(ctx.user)) {
      return next({ ctx: { ...ctx, user: ctx.user } });
    }
    const roles = ctx.user.roles as Record<string, Role>;
    const isBusinessAdmin = Object.values(roles).some(
      (r) => r === Role.business_admin
    );
    if (isBusinessAdmin) {
      return next({ ctx: { ...ctx, user: ctx.user } });
    }

    const permissions = ctx.user.permissions ?? {};
    const hasPermission = Object.values(permissions).some(
      (locPerms) => locPerms[key] === true
    );

    if (!hasPermission) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Missing permission: ${key}`,
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

/** Resolve businessId: platform admins may use supplied value, everyone else gets session value */
export function resolveBusinessId(user: UserPayload, inputBusinessId?: string): string {
  if (isPlatformAdmin(user)) return inputBusinessId ?? user.businessId;
  return user.businessId;
}

/** Force businessId in input to session value for non-platform-admins (defense-in-depth).
 *  Sets ctx.resolvedBusinessId for handlers to use instead of input.businessId. */
export function forceBusinessId() {
  return middleware(async ({ ctx, next, getRawInput }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    const rawInput = await getRawInput() as Record<string, unknown> | undefined;
    const inputBusinessId = rawInput?.businessId as string | undefined;
    const resolvedBusinessId = resolveBusinessId(ctx.user, inputBusinessId);

    return next({ ctx: { ...ctx, user: ctx.user, resolvedBusinessId } });
  });
}

/** Require recent authentication (for sensitive actions) */
export function requireRecentAuth(maxAgeMs = 15 * 60 * 1000) {
  return middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    const authAt = ctx.user.authAt;
    if (!authAt || Date.now() - authAt > maxAgeMs) {
      throw new TRPCError({ code: "FORBIDDEN", message: "RE_AUTH_REQUIRED" });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

/** Check role for specific location */
export function checkLocationRole(
  locationId: string,
  minRole: Role,
  user: { roles: Record<string, Role> }
): boolean {
  const userRole = user.roles[locationId];
  if (!userRole) return false;
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minRole];
}
