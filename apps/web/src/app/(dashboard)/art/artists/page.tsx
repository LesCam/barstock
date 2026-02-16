"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";

export default function ArtistsListPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const businessId = user?.businessId;

  const { data, isLoading } = trpc.artists.list.useQuery(
    { businessId: businessId!, activeOnly: false },
    { enabled: !!businessId }
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Artists</h1>
        <div className="flex gap-2">
          <Link
            href="/art/artists/new"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Artist
          </Link>
          <Link
            href="/art"
            className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Gallery
          </Link>
        </div>
      </div>

      {isLoading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Commission %</th>
                <th className="px-4 py-3">Artworks</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data?.items.map((artist: any) => (
                <tr key={artist.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/art/artists/${artist.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {artist.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{artist.contactEmail ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{artist.contactPhone ?? "—"}</td>
                  <td className="px-4 py-3">{artist.defaultCommissionPubPercent}%</td>
                  <td className="px-4 py-3">{artist._count?.artworks ?? 0}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        artist.active
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {artist.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
