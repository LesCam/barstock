"use client";

import { useSession } from "next-auth/react";
import { useLocation } from "@/components/location-context";
import { trpc } from "@/lib/trpc";
import Link from "next/link";
import { HelpLink } from "@/components/help-link";

export default function ReceiptsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const { selectedLocationId: locationId } = useLocation();

  const { data: skippedReceipts, isLoading: skippedLoading } =
    trpc.receipts.listSkipped.useQuery(
      { locationId: locationId! },
      { enabled: !!locationId }
    );

  const { data: recentReceipts, isLoading: recentLoading } =
    trpc.receipts.list.useQuery(
      { locationId: locationId!, limit: 20 },
      { enabled: !!locationId }
    );

  if (!locationId) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-[#EAF0FF]/60">Select a location to view receipts.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-[#EAF0FF]">Receipts</h1>
          <HelpLink section="transfers" tooltip="Learn about receiving" />
        </div>
        <p className="mt-1 text-sm text-[#EAF0FF]/60">
          Receipt scans and skipped items needing attention
        </p>
      </div>

      {/* Section A — Skipped Items Needing Attention */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#E9B44C]">
          Skipped Items Needing Attention
        </h2>

        {skippedLoading ? (
          <div className="flex items-center gap-2 py-4">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#E9B44C] border-t-transparent" />
            <span className="text-sm text-[#EAF0FF]/40">Loading...</span>
          </div>
        ) : !skippedReceipts?.length ? (
          <p className="py-4 text-sm text-[#EAF0FF]/40">
            No skipped items — all receipt items have been resolved.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {skippedReceipts.map((r: any) => (
              <div
                key={r.id}
                className="rounded-xl border border-[#E9B44C]/40 bg-[#16283F] p-4"
              >
                <div className="mb-3">
                  <h3 className="font-semibold text-[#EAF0FF]">
                    {r.vendorName ?? "Unknown Vendor"}
                  </h3>
                  <p className="mt-0.5 text-xs text-[#EAF0FF]/40">
                    {r.invoiceDate
                      ? new Date(r.invoiceDate).toLocaleDateString()
                      : new Date(r.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="rounded-full bg-[#E9B44C]/15 px-2.5 py-0.5 text-xs font-semibold text-[#E9B44C]">
                    {r.skippedCount} skipped item{r.skippedCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <Link
                  href={`/receipt/add-skipped?receiptCaptureId=${r.id}`}
                  className="inline-block rounded-lg border border-[#E9B44C] px-4 py-1.5 text-sm font-semibold text-[#E9B44C] hover:bg-[#E9B44C]/10"
                >
                  Review
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Section B — Recent Receipts */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#EAF0FF]/50">
          Recent Receipts
        </h2>

        {recentLoading ? (
          <div className="flex items-center gap-2 py-4">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#E9B44C] border-t-transparent" />
            <span className="text-sm text-[#EAF0FF]/40">Loading...</span>
          </div>
        ) : !recentReceipts?.items?.length ? (
          <p className="py-4 text-sm text-[#EAF0FF]/40">No receipts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-[#EAF0FF]/40">
                  <th className="pb-2 pr-4">Vendor</th>
                  <th className="pb-2 pr-4">Invoice #</th>
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Lines</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentReceipts.items.map((r: any) => (
                  <tr
                    key={r.id}
                    className="border-b border-white/5 hover:bg-[#16283F]/50"
                  >
                    <td className="py-3 pr-4 font-medium text-[#EAF0FF]">
                      {r.vendorName ?? "Unknown"}
                    </td>
                    <td className="py-3 pr-4 text-[#EAF0FF]/60">
                      {r.invoiceNumber ?? "—"}
                    </td>
                    <td className="py-3 pr-4 text-[#EAF0FF]/60">
                      {r.invoiceDate
                        ? new Date(r.invoiceDate).toLocaleDateString()
                        : new Date(r.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 pr-4 text-[#EAF0FF]/60">
                      {r.lineCount}
                    </td>
                    <td className="py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          r.status === "processed"
                            ? "bg-green-500/15 text-green-400"
                            : r.status === "extracted"
                              ? "bg-blue-500/15 text-blue-400"
                              : r.status === "failed"
                                ? "bg-red-500/15 text-red-400"
                                : "bg-[#E9B44C]/15 text-[#E9B44C]"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
