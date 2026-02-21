"use client";

import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";

interface Notification {
  id: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: Date;
}

function timeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const PAGE_SIZE = 30;

export default function NotificationsPage() {
  const router = useRouter();
  const utils = trpc.useUtils();

  const [items, setItems] = useState<Notification[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);

  const { data, isLoading, isFetching } = trpc.notifications.list.useQuery(
    { limit: PAGE_SIZE, cursor },
  );

  const prevCursorRef = useRef(cursor);

  useEffect(() => {
    if (!data) return;
    const wasPaging = !!prevCursorRef.current;
    prevCursorRef.current = cursor;

    if (wasPaging) {
      setItems((prev) => {
        const ids = new Set(prev.map((i) => i.id));
        const newItems = data.items.filter((i: Notification) => !ids.has(i.id));
        return [...prev, ...newItems];
      });
    } else {
      setItems(data.items);
    }
    setHasMore(!!data.nextCursor);
  }, [data]);

  const markReadMutation = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
    },
  });

  const markAllReadMutation = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      setItems((prev) => prev.map((i) => ({ ...i, isRead: true })));
      utils.notifications.unreadCount.invalidate();
    },
  });

  function handleClick(notification: Notification) {
    if (!notification.isRead) {
      setItems((prev) =>
        prev.map((i) => (i.id === notification.id ? { ...i, isRead: true } : i))
      );
      markReadMutation.mutate({ id: notification.id });
    }
    if (notification.linkUrl) {
      router.push(notification.linkUrl);
    }
  }

  function handleLoadMore() {
    if (!hasMore || isFetching || items.length === 0) return;
    setCursor(items[items.length - 1].id);
  }

  const unreadCount = items.filter((i) => !i.isRead).length;

  if (isLoading && items.length === 0) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-[#EAF0FF]">Notifications</h1>
        <p className="text-[#EAF0FF]/60">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#EAF0FF]">Notifications</h1>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
            className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-[#E9B44C] hover:bg-white/5 disabled:opacity-50"
          >
            Mark All as Read
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-[#EAF0FF]/60">No notifications yet.</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-white/10 bg-[#16283F]">
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`flex w-full items-start gap-3 border-b border-white/5 px-5 py-4 text-left transition-colors hover:bg-white/5 ${
                  !n.isRead ? "bg-[#E9B44C]/5" : ""
                }`}
              >
                {!n.isRead && (
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#E9B44C]" />
                )}
                <div className={!n.isRead ? "" : "pl-[22px]"}>
                  <p className="text-sm font-medium text-[#EAF0FF]">{n.title}</p>
                  {n.body && (
                    <p className="mt-0.5 text-sm text-[#EAF0FF]/50 line-clamp-2">{n.body}</p>
                  )}
                  <p className="mt-1 text-xs text-[#EAF0FF]/30">{timeAgo(n.createdAt)}</p>
                </div>
              </button>
            ))}
          </div>

          {hasMore && (
            <div className="mt-4 text-center">
              {isFetching && cursor ? (
                <p className="text-sm text-[#EAF0FF]/40">Loading...</p>
              ) : (
                <button
                  onClick={handleLoadMore}
                  className="rounded-md border border-white/10 px-4 py-2 text-sm text-[#EAF0FF]/80 hover:bg-white/5"
                >
                  Load More
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
