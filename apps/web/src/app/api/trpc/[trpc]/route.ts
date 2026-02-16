import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter, createContext } from "@barstock/api";
import { auth } from "@/lib/auth";
import type { UserPayload } from "@barstock/api";

const handler = async (req: Request) => {
  const session = await auth();
  let user: UserPayload | null = null;

  if (session?.user) {
    const u = session.user as any;
    user = {
      userId: u.userId,
      email: u.email,
      roles: u.roles,
      locationIds: u.locationIds,
      businessId: u.businessId,
      businessName: u.businessName,
      highestRole: u.highestRole,
    };
  }

  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext({ headers: req.headers, user }),
  });
};

export { handler as GET, handler as POST };
