"use client";

import { useEffect } from "react";

const CURRENT_VERSION = "1.8.0";

interface ChangelogEntry {
  version: string;
  date: string;
  features: string[];
}

const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.8.0",
    date: "Feb 2026",
    features: [
      "In-app help tips on every dashboard page",
      "Quick-start onboarding checklist for new users",
      "What's New changelog (you're looking at it!)",
      "7 new help sections: Draft, Alerts, Analytics, Transfers, Audit, Orders, Benchmarking",
    ],
  },
  {
    version: "1.7.0",
    date: "Jan 2026",
    features: [
      "Industry benchmarking with opt-in anonymized comparisons",
      "Demand forecasting with day-of-week patterns",
      "Purchase orders with vendor breakdown and trend analysis",
      "Forecast accuracy tracking across sessions",
    ],
  },
  {
    version: "1.6.0",
    date: "Dec 2025",
    features: [
      "Predictive analytics: anomaly detection, POS-to-depletion ratios, variance forecasts",
      "Alert dashboard with frequency charts and top triggered items",
      "SSE real-time notifications and alert rules engine",
      "User activity timeline on the audit page",
    ],
  },
  {
    version: "1.5.0",
    date: "Nov 2025",
    features: [
      "Multi-source expected inventory (POS, tap flow, receiving, transfers, adjustments)",
      "Dashboard KPI summary with variance trend chart",
      "Recipe-based depletion and split ratios",
      "Par levels with auto-suggest and lead time",
    ],
  },
  {
    version: "1.4.0",
    date: "Oct 2025",
    features: [
      "Multi-user counting sessions with real-time participant tracking",
      "Voice commands for hands-free operation",
      "Auto-lock with PIN and biometric support",
      "Product guide with public menu page",
    ],
  },
];

export default function WhatsNewPage() {
  useEffect(() => {
    localStorage.setItem("barstock-whats-new-seen", CURRENT_VERSION);
  }, []);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-[#EAF0FF]">What&apos;s New</h1>
      <p className="mb-6 text-sm text-[#EAF0FF]/60">
        Recent updates and improvements to Barstock.
      </p>

      <div className="space-y-4">
        {CHANGELOG.map((entry, idx) => (
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
              {entry.features.map((feature, fi) => (
                <li
                  key={fi}
                  className="flex items-start gap-2 text-sm text-[#EAF0FF]/70"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#E9B44C]/60" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
