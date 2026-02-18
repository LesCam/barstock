import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";
import { API_URL } from "@/lib/trpc";

const SCREEN_WIDTH = Dimensions.get("window").width;

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

export default function ArtworkDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // Refresh artwork data when returning from photo screen
  useFocusEffect(
    useCallback(() => {
      if (id && user?.businessId) {
        utils.artworks.getById.invalidate({ id, businessId: user.businessId });
      }
    }, [id, user?.businessId])
  );

  const { data: artwork, isLoading } = trpc.artworks.getById.useQuery(
    { id: id!, businessId: user!.businessId },
    { enabled: !!id && !!user?.businessId }
  );

  if (isLoading || !artwork) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#E9B44C" />
      </View>
    );
  }

  const statusColor = STATUS_COLORS[artwork.status] ?? "#6B7280";
  const photos = artwork.photos ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Photo gallery */}
      {photos.length > 0 ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.photoGallery}
        >
          {photos.map((photo: any) => {
            const imgUrl = resolveImageUrl(photo.url);
            return (
              <Image
                key={photo.id}
                source={{ uri: imgUrl! }}
                style={styles.photo}
                contentFit="cover"
                transition={200}
              />
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.noPhoto}>
          <Text style={styles.noPhotoEmoji}>🖼️</Text>
          <Text style={styles.noPhotoText}>No photos</Text>
        </View>
      )}

      {photos.length > 1 && (
        <Text style={styles.photoCount}>
          {photos.length} photo{photos.length > 1 ? "s" : ""} — swipe to view
        </Text>
      )}

      {/* Info section */}
      <View style={styles.infoSection}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{artwork.title}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusText}>
              {artwork.status.replace(/_/g, " ")}
            </Text>
          </View>
        </View>

        <Text style={styles.artistName}>{artwork.artist?.name}</Text>

        <Text style={styles.price}>{formatPrice(artwork.listPriceCents)}</Text>

        {artwork.medium && (
          <InfoRow label="Medium" value={artwork.medium} />
        )}
        {artwork.dimensions && (
          <InfoRow label="Dimensions" value={artwork.dimensions} />
        )}
        {artwork.locationInPub && (
          <InfoRow label="Location" value={artwork.locationInPub} />
        )}
        {artwork.notes && (
          <InfoRow label="Notes" value={artwork.notes} />
        )}
      </View>

      {/* Add Photo button — max 3 photos */}
      {photos.length < 3 && (
        <TouchableOpacity
          style={styles.addPhotoButton}
          onPress={() =>
            router.push({
              pathname: "/art/photo" as any,
              params: { artworkId: artwork.id },
            })
          }
          activeOpacity={0.7}
        >
          <Text style={styles.addPhotoButtonText}>Add Photo</Text>
        </TouchableOpacity>
      )}

      {/* Record Sale button — only for on_wall artworks */}
      {artwork.status === "on_wall" && (
        <TouchableOpacity
          style={styles.sellButton}
          onPress={() =>
            router.push({
              pathname: "/art/sell" as any,
              params: { artworkId: artwork.id },
            })
          }
          activeOpacity={0.7}
        >
          <Text style={styles.sellButtonText}>Record Sale</Text>
        </TouchableOpacity>
      )}

      {/* Sale info for sold artworks */}
      {artwork.status === "sold" && <SaleInfo artworkId={artwork.id} businessId={artwork.businessId} />}
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function SaleInfo({ artworkId, businessId }: { artworkId: string; businessId: string }) {
  const { data } = trpc.artSales.list.useQuery(
    { businessId, limit: 1 },
    { enabled: !!businessId }
  );

  const sale = data?.items?.find((s: any) => s.artworkId === artworkId);
  if (!sale) return null;

  return (
    <View style={styles.saleSection}>
      <Text style={styles.saleHeader}>Sale Details</Text>
      <InfoRow label="Sale Price" value={formatPrice(sale.salePriceCents)} />
      <InfoRow
        label="Payment"
        value={sale.paymentMethod.replace(/_/g, " ")}
      />
      {sale.buyerName && <InfoRow label="Buyer" value={sale.buyerName} />}
      <InfoRow
        label="Date"
        value={new Date(sale.soldAt).toLocaleDateString()}
      />
      <InfoRow
        label="Pub Cut"
        value={formatPrice(sale.pubCutCents)}
      />
      <InfoRow
        label="Artist Cut"
        value={formatPrice(sale.artistCutCents)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623" },
  content: { paddingBottom: 40 },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0B1623",
  },
  photoGallery: { height: SCREEN_WIDTH * 0.8 },
  photo: { width: SCREEN_WIDTH, height: SCREEN_WIDTH * 0.8 },
  noPhoto: {
    height: 200,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#16283F",
  },
  noPhotoEmoji: { fontSize: 48, opacity: 0.3 },
  noPhotoText: { fontSize: 13, color: "#5A6A7A", marginTop: 8 },
  photoCount: {
    fontSize: 11,
    color: "#5A6A7A",
    textAlign: "center",
    paddingVertical: 6,
  },
  infoSection: { padding: 16 },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  title: { fontSize: 22, fontWeight: "700", color: "#EAF0FF", flex: 1 },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginLeft: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFF",
    textTransform: "uppercase",
  },
  artistName: { fontSize: 16, color: "#8899AA", marginBottom: 8 },
  price: {
    fontSize: 24,
    fontWeight: "700",
    color: "#E9B44C",
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3550",
  },
  infoLabel: { fontSize: 13, color: "#5A6A7A" },
  infoValue: { fontSize: 13, color: "#EAF0FF", fontWeight: "500" },
  addPhotoButton: {
    backgroundColor: "#16283F",
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  addPhotoButtonText: { fontSize: 15, fontWeight: "600", color: "#E9B44C" },
  sellButton: {
    backgroundColor: "#E9B44C",
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  sellButtonText: { fontSize: 17, fontWeight: "700", color: "#0B1623" },
  saleSection: {
    margin: 16,
    padding: 16,
    backgroundColor: "#16283F",
    borderRadius: 12,
  },
  saleHeader: {
    fontSize: 16,
    fontWeight: "700",
    color: "#EAF0FF",
    marginBottom: 12,
  },
});
