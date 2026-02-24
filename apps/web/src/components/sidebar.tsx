"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useLocation } from "@/components/location-context";

const CURRENT_VERSION = "1.8.0";

interface SidebarProps {
  user: {
    email?: string;
    roles?: Record<string, string>;
    businessName?: string;
    highestRole?: string;
  };
}

const navItems = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/inventory", label: "Inventory", icon: "📦" },
  { href: "/setup/inventory-import", label: "Import Inventory", icon: "📥" },
  { href: "/inventory/expected", label: "Expected Stock", icon: "📉" },
  { href: "/pos", label: "POS Connections", icon: "🔗" },
  { href: "/pos/unmapped", label: "Unmapped Items", icon: "⚠️" },
  { href: "/pos/upload", label: "Upload Sales", icon: "📤" },
  { href: "/recipes", label: "Recipes", icon: "🍹" },
  { href: "/draft", label: "Draft / Kegs", icon: "🍺" },
  { href: "/par", label: "Par Levels", icon: "\uD83C\uDFAF" },
  { href: "/forecast", label: "Forecast", icon: "\uD83D\uDD2E" },
  { href: "/orders", label: "Orders", icon: "\uD83D\uDED2" },
  { href: "/sessions", label: "Sessions", icon: "📋" },
  { href: "/analytics", label: "Analytics", icon: "\uD83E\uDDE0" },
  { href: "/reports", label: "Reports", icon: "📈" },
  { href: "/usage-trends", label: "Usage Trends", icon: "📉" },
  { href: "/audit", label: "Audit Log", icon: "🔍" },
  { href: "/alerts", label: "Alerts", icon: "🚨" },
  { href: "/notifications", label: "Notifications", icon: "🔔" },
  { href: "/art", label: "Art Gallery", icon: "🎨" },
  { href: "/guide", label: "Product Guide", icon: "📖" },
  { href: "/help", label: "Help", icon: "❓" },
  { href: "/whats-new", label: "What's New", icon: "✨" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

const adminNavItems = [
  { href: "/staff", label: "Staff", icon: "👥" },
  { href: "/staff/scorecards", label: "Scorecards", icon: "\uD83C\uDFC6" },
  { href: "/benchmarking", label: "Benchmarking", icon: "\uD83D\uDCCA" },
];

function formatRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const { selectedLocationId, setSelectedLocationId, locations, isAdmin } = useLocation();
  const [whatsNewUnseen, setWhatsNewUnseen] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem("barstock-whats-new-seen");
    setWhatsNewUnseen(seen !== CURRENT_VERSION);
  }, []);

  const selectedLocationName = selectedLocationId
    ? locations.find((l) => l.id === selectedLocationId)?.name ?? "Unknown"
    : "All Locations";

  return (
    <aside className="print-hide flex w-64 flex-col border-r border-white/10 bg-[var(--navy-bg)]">
      <div className="border-b border-white/10 p-4">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">{user.businessName || "Dashboard"}</h2>
        <p className="mt-1 truncate text-xs text-[var(--text-muted)]">{user.email}</p>
        {user.highestRole && (
          <span className="mt-1 inline-block rounded-full bg-[#E9B44C]/10 px-2 py-0.5 text-xs font-medium text-[#E9B44C]">
            {formatRole(user.highestRole)}
          </span>
        )}
      </div>

      {locations.length > 1 && (
        <div className="border-b border-white/10 px-4 py-3">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#EAF0FF]/50">
            Location
          </label>
          <select
            value={selectedLocationId ?? "all"}
            onChange={(e) =>
              setSelectedLocationId(e.target.value === "all" ? null : e.target.value)
            }
            className="w-full rounded-md border border-white/10 bg-[#0B1623] px-2 py-1.5 text-sm text-[#EAF0FF] focus:border-[#E9B44C]/50 focus:outline-none"
          >
            {isAdmin && <option value="all">All Locations</option>}
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[#EAF0FF]/40">
            {selectedLocationId ? selectedLocationName : "Portfolio View"}
          </p>
        </div>
      )}

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {navItems.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={item.href === "/whats-new" ? () => setWhatsNewUnseen(false) : undefined}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                active
                  ? "bg-[#16283F] font-medium text-[#E9B44C]"
                  : "text-[var(--text-primary)] hover:bg-[#16283F]"
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
              {item.href === "/whats-new" && whatsNewUnseen && (
                <span className="ml-auto h-2 w-2 rounded-full bg-[#E9B44C]" />
              )}
            </Link>
          );
        })}

        {(user.highestRole === "business_admin" || user.highestRole === "platform_admin") &&
          adminNavItems.map((item) => {
            const active =
              pathname === item.href ||
              pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                  active
                    ? "bg-[#16283F] font-medium text-[#E9B44C]"
                    : "text-[var(--text-primary)] hover:bg-[#16283F]"
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}

        {user.highestRole === "platform_admin" && (
          <>
            <div className="my-2 border-t border-white/10 pt-2">
              <p className="px-3 text-xs font-semibold uppercase text-[var(--text-muted)]">
                Platform
              </p>
            </div>
            {[{ href: "/businesses", label: "Businesses", icon: "🏢" }].map(
              (item) => {
                const active =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                      active
                        ? "bg-[#16283F] font-medium text-[#E9B44C]"
                        : "text-[var(--text-primary)] hover:bg-[#16283F]"
                    }`}
                  >
                    <span>{item.icon}</span>
                    {item.label}
                  </Link>
                );
              }
            )}
          </>
        )}
      </nav>

      <div className="border-t border-white/10 p-3 pb-12">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full rounded-md px-3 py-2 text-left text-sm text-[var(--text-muted)] hover:bg-[#16283F]"
        >
          Sign out
        </button>
        <p className="mt-2 px-3 text-xs text-[#EAF0FF]/40">Powered by Barstock</p>
      </div>
    </aside>
  );
}
