import { createTRPCReact } from "@trpc/react-query";
import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import superjson from "superjson";
import type { AppRouter } from "@barstock/api";
import type { TRPCLink } from "@trpc/client";

export const trpc = createTRPCReact<AppRouter>();

export const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

let authToken: string | null = null;
let refreshToken: string | null = null;
let onSignOut: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setRefreshToken(token: string | null) {
  refreshToken = token;
}

export function setOnSignOut(cb: (() => void) | null) {
  onSignOut = cb;
}

// Prevent multiple concurrent refresh attempts
let refreshPromise: Promise<string> | null = null;

async function doRefresh(): Promise<string> {
  if (!refreshToken) throw new Error("No refresh token");
  const res = await fetch(`${API_URL}/api/trpc/auth.refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: { refreshToken } }),
  });
  if (!res.ok) throw new Error("Refresh failed");
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Refresh returned invalid JSON");
  }
  // Handle both batch ([{result:...}]) and single ({result:...}) response formats
  const result = Array.isArray(data) ? data[0] : data;
  const newToken = result?.result?.data?.json?.accessToken;
  if (!newToken) throw new Error("No access token in refresh response");
  return newToken;
}

/**
 * Link that intercepts UNAUTHORIZED errors, refreshes the token, and retries.
 */
const refreshLink: TRPCLink<AppRouter> = () => {
  return ({ next, op }) => {
    return observable((observer) => {
      const unsubscribe = next(op).subscribe({
        next(value) {
          observer.next(value);
        },
        error(err) {
          if (
            err instanceof TRPCClientError &&
            err.data?.code === "UNAUTHORIZED" &&
            refreshToken &&
            // Don't retry refresh/login calls (but DO retry auth.verifyPin for lock screen)
            (!op.path.startsWith("auth.") || op.path === "auth.verifyPin")
          ) {
            // Deduplicate concurrent refreshes
            if (!refreshPromise) {
              refreshPromise = doRefresh().finally(() => {
                refreshPromise = null;
              });
            }
            refreshPromise
              .then((newToken) => {
                authToken = newToken;
                // Persist the new token
                import("@react-native-async-storage/async-storage").then(
                  ({ default: AsyncStorage }) =>
                    AsyncStorage.setItem("authToken", newToken)
                );
                // Retry the original operation
                next(op).subscribe({
                  next(value) {
                    observer.next(value);
                  },
                  error(retryErr) {
                    observer.error(retryErr);
                  },
                  complete() {
                    observer.complete();
                  },
                });
              })
              .catch(() => {
                // Refresh failed — sign out
                onSignOut?.();
                observer.error(err);
              });
          } else {
            observer.error(err);
          }
        },
        complete() {
          observer.complete();
        },
      });
      return unsubscribe;
    });
  };
};

const links = [
  refreshLink,
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
