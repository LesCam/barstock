import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, Stack, router } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useAuth, usePermission } from "@/lib/auth-context";
import { API_URL } from "@/lib/trpc";

export default function GuideItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { selectedLocationId, user } = useAuth();
  const isManager = ["manager", "business_admin", "platform_admin"].includes(
    user?.highestRole ?? ""
  );
  const isAdmin = ["business_admin", "platform_admin"].includes(
    user?.highestRole ?? ""
  );

  const utils = trpc.useUtils();

  const { data: item, isLoading } = trpc.productGuide.getItem.useQuery(
    { id: id!, locationId: selectedLocationId! },
    { enabled: !!id && !!selectedLocationId }
  );

  const deleteItem = trpc.productGuide.deleteItem.useMutation({
    onSuccess: () => {
      utils.productGuide.listItems.invalidate();
      router.back();
    },
  });

  function handleDelete() {
    Alert.alert(
      "Delete Item",
      `Remove "${item?.inventoryItem.name}" from the guide?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteItem.mutate({ id: id!, locationId: selectedLocationId! });
          },
        },
      ]
    );
  }

  function resolveImageUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    if (url.startsWith("http")) return url;
    return `${API_URL}${url}`;
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: "Loading..." }} />
        <Text style={styles.loading}>Loading...</Text>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: "Not Found" }} />
        <Text style={styles.loading}>Item not found.</Text>
      </View>
    );
  }

  const imgUrl = resolveImageUrl(item.imageUrl);
  const prices = Array.isArray(item.prices) ? (item.prices as { label: string; price: number }[]) : [];

  return (
    <ScrollView style={styles.container}>
      <Stack.Screen options={{ title: item.inventoryItem.name }} />

      {/* Hero image */}
      <View>
        {imgUrl ? (
          <Image
            source={{ uri: imgUrl }}
            style={styles.heroImage}
            contentFit="contain"
            transition={200}
          />
        ) : (
          <View style={styles.heroPlaceholder}>
            <Text style={styles.heroPlaceholderText}>🍷</Text>
          </View>
        )}
        {isAdmin && (
          <TouchableOpacity
            style={styles.cameraButton}
            onPress={() =>
              router.push(
                `/guide/photo?guideItemId=${id}&locationId=${selectedLocationId}`
              )
            }
          >
            <Text style={styles.cameraButtonText}>📷</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.content}>
        <Text style={styles.name}>{item.inventoryItem.name}</Text>

        <View style={styles.metaRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{item.category.name}</Text>
          </View>
          <Text style={styles.type}>
            {item.inventoryItem.category?.name ?? item.category.name}
          </Text>
        </View>

        {prices.length > 0 && (
          <View style={styles.pricesRow}>
            {prices.map((p, i) => (
              <View key={i} style={styles.priceChip}>
                <Text style={styles.priceChipLabel}>{p.label}</Text>
                <Text style={styles.priceChipValue}>${Number(p.price).toFixed(2)}</Text>
              </View>
            ))}
          </View>
        )}

        {item.description ? (
          <View style={styles.descriptionContainer}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.description}>{item.description}</Text>
          </View>
        ) : null}

        {(item.abv != null || item.producer || item.region || item.vintage != null || item.varietal) && (
          <View style={styles.detailsCard}>
            {item.abv != null && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>ABV</Text>
                <Text style={styles.detailValue}>{Number(item.abv)}%</Text>
              </View>
            )}
            {item.producer ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Producer</Text>
                <Text style={styles.detailValue}>{item.producer}</Text>
              </View>
            ) : null}
            {item.region ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Region</Text>
                <Text style={styles.detailValue}>{item.region}</Text>
              </View>
            ) : null}
            {item.vintage != null ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Vintage</Text>
                <Text style={styles.detailValue}>{item.vintage}</Text>
              </View>
            ) : null}
            {item.varietal ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Varietal</Text>
                <Text style={styles.detailValue}>{item.varietal}</Text>
              </View>
            ) : null}
          </View>
        )}

        {isManager && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDelete}
            disabled={deleteItem.isPending}
          >
            <Text style={styles.deleteButtonText}>
              {deleteItem.isPending ? "Deleting..." : "Delete from Guide"}
            </Text>
          </TouchableOpacity>
        )}

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623" },
  loading: { color: "#5A6A7A", textAlign: "center", marginTop: 40 },
  heroImage: { width: "100%", height: 300 },
  heroPlaceholder: {
    width: "100%",
    height: 300,
    backgroundColor: "#16283F",
    justifyContent: "center",
    alignItems: "center",
  },
  heroPlaceholderText: { fontSize: 64, opacity: 0.3 },
  cameraButton: {
    position: "absolute",
    bottom: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  cameraButtonText: { fontSize: 20 },
  content: { padding: 16 },
  name: {
    fontSize: 22,
    fontWeight: "700",
    color: "#EAF0FF",
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  badge: {
    backgroundColor: "#E9B44C",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: { fontSize: 12, fontWeight: "600", color: "#0B1623" },
  type: {
    fontSize: 13,
    color: "#5A6A7A",
    textTransform: "capitalize",
  },
  pricesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  priceChip: {
    backgroundColor: "#16283F",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
  },
  priceChipLabel: {
    fontSize: 11,
    color: "#5A6A7A",
    marginBottom: 2,
  },
  priceChipValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#E9B44C",
  },
  descriptionContainer: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#EAF0FF",
    opacity: 0.6,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: "#EAF0FF",
  },
  detailsCard: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  detailLabel: { fontSize: 13, color: "#5A6A7A" },
  detailValue: { fontSize: 13, fontWeight: "500", color: "#EAF0FF" },
  deleteButton: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center" as const,
    marginBottom: 32,
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: "#EF4444",
  },
});
