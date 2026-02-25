import { useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from "react-native";
import { router } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";

export default function RecipeListScreen() {
  const { selectedLocationId, user } = useAuth();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const isManager =
    user?.highestRole === "manager" ||
    user?.highestRole === "business_admin" ||
    user?.highestRole === "platform_admin";

  const { data: recipes, isLoading } = trpc.recipes.listWithCosts.useQuery(
    { locationId: selectedLocationId! },
    { enabled: !!selectedLocationId, staleTime: 5 * 60 * 1000 }
  );

  const { data: categories } = trpc.recipes.listCategories.useQuery(
    { locationId: selectedLocationId! },
    { enabled: !!selectedLocationId }
  );

  const filtered = useMemo(() => {
    if (!recipes) return [];
    let list = recipes.filter((r: any) => r.active);
    if (categoryFilter) {
      list = list.filter((r: any) => r.category === categoryFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r: any) => r.name.toLowerCase().includes(q));
    }
    return list;
  }, [recipes, categoryFilter, search]);

  if (!selectedLocationId) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>Select a location first.</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#E9B44C" style={{ marginTop: 40 }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filtered}
        keyExtractor={(item: any) => item.id}
        ListHeaderComponent={
          <>
            {/* Search bar */}
            <TextInput
              style={styles.searchInput}
              placeholder="Search recipes..."
              placeholderTextColor="#5A6A7A"
              value={search}
              onChangeText={setSearch}
            />

            {/* Category filter chips */}
            {categories && categories.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipScroll}
                contentContainerStyle={styles.chipScrollContent}
              >
                <TouchableOpacity
                  style={[
                    styles.chip,
                    categoryFilter === null && styles.chipActive,
                  ]}
                  onPress={() => setCategoryFilter(null)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      categoryFilter === null && styles.chipTextActive,
                    ]}
                  >
                    All
                  </Text>
                </TouchableOpacity>
                {categories.map((cat: string) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.chip,
                      categoryFilter === cat && styles.chipActive,
                    ]}
                    onPress={() =>
                      setCategoryFilter(categoryFilter === cat ? null : cat)
                    }
                  >
                    <Text
                      style={[
                        styles.chipText,
                        categoryFilter === cat && styles.chipTextActive,
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </>
        }
        renderItem={({ item }: { item: any }) => (
          <TouchableOpacity
            style={styles.recipeRow}
            activeOpacity={0.7}
            onPress={() => router.push(`/recipes/${item.id}` as any)}
          >
            <View style={styles.recipeInfo}>
              <Text style={styles.recipeName} numberOfLines={1}>
                {item.name}
              </Text>
              <View style={styles.recipeMeta}>
                {item.category && (
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryBadgeText}>
                      {item.category}
                    </Text>
                  </View>
                )}
                <Text style={styles.ingredientCount}>
                  {item.ingredients?.length ?? 0} ingredient
                  {(item.ingredients?.length ?? 0) !== 1 ? "s" : ""}
                </Text>
              </View>
            </View>
            <View style={styles.recipeCost}>
              <Text style={styles.costText}>
                {item.totalCost != null
                  ? `$${item.totalCost.toFixed(2)}`
                  : "—"}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              {search ? "No recipes match your search." : "No recipes yet."}
            </Text>
            {isManager && !search && (
              <Text style={styles.emptySubtext}>
                Tap + to create your first recipe.
              </Text>
            )}
          </View>
        }
        contentContainerStyle={styles.listContent}
      />

      {/* FAB for managers */}
      {isManager && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.push("/recipes/new")}
          activeOpacity={0.8}
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623" },
  listContent: { padding: 16, paddingBottom: 100 },

  searchInput: {
    backgroundColor: "#16283F",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: "#EAF0FF",
    borderWidth: 1,
    borderColor: "#1E3550",
    marginBottom: 12,
  },

  chipScroll: { marginBottom: 16 },
  chipScrollContent: { gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "#16283F",
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  chipActive: { backgroundColor: "#E9B44C", borderColor: "#E9B44C" },
  chipText: { fontSize: 12, color: "#8899AA", fontWeight: "600" },
  chipTextActive: { color: "#0B1623" },

  recipeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#16283F",
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  recipeInfo: { flex: 1, marginRight: 12 },
  recipeName: { fontSize: 15, fontWeight: "600", color: "#EAF0FF" },
  recipeMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  categoryBadge: {
    backgroundColor: "#E9B44C20",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  categoryBadgeText: { fontSize: 11, color: "#E9B44C", fontWeight: "600" },
  ingredientCount: { fontSize: 12, color: "#5A6A7A" },
  recipeCost: { alignItems: "flex-end" },
  costText: { fontSize: 15, fontWeight: "600", color: "#EAF0FF" },

  emptyCard: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 24,
    alignItems: "center",
    marginTop: 20,
  },
  emptyText: { fontSize: 15, color: "#8899AA", textAlign: "center" },
  emptySubtext: {
    fontSize: 13,
    color: "#5A6A7A",
    textAlign: "center",
    marginTop: 8,
  },

  fab: {
    position: "absolute",
    bottom: 24,
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
  fabText: { fontSize: 28, color: "#0B1623", fontWeight: "600", marginTop: -2 },
});
