"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface PageTipProps {
  tipId: string;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}

export function PageTip({ tipId, title, description, actionLabel, actionHref }: PageTipProps) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const key = `barstock-tip-${tipId}`;
    setDismissed(localStorage.getItem(key) === "1");
  }, [tipId]);

  if (dismissed) return null;

  function handleDismiss() {
    localStorage.setItem(`barstock-tip-${tipId}`, "1");
    setDismissed(true);
  }

  return (
    <div className="mb-6 rounded-lg border border-[#E9B44C]/30 bg-[#E9B44C]/5 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#E9B44C]">{title}</p>
          <p className="mt-0.5 text-sm text-[#EAF0FF]/60">{description}</p>
          {actionLabel && actionHref && (
            <Link
              href={actionHref}
              className="mt-1.5 inline-block text-xs font-medium text-[#E9B44C] hover:text-[#C8922E]"
            >
              {actionLabel} →
            </Link>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className="shrink-0 rounded-md border border-[#E9B44C]/30 px-2.5 py-1 text-xs font-medium text-[#E9B44C] hover:bg-[#E9B44C]/10"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
