"use client";

import { createContext, useContext, useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";

const STORAGE_KEY = "barstock:selectedLocationId";

interface LocationContextValue {
  selectedLocationId: string | null;
  setSelectedLocationId: (id: string | null) => void;
  locations: Array<{ id: string; name: string }>;
  isAdmin: boolean;
}

const LocationContext = createContext<LocationContextValue>({
  selectedLocationId: null,
  setSelectedLocationId: () => {},
  locations: [],
  isAdmin: false,
});

export function useLocation() {
  return useContext(LocationContext);
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const user = session?.user as any;
  const businessId = user?.businessId as string | undefined;
  const locationIds = (user?.locationIds ?? []) as string[];
  const highestRole = user?.highestRole as string | undefined;
  const isAdmin = highestRole === "business_admin" || highestRole === "platform_admin";

  const { data: fetchedLocations } = trpc.locations.listByBusiness.useQuery(
    { businessId: businessId!, activeOnly: true },
    { enabled: !!businessId }
  );

  const locations = useMemo(
    () => (fetchedLocations ?? []).map((l) => ({ id: l.id, name: l.name })),
    [fetchedLocations]
  );

  const [selectedLocationId, setSelectedLocationIdState] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Initialize from localStorage once locations are loaded
  useEffect(() => {
    if (!locationIds.length && !isAdmin) return;
    if (initialized) return;

    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;

    if (stored && locationIds.includes(stored)) {
      setSelectedLocationIdState(stored);
    } else if (stored === "all" && isAdmin) {
      setSelectedLocationIdState(null);
    } else if (isAdmin) {
      // Default admin to "All Locations"
      setSelectedLocationIdState(null);
    } else if (locationIds.length > 0) {
      setSelectedLocationIdState(locationIds[0]);
    }

    setInitialized(true);
  }, [locationIds, isAdmin, initialized]);

  function setSelectedLocationId(id: string | null) {
    setSelectedLocationIdState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, id ?? "all");
    }
  }

  // Non-admin users should never have null
  const resolvedId = !isAdmin && selectedLocationId === null && locationIds.length > 0
    ? locationIds[0]
    : selectedLocationId;

  const value = useMemo(
    () => ({
      selectedLocationId: resolvedId,
      setSelectedLocationId,
      locations,
      isAdmin,
    }),
    [resolvedId, locations, isAdmin]
  );

  return (
    <LocationContext.Provider value={value}>{children}</LocationContext.Provider>
  );
}
