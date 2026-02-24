"use client";

import { useState } from "react";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { SessionProvider } from "next-auth/react";
import { trpc, createTRPCClient } from "@/lib/trpc";
import { LocationProvider } from "@/components/location-context";
import { NetworkProvider } from "@/lib/network-context";
import { OfflineBanner } from "@/components/offline-banner";
import { createIDBPersister } from "@/lib/idb-persister";

const PERSIST_QUERY_KEYS = new Set(["sessions", "inventory", "areas", "itemCategories"]);

const persister = typeof window !== "undefined" ? createIDBPersister() : undefined;

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            gcTime: 1000 * 60 * 60 * 24, // 24 hours
            staleTime: 1000 * 30, // 30 seconds
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());

  const persistOptions = persister
    ? {
        persister,
        dehydrateOptions: {
          shouldDehydrateQuery: (query: { queryKey: readonly unknown[] }) => {
            const key = query.queryKey[0];
            if (Array.isArray(key)) {
              return PERSIST_QUERY_KEYS.has(key[0] as string);
            }
            return PERSIST_QUERY_KEYS.has(key as string);
          },
        },
      }
    : undefined;

  const inner = (
    <LocationProvider>
      <OfflineBanner />
      {children}
    </LocationProvider>
  );

  return (
    <SessionProvider>
      <NetworkProvider>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          {persistOptions ? (
            <PersistQueryClientProvider
              client={queryClient}
              persistOptions={persistOptions}
            >
              {inner}
            </PersistQueryClientProvider>
          ) : (
            inner
          )}
        </trpc.Provider>
      </NetworkProvider>
    </SessionProvider>
  );
}
