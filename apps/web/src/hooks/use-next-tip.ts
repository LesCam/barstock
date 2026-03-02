"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { TIP_REGISTRY, type TipDefinition } from "@/lib/tip-registry";

type Role = "staff" | "manager" | "business_admin" | "platform_admin" | "curator" | "accounting";

const ROLE_HIERARCHY: Record<Role, number> = {
  staff: 0,
  curator: 1,
  accounting: 1,
  manager: 2,
  business_admin: 3,
  platform_admin: 4,
};

function isTipDismissed(tipId: string): boolean {
  return localStorage.getItem(`barstock-tip-${tipId}`) === "1";
}

function roleMatches(userRole: Role | undefined, tipRoles?: Role[]): boolean {
  if (!tipRoles) return true;
  if (!userRole) return true;
  const level = ROLE_HIERARCHY[userRole] ?? 0;
  return tipRoles.some(
    (r) => r === userRole || (ROLE_HIERARCHY[r] !== undefined && level >= ROLE_HIERARCHY[r]),
  );
}

/**
 * Returns the next eligible tip for the given page, considering:
 * - Prerequisites (must be dismissed before this tip can show)
 * - Role filtering
 * - Order (lowest order first)
 * - Already-dismissed tips are skipped
 */
export function useNextTip(pageId: string): TipDefinition | null {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.highestRole as Role | undefined;
  const [tip, setTip] = useState<TipDefinition | null>(null);

  useEffect(() => {
    // Get all tips for this page, sorted by order
    const pageTips = TIP_REGISTRY
      .filter((t) => t.page === pageId)
      .sort((a, b) => a.order - b.order);

    for (const t of pageTips) {
      // Skip already dismissed
      if (isTipDismissed(t.id)) continue;
      // Skip if role doesn't match
      if (!roleMatches(userRole, t.roles)) continue;
      // Skip if prerequisite not yet dismissed
      if (t.prerequisite && !isTipDismissed(t.prerequisite)) continue;
      // This is the next eligible tip
      setTip(t);
      return;
    }

    setTip(null);
  }, [pageId, userRole]);

  return tip;
}
