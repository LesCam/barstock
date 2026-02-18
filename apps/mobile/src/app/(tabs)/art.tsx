import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";
import { API_URL } from "@/lib/trpc";

const COLUMN_GAP = 12;
const NUM_COLUMNS = 2;
const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_WIDTH =
  (SCREEN_WIDTH - COLUMN_GAP * (NUM_COLUMNS + 1)) / NUM_COLUMNS;

const STATUS_FILTERS = [
  { label: "All", value: null },
  { label: "On Wall", value: "on_wall" as const },
  { label: "Reserved", value: "reserved" as const },
  { label: "Sold", value: "sold" as const },
];

const SORT_OPTIONS = [
  { label: "Newest", value: "newest" },
  { label: "Artist", value: "artist" },
  { label: "Status", value: "status" },
  { label: "Title", value: "title" },
  { label: "Price", value: "price" },
] as const;

const STATUS_SORT_ORDER: Record<string, number> = {
  on_wall: 0,
  reserved_pending_payment: 1,
  reserved: 2,
  pending_payment_issue: 3,
  sold: 4,
  removed: 5,
  removed_not_sold: 6,
};

const STATUS_COLORS: Record<string, string> = {
  on_wall: "#22C55E",
  reserved_pending_payment: "#F59E0B",
  reserved: "#3B82F6",
  sold: "#EF4444",
  removed: "#6B7280",
  removed_not_sold: "#6B7280",
  pending_payment_issue: "#F59E0B",
};

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `${API_URL}${url}`;
}

export default function ArtTab() {
  const { user } = useAuth();
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>("newest");

  const { data, isLoading, refetch } = trpc.artworks.list.useQuery(
    {
      businessId: user?.businessId ?? "",
      status: selectedStatus ?? undefined,
      limit: 50,
    },
    { enabled: !!user?.businessId }
  );

  const items = useMemo(() => {
    const raw = [...(data?.items ?? [])];
    switch (sortBy) {
      case "artist":
        return raw.sort((a: any, b: any) =>
          (a.artist?.name ?? "").localeCompare(b.artist?.name ?? "")
        );
      case "status":
        return raw.sort(
          (a: any, b: any) =>
            (STATUS_SORT_ORDER[a.status] ?? 99) - (STATUS_SORT_ORDER[b.status] ?? 99)
        );
      case "title":
        return raw.sort((a: any, b: any) => a.title.localeCompare(b.title));
      case "price":
        return raw.sort((a: any, b: any) => b.listPriceCents - a.listPriceCents);
      default:
        return raw; // newest — already sorted by API
    }
  }, [data?.items, sortBy]);

  return (
    <View style={styles.container}>
      {/* Status filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterContent}
      >
        {STATUS_FILTERS.map((filter) => (
          <TouchableOpacity
            key={filter.label}
            onPress={() => setSelectedStatus(filter.value)}
            style={[
              styles.pill,
              selectedStatus === filter.value && styles.pillActive,
            ]}
          >
            <Text
              style={[
                styles.pillText,
                selectedStatus === filter.value && styles.pillTextActive,
              ]}
            >
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Sort options */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.sortBar}
        contentContainerStyle={styles.sortContent}
      >
        <Text style={styles.sortLabel}>Sort:</Text>
        {SORT_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            onPress={() => setSortBy(opt.value)}
            style={[
              styles.sortPill,
              sortBy === opt.value && styles.sortPillActive,
            ]}
          >
            <Text
              style={[
                styles.sortPillText,
                sortBy === opt.value && styles.sortPillTextActive,
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Artwork grid */}
      <FlatList
        data={items}
        numColumns={NUM_COLUMNS}
        keyExtractor={(item: any) => item.id}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        onRefresh={refetch}
        refreshing={false}
        renderItem={({ item }: { item: any }) => {
          const photo = item.photos?.[0];
          const imgUrl = resolveImageUrl(photo?.thumbnailUrl ?? photo?.url);
          const statusColor = STATUS_COLORS[item.status] ?? "#6B7280";

          return (
            <TouchableOpacity
              style={[styles.card, { width: CARD_WIDTH }]}
              onPress={() => router.push(`/art/${item.id}` as any)}
              activeOpacity={0.7}
            >
              <View style={styles.imageContainer}>
                {imgUrl ? (
                  <Image
                    source={{ uri: imgUrl }}
                    style={styles.image}
                    contentFit="cover"
                    transition={200}
                  />
                ) : (
                  <View style={styles.placeholder}>
                    <Text style={styles.placeholderEmoji}>🖼️</Text>
                  </View>
                )}
                <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                  <Text style={styles.statusText}>
                    {item.status.replace(/_/g, " ")}
                  </Text>
                </View>
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.artistName} numberOfLines={1}>
                  {item.artist?.name}
                </Text>
                <Text style={styles.price}>
                  {formatPrice(item.listPriceCents)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          isLoading ? (
            <Text style={styles.empty}>Loading...</Text>
          ) : (
            <Text style={styles.empty}>No artworks found.</Text>
          )
        }
      />

      {/* FAB — add artwork */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push("/art/new" as any)}
        activeOpacity={0.7}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623" },
  filterBar: {
    maxHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3550",
  },
  filterContent: {
    paddingHorizontal: COLUMN_GAP,
    paddingVertical: 10,
    gap: 8,
    flexDirection: "row",
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  pillActive: { backgroundColor: "#E9B44C" },
  pillText: { fontSize: 13, fontWeight: "500", color: "#EAF0FF" },
  pillTextActive: { color: "#0B1623" },
  sortBar: {
    maxHeight: 40,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3550",
  },
  sortContent: {
    paddingHorizontal: COLUMN_GAP,
    paddingVertical: 6,
    gap: 6,
    flexDirection: "row",
    alignItems: "center",
  },
  sortLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#5A6A7A",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginRight: 2,
  },
  sortPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  sortPillActive: { backgroundColor: "#1E3550" },
  sortPillText: { fontSize: 12, fontWeight: "500", color: "#5A6A7A" },
  sortPillTextActive: { color: "#EAF0FF" },
  row: { gap: COLUMN_GAP, paddingHorizontal: COLUMN_GAP },
  grid: { paddingTop: COLUMN_GAP, paddingBottom: 24 },
  card: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: COLUMN_GAP,
  },
  imageContainer: { width: "100%", aspectRatio: 1, position: "relative" },
  image: { width: "100%", height: "100%" },
  placeholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#16283F",
  },
  placeholderEmoji: { fontSize: 36, opacity: 0.3 },
  statusBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#FFF",
    textTransform: "uppercase",
  },
  cardBody: { padding: 10 },
  title: { fontSize: 14, fontWeight: "600", color: "#EAF0FF" },
  artistName: { fontSize: 11, color: "#5A6A7A", marginTop: 2 },
  price: {
    fontSize: 13,
    fontWeight: "600",
    color: "#E9B44C",
    marginTop: 4,
  },
  empty: {
    textAlign: "center",
    color: "#5A6A7A",
    marginTop: 40,
    fontSize: 14,
  },
  fab: {
    position: "absolute",
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#E9B44C",
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  fabText: {
    fontSize: 28,
    fontWeight: "600",
    color: "#0B1623",
    marginTop: -2,
  },
});
