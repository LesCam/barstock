import { createTRPCReact } from "@trpc/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@barstock/api";

export const trpc = createTRPCReact<AppRouter>();

export const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

const links = [
  httpBatchLink({
    url: `${API_URL}/api/trpc`,
    transformer: superjson,
    headers() {
      return authToken ? { authorization: `Bearer ${authToken}` } : {};
    },
  }),
];

// React Query integrated client (for hooks)
export const trpcClient = trpc.createClient({ links });

// Vanilla client for imperative calls (e.g. inside AuthProvider)
export const trpcVanilla = createTRPCClient<AppRouter>({ links });
