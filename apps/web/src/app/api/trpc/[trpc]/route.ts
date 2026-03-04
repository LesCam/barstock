import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter, createContext } from "@barstock/api";
import { logError } from "@barstock/api/src/lib/error-handler";
import { auth } from "@/lib/auth";
import type { UserPayload } from "@barstock/api";

// Allow large payloads (receipt photos) and longer processing time
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const handler = async (req: Request) => {
  const session = await auth();
  let user: UserPayload | null = null;

  if (session?.user) {
    const u = session.user as any;
    user = {
      userId: u.userId,
      email: u.email,
      roles: u.roles,
      permissions: u.permissions ?? {},
      locationIds: u.locationIds,
      businessId: u.businessId,
      businessName: u.businessName,
      highestRole: u.highestRole,
      tokenVersion: u.tokenVersion ?? 0,
      authAt: u.authAt ?? 0,
    };
  }

  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext({ headers: req.headers, user }),
    responseMeta() {
      return { headers: { "cache-control": "no-store" } };
    },
    onError({ error, path, input, ctx }) {
      logError({
        requestId: ctx?.requestId ?? "unknown",
        path,
        error,
        input,
        userId: ctx?.user?.userId,
      });
    },
  });
};

export { handler as GET, handler as POST };
