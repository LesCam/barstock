"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

const CURRENT_VERSION = "1.9.0";

type Role = "staff" | "manager" | "business_admin" | "platform_admin" | "curator" | "accounting";
type Badge = "new" | "improved" | "fixed";

const ROLE_HIERARCHY: Record<Role, number> = {
  staff: 0,
  curator: 1,
  accounting: 1,
  manager: 2,
  business_admin: 3,
  platform_admin: 4,
};

function featureVisible(userRole: Role | undefined, featureRoles?: Role[]): boolean {
  if (!featureRoles) return true;
  if (!userRole) return true;
  const level = ROLE_HIERARCHY[userRole] ?? 0;
  return featureRoles.some((r) => r === userRole || (ROLE_HIERARCHY[r] !== undefined && level >= ROLE_HIERARCHY[r]));
}

interface Feature {
  text: string;
  badge?: Badge;
  roles?: Role[];
}

interface ChangelogEntry {
  version: string;
  date: string;
  features: Feature[];
}

const BADGE_STYLES: Record<Badge, { bg: string; text: string; label: string }> = {
  new: { bg: "bg-green-500/15", text: "text-green-400", label: "New" },
  improved: { bg: "bg-blue-500/15", text: "text-blue-400", label: "Improved" },
  fixed: { bg: "bg-orange-500/15", text: "text-orange-400", label: "Fixed" },
};

const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.9.0",
    date: "Mar 2026",
    features: [
      { text: "Offline conflict resolution — review and resolve sync conflicts", badge: "new" },
      { text: "Offline session close — queue session close while offline", badge: "new" },
      { text: "Session-scoped sync queue — entries grouped by session", badge: "improved" },
      { text: "Optimistic edit/delete markers — visual pending sync indicators", badge: "improved" },
      { text: "Role-filtered help sections — see only relevant docs for your role", badge: "new" },
      { text: "Help progress tracking — track which sections you've explored", badge: "new" },
      { text: "Curator onboarding path — art gallery quick-start for curators", badge: "new", roles: ["curator", "manager", "business_admin", "platform_admin"] },
      { text: "Accounting onboarding path — financial overview for accounting", badge: "new", roles: ["accounting", "manager", "business_admin", "platform_admin"] },
      { text: "Mobile What's New screen with version tracking", badge: "new" },
      { text: "PageTip sequencing — tips appear in logical order", badge: "improved" },
    ],
  },
  {
    version: "1.8.0",
    date: "Feb 2026",
    features: [
      { text: "In-app help tips on every dashboard page", badge: "new" },
      { text: "Quick-start onboarding checklist for new users", badge: "new" },
      { text: "What's New changelog (you're looking at it!)", badge: "new" },
      { text: "7 new help sections: Draft, Alerts, Analytics, Transfers, Audit, Orders, Benchmarking" },
    ],
  },
  {
    version: "1.7.0",
    date: "Jan 2026",
    features: [
      { text: "Industry benchmarking with opt-in anonymized comparisons", badge: "new", roles: ["business_admin", "platform_admin"] },
      { text: "Demand forecasting with day-of-week patterns", badge: "new", roles: ["manager", "business_admin", "platform_admin"] },
      { text: "Purchase orders with vendor breakdown and trend analysis", badge: "new", roles: ["manager", "business_admin", "platform_admin", "accounting"] },
      { text: "Forecast accuracy tracking across sessions" },
    ],
  },
  {
    version: "1.6.0",
    date: "Dec 2025",
    features: [
      { text: "Predictive analytics: anomaly detection, POS-to-depletion ratios, variance forecasts", roles: ["manager", "business_admin", "platform_admin", "accounting"] },
      { text: "Alert dashboard with frequency charts and top triggered items", roles: ["manager", "business_admin", "platform_admin"] },
      { text: "SSE real-time notifications and alert rules engine" },
      { text: "User activity timeline on the audit page", roles: ["manager", "business_admin", "platform_admin", "accounting"] },
    ],
  },
  {
    version: "1.5.0",
    date: "Nov 2025",
    features: [
      { text: "Multi-source expected inventory (POS, tap flow, receiving, transfers, adjustments)" },
      { text: "Dashboard KPI summary with variance trend chart" },
      { text: "Recipe-based depletion and split ratios", roles: ["manager", "business_admin", "platform_admin"] },
      { text: "Par levels with auto-suggest and lead time", roles: ["manager", "business_admin", "platform_admin"] },
    ],
  },
  {
    version: "1.4.0",
    date: "Oct 2025",
    features: [
      { text: "Multi-user counting sessions with real-time participant tracking" },
      { text: "Voice commands for hands-free operation" },
      { text: "Auto-lock with PIN and biometric support" },
      { text: "Product guide with public menu page" },
    ],
  },
];

export default function WhatsNewPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.highestRole as Role | undefined;
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    localStorage.setItem("barstock-whats-new-seen", CURRENT_VERSION);
  }, []);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-bold text-[#EAF0FF]">What&apos;s New</h1>
          <p className="text-sm text-[#EAF0FF]/60">
            Recent updates and improvements to Barstock.
          </p>
        </div>
        <button
          onClick={() => setShowAll(!showAll)}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[#EAF0FF]/60 hover:border-[#E9B44C]/30 hover:text-[#EAF0FF]/80"
        >
          {showAll ? "Show relevant" : "Show all"}
        </button>
      </div>

      <div className="space-y-4">
        {CHANGELOG.map((entry, idx) => {
          const visibleFeatures = showAll
            ? entry.features
            : entry.features.filter((f) => featureVisible(userRole, f.roles));
          if (visibleFeatures.length === 0) return null;

          return (
            <div
              key={entry.version}
              className="rounded-lg border border-white/10 bg-[#16283F] p-5"
            >
              <div className="mb-3 flex items-center gap-3">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    idx === 0
                      ? "bg-[#E9B44C]/20 text-[#E9B44C]"
                      : "bg-white/10 text-[#EAF0FF]/60"
                  }`}
                >
                  v{entry.version}
                </span>
                <span className="text-xs text-[#EAF0FF]/40">{entry.date}</span>
                {idx === 0 && (
                  <span className="rounded-full bg-[#E9B44C]/10 px-2 py-0.5 text-xs font-medium text-[#E9B44C]">
                    Latest
                  </span>
                )}
              </div>
              <ul className="space-y-1.5">
                {visibleFeatures.map((feature, fi) => (
                  <li
                    key={fi}
                    className="flex items-start gap-2 text-sm text-[#EAF0FF]/70"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#E9B44C]/60" />
                    <span className="flex items-center gap-2">
                      {feature.text}
                      {feature.badge && (
                        <span
                          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${BADGE_STYLES[feature.badge].bg} ${BADGE_STYLES[feature.badge].text}`}
                        >
                          {BADGE_STYLES[feature.badge].label}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
