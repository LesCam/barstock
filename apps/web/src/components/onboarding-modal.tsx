"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

const STORAGE_KEY = "barstock-onboarding-complete";

const DEFAULT_FEATURES = [
  {
    icon: "\u{1F4E6}",
    title: "Inventory Counting",
    desc: "Weigh, count, and track every bottle and keg",
  },
  {
    icon: "\u{1F4B3}",
    title: "POS Tracking",
    desc: "Sync sales to auto-deplete inventory levels",
  },
  {
    icon: "\u{1F4CA}",
    title: "Variance Detection",
    desc: "Spot shrinkage, over-pours, and loss patterns",
  },
  {
    icon: "\u{1F514}",
    title: "Par & Reorder",
    desc: "Set par levels and get low-stock alerts",
  },
];

const ROLE_FEATURES: Record<string, typeof DEFAULT_FEATURES> = {
  curator: [
    {
      icon: "\u{1F3A8}",
      title: "Art Gallery",
      desc: "Manage artworks, artists, and consignment agreements",
    },
    {
      icon: "\u{1F4F7}",
      title: "Photo & QR Labels",
      desc: "Capture photos and print QR wall labels for each piece",
    },
    {
      icon: "\u{1F4B0}",
      title: "Sales Tracking",
      desc: "Record sales, track commissions, and manage payouts",
    },
    {
      icon: "\u{1F4CB}",
      title: "Product Guide",
      desc: "Browse the public menu and share your catalog",
    },
  ],
  accounting: [
    {
      icon: "\u{1F4CA}",
      title: "Reports",
      desc: "COGS, variance, usage, and staff accountability reports",
    },
    {
      icon: "\u{1F4C8}",
      title: "Analytics",
      desc: "Forecasting, anomaly detection, and trend analysis",
    },
    {
      icon: "\u{1F4E6}",
      title: "Purchase Orders",
      desc: "Review orders, vendor spend, and fulfillment status",
    },
    {
      icon: "\u{1F50D}",
      title: "Audit Trail",
      desc: "Full activity log with timestamps and actor tracking",
    },
  ],
};

function getRoleLabel(role?: string) {
  switch (role) {
    case "platform_admin":
      return "Platform Admin";
    case "business_admin":
      return "Business Admin";
    case "manager":
      return "Manager";
    case "staff":
      return "Staff";
    case "curator":
      return "Curator";
    case "accounting":
      return "Accounting";
    default:
      return "Team Member";
  }
}

function getQuickStart(role?: string) {
  switch (role) {
    case "staff":
      return {
        title: "Ready to Count",
        desc: "Start by joining a counting session. Your manager will assign sub-areas for you to count.",
      };
    case "manager":
      return {
        title: "Set Up Your Bar",
        desc: "Start by adding your inventory items and tare weights. Then connect your POS to enable automatic depletion tracking.",
      };
    case "business_admin":
    case "platform_admin":
      return {
        title: "Configure Everything",
        desc: "Set up categories, connect your POS system, invite staff, and configure locations. Head to Settings to get started.",
      };
    case "curator":
      return {
        title: "Manage Your Gallery",
        desc: "Add artworks and artists, print QR labels for the wall, and track sales and commissions from the Art Gallery section.",
      };
    case "accounting":
      return {
        title: "Financial Overview",
        desc: "Review reports for COGS, variance, and usage. Check purchase orders and audit trails to stay on top of the numbers.",
      };
    default:
      return {
        title: "Get Started",
        desc: "Explore the app to see your inventory, start counting sessions, and track variance.",
      };
  }
}

export function OnboardingModal() {
  const { data: session } = useSession();
  const [show, setShow] = useState(false);
  const [page, setPage] = useState(0);
  const totalPages = 3;

  useEffect(() => {
    if (!session?.user) return;
    const done = localStorage.getItem(STORAGE_KEY);
    if (done !== "true") {
      setShow(true);
    }
  }, [session]);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setShow(false);
  };

  if (!show || !session?.user) return null;

  const user = session.user as any;
  const roleLabel = getRoleLabel(user.highestRole);
  const quickStart = getQuickStart(user.highestRole);
  const features = ROLE_FEATURES[user.highestRole as string] ?? DEFAULT_FEATURES;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1623]/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-xl border border-white/10 bg-[#16283F] p-8 shadow-2xl">
        {/* Skip */}
        <button
          onClick={dismiss}
          className="absolute right-4 top-4 text-sm text-[#EAF0FF]/40 hover:text-[#EAF0FF]/70"
        >
          Skip
        </button>

        {/* Page 1: Welcome */}
        {page === 0 && (
          <div className="flex flex-col items-center text-center">
            <h2 className="mb-2 text-2xl font-bold text-[#EAF0FF]">
              Welcome to Barstock!
            </h2>
            {user.businessName && (
              <p className="mb-3 text-lg font-semibold text-[#E9B44C]">
                {user.businessName}
              </p>
            )}
            <span className="mb-5 inline-block rounded-full border border-[#E9B44C]/30 bg-[#E9B44C]/15 px-4 py-1.5 text-sm font-semibold text-[#E9B44C]">
              {roleLabel}
            </span>
            <p className="max-w-sm text-sm leading-relaxed text-[#EAF0FF]/60">
              Your complete bar inventory management system. Track every bottle,
              monitor shrinkage, and make smarter ordering decisions.
            </p>
          </div>
        )}

        {/* Page 2: Features */}
        {page === 1 && (
          <div className="flex flex-col items-center">
            <h2 className="mb-6 text-xl font-bold text-[#EAF0FF]">
              Key Features
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {features.map((f) => (
                <div
                  key={f.title}
                  className="flex flex-col items-center rounded-lg border border-[#1E3550] bg-[#0B1623] p-4 text-center"
                >
                  <span className="mb-2 text-2xl">{f.icon}</span>
                  <span className="mb-1 text-sm font-bold text-[#EAF0FF]">
                    {f.title}
                  </span>
                  <span className="text-xs leading-snug text-[#EAF0FF]/50">
                    {f.desc}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Page 3: Quick Start */}
        {page === 2 && (
          <div className="flex flex-col items-center text-center">
            <h2 className="mb-4 text-xl font-bold text-[#EAF0FF]">
              {quickStart.title}
            </h2>
            <p className="mb-4 max-w-sm text-sm leading-relaxed text-[#EAF0FF]/60">
              {quickStart.desc}
            </p>
            <span className="inline-block rounded-full border border-[#E9B44C]/30 bg-[#E9B44C]/15 px-4 py-1.5 text-sm font-semibold text-[#E9B44C]">
              {roleLabel}
            </span>
          </div>
        )}

        {/* Dots + Nav */}
        <div className="mt-8 flex flex-col items-center gap-4">
          <div className="flex gap-2">
            {Array.from({ length: totalPages }).map((_, i) => (
              <div
                key={i}
                className={`h-2 w-2 rounded-full ${
                  i === page ? "bg-[#E9B44C]" : "bg-[#EAF0FF]/20"
                }`}
              />
            ))}
          </div>
          <button
            onClick={() => {
              if (page < totalPages - 1) {
                setPage(page + 1);
              } else {
                dismiss();
              }
            }}
            className="rounded-lg bg-[#E9B44C] px-8 py-2.5 text-sm font-bold text-[#0B1623] hover:bg-[#d4a343]"
          >
            {page === totalPages - 1 ? "Get Started" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
