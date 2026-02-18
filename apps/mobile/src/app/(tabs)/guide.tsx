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
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";
import { API_URL } from "@/lib/trpc";

const COLUMN_GAP = 12;
const NUM_COLUMNS = 2;
const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_WIDTH =
  (SCREEN_WIDTH - COLUMN_GAP * (NUM_COLUMNS + 1)) / NUM_COLUMNS;

export default function GuideTab() {
  const { selectedLocationId } = useAuth();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null
  );

  const { data: categories } = trpc.productGuide.listCategories.useQuery(
    { locationId: selectedLocationId!, activeOnly: true },
    { enabled: !!selectedLocationId }
  );

  const { data: items, isLoading } = trpc.productGuide.listItems.useQuery(
    {
      locationId: selectedLocationId!,
      categoryId: selectedCategoryId ?? undefined,
      activeOnly: true,
    },
    { enabled: !!selectedLocationId }
  );

  function resolveImageUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    if (url.startsWith("http")) return url;
    return `${API_URL}${url}`;
  }

  return (
    <View style={styles.container}>
      {/* Category filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterContent}
      >
        <TouchableOpacity
          onPress={() => setSelectedCategoryId(null)}
          style={[
            styles.pill,
            selectedCategoryId === null && styles.pillActive,
          ]}
        >
          <Text
            style={[
              styles.pillText,
              selectedCategoryId === null && styles.pillTextActive,
            ]}
          >
            All
          </Text>
        </TouchableOpacity>
        {categories?.map((cat: any) => (
          <TouchableOpacity
            key={cat.id}
            onPress={() => setSelectedCategoryId(cat.id)}
            style={[
              styles.pill,
              selectedCategoryId === cat.id && styles.pillActive,
            ]}
          >
            <Text
              style={[
                styles.pillText,
                selectedCategoryId === cat.id && styles.pillTextActive,
              ]}
            >
              {cat.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Items grid */}
      <FlatList
        data={items}
        numColumns={NUM_COLUMNS}
        keyExtractor={(i: any) => i.id}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        renderItem={({ item }: { item: any }) => {
          const imgUrl = resolveImageUrl(item.imageUrl);
          const prices = Array.isArray(item.prices) ? (item.prices as any[]) : [];
          return (
            <TouchableOpacity
              style={[styles.card, { width: CARD_WIDTH }]}
              onPress={() => router.push(`/guide/${item.id}` as any)}
              activeOpacity={0.7}
            >
              <View style={styles.imageContainer}>
                {imgUrl ? (
                  <Image
                    source={{ uri: imgUrl }}
                    style={styles.image}
                    contentFit="contain"
                    transition={200}
                  />
                ) : (
                  <View style={styles.placeholder}>
                    <Text style={styles.placeholderText}>🍷</Text>
                  </View>
                )}
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.itemName} numberOfLines={2}>
                  {item.inventoryItem.name}
                </Text>
                <Text style={styles.categoryLabel} numberOfLines={1}>
                  {item.category.name}
                </Text>
                {prices.length > 0 && (
                  <Text style={styles.priceLabel}>
                    {prices.length === 1
                      ? `$${Number(prices[0].price).toFixed(2)}`
                      : `$${Number(Math.min(...prices.map((p: any) => p.price))).toFixed(2)}+`}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          isLoading ? (
            <Text style={styles.empty}>Loading...</Text>
          ) : (
            <Text style={styles.empty}>No items in the guide yet.</Text>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623" },
  filterBar: { maxHeight: 52, borderBottomWidth: 1, borderBottomColor: "#1E3550" },
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
  row: { gap: COLUMN_GAP, paddingHorizontal: COLUMN_GAP },
  grid: { paddingTop: COLUMN_GAP, paddingBottom: 24 },
  card: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: COLUMN_GAP,
  },
  imageContainer: { width: "100%", aspectRatio: 1 },
  image: { width: "100%", height: "100%" },
  placeholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#16283F",
  },
  placeholderText: { fontSize: 36, opacity: 0.3 },
  cardBody: { padding: 10 },
  itemName: { fontSize: 14, fontWeight: "600", color: "#EAF0FF" },
  categoryLabel: {
    fontSize: 11,
    color: "#5A6A7A",
    marginTop: 2,
  },
  priceLabel: {
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
});
