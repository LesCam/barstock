"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useLocation } from "@/components/location-context";
import { trpc } from "@/lib/trpc";
import Link from "next/link";
import { HelpLink } from "@/components/help-link";
import { PageTip } from "@/components/page-tip";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "extracted", label: "Extracted" },
  { value: "confirmed", label: "Confirmed" },
  { value: "processed", label: "Processed" },
  { value: "failed", label: "Failed" },
] as const;

export default function ReceiptsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const { selectedLocationId: locationId } = useLocation();

  const [searchText, setSearchText] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: vendors } = trpc.vendors.list.useQuery(
    { businessId: user?.businessId },
    { enabled: !!user?.businessId }
  );

  const { data: skippedReceipts, isLoading: skippedLoading } =
    trpc.receipts.listSkipped.useQuery(
      { locationId: locationId! },
      { enabled: !!locationId }
    );

  const hasFilters = searchText || vendorFilter || statusFilter || dateFrom || dateTo;

  const { data: recentReceipts, isLoading: recentLoading } =
    trpc.receipts.search.useQuery(
      {
        locationId: locationId!,
        limit: 20,
        ...(searchText ? { search: searchText } : {}),
        ...(vendorFilter ? { vendorId: vendorFilter } : {}),
        ...(statusFilter ? { status: statusFilter as any } : {}),
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
      },
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
          <HelpLink section="receipt-capture" tooltip="Learn about receiving" />
        </div>
        <p className="mt-1 text-sm text-[#EAF0FF]/60">
          Receipt scans and skipped items needing attention
        </p>
      </div>

      <PageTip
        tipId="receipts-intro"
        title="Receipt Capture"
        description="Capture vendor invoices to track receiving. Scan or upload receipts and auto-match line items to inventory."
      />

      {/* Learning Stats Banner */}
      <LearningStatsBanner />

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

      {/* Section B — Receipt Archive */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#EAF0FF]/50">
          Receipt Archive
        </h2>

        {/* Filter Bar */}
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="mb-1 block text-xs text-[#EAF0FF]/40">Search</label>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Vendor, invoice #..."
              className="w-full rounded-lg border border-white/10 bg-[#16283F] px-3 py-2 text-sm text-[#EAF0FF] placeholder-[#EAF0FF]/30 focus:border-[#E9B44C]/50 focus:outline-none"
            />
          </div>

          <div className="min-w-[150px]">
            <label className="mb-1 block text-xs text-[#EAF0FF]/40">Vendor</label>
            <select
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#16283F] px-3 py-2 text-sm text-[#EAF0FF] focus:border-[#E9B44C]/50 focus:outline-none"
            >
              <option value="">All vendors</option>
              {vendors?.map((v: any) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[130px]">
            <label className="mb-1 block text-xs text-[#EAF0FF]/40">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#16283F] px-3 py-2 text-sm text-[#EAF0FF] focus:border-[#E9B44C]/50 focus:outline-none"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[140px]">
            <label className="mb-1 block text-xs text-[#EAF0FF]/40">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#16283F] px-3 py-2 text-sm text-[#EAF0FF] focus:border-[#E9B44C]/50 focus:outline-none"
            />
          </div>

          <div className="min-w-[140px]">
            <label className="mb-1 block text-xs text-[#EAF0FF]/40">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#16283F] px-3 py-2 text-sm text-[#EAF0FF] focus:border-[#E9B44C]/50 focus:outline-none"
            />
          </div>

          {hasFilters && (
            <button
              onClick={() => {
                setSearchText("");
                setVendorFilter("");
                setStatusFilter("");
                setDateFrom("");
                setDateTo("");
              }}
              className="rounded-lg border border-white/10 px-3 py-2 text-sm text-[#EAF0FF]/60 hover:bg-white/5"
            >
              Clear
            </button>
          )}
        </div>

        {recentLoading ? (
          <div className="flex items-center gap-2 py-4">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#E9B44C] border-t-transparent" />
            <span className="text-sm text-[#EAF0FF]/40">Loading...</span>
          </div>
        ) : !recentReceipts?.items?.length ? (
          <p className="py-4 text-sm text-[#EAF0FF]/40">
            {hasFilters ? "No receipts match your filters." : "No receipts yet."}
          </p>
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

function LearningStatsBanner() {
  const { data: stats, isLoading } = trpc.receipts.learningStats.useQuery();

  if (isLoading || !stats) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <span className="rounded-full bg-[#16283F] border border-white/10 px-3 py-1 text-xs text-[#EAF0FF]/80">
        {stats.vendorAliasCount} vendor alias{stats.vendorAliasCount !== 1 ? "es" : ""}
      </span>
      <span className="rounded-full bg-[#16283F] border border-white/10 px-3 py-1 text-xs text-[#EAF0FF]/80">
        {stats.supplierAliasCount} item alias{stats.supplierAliasCount !== 1 ? "es" : ""}
      </span>
      {stats.recentAutoMatchRate != null && (
        <span className="rounded-full bg-[#16283F] border border-white/10 px-3 py-1 text-xs text-[#EAF0FF]/80">
          {stats.recentAutoMatchRate}% auto-match rate (30d)
        </span>
      )}
      <span className="text-xs text-[#EAF0FF]/40">
        Fuzzy threshold: {stats.fuzzyThreshold}
      </span>
    </div>
  );
}
