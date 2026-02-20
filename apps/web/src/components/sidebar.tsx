"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

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
  { href: "/inventory/expected", label: "Expected Stock", icon: "📉" },
  { href: "/pos", label: "POS Connections", icon: "🔗" },
  { href: "/pos/unmapped", label: "Unmapped Items", icon: "⚠️" },
  { href: "/recipes", label: "Recipes", icon: "🍹" },
  { href: "/draft", label: "Draft / Kegs", icon: "🍺" },
  { href: "/par", label: "Par Levels", icon: "\uD83C\uDFAF" },
  { href: "/sessions", label: "Sessions", icon: "📋" },
  { href: "/reports", label: "Reports", icon: "📈" },
  { href: "/audit", label: "Audit Log", icon: "🔍" },
  { href: "/art", label: "Art Gallery", icon: "🎨" },
  { href: "/guide", label: "Product Guide", icon: "📖" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

const adminNavItems = [
  { href: "/staff", label: "Staff", icon: "👥" },
];

function formatRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 flex-col border-r border-white/10 bg-[var(--navy-bg)]">
      <div className="border-b border-white/10 p-4">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">{user.businessName || "Dashboard"}</h2>
        <p className="mt-1 truncate text-xs text-[var(--text-muted)]">{user.email}</p>
        {user.highestRole && (
          <span className="mt-1 inline-block rounded-full bg-[#E9B44C]/10 px-2 py-0.5 text-xs font-medium text-[#E9B44C]">
            {formatRole(user.highestRole)}
          </span>
        )}
      </div>

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
