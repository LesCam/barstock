import { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useNotifications } from "@/lib/notification-context";
import { mapNotificationRoute } from "@/lib/notification-route-map";

interface Notification {
  id: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: Date;
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

const PAGE_SIZE = 20;

export default function NotificationsScreen() {
  const router = useRouter();
  const { refetch: refetchCount } = useNotifications();
  const utils = trpc.useUtils();

  const [items, setItems] = useState<Notification[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, isFetching } = trpc.notifications.list.useQuery(
    { limit: PAGE_SIZE, cursor },
  );

  // Track the cursor that was active when data arrived to distinguish append vs refresh
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
    setRefreshing(false);
  }, [data]);

  const markReadMutation = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      refetchCount();
    },
  });

  const markAllReadMutation = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      setItems((prev) => prev.map((i) => ({ ...i, isRead: true })));
      refetchCount();
    },
  });

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setCursor(undefined);
    utils.notifications.list.invalidate();
  }, [utils]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || isFetching || items.length === 0) return;
    const lastItem = items[items.length - 1];
    setCursor(lastItem.id);
  }, [hasMore, isFetching, items]);

  const handleTap = useCallback(
    (notification: Notification) => {
      if (!notification.isRead) {
        setItems((prev) =>
          prev.map((i) => (i.id === notification.id ? { ...i, isRead: true } : i))
        );
        markReadMutation.mutate({ id: notification.id });
      }

      const mobileRoute = mapNotificationRoute(notification.linkUrl);
      if (mobileRoute) {
        router.push(mobileRoute as any);
      }
    },
    [markReadMutation, router]
  );

  const unreadCount = items.filter((i) => !i.isRead).length;

  const renderItem = useCallback(
    ({ item }: { item: Notification }) => (
      <TouchableOpacity
        style={[styles.card, !item.isRead && styles.cardUnread]}
        onPress={() => handleTap(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardRow}>
          {!item.isRead && <View style={styles.dot} />}
          <View style={[styles.cardContent, item.isRead && styles.cardContentRead]}>
            <Text style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
            {item.body ? (
              <Text style={styles.body} numberOfLines={2}>
                {item.body}
              </Text>
            ) : null}
            <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    ),
    [handleTap]
  );

  const renderFooter = useCallback(() => {
    if (!hasMore) return null;
    if (isFetching && cursor) {
      return (
        <View style={styles.footer}>
          <ActivityIndicator size="small" color="#E9B44C" />
        </View>
      );
    }
    return (
      <TouchableOpacity style={styles.loadMore} onPress={handleLoadMore}>
        <Text style={styles.loadMoreText}>Load More</Text>
      </TouchableOpacity>
    );
  }, [hasMore, isFetching, cursor, handleLoadMore]);

  if (isLoading && items.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#E9B44C" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {unreadCount > 0 && (
        <TouchableOpacity
          style={styles.markAllBtn}
          onPress={() => markAllReadMutation.mutate()}
          disabled={markAllReadMutation.isPending}
        >
          <Text style={styles.markAllText}>Mark All as Read</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>No notifications yet</Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#E9B44C"
          />
        }
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B1623",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
  },
  emptyText: {
    color: "#5A6A7A",
    fontSize: 15,
  },
  markAllBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3550",
    alignItems: "flex-end",
  },
  markAllText: {
    color: "#E9B44C",
    fontSize: 14,
    fontWeight: "600",
  },
  card: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3550",
  },
  cardUnread: {
    backgroundColor: "#E9B44C08",
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E9B44C",
    marginTop: 5,
    marginRight: 10,
  },
  cardContent: {
    flex: 1,
  },
  cardContentRead: {
    paddingLeft: 18,
  },
  title: {
    color: "#EAF0FF",
    fontSize: 15,
    fontWeight: "600",
  },
  body: {
    color: "#EAF0FF80",
    fontSize: 13,
    marginTop: 3,
    lineHeight: 18,
  },
  time: {
    color: "#EAF0FF4D",
    fontSize: 11,
    marginTop: 5,
  },
  footer: {
    paddingVertical: 20,
    alignItems: "center",
  },
  loadMore: {
    paddingVertical: 16,
    alignItems: "center",
  },
  loadMoreText: {
    color: "#E9B44C",
    fontSize: 14,
    fontWeight: "600",
  },
});
