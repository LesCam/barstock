import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";
import type { UserPayload } from "./context";
import { Role, ROLE_HIERARCHY } from "@barstock/types";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
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
  return middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    if (isPlatformAdmin(ctx.user)) {
      return next({ ctx: { ...ctx, user: ctx.user } });
    }

    const rawInput = (ctx as any).rawInput;
    const businessId = rawInput?.businessId ?? rawInput?.input?.businessId;

    if (businessId && businessId !== ctx.user.businessId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "No access to this business",
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

/** Require access to a specific location */
export function requireLocationAccess() {
  return middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    if (isPlatformAdmin(ctx.user)) {
      return next({ ctx: { ...ctx, user: ctx.user } });
    }

    const locationId =
      (ctx as any).rawInput?.locationId ??
      (ctx as any).rawInput?.input?.locationId;

    if (locationId && !ctx.user.locationIds.includes(locationId)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "No access to this location",
      });
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
