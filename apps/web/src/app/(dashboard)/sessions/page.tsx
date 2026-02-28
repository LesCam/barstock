"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";
import { useLocation } from "@/components/location-context";
import { useRouter } from "next/navigation";
import { HelpLink } from "@/components/help-link";
import { SessionType, Role } from "@barstock/types";

export default function SessionsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const { selectedLocationId: locationId } = useLocation();
  const router = useRouter();
  const utils = trpc.useUtils();

  const [showNewForm, setShowNewForm] = useState(false);
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [sessionType, setSessionType] = useState<SessionType>("shift");
  const [startedTs, setStartedTs] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });

  // Plan session state
  const [planType, setPlanType] = useState<SessionType>("shift");
  const [planDate, setPlanDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [planAssignments, setPlanAssignments] = useState<
    Array<{ userId: string; subAreaId: string }>
  >([{ userId: "", subAreaId: "" }]);

  const isManager =
    user?.highestRole === "manager" ||
    user?.highestRole === "business_admin" ||
    user?.highestRole === "platform_admin";

  const { data: sessions, isLoading } = trpc.sessions.list.useQuery(
    { locationId: locationId!, openOnly: false },
    { enabled: !!locationId }
  );

  const { data: staffList } = trpc.users.listForBusiness.useQuery(
    { businessId: user?.businessId },
    { enabled: !!user?.businessId && showPlanForm }
  );

  const { data: barAreas } = trpc.areas.listBarAreas.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId && showPlanForm }
  );

  const createMutation = trpc.sessions.create.useMutation({
    onSuccess: (created) => {
      utils.sessions.list.invalidate();
      setShowNewForm(false);
      router.push(`/sessions/${created.id}`);
    },
  });

  const planMutation = trpc.sessions.plan.useMutation({
    onSuccess: (created) => {
      utils.sessions.list.invalidate();
      setShowPlanForm(false);
      setPlanAssignments([{ userId: "", subAreaId: "" }]);
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

  function handlePlan() {
    if (!locationId) return;
    const validAssignments = planAssignments.filter((a) => a.userId);
    if (validAssignments.length === 0) return;
    planMutation.mutate({
      locationId,
      sessionType: planType,
      plannedAt: new Date(planDate),
      assignments: validAssignments.map((a) => ({
        userId: a.userId,
        subAreaId: a.subAreaId || undefined,
        focusItems: [],
      })),
    });
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-[#EAF0FF]">Inventory Sessions</h1>
          <HelpLink section="sessions" tooltip="Learn about counting sessions" />
        </div>
        <div className="flex gap-2">
          {isManager && (
            <button
              onClick={() => { setShowPlanForm((v) => !v); setShowNewForm(false); }}
              className="rounded-md border border-[#E9B44C] px-4 py-2 text-sm font-medium text-[#E9B44C] hover:bg-[#E9B44C]/10"
            >
              {showPlanForm ? "Cancel" : "Plan Session"}
            </button>
          )}
          <button
            onClick={() => { setShowNewForm((v) => !v); setShowPlanForm(false); }}
            className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E]"
          >
            {showNewForm ? "Cancel" : "New Session"}
          </button>
        </div>
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

      {showPlanForm && (
        <div className="mb-6 rounded-lg border border-white/10 bg-[#16283F] p-4">
          <h3 className="mb-3 text-sm font-semibold text-[#EAF0FF]">Plan a Session</h3>
          <div className="flex flex-wrap items-end gap-4 mb-4">
            <div>
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">Session Type</label>
              <select
                value={planType}
                onChange={(e) => setPlanType(e.target.value as SessionType)}
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
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">Planned Date</label>
              <input
                type="datetime-local"
                value={planDate}
                onChange={(e) => setPlanDate(e.target.value)}
                className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
              />
            </div>
          </div>

          <div className="mb-3">
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-[#EAF0FF]/60">
              Staff Assignments
            </label>
            <div className="space-y-2">
              {planAssignments.map((a, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={a.userId}
                    onChange={(e) => {
                      const updated = [...planAssignments];
                      updated[idx] = { ...updated[idx], userId: e.target.value };
                      setPlanAssignments(updated);
                    }}
                    className="flex-1 rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
                  >
                    <option value="">Select staff...</option>
                    {staffList?.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.firstName ? `${s.firstName} ${s.lastName ?? ""}`.trim() : s.email}
                      </option>
                    ))}
                  </select>
                  <select
                    value={a.subAreaId}
                    onChange={(e) => {
                      const updated = [...planAssignments];
                      updated[idx] = { ...updated[idx], subAreaId: e.target.value };
                      setPlanAssignments(updated);
                    }}
                    className="flex-1 rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
                  >
                    <option value="">No area</option>
                    {barAreas?.map((area: any) => (
                      <optgroup key={area.id} label={area.name}>
                        {area.subAreas.map((sa: any) => (
                          <option key={sa.id} value={sa.id}>{sa.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {planAssignments.length > 1 && (
                    <button
                      onClick={() => setPlanAssignments(planAssignments.filter((_, i) => i !== idx))}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => setPlanAssignments([...planAssignments, { userId: "", subAreaId: "" }])}
              className="mt-2 text-xs text-[#E9B44C] hover:text-[#C8922E]"
            >
              + Add Staff
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handlePlan}
              disabled={planMutation.isPending || planAssignments.every((a) => !a.userId)}
              className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
            >
              {planMutation.isPending ? "Planning..." : "Create Plan"}
            </button>
          </div>
          {planMutation.error && (
            <p className="mt-2 text-sm text-red-400">{planMutation.error.message}</p>
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
                          : s.plannedAt && !s.endedTs && s._count.lines === 0
                            ? "bg-[#7C5CFC]/10 text-[#7C5CFC]"
                            : "bg-[#E9B44C]/10 text-[#E9B44C]"
                      }`}
                    >
                      {s.endedTs ? "Closed" : s.plannedAt && s._count.lines === 0 ? "Planned" : "Open"}
                    </span>
                    {(s._count as any).assignments > 0 && !s.endedTs && (
                      <span className="ml-1 rounded-full bg-[#2BA8A0]/10 px-2 py-0.5 text-[10px] text-[#2BA8A0]">
                        {(s._count as any).assignments} assigned
                      </span>
                    )}
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
