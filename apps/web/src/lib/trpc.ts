import { createTRPCReact } from "@trpc/react-query";
import { createTRPCClient as createVanillaClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@barstock/api";

export const trpc = createTRPCReact<AppRouter>();

export function getBaseUrl() {
  if (typeof window !== "undefined") return "";
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:3000`;
}

const links = [
  httpBatchLink({
    url: `${getBaseUrl()}/api/trpc`,
    transformer: superjson,
  }),
];

export function createTRPCClient(headers?: () => Record<string, string>) {
  return trpc.createClient({
    links: headers
      ? [
          httpBatchLink({
            url: `${getBaseUrl()}/api/trpc`,
            transformer: superjson,
            headers,
          }),
        ]
      : links,
  });
}

/** Vanilla tRPC client for imperative calls outside React (offline queue replay). */
export const trpcVanilla = createVanillaClient<AppRouter>({ links });
