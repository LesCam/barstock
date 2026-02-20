"use client";

import { use, useState, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { VarianceReason } from "@barstock/types";

// --- Inline editable cell ---
function EditableCell({
  value,
  onSave,
  type = "number",
  disabled,
}: {
  value: number | null | undefined;
  onSave: (v: number | undefined) => void;
  type?: string;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  if (disabled) {
    return <span>{value ?? "\u2014"}</span>;
  }

  if (!editing) {
    return (
      <span
        onClick={() => {
          setDraft(value != null ? String(value) : "");
          setEditing(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="cursor-pointer rounded px-1 hover:bg-white/10"
      >
        {value ?? "\u2014"}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        const num = draft === "" ? undefined : Number(draft);
        if (num !== (value ?? undefined)) {
          onSave(num);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setEditing(false);
      }}
      className="w-20 rounded border border-white/20 bg-[#0B1623] px-1 py-0.5 text-sm text-[#EAF0FF]"
    />
  );
}

// --- Variance reason labels ---
const VARIANCE_LABELS: Record<VarianceReason, string> = {
  waste_foam: "Waste / Foam",
  comp: "Comp",
  staff_drink: "Staff Drink",
  theft: "Theft",
  breakage: "Breakage",
  line_cleaning: "Line Cleaning",
  transfer: "Transfer",
  unknown: "Unknown",
};

export default function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: authSession } = useSession();
  const user = authSession?.user as any;
  const locationId = user?.locationIds?.[0];
  const utils = trpc.useUtils();

  // --- Data fetching ---
  const { data: session, isLoading } = trpc.sessions.getById.useQuery({ id });

  // Poll participants every 15s for open sessions
  const { data: participants } = trpc.sessions.listParticipants.useQuery(
    { sessionId: id },
    { refetchInterval: 15_000 }
  );

  const { data: inventoryItems } = trpc.inventory.list.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId }
  );

  // --- Add line state ---
  const [selectedItemId, setSelectedItemId] = useState("");
  const [countInput, setCountInput] = useState("");
  const [itemSearch, setItemSearch] = useState("");

  // --- Close session state ---
  const [varianceItemIds, setVarianceItemIds] = useState<string[]>([]);
  const [varianceReasons, setVarianceReasons] = useState<
    Record<string, VarianceReason>
  >({});
  const [showVarianceDialog, setShowVarianceDialog] = useState(false);
  const [closeResult, setCloseResult] = useState<{
    adjustmentsCreated: number;
    totalVariance: number;
  } | null>(null);

  // --- Mutations ---
  const updateLineMut = trpc.sessions.updateLine.useMutation({
    onSuccess: () => utils.sessions.getById.invalidate({ id }),
  });

  const addLineMut = trpc.sessions.addLine.useMutation({
    onSuccess: () => {
      utils.sessions.getById.invalidate({ id });
      setSelectedItemId("");
      setCountInput("");
      setItemSearch("");
    },
  });

  const closeMut = trpc.sessions.close.useMutation({
    onSuccess: (result) => {
      setCloseResult(result);
      setShowVarianceDialog(false);
      setVarianceItemIds([]);
      utils.sessions.getById.invalidate({ id });
      utils.sessions.list.invalidate();
    },
    onError: (err) => {
      const msg = err.message;
      const match = msg.match(/Variance reasons required for items:\s*(.+)/);
      if (match) {
        const ids = match[1].split(",").map((s) => s.trim());
        setVarianceItemIds(ids);
        setShowVarianceDialog(true);
      }
    },
  });

  const isOpen = session && !session.endedTs;

  // --- Filtered inventory items for add-item picker ---
  const filteredItems = useMemo(() => {
    if (!inventoryItems) return [];
    const search = itemSearch.toLowerCase();
    return inventoryItems.filter(
      (item) =>
        item.name.toLowerCase().includes(search) ||
        (item.category?.name ?? "").toLowerCase().includes(search)
    );
  }, [inventoryItems, itemSearch]);

  // --- Item name lookup for variance dialog ---
  function getItemName(itemId: string): string {
    const line = session?.lines.find((l) => l.inventoryItemId === itemId);
    return line?.inventoryItem.name ?? itemId;
  }

  function handleAddLine() {
    if (!selectedItemId) return;
    addLineMut.mutate({
      sessionId: id,
      inventoryItemId: selectedItemId,
      countUnits: countInput ? Number(countInput) : undefined,
    });
  }

  function handleClose() {
    closeMut.mutate({ sessionId: id });
  }

  function handleSubmitVarianceReasons() {
    const reasons = varianceItemIds.map((itemId) => ({
      itemId,
      reason: varianceReasons[itemId] || VarianceReason.unknown,
    }));
    closeMut.mutate({ sessionId: id, varianceReasons: reasons });
  }

  // --- Loading / not found ---
  if (isLoading) return <p className="text-[#EAF0FF]/60">Loading...</p>;
  if (!session) return <p className="text-[#EAF0FF]/60">Session not found.</p>;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/sessions"
          className="mb-2 inline-block text-sm text-[#EAF0FF]/60 hover:text-[#EAF0FF]"
        >
          &larr; Back to Sessions
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold capitalize text-[#EAF0FF]">
            {session.sessionType} Session
          </h1>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              isOpen
                ? "bg-[#E9B44C]/10 text-[#E9B44C]"
                : "bg-white/5 text-[#EAF0FF]/70"
            }`}
          >
            {isOpen ? "Open" : "Closed"}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-[#EAF0FF]/60">
          <span>
            Started: {new Date(session.startedTs).toLocaleString()}
          </span>
          {session.endedTs && (
            <span>Ended: {new Date(session.endedTs).toLocaleString()}</span>
          )}
          {session.createdBy && (
            <span>Created by: {session.createdBy}</span>
          )}
          {session.closedBy && (
            <span>Closed by: {session.closedBy}</span>
          )}
        </div>
      </div>

      {/* Participants (open sessions) */}
      {isOpen && participants && participants.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-[#EAF0FF]/40">
            Active:
          </span>
          {participants.map((p) => {
            const idleMs = Date.now() - new Date(p.lastActiveAt).getTime();
            const isIdle = idleMs > 2 * 60 * 1000;
            const displayName = p.user.firstName
              ? `${p.user.firstName}${p.user.lastName ? ` ${p.user.lastName.charAt(0)}.` : ""}`
              : p.user.email.split("@")[0];
            return (
              <span
                key={p.userId}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                  isIdle
                    ? "border-white/5 text-[#EAF0FF]/30"
                    : "border-[#2BA8A0]/30 text-[#EAF0FF]"
                }`}
              >
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    isIdle ? "bg-[#5A6A7A]" : "bg-[#2BA8A0]"
                  }`}
                />
                {displayName}
                {p.subArea && !isIdle && (
                  <span className="text-[#EAF0FF]/40">
                    — {p.subArea.name}
                  </span>
                )}
                {isIdle && <span className="text-[#EAF0FF]/20">idle</span>}
              </span>
            );
          })}
        </div>
      )}

      {/* Close result banner */}
      {closeResult && (
        <div className="mb-4 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-300">
          Session closed. {closeResult.adjustmentsCreated} adjustment(s) created,
          total variance: {closeResult.totalVariance.toFixed(2)} units.
        </div>
      )}

      {/* Lines table */}
      <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
            <tr>
              <th className="px-4 py-3">Item Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Count</th>
              <th className="px-4 py-3">Weight (g)</th>
              <th className="px-4 py-3">% Remaining</th>
              <th className="px-4 py-3">Area</th>
              <th className="px-4 py-3">Counted By</th>
              <th className="px-4 py-3">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-[#EAF0FF]">
            {session.lines.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-[#EAF0FF]/40">
                  No items counted yet.
                </td>
              </tr>
            ) : (
              session.lines.map((line) => (
                <tr key={line.id} className="hover:bg-white/5">
                  <td className="px-4 py-3">{line.inventoryItem.name}</td>
                  <td className="px-4 py-3 capitalize text-xs">
                    {line.inventoryItem.category?.name ?? ""}
                  </td>
                  <td className="px-4 py-3">
                    <EditableCell
                      value={line.countUnits != null ? Number(line.countUnits) : null}
                      disabled={!isOpen}
                      onSave={(v) =>
                        updateLineMut.mutate({ id: line.id, countUnits: v })
                      }
                    />
                  </td>
                  <td className="px-4 py-3">
                    <EditableCell
                      value={
                        line.grossWeightGrams != null
                          ? Number(line.grossWeightGrams)
                          : null
                      }
                      disabled={!isOpen}
                      onSave={(v) =>
                        updateLineMut.mutate({ id: line.id, grossWeightGrams: v })
                      }
                    />
                  </td>
                  <td className="px-4 py-3">
                    <EditableCell
                      value={
                        line.percentRemaining != null
                          ? Number(line.percentRemaining)
                          : null
                      }
                      disabled={!isOpen}
                      onSave={(v) =>
                        updateLineMut.mutate({ id: line.id, percentRemaining: v })
                      }
                    />
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {line.subArea
                      ? `${line.subArea.barArea.name} / ${line.subArea.name}`
                      : "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {line.countedByUser
                      ? line.countedByUser.firstName ?? line.countedByUser.email.split("@")[0]
                      : "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {line.notes ?? "\u2014"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add item section (open sessions only) */}
      {isOpen && (
        <div className="mt-4 rounded-lg border border-white/10 bg-[#16283F] p-4">
          <h2 className="mb-3 text-sm font-semibold text-[#EAF0FF]">Add Item</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">
                Inventory Item
              </label>
              <input
                type="text"
                placeholder="Search items..."
                value={itemSearch}
                onChange={(e) => {
                  setItemSearch(e.target.value);
                  setSelectedItemId("");
                }}
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30"
              />
              {itemSearch && !selectedItemId && filteredItems.length > 0 && (
                <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-white/10 bg-[#0B1623]">
                  {filteredItems.slice(0, 20).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setSelectedItemId(item.id);
                        setItemSearch(item.name);
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-[#EAF0FF] hover:bg-white/10"
                    >
                      <span>{item.name}</span>
                      <span className="text-xs capitalize text-[#EAF0FF]/40">
                        {item.category?.name ?? ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {itemSearch && !selectedItemId && filteredItems.length === 0 && (
                <p className="mt-1 text-xs text-[#EAF0FF]/40">No items found.</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">Count</label>
              <input
                type="number"
                value={countInput}
                onChange={(e) => setCountInput(e.target.value)}
                placeholder="0"
                className="w-24 rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
              />
            </div>
            <button
              onClick={handleAddLine}
              disabled={!selectedItemId || addLineMut.isPending}
              className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
            >
              {addLineMut.isPending ? "Adding..." : "Add"}
            </button>
          </div>
          {addLineMut.error && (
            <p className="mt-2 text-sm text-red-400">{addLineMut.error.message}</p>
          )}
        </div>
      )}

      {/* Close session button */}
      {isOpen && (
        <div className="mt-4">
          <button
            onClick={handleClose}
            disabled={closeMut.isPending}
            className="rounded-md bg-[#E9B44C] px-6 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
          >
            {closeMut.isPending ? "Closing..." : "Close Session"}
          </button>
          {closeMut.error && !showVarianceDialog && (
            <p className="mt-2 text-sm text-red-400">{closeMut.error.message}</p>
          )}
        </div>
      )}

      {/* Variance reasons dialog */}
      {showVarianceDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-lg rounded-lg border border-white/10 bg-[#16283F] p-6">
            <h2 className="mb-1 text-lg font-semibold text-[#EAF0FF]">
              Variance Reasons Required
            </h2>
            <p className="mb-4 text-sm text-[#EAF0FF]/60">
              The following items exceed the variance threshold. Please provide a
              reason for each.
            </p>

            <div className="space-y-3">
              {varianceItemIds.map((itemId) => (
                <div
                  key={itemId}
                  className="flex items-center gap-3 rounded-md border border-white/10 bg-[#0B1623] p-3"
                >
                  <span className="flex-1 text-sm text-[#EAF0FF]">
                    {getItemName(itemId)}
                  </span>
                  <select
                    value={varianceReasons[itemId] || ""}
                    onChange={(e) =>
                      setVarianceReasons((prev) => ({
                        ...prev,
                        [itemId]: e.target.value as VarianceReason,
                      }))
                    }
                    className="rounded-md border border-white/10 bg-[#16283F] px-2 py-1 text-sm text-[#EAF0FF]"
                  >
                    <option value="">Select reason...</option>
                    {Object.entries(VARIANCE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="mt-4 flex gap-3">
              <button
                onClick={handleSubmitVarianceReasons}
                disabled={
                  closeMut.isPending ||
                  varianceItemIds.some((id) => !varianceReasons[id])
                }
                className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
              >
                {closeMut.isPending ? "Submitting..." : "Submit Reasons"}
              </button>
              <button
                onClick={() => setShowVarianceDialog(false)}
                className="rounded-md border border-white/10 px-4 py-2 text-sm text-[#EAF0FF] hover:bg-white/5"
              >
                Cancel
              </button>
            </div>

            {closeMut.error && showVarianceDialog && (
              <p className="mt-2 text-sm text-red-400">
                {closeMut.error.message}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
