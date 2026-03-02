"use client";

import { useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useLocation } from "@/components/location-context";
import { trpc } from "@/lib/trpc";
import Link from "next/link";
import { HelpLink } from "@/components/help-link";

type LineStatus = "pending" | "created" | "requested";

interface SkippedLine {
  id: string;
  descriptionRaw: string;
  unitSizeRaw: string | null;
  unitPriceRaw: number | null;
  quantityRaw: number | null;
  productCodeRaw: string | null;
  selectedCategoryId: string | null;
  status: LineStatus;
}

const MANAGER_ROLES = ["manager", "business_admin", "platform_admin"];

export default function AddSkippedPage() {
  const searchParams = useSearchParams();
  const receiptCaptureId = searchParams.get("receiptCaptureId");
  const { data: session } = useSession();
  const user = session?.user as any;
  const { selectedLocationId: locationId } = useLocation();
  const businessId = user?.businessId as string | undefined;
  const isManager = MANAGER_ROLES.includes(user?.highestRole ?? "");

  const [lines, setLines] = useState<SkippedLine[]>([]);
  const [initialized, setInitialized] = useState(false);

  const utils = trpc.useUtils();

  const { data: receipt, isLoading } = trpc.receipts.getById.useQuery(
    { id: receiptCaptureId! },
    { enabled: !!receiptCaptureId }
  );

  const { data: categories } = trpc.itemCategories.list.useQuery(
    { businessId: businessId! },
    { enabled: !!businessId }
  );

  // Initialize skipped lines from receipt data
  if (receipt && !initialized) {
    setInitialized(true);
    const skipped = receipt.lines
      .filter((l: any) => l.skipped && !l.inventoryItemId)
      .map((l: any) => ({
        id: l.id,
        descriptionRaw: l.descriptionRaw,
        unitSizeRaw: l.unitSizeRaw ?? null,
        unitPriceRaw: l.unitPriceRaw != null ? Number(l.unitPriceRaw) : null,
        quantityRaw: l.quantityRaw != null ? Number(l.quantityRaw) : null,
        productCodeRaw: l.productCodeRaw ?? null,
        selectedCategoryId: null,
        status: "pending" as LineStatus,
      }));
    setLines(skipped);
  }

  const createMutation = trpc.receipts.createFromSkipped.useMutation({
    onSuccess: (_data, variables) => {
      setLines((prev) =>
        prev.map((l) =>
          l.id === variables.receiptLineId ? { ...l, status: "created" } : l
        )
      );
      utils.inventory.list.invalidate();
    },
  });

  const requestMutation = trpc.receipts.requestItemCreation.useMutation({
    onSuccess: (_data, variables) => {
      setLines((prev) =>
        prev.map((l) =>
          l.id === variables.receiptLineId ? { ...l, status: "requested" } : l
        )
      );
    },
  });

  function handleCreate(line: SkippedLine) {
    if (!line.selectedCategoryId || !locationId) return;
    createMutation.mutate({
      receiptLineId: line.id,
      categoryId: line.selectedCategoryId,
      locationId,
    });
  }

  function handleRequest(line: SkippedLine) {
    requestMutation.mutate({ receiptLineId: line.id });
  }

  const completedCount = lines.filter((l) => l.status !== "pending").length;
  const isBusy = createMutation.isPending || requestMutation.isPending;

  if (!receiptCaptureId) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-[#EAF0FF]/60">No receipt specified.</p>
        <Link href="/receipts" className="mt-4 text-[#E9B44C] hover:underline">
          Back to Receipts
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#E9B44C] border-t-transparent" />
        <p className="mt-3 text-sm text-[#EAF0FF]/60">Loading skipped items...</p>
      </div>
    );
  }

  if (lines.length === 0 && initialized) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-[#EAF0FF]/60">No skipped items to add.</p>
        <Link href="/receipts" className="mt-4 text-[#E9B44C] hover:underline">
          Back to Receipts
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Link href="/receipts" className="text-[#EAF0FF]/40 hover:text-[#EAF0FF]/60">
            &larr; Receipts
          </Link>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <h1 className="text-2xl font-bold text-[#EAF0FF]">Add Skipped Items</h1>
          <HelpLink section="receipt-capture" tooltip="Learn about receipt capture" />
        </div>
        <p className="mt-1 text-sm text-[#EAF0FF]/60">
          {completedCount}/{lines.length} processed
          {receipt?.vendor?.name && <> &middot; {receipt.vendor.name}</>}
        </p>
      </div>

      {createMutation.isError && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {createMutation.error.message}
        </div>
      )}
      {requestMutation.isError && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {requestMutation.error.message}
        </div>
      )}

      <div className="space-y-4">
        {lines.map((line) => {
          const selectedCat = categories?.find(
            (c: any) => c.id === line.selectedCategoryId
          );

          return (
            <div
              key={line.id}
              className={`rounded-xl border p-4 ${
                line.status !== "pending"
                  ? "border-white/5 bg-[#16283F]/50 opacity-60"
                  : "border-white/10 bg-[#16283F]"
              }`}
            >
              {/* Status badge */}
              {line.status !== "pending" && (
                <span
                  className={`mb-2 inline-block rounded-full px-3 py-0.5 text-xs font-semibold ${
                    line.status === "created"
                      ? "bg-green-500/20 text-green-400"
                      : "bg-[#E9B44C]/20 text-[#E9B44C]"
                  }`}
                >
                  {line.status === "created" ? "Created" : "Requested"}
                </span>
              )}

              {/* Description */}
              <h3 className="text-lg font-semibold text-[#EAF0FF]">
                {line.descriptionRaw}
              </h3>

              {/* Detail chips */}
              <div className="mt-2 flex flex-wrap gap-2">
                {line.unitSizeRaw && (
                  <span className="rounded-md bg-[#0B1623] px-2.5 py-1 text-xs text-[#8899AA]">
                    {line.unitSizeRaw}
                  </span>
                )}
                {line.unitPriceRaw != null && (
                  <span className="rounded-md bg-[#0B1623] px-2.5 py-1 text-xs text-[#8899AA]">
                    ${line.unitPriceRaw.toFixed(2)}
                  </span>
                )}
                {line.quantityRaw != null && (
                  <span className="rounded-md bg-[#0B1623] px-2.5 py-1 text-xs text-[#8899AA]">
                    Qty: {line.quantityRaw}
                  </span>
                )}
                {line.productCodeRaw && (
                  <span className="rounded-md bg-[#0B1623] px-2.5 py-1 text-xs text-[#8899AA]">
                    #{line.productCodeRaw}
                  </span>
                )}
              </div>

              {line.status === "pending" && (
                <div className="mt-4 flex items-center gap-3">
                  {isManager && (
                    <>
                      <select
                        value={line.selectedCategoryId ?? ""}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l) =>
                              l.id === line.id
                                ? { ...l, selectedCategoryId: e.target.value || null }
                                : l
                            )
                          )
                        }
                        className="rounded-lg border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] focus:border-[#E9B44C]/50 focus:outline-none"
                      >
                        <option value="">Select category...</option>
                        {categories?.map((cat: any) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleCreate(line)}
                        disabled={!line.selectedCategoryId || isBusy}
                        className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40"
                      >
                        {createMutation.isPending &&
                        createMutation.variables?.receiptLineId === line.id
                          ? "Creating..."
                          : "Create Item"}
                      </button>
                    </>
                  )}
                  {!isManager && (
                    <button
                      onClick={() => handleRequest(line)}
                      disabled={isBusy}
                      className="rounded-lg bg-[#E9B44C] px-4 py-2 text-sm font-semibold text-[#0B1623] hover:bg-[#d4a43e] disabled:opacity-40"
                    >
                      {requestMutation.isPending &&
                      requestMutation.variables?.receiptLineId === line.id
                        ? "Requesting..."
                        : "Request Addition"}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
