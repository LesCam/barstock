import { View, Text, ScrollView, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, Stack } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";
import { API_URL } from "@/lib/trpc";

export default function GuideItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { selectedLocationId } = useAuth();

  const { data: item, isLoading } = trpc.productGuide.getItem.useQuery(
    { id: id!, locationId: selectedLocationId! },
    { enabled: !!id && !!selectedLocationId }
  );

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

  return (
    <ScrollView style={styles.container}>
      <Stack.Screen options={{ title: item.inventoryItem.name }} />

      {/* Hero image */}
      {imgUrl ? (
        <Image
          source={{ uri: imgUrl }}
          style={styles.heroImage}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={styles.heroPlaceholder}>
          <Text style={styles.heroPlaceholderText}>🍷</Text>
        </View>
      )}

      <View style={styles.content}>
        <Text style={styles.name}>{item.inventoryItem.name}</Text>

        <View style={styles.metaRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{item.category.name}</Text>
          </View>
          <Text style={styles.type}>
            {item.inventoryItem.type.replace("_", " ")}
          </Text>
        </View>

        {item.description ? (
          <View style={styles.descriptionContainer}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.description}>{item.description}</Text>
          </View>
        ) : null}

        {item.inventoryItem.barcode ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Barcode</Text>
            <Text style={styles.detailValue}>
              {item.inventoryItem.barcode}
            </Text>
          </View>
        ) : null}
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
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
  },
  detailLabel: { fontSize: 13, color: "#5A6A7A" },
  detailValue: { fontSize: 13, fontWeight: "500", color: "#EAF0FF" },
});
