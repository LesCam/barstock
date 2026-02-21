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
import { trpc } from "@/lib/trpc";

const DATE_FILTERS = [
  { label: "24h", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "All", days: 0 },
] as const;

const PAGE_SIZE = 50;

interface AuditItem {
  id: string;
  actionType: string;
  objectType: string;
  objectId: string | null;
  metadataJson: any;
  createdAt: Date;
  actorUser: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
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

function actorName(actor: AuditItem["actorUser"]): string {
  if (!actor) return "System";
  if (actor.firstName || actor.lastName)
    return [actor.firstName, actor.lastName].filter(Boolean).join(" ");
  return actor.email;
}

function formatActionType(actionType: string): string {
  return actionType
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AuditLogScreen() {
  const [dateFilter, setDateFilter] = useState(1); // days; 0 = all
  const [actionFilter, setActionFilter] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [items, setItems] = useState<AuditItem[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fromDate =
    dateFilter > 0
      ? new Date(Date.now() - dateFilter * 24 * 60 * 60 * 1000)
      : undefined;

  const { data: actionTypes } = trpc.audit.actionTypes.useQuery({});

  const { data, isLoading, isFetching } = trpc.audit.list.useQuery({
    limit: PAGE_SIZE,
    cursor,
    fromDate,
    actionType: actionFilter ?? undefined,
  });

  const prevCursorRef = useRef(cursor);

  useEffect(() => {
    if (!data) return;
    const wasPaging = !!prevCursorRef.current;
    prevCursorRef.current = cursor;

    if (wasPaging) {
      setItems((prev) => {
        const ids = new Set(prev.map((i) => i.id));
        const newItems = (data.items as AuditItem[]).filter(
          (i) => !ids.has(i.id)
        );
        return [...prev, ...newItems];
      });
    } else {
      setItems(data.items as AuditItem[]);
    }
    setHasMore(!!data.nextCursor);
    setRefreshing(false);
  }, [data]);

  // Reset pagination when filters change
  useEffect(() => {
    setCursor(undefined);
    setItems([]);
    setHasMore(true);
  }, [dateFilter, actionFilter]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setCursor(undefined);
    setItems([]);
  }, []);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || isFetching || items.length === 0) return;
    const lastItem = items[items.length - 1];
    setCursor(lastItem.id);
  }, [hasMore, isFetching, items]);

  const renderMetadata = (metadata: any) => {
    if (!metadata || typeof metadata !== "object") return null;
    const entries = Object.entries(metadata);
    if (entries.length === 0) return null;

    return (
      <View style={styles.metadataContainer}>
        {entries.map(([key, value]) => (
          <View key={key} style={styles.metadataRow}>
            <Text style={styles.metadataKey}>{key}</Text>
            <Text style={styles.metadataValue} numberOfLines={3}>
              {typeof value === "object" ? JSON.stringify(value) : String(value)}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  const renderItem = useCallback(
    ({ item }: { item: AuditItem }) => {
      const isExpanded = expandedId === item.id;

      return (
        <TouchableOpacity
          style={styles.card}
          onPress={() => setExpandedId(isExpanded ? null : item.id)}
          activeOpacity={0.7}
        >
          <View style={styles.cardHeader}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {formatActionType(item.actionType)}
              </Text>
            </View>
            <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
          </View>
          <Text style={styles.actor}>{actorName(item.actorUser)}</Text>
          {item.objectType && (
            <Text style={styles.objectInfo}>
              {item.objectType}
              {item.objectId ? ` #${item.objectId.slice(0, 8)}` : ""}
            </Text>
          )}
          {isExpanded && renderMetadata(item.metadataJson)}
        </TouchableOpacity>
      );
    },
    [expandedId]
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
      {/* Date range filter chips */}
      <View style={styles.filterRow}>
        {DATE_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.label}
            style={[
              styles.chip,
              dateFilter === f.days && styles.chipActive,
            ]}
            onPress={() => setDateFilter(f.days)}
          >
            <Text
              style={[
                styles.chipText,
                dateFilter === f.days && styles.chipTextActive,
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Action type filter chips */}
      {actionTypes && actionTypes.length > 0 && (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[null, ...actionTypes]}
          keyExtractor={(item) => item ?? "__all__"}
          contentContainerStyle={styles.actionFilterRow}
          renderItem={({ item: at }) => (
            <TouchableOpacity
              style={[
                styles.chip,
                styles.chipSmall,
                actionFilter === at && styles.chipActive,
                at === null && actionFilter === null && styles.chipActive,
              ]}
              onPress={() => setActionFilter(at)}
            >
              <Text
                style={[
                  styles.chipText,
                  styles.chipTextSmall,
                  (actionFilter === at ||
                    (at === null && actionFilter === null)) &&
                    styles.chipTextActive,
                ]}
              >
                {at ? formatActionType(at) : "All Types"}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>No audit log entries</Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#E9B44C"
          />
        }
        contentContainerStyle={
          items.length === 0 ? styles.emptyContainer : undefined
        }
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
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3550",
  },
  actionFilterRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: "#16283F",
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  chipSmall: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipActive: {
    backgroundColor: "#E9B44C20",
    borderColor: "#E9B44C",
  },
  chipText: {
    color: "#EAF0FF",
    fontSize: 13,
    fontWeight: "500",
  },
  chipTextSmall: {
    fontSize: 11,
  },
  chipTextActive: {
    color: "#E9B44C",
  },
  card: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3550",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  badge: {
    backgroundColor: "#1E3550",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeText: {
    color: "#E9B44C",
    fontSize: 11,
    fontWeight: "600",
  },
  time: {
    color: "#EAF0FF4D",
    fontSize: 11,
  },
  actor: {
    color: "#EAF0FF",
    fontSize: 14,
    marginTop: 4,
  },
  objectInfo: {
    color: "#5A6A7A",
    fontSize: 12,
    marginTop: 2,
  },
  metadataContainer: {
    marginTop: 10,
    backgroundColor: "#0D1E30",
    borderRadius: 6,
    padding: 10,
  },
  metadataRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  metadataKey: {
    color: "#5A6A7A",
    fontSize: 12,
    fontWeight: "600",
    width: 100,
  },
  metadataValue: {
    color: "#EAF0FF",
    fontSize: 12,
    flex: 1,
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
