import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";

const UOM_LABELS: Record<string, string> = {
  oz: "oz",
  ml: "mL",
  units: "units",
  grams: "g",
  L: "L",
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const isManager =
    user?.highestRole === "manager" ||
    user?.highestRole === "business_admin" ||
    user?.highestRole === "platform_admin";

  const { data: recipe, isLoading } = trpc.recipes.getById.useQuery(
    { id: id! },
    { enabled: !!id, staleTime: 5 * 60 * 1000 }
  );

  const deleteMut = trpc.recipes.delete.useMutation({
    onSuccess: () => {
      utils.recipes.listWithCosts.invalidate();
      router.back();
    },
  });

  function handleDelete() {
    Alert.alert(
      "Deactivate Recipe",
      `Are you sure you want to deactivate "${recipe?.name}"? It can be reactivated later on the web.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Deactivate",
          style: "destructive",
          onPress: () => deleteMut.mutate({ id: id! }),
        },
      ]
    );
  }

  if (isLoading || !recipe) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#E9B44C" style={{ marginTop: 40 }} />
      </View>
    );
  }

  const totalCost = recipe.ingredients?.reduce((sum: number, ing: any) => {
    return sum + (ing.unitCost ? Number(ing.quantity) * ing.unitCost : 0);
  }, 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{recipe.name}</Text>
      {recipe.category && (
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryBadgeText}>{recipe.category}</Text>
        </View>
      )}
      <View style={[styles.statusBadge, !recipe.active && styles.statusInactive]}>
        <Text style={[styles.statusText, !recipe.active && styles.statusTextInactive]}>
          {recipe.active ? "Active" : "Inactive"}
        </Text>
      </View>

      {/* Ingredients */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          Ingredients ({recipe.ingredients?.length ?? 0})
        </Text>
        {recipe.ingredients?.map((ing: any, i: number) => (
          <View
            key={ing.inventoryItemId ?? i}
            style={[
              styles.ingredientRow,
              i === recipe.ingredients.length - 1 && styles.lastRow,
            ]}
          >
            <View style={styles.ingredientInfo}>
              <Text style={styles.ingredientName} numberOfLines={1}>
                {ing.inventoryItem?.name ?? "Unknown Item"}
              </Text>
              <Text style={styles.ingredientQty}>
                {Number(ing.quantity)} {UOM_LABELS[ing.uom] ?? ing.uom}
              </Text>
            </View>
            <Text style={styles.ingredientCost}>
              {ing.unitCost != null
                ? `$${(Number(ing.quantity) * ing.unitCost).toFixed(2)}`
                : "—"}
            </Text>
          </View>
        ))}
      </View>

      {/* Total Cost */}
      <View style={styles.card}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total Recipe Cost</Text>
          <Text style={styles.totalValue}>
            {totalCost != null ? `$${totalCost.toFixed(2)}` : "—"}
          </Text>
        </View>
      </View>

      {/* Manager actions */}
      {isManager && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => router.push(`/recipes/new?recipeId=${id}` as any)}
          >
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={handleDelete}
            disabled={deleteMut.isPending}
          >
            <Text style={styles.deleteBtnText}>
              {deleteMut.isPending ? "..." : "Deactivate"}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623" },
  content: { padding: 16, paddingBottom: 40 },

  title: { fontSize: 22, fontWeight: "bold", color: "#EAF0FF", marginBottom: 8 },
  categoryBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#E9B44C20",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 8,
  },
  categoryBadgeText: { fontSize: 12, color: "#E9B44C", fontWeight: "600" },
  statusBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#4CAF5020",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 20,
  },
  statusInactive: { backgroundColor: "#EF444420" },
  statusText: { fontSize: 12, color: "#4CAF50", fontWeight: "600" },
  statusTextInactive: { color: "#EF4444" },

  card: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 15, fontWeight: "600", color: "#EAF0FF", marginBottom: 12 },

  ingredientRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3550",
  },
  lastRow: { borderBottomWidth: 0 },
  ingredientInfo: { flex: 1, marginRight: 12 },
  ingredientName: { fontSize: 14, fontWeight: "500", color: "#EAF0FF" },
  ingredientQty: { fontSize: 12, color: "#5A6A7A", marginTop: 2 },
  ingredientCost: { fontSize: 14, fontWeight: "500", color: "#EAF0FF" },

  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: { fontSize: 15, fontWeight: "600", color: "#EAF0FF" },
  totalValue: { fontSize: 18, fontWeight: "700", color: "#E9B44C" },

  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3550",
  },
  detailLabel: { fontSize: 14, color: "#5A6A7A" },
  detailValue: { fontSize: 14, fontWeight: "500", color: "#EAF0FF" },

  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  editBtn: {
    flex: 1,
    backgroundColor: "#E9B44C",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  editBtnText: { fontSize: 15, fontWeight: "600", color: "#0B1623" },
  deleteBtn: {
    flex: 1,
    backgroundColor: "#EF444420",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EF444440",
  },
  deleteBtnText: { fontSize: 15, fontWeight: "600", color: "#EF4444" },
});
