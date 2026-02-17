"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";

export default function BusinessesPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as any;

  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);

  // Guard: only platform_admin
  if (user && user.highestRole !== "platform_admin") {
    router.replace("/");
    return null;
  }

  const { data: businesses, isLoading } = trpc.businesses.list.useQuery(
    { search: search || undefined, activeOnly },
    { enabled: !!user }
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#EAF0FF]">Businesses</h1>
        <Link
          href="/businesses/new"
          className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E]"
        >
          + New Business
        </Link>
      </div>

      <div className="mb-4 flex items-center gap-4">
        <input
          type="text"
          placeholder="Search by name, slug, or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-72 rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none focus:ring-1 focus:ring-[#E9B44C]"
        />
        <button
          onClick={() => setActiveOnly(!activeOnly)}
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            activeOnly
              ? "bg-green-500/10 text-green-400"
              : "bg-white/5 text-[#EAF0FF]/80"
          }`}
        >
          {activeOnly ? "Active Only" : "All"}
        </button>
      </div>

      {isLoading ? (
        <p className="text-[#EAF0FF]/60">Loading...</p>
      ) : !businesses?.length ? (
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-8 text-center text-[#EAF0FF]/60">
          No businesses found.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/10 bg-[#16283F]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-[#0B1623] text-xs font-medium uppercase text-[#EAF0FF]/60">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Contact Email</th>
                <th className="px-4 py-3">Locations</th>
                <th className="px-4 py-3">Users</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {businesses.map((biz: any) => (
                <tr key={biz.id} className="hover:bg-[#16283F]/60">
                  <td className="px-4 py-3">
                    <Link
                      href={`/businesses/${biz.id}`}
                      className="font-medium text-[#E9B44C] hover:underline"
                    >
                      {biz.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[#EAF0FF]/60">{biz.slug}</td>
                  <td className="px-4 py-3 text-[#EAF0FF]/60">
                    {biz.contactEmail || "—"}
                  </td>
                  <td className="px-4 py-3 text-[#EAF0FF]/60">
                    {biz._count?.locations ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-[#EAF0FF]/60">
                    {biz._count?.users ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        biz.active !== false
                          ? "bg-green-500/10 text-green-400"
                          : "bg-red-500/10 text-red-400"
                      }`}
                    >
                      {biz.active !== false ? "Active" : "Archived"}
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
