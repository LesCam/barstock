"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { SessionType } from "@barstock/types";

export default function SessionsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const locationId = user?.locationIds?.[0];
  const router = useRouter();
  const utils = trpc.useUtils();

  const [showNewForm, setShowNewForm] = useState(false);
  const [sessionType, setSessionType] = useState<SessionType>("shift");
  const [startedTs, setStartedTs] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });

  const { data: sessions, isLoading } = trpc.sessions.list.useQuery(
    { locationId: locationId!, openOnly: false },
    { enabled: !!locationId }
  );

  const createMutation = trpc.sessions.create.useMutation({
    onSuccess: (created) => {
      utils.sessions.list.invalidate();
      setShowNewForm(false);
      router.push(`/sessions/${created.id}`);
    },
  });

  function handleCreate() {
    if (!locationId) return;
    createMutation.mutate({
      locationId,
      sessionType,
      startedTs: new Date(startedTs),
    });
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#EAF0FF]">Inventory Sessions</h1>
        <button
          onClick={() => setShowNewForm((v) => !v)}
          className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E]"
        >
          {showNewForm ? "Cancel" : "New Session"}
        </button>
      </div>

      {showNewForm && (
        <div className="mb-6 rounded-lg border border-white/10 bg-[#16283F] p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">Session Type</label>
              <select
                value={sessionType}
                onChange={(e) => setSessionType(e.target.value as SessionType)}
                className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
              >
                {Object.values(SessionType).map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">Started</label>
              <input
                type="datetime-local"
                value={startedTs}
                onChange={(e) => setStartedTs(e.target.value)}
                className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
            >
              {createMutation.isPending ? "Creating..." : "Create Session"}
            </button>
          </div>
          {createMutation.error && (
            <p className="mt-2 text-sm text-red-400">{createMutation.error.message}</p>
          )}
        </div>
      )}

      {isLoading ? (
        <p className="text-[#EAF0FF]/60">Loading...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
              <tr>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Ended</th>
                <th className="px-4 py-3">Created By</th>
                <th className="px-4 py-3">Lines</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sessions?.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => router.push(`/sessions/${s.id}`)}
                  className="cursor-pointer hover:bg-white/5"
                >
                  <td className="px-4 py-3 capitalize">{s.sessionType}</td>
                  <td className="px-4 py-3 text-xs">
                    {new Date(s.startedTs).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {s.endedTs ? new Date(s.endedTs).toLocaleString() : "\u2014"}
                  </td>
                  <td className="px-4 py-3">{s.createdByUser?.email ?? "\u2014"}</td>
                  <td className="px-4 py-3">{s._count.lines}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        s.endedTs
                          ? "bg-white/5 text-[#EAF0FF]/70"
                          : "bg-[#E9B44C]/10 text-[#E9B44C]"
                      }`}
                    >
                      {s.endedTs ? "Closed" : "Open"}
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
