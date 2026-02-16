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
        <h1 className="text-2xl font-bold text-gray-900">Businesses</h1>
        <Link
          href="/businesses/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
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
          className="w-72 rounded-md border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={() => setActiveOnly(!activeOnly)}
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            activeOnly
              ? "bg-green-100 text-green-800"
              : "bg-gray-100 text-gray-700"
          }`}
        >
          {activeOnly ? "Active Only" : "All"}
        </button>
      </div>

      {isLoading ? (
        <p className="text-gray-500">Loading...</p>
      ) : !businesses?.length ? (
        <div className="rounded-lg border bg-white p-8 text-center text-gray-500">
          No businesses found.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs font-medium uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Contact Email</th>
                <th className="px-4 py-3">Locations</th>
                <th className="px-4 py-3">Users</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {businesses.map((biz: any) => (
                <tr key={biz.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/businesses/${biz.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {biz.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{biz.slug}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {biz.contactEmail || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {biz._count?.locations ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {biz._count?.users ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        biz.active !== false
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
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
