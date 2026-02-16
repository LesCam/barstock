"use client";

import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import Link from "next/link";

export default function DashboardPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const businessId = user?.businessId;

  const { data: locations } = trpc.locations.listByBusiness.useQuery(
    { businessId: businessId! },
    { enabled: !!businessId }
  );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {locations?.map((loc) => (
          <Link
            key={loc.id}
            href={`/locations/${loc.id}`}
            className="rounded-lg border bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <h3 className="font-semibold text-gray-900">{loc.name}</h3>
            <p className="mt-1 text-sm text-gray-500">{loc.timezone}</p>
            <p className="mt-1 text-xs text-gray-400">
              Closeout: {loc.closeoutHour}:00
            </p>
          </Link>
        ))}

        {!businessId && (
          <div className="col-span-full rounded-lg border bg-white p-5 text-gray-500">
            Select a business to view locations.
          </div>
        )}
      </div>
    </div>
  );
}
