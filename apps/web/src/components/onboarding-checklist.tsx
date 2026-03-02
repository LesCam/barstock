"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "@/components/location-context";
import { useHelpProgress } from "@/hooks/use-help-progress";
import Link from "next/link";

const MANAGER_ROLES = ["platform_admin", "business_admin", "manager"];

interface Step {
  id: string;
  label: string;
  href: string;
  done: boolean;
}

export function OnboardingChecklist() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const highestRole: string | undefined = user?.highestRole;
  const isManager = MANAGER_ROLES.includes(highestRole ?? "");
  const { selectedLocationId: locationId } = useLocation();

  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem("barstock-checklist-dismissed") === "1");
  }, []);

  const { data: inventory } = trpc.inventory.list.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId }
  );

  const { data: sessions } = trpc.sessions.list.useQuery(
    { locationId: locationId!, openOnly: false },
    { enabled: !!locationId }
  );

  const { data: connections } = trpc.pos.listConnections.useQuery(
    { locationId: locationId! },
    { enabled: !!locationId && isManager }
  );

  // Help progress: 28 total sections, "done" at >= 50% visited
  const { percentComplete: helpPercent } = useHelpProgress(28);

  if (dismissed || !locationId) return null;

  const steps: Step[] = isManager
    ? [
        {
          id: "inventory",
          label: "Add first inventory item",
          href: "/inventory",
          done: (inventory?.length ?? 0) > 0,
        },
        {
          id: "session",
          label: "Create first counting session",
          href: "/sessions",
          done: (sessions?.length ?? 0) > 0,
        },
        {
          id: "pos",
          label: "Connect POS system",
          href: "/pos",
          done: (connections?.length ?? 0) > 0,
        },
        {
          id: "help",
          label: "Explore Help Guide",
          href: "/help",
          done: helpPercent >= 50,
        },
      ]
    : [
        {
          id: "session",
          label: "Join a counting session",
          href: "/sessions",
          done: (sessions?.length ?? 0) > 0,
        },
        {
          id: "help",
          label: "Explore Help Guide",
          href: "/help",
          done: helpPercent >= 50,
        },
      ];

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;

  function handleDismiss() {
    localStorage.setItem("barstock-checklist-dismissed", "1");
    setDismissed(true);
  }

  return (
    <div className="mb-6 rounded-lg border border-[#E9B44C]/20 bg-[#16283F] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#EAF0FF]">Quick Start</h3>
          <p className="mt-0.5 text-xs text-[#EAF0FF]/40">
            {allDone
              ? "All set! You're ready to go."
              : `${completedCount} of ${steps.length} steps completed`}
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="text-xs text-[#EAF0FF]/40 hover:text-[#EAF0FF]/60"
        >
          Dismiss
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-3 h-1.5 w-full rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-[#E9B44C] transition-all"
          style={{ width: `${steps.length > 0 ? (completedCount / steps.length) * 100 : 0}%` }}
        />
      </div>

      <div className="space-y-2">
        {steps.map((step) => (
          <Link
            key={step.id}
            href={step.href}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-white/5"
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                step.done
                  ? "border-green-500 bg-green-500/20 text-green-400"
                  : "border-white/20 text-[#EAF0FF]/30"
              }`}
            >
              {step.done ? "\u2713" : ""}
            </span>
            <span
              className={
                step.done ? "text-[#EAF0FF]/40 line-through" : "text-[#EAF0FF]/80"
              }
            >
              {step.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
