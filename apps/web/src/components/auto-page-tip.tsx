"use client";

import { useNextTip } from "@/hooks/use-next-tip";
import { PageTip } from "./page-tip";

interface AutoPageTipProps {
  pageId: string;
}

/**
 * Renders the next eligible tip for the given page from the TIP_REGISTRY.
 * Handles prerequisite sequencing and role filtering automatically.
 */
export function AutoPageTip({ pageId }: AutoPageTipProps) {
  const tip = useNextTip(pageId);
  if (!tip) return null;

  return (
    <PageTip
      tipId={tip.id}
      title={tip.title}
      description={tip.description}
      actionLabel={tip.actionLabel}
      actionHref={tip.actionHref}
      prerequisite={tip.prerequisite}
    />
  );
}
