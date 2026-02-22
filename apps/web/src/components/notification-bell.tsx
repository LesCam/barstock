"use client";

import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();

  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 60_000, // Fallback polling (SSE handles real-time)
  });

  // SSE for real-time notifications
  useEffect(() => {
    const es = new EventSource("/api/notifications/stream");
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "notification") {
          utils.notifications.unreadCount.invalidate();
          if (open) utils.notifications.list.invalidate();
        }
      } catch {
        // ignore parse errors
      }
    };
    return () => es.close();
  }, [utils, open]);

  const { data, isLoading } = trpc.notifications.list.useQuery(
    { limit: 20 },
    { enabled: open }
  );

  const markReadMutation = trpc.notifications.markRead.useMutation();
  const markAllReadMutation = trpc.notifications.markAllRead.useMutation();

  // Click outside to close
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function handleNotificationClick(id: string, linkUrl?: string | null) {
    markReadMutation.mutate({ id }, {
      onSuccess: () => {
        utils.notifications.unreadCount.invalidate();
        utils.notifications.list.invalidate();
      },
    });
    if (linkUrl) router.push(linkUrl);
    setOpen(false);
  }

  function handleMarkAllRead() {
    markAllReadMutation.mutate(undefined, {
      onSuccess: () => {
        utils.notifications.unreadCount.invalidate();
        utils.notifications.list.invalidate();
      },
    });
  }

  const notifications = data?.items ?? [];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-md p-2 text-[#EAF0FF]/60 hover:bg-white/5 hover:text-[#EAF0FF]"
        aria-label="Notifications"
      >
        {/* Bell icon */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {(unreadCount ?? 0) > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount! > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-lg border border-white/10 bg-[#16283F] shadow-xl">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="text-sm font-semibold text-[#EAF0FF]">Notifications</span>
            {(unreadCount ?? 0) > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-[#E9B44C] hover:text-[#D4A43C]"
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {isLoading ? (
              <div className="px-4 py-6 text-center text-sm text-[#EAF0FF]/40">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-[#EAF0FF]/40">No notifications</div>
            ) : (
              notifications.map((n: any) => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n.id, n.linkUrl)}
                  className={`w-full border-b border-white/5 px-4 py-3 text-left hover:bg-white/5 ${
                    !n.isRead ? "bg-[#E9B44C]/5" : ""
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.isRead && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#E9B44C]" />
                    )}
                    <div className={!n.isRead ? "" : "pl-4"}>
                      <p className="text-sm font-medium text-[#EAF0FF]">{n.title}</p>
                      {n.body && (
                        <p className="mt-0.5 text-xs text-[#EAF0FF]/50 line-clamp-2">{n.body}</p>
                      )}
                      <p className="mt-1 text-[10px] text-[#EAF0FF]/30">
                        {new Date(n.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-white/10 px-4 py-2.5 text-center text-xs font-medium text-[#E9B44C] hover:bg-white/5"
          >
            View all
          </Link>
        </div>
      )}
    </div>
  );
}
