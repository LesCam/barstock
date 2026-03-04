"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useLocation } from "@/components/location-context";

const CURRENT_VERSION = "1.8.0";
const STORAGE_KEY = "barstock-sidebar-expanded";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  platformOnly?: boolean;
}

interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
  adminOnly?: boolean;
  platformOnly?: boolean;
  /** If true, render as a direct link (single-item group) */
  directLink?: boolean;
}

const NAV_GROUPS: NavGroup[] = [
  {
    key: "overview",
    label: "Dashboard",
    directLink: true,
    items: [{ href: "/", label: "Dashboard", icon: "📊" }],
  },
  {
    key: "inventory",
    label: "Inventory",
    items: [
      { href: "/inventory", label: "Inventory", icon: "📦" },
      { href: "/inventory/expected", label: "Expected Stock", icon: "📉" },
      { href: "/setup/inventory-import", label: "Import", icon: "📥" },
      { href: "/par", label: "Par Levels", icon: "\uD83C\uDFAF" },
      { href: "/recipes", label: "Recipes", icon: "🍹" },
      { href: "/draft", label: "Draft / Kegs", icon: "🍺" },
    ],
  },
  {
    key: "sales",
    label: "Sales & POS",
    items: [
      { href: "/pos", label: "POS Connections", icon: "🔗" },
      { href: "/pos/unmapped", label: "Unmapped Items", icon: "⚠️" },
      { href: "/pos/upload", label: "Upload Sales", icon: "📤" },
    ],
  },
  {
    key: "ordering",
    label: "Ordering",
    items: [
      { href: "/forecast", label: "Forecast", icon: "\uD83D\uDD2E" },
      { href: "/orders", label: "Orders", icon: "\uD83D\uDED2" },
      { href: "/receipts", label: "Receipts", icon: "🧾" },
    ],
  },
  {
    key: "sessions",
    label: "Sessions",
    directLink: true,
    items: [{ href: "/sessions", label: "Sessions", icon: "📋" }],
  },
  {
    key: "staff",
    label: "Staff",
    adminOnly: true,
    items: [
      { href: "/staff", label: "Staff", icon: "👥" },
      { href: "/staff/scorecards", label: "Scorecards", icon: "\uD83C\uDFC6" },
    ],
  },
  {
    key: "reports",
    label: "Reports",
    items: [
      { href: "/reports", label: "Reports", icon: "📈" },
      { href: "/usage-trends", label: "Usage Trends", icon: "📉" },
      { href: "/analytics", label: "Analytics", icon: "\uD83E\uDDE0" },
      { href: "/benchmarking", label: "Benchmarking", icon: "\uD83D\uDCCA", adminOnly: true },
      { href: "/portfolio", label: "Portfolio", icon: "🏢", adminOnly: true },
    ],
  },
  {
    key: "alerts",
    label: "Alerts & Audit",
    items: [
      { href: "/alerts", label: "Alerts", icon: "🚨" },
      { href: "/notifications", label: "Notifications", icon: "🔔" },
      { href: "/audit", label: "Audit Log", icon: "🔍" },
    ],
  },
  {
    key: "other",
    label: "Other",
    items: [
      { href: "/guide", label: "Product Guide", icon: "📖" },
      { href: "/art", label: "Art Gallery", icon: "🎨" },
    ],
  },
  {
    key: "platform",
    label: "Platform",
    platformOnly: true,
    items: [
      { href: "/businesses", label: "Businesses", icon: "🏢" },
      { href: "/portfolio/cross-tenant", label: "Cross-Tenant", icon: "🌐" },
    ],
  },
];

const SETTINGS_ITEMS: NavItem[] = [
  { href: "/settings", label: "Settings", icon: "⚙️" },
  { href: "/help", label: "Help", icon: "❓" },
  { href: "/whats-new", label: "What's New", icon: "✨" },
];

interface SidebarProps {
  user: {
    email?: string;
    roles?: Record<string, string>;
    businessName?: string;
    highestRole?: string;
  };
}

function formatRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function isItemActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function findActiveGroup(pathname: string): string | null {
  for (const group of NAV_GROUPS) {
    if (group.items.some((item) => isItemActive(item.href, pathname))) {
      return group.key;
    }
  }
  return null;
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const { selectedLocationId, setSelectedLocationId, locations, isAdmin } = useLocation();
  const [whatsNewUnseen, setWhatsNewUnseen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Load persisted state + auto-expand active group
  useEffect(() => {
    const seen = localStorage.getItem("barstock-whats-new-seen");
    setWhatsNewUnseen(seen !== CURRENT_VERSION);

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed: Record<string, boolean> = stored ? JSON.parse(stored) : {};
      const activeGroup = findActiveGroup(pathname);
      if (activeGroup) parsed[activeGroup] = true;
      setExpandedGroups(parsed);
    } catch {
      setExpandedGroups({});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-expand active group on navigation
  useEffect(() => {
    const activeGroup = findActiveGroup(pathname);
    if (activeGroup && !expandedGroups[activeGroup]) {
      setExpandedGroups((prev) => {
        const next = { ...prev, [activeGroup]: true };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const isAdminUser = user.highestRole === "business_admin" || user.highestRole === "platform_admin";
  const isPlatformAdmin = user.highestRole === "platform_admin";

  const selectedLocationName = selectedLocationId
    ? locations.find((l) => l.id === selectedLocationId)?.name ?? "Unknown"
    : "All Locations";

  function canSeeGroup(group: NavGroup): boolean {
    if (group.platformOnly && !isPlatformAdmin) return false;
    if (group.adminOnly && !isAdminUser) return false;
    return true;
  }

  function canSeeItem(item: NavItem): boolean {
    if (item.platformOnly && !isPlatformAdmin) return false;
    if (item.adminOnly && !isAdminUser) return false;
    return true;
  }

  function renderNavLink(item: NavItem, indented = false) {
    const active = isItemActive(item.href, pathname);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`flex items-center gap-2 rounded-md ${indented ? "pl-6" : "px-3"} ${indented ? "pr-3" : ""} py-2 text-sm ${
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

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {NAV_GROUPS.filter(canSeeGroup).map((group) => {
          const visibleItems = group.items.filter(canSeeItem);
          if (visibleItems.length === 0) return null;

          // Direct link groups (single-item, no collapsible header)
          if (group.directLink) {
            return (
              <div key={group.key}>
                {renderNavLink(visibleItems[0])}
              </div>
            );
          }

          const expanded = !!expandedGroups[group.key];

          return (
            <div key={group.key} className="mt-1">
              <button
                onClick={() => toggleGroup(group.key)}
                className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] hover:bg-[#16283F]/50"
              >
                {group.label}
                <span
                  className={`text-[10px] transition-transform duration-150 ${
                    expanded ? "rotate-90" : ""
                  }`}
                >
                  ▸
                </span>
              </button>
              {expanded && (
                <div className="space-y-0.5">
                  {visibleItems.map((item) => renderNavLink(item, true))}
                </div>
              )}
            </div>
          );
        })}

        {/* Settings section — always visible, not collapsible */}
        <div className="mt-3 border-t border-white/10 pt-2">
          {SETTINGS_ITEMS.map((item) => {
            const active = isItemActive(item.href, pathname);
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
        </div>
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
