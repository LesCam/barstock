"use client";

import { Fragment, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";

const ADMIN_ROLES = ["platform_admin", "business_admin", "manager"];

const STATUS_BADGE: Record<string, string> = {
  in_storage: "bg-blue-500/20 text-blue-400",
  in_service: "bg-green-500/20 text-green-400",
  empty: "bg-amber-500/20 text-amber-400",
  returned: "bg-white/5 text-[#EAF0FF]/40",
};

export default function DraftPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const locationId = user?.locationIds?.[0];
  const canEdit = ADMIN_ROLES.includes(user?.highestRole ?? "");

  const utils = trpc.useUtils();

  /* ── Queries ── */
  const { data: tapLines } = trpc.draft.listTapLines.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId },
  );
  const { data: kegs } = trpc.draft.listKegs.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId },
  );
  const { data: products } = trpc.inventory.list.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId },
  );
  const { data: kegSizes } = trpc.draft.listKegSizes.useQuery();

  const kegBeerProducts =
    products?.filter((p: any) => p.type === "keg_beer") ?? [];
  const storageKegs =
    kegs?.filter((k: any) => k.status === "in_storage") ?? [];

  /* ── Mutations ── */
  const createKeg = trpc.draft.createKeg.useMutation({
    onSuccess: () => utils.draft.listKegs.invalidate(),
  });
  const updateKegStatus = trpc.draft.updateKegStatus.useMutation({
    onSuccess: () => {
      utils.draft.listKegs.invalidate();
      utils.draft.listTapLines.invalidate();
    },
  });
  const assignTapMutation = trpc.draft.assignTap.useMutation({
    onSuccess: () => {
      utils.draft.listKegs.invalidate();
      utils.draft.listTapLines.invalidate();
    },
  });

  const isMutating =
    assignTapMutation.isPending || updateKegStatus.isPending;

  /* ── UI state ── */
  const [showReceiveForm, setShowReceiveForm] = useState(false);
  const [assigningKegId, setAssigningKegId] = useState<string | null>(null);
  const [assigningTapId, setAssigningTapId] = useState<string | null>(null);

  // Receive keg form
  const [receiveItemId, setReceiveItemId] = useState("");
  const [receiveSizeId, setReceiveSizeId] = useState("");
  const [receiveOz, setReceiveOz] = useState("");
  const [receiveDate, setReceiveDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [receiveNotes, setReceiveNotes] = useState("");

  // Assign tap (from keg row)
  const [assignTapLineId, setAssignTapLineId] = useState("");
  const [assignTapDate, setAssignTapDate] = useState(
    new Date().toISOString().split("T")[0],
  );

  // Assign keg (from tap card)
  const [assignKegInstanceId, setAssignKegInstanceId] = useState("");
  const [assignKegDate, setAssignKegDate] = useState(
    new Date().toISOString().split("T")[0],
  );

  function resetReceiveForm() {
    setReceiveItemId("");
    setReceiveSizeId("");
    setReceiveOz("");
    setReceiveDate(new Date().toISOString().split("T")[0]);
    setReceiveNotes("");
  }

  function handleSizeChange(sizeId: string) {
    setReceiveSizeId(sizeId);
    const size = kegSizes?.find((s: any) => s.id === sizeId);
    if (size) setReceiveOz(String(Number(size.totalOz)));
  }

  async function handleReceiveKeg(e: React.FormEvent) {
    e.preventDefault();
    await createKeg.mutateAsync({
      locationId: locationId!,
      inventoryItemId: receiveItemId,
      kegSizeId: receiveSizeId,
      receivedTs: new Date(receiveDate),
      startingOz: Number(receiveOz),
      notes: receiveNotes || undefined,
    });
    setShowReceiveForm(false);
    resetReceiveForm();
  }

  async function handleAssignFromKeg(kegId: string) {
    const ts = new Date(assignTapDate);
    await assignTapMutation.mutateAsync({
      locationId: locationId!,
      tapLineId: assignTapLineId,
      kegInstanceId: kegId,
      effectiveStartTs: ts,
    });
    await updateKegStatus.mutateAsync({
      id: kegId,
      status: "in_service",
      tappedTs: ts,
    });
    setAssigningKegId(null);
  }

  async function handleAssignFromTap(tapLineId: string) {
    const ts = new Date(assignKegDate);
    await assignTapMutation.mutateAsync({
      locationId: locationId!,
      tapLineId,
      kegInstanceId: assignKegInstanceId,
      effectiveStartTs: ts,
    });
    await updateKegStatus.mutateAsync({
      id: assignKegInstanceId,
      status: "in_service",
      tappedTs: ts,
    });
    setAssigningTapId(null);
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-[#EAF0FF]">
        Draft Beer / Kegs
      </h1>

      {/* ── Tap Board ── */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Tap Board</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tapLines?.map((tap: any) => {
            const assignment = tap.tapAssignments[0];
            const isAssigning = assigningTapId === tap.id;
            return (
              <div
                key={tap.id}
                className="rounded-lg border border-white/10 bg-[#16283F] p-4"
              >
                <h3 className="font-medium">{tap.name}</h3>
                {assignment ? (
                  <div className="mt-2 text-sm">
                    <p className="text-[#EAF0FF]">
                      {assignment.kegInstance.inventoryItem.name}
                    </p>
                    <p className="text-xs text-[#EAF0FF]/60">
                      Tapped:{" "}
                      {assignment.effectiveStartTs
                        ? new Date(
                            assignment.effectiveStartTs,
                          ).toLocaleDateString()
                        : "—"}
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="mt-2 text-sm italic text-[#EAF0FF]/40">
                      Empty
                    </p>
                    {canEdit && !isAssigning && (
                      <button
                        onClick={() => {
                          setAssigningTapId(tap.id);
                          setAssigningKegId(null);
                          setAssignKegInstanceId("");
                          setAssignKegDate(
                            new Date().toISOString().split("T")[0],
                          );
                        }}
                        className="mt-2 text-xs text-blue-400 hover:text-blue-300"
                      >
                        Assign Keg
                      </button>
                    )}
                    {isAssigning && (
                      <form
                        className="mt-3 space-y-2"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          await handleAssignFromTap(tap.id);
                        }}
                      >
                        <select
                          value={assignKegInstanceId}
                          onChange={(e) =>
                            setAssignKegInstanceId(e.target.value)
                          }
                          required
                          className="w-full rounded border border-white/10 bg-[#0B1623] px-2 py-1.5 text-xs text-[#EAF0FF]"
                        >
                          <option value="">Select keg…</option>
                          {storageKegs.map((k: any) => (
                            <option key={k.id} value={k.id}>
                              {k.inventoryItem.name} — {k.kegSize.name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="date"
                          value={assignKegDate}
                          onChange={(e) => setAssignKegDate(e.target.value)}
                          className="w-full rounded border border-white/10 bg-[#0B1623] px-2 py-1.5 text-xs text-[#EAF0FF]"
                        />
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={isMutating}
                            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                          >
                            {isMutating ? "Assigning…" : "Assign"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setAssigningTapId(null)}
                            className="text-xs text-[#EAF0FF]/60 hover:text-[#EAF0FF]"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                  </>
                )}
              </div>
            );
          })}
          {tapLines?.length === 0 && (
            <p className="text-sm text-[#EAF0FF]/60">
              No tap lines configured.
            </p>
          )}
        </div>
      </section>

      {/* ── Keg Section ── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Keg Inventory ({kegs?.length ?? 0})
          </h2>
          {canEdit && !showReceiveForm && (
            <button
              onClick={() => setShowReceiveForm(true)}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
            >
              + Receive Keg
            </button>
          )}
        </div>

        {/* Receive Keg Form */}
        {showReceiveForm && (
          <form
            onSubmit={handleReceiveKeg}
            className="mb-4 space-y-3 rounded-lg border border-white/10 bg-[#16283F] p-4"
          >
            <h3 className="text-sm font-semibold text-[#EAF0FF]/80">
              Receive New Keg
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <select
                value={receiveItemId}
                onChange={(e) => setReceiveItemId(e.target.value)}
                required
                className="rounded border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
              >
                <option value="">Select product…</option>
                {kegBeerProducts.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select
                value={receiveSizeId}
                onChange={(e) => handleSizeChange(e.target.value)}
                required
                className="rounded border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
              >
                <option value="">Select keg size…</option>
                {kegSizes?.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={receiveOz}
                onChange={(e) => setReceiveOz(e.target.value)}
                placeholder="Starting volume (L)"
                required
                min={1}
                className="rounded border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
              />
              <input
                type="date"
                value={receiveDate}
                onChange={(e) => setReceiveDate(e.target.value)}
                required
                className="rounded border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
              />
              <input
                type="text"
                value={receiveNotes}
                onChange={(e) => setReceiveNotes(e.target.value)}
                placeholder="Notes (optional)"
                className="rounded border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createKeg.isPending}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {createKeg.isPending ? "Saving…" : "Receive Keg"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowReceiveForm(false);
                  resetReceiveForm();
                }}
                className="text-sm text-[#EAF0FF]/60 hover:text-[#EAF0FF]"
              >
                Cancel
              </button>
            </div>
            {createKeg.error && (
              <p className="text-sm text-red-400">{createKeg.error.message}</p>
            )}
          </form>
        )}

        {/* Keg Table */}
        <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Received</th>
                {canEdit && <th className="px-4 py-3">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {kegs?.map((keg: any) => (
                <Fragment key={keg.id}>
                  <tr className="hover:bg-[#16283F]/60">
                    <td className="px-4 py-3">{keg.inventoryItem.name}</td>
                    <td className="px-4 py-3">
                      {keg.kegSize.name}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_BADGE[keg.status] ?? "bg-white/5 text-[#EAF0FF]/70"}`}
                      >
                        {keg.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {new Date(keg.receivedTs).toLocaleDateString()}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        {keg.status === "in_storage" && (
                          <button
                            onClick={() => {
                              setAssigningKegId(keg.id);
                              setAssigningTapId(null);
                              setAssignTapLineId("");
                              setAssignTapDate(
                                new Date().toISOString().split("T")[0],
                              );
                            }}
                            className="text-xs font-medium text-blue-400 hover:text-blue-300"
                          >
                            Tap
                          </button>
                        )}
                        {keg.status === "in_service" && (
                          <button
                            onClick={() =>
                              updateKegStatus.mutate({
                                id: keg.id,
                                status: "empty",
                                emptiedTs: new Date(),
                              })
                            }
                            disabled={updateKegStatus.isPending}
                            className="text-xs font-medium text-amber-400 hover:text-amber-300 disabled:opacity-50"
                          >
                            Mark Empty
                          </button>
                        )}
                        {keg.status === "empty" && (
                          <button
                            onClick={() =>
                              updateKegStatus.mutate({
                                id: keg.id,
                                status: "returned",
                              })
                            }
                            disabled={updateKegStatus.isPending}
                            className="text-xs font-medium text-[#EAF0FF]/60 hover:text-[#EAF0FF] disabled:opacity-50"
                          >
                            Mark Returned
                          </button>
                        )}
                      </td>
                    )}
                  </tr>

                  {/* Assign-to-Tap inline form */}
                  {assigningKegId === keg.id && (
                    <tr>
                      <td
                        colSpan={canEdit ? 5 : 4}
                        className="bg-[#0B1623] px-4 py-3"
                      >
                        <form
                          className="flex flex-wrap items-end gap-3"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            await handleAssignFromKeg(keg.id);
                          }}
                        >
                          <div>
                            <label className="mb-1 block text-xs text-[#EAF0FF]/60">
                              Tap Line
                            </label>
                            <select
                              value={assignTapLineId}
                              onChange={(e) =>
                                setAssignTapLineId(e.target.value)
                              }
                              required
                              className="rounded border border-white/10 bg-[#16283F] px-2 py-1.5 text-xs text-[#EAF0FF]"
                            >
                              <option value="">Select tap…</option>
                              {tapLines?.map((t: any) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                  {t.tapAssignments[0]
                                    ? ` (${t.tapAssignments[0].kegInstance.inventoryItem.name})`
                                    : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-[#EAF0FF]/60">
                              Tapped Date
                            </label>
                            <input
                              type="date"
                              value={assignTapDate}
                              onChange={(e) =>
                                setAssignTapDate(e.target.value)
                              }
                              className="rounded border border-white/10 bg-[#16283F] px-2 py-1.5 text-xs text-[#EAF0FF]"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={isMutating}
                            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                          >
                            {isMutating ? "Assigning…" : "Assign"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setAssigningKegId(null)}
                            className="text-xs text-[#EAF0FF]/60 hover:text-[#EAF0FF]"
                          >
                            Cancel
                          </button>
                        </form>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
