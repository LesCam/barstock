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
  { href: "/pos", label: "POS Connections", icon: "🔗" },
  { href: "/pos/unmapped", label: "Unmapped Items", icon: "⚠️" },
  { href: "/draft", label: "Draft / Kegs", icon: "🍺" },
  { href: "/sessions", label: "Sessions", icon: "📋" },
  { href: "/reports", label: "Reports", icon: "📈" },
  { href: "/audit", label: "Audit Log", icon: "🔍" },
  { href: "/art", label: "Art Gallery", icon: "🎨" },
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
    <aside className="flex w-64 flex-col border-r bg-white">
      <div className="border-b p-4">
        <h2 className="text-lg font-bold text-gray-900">BarStock</h2>
        <p className="mt-1 truncate text-xs text-gray-500">{user.email}</p>
        {user.businessName && (
          <p className="mt-0.5 truncate text-xs font-medium text-gray-700">
            {user.businessName}
          </p>
        )}
        {user.highestRole && (
          <span className="mt-1 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
            {formatRole(user.highestRole)}
          </span>
        )}
      </div>

      <nav className="flex-1 space-y-1 p-3">
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
                  ? "bg-blue-50 font-medium text-blue-700"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full rounded-md px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-100"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
