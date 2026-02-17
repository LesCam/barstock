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
        <h1 className="text-2xl font-bold text-[#EAF0FF]">Artists</h1>
        <div className="flex gap-2">
          <Link
            href="/art/artists/new"
            className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E]"
          >
            + Artist
          </Link>
          <Link
            href="/art"
            className="rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-[#EAF0FF]/80 hover:bg-[#16283F]/60"
          >
            Gallery
          </Link>
        </div>
      </div>

      {isLoading ? (
        <p className="text-[#EAF0FF]/60">Loading...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
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
                <tr key={artist.id} className="hover:bg-[#16283F]/60">
                  <td className="px-4 py-3">
                    <Link
                      href={`/art/artists/${artist.id}`}
                      className="font-medium text-[#E9B44C] hover:underline"
                    >
                      {artist.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[#EAF0FF]/70">{artist.contactEmail ?? "—"}</td>
                  <td className="px-4 py-3 text-[#EAF0FF]/70">{artist.contactPhone ?? "—"}</td>
                  <td className="px-4 py-3">{artist.defaultCommissionPubPercent}%</td>
                  <td className="px-4 py-3">{artist._count?.artworks ?? 0}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        artist.active
                          ? "bg-green-500/10 text-green-400"
                          : "bg-white/5 text-[#EAF0FF]/40"
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
