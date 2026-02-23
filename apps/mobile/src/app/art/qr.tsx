import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, router } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";
import { API_URL } from "@/lib/trpc";

const SCREEN_WIDTH = Dimensions.get("window").width;

function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `${API_URL}${url}`;
}

export default function ArtworkQRScreen() {
  const { artworkId } = useLocalSearchParams<{ artworkId: string }>();
  const { user } = useAuth();

  const { data: artwork, isLoading } = trpc.artworks.getById.useQuery(
    { id: artworkId!, businessId: user!.businessId },
    { enabled: !!artworkId && !!user?.businessId }
  );

  if (isLoading || !artwork) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Loading...</Text>
      </View>
    );
  }

  const photo = artwork.photos?.[0];
  const imgUrl = resolveImageUrl(photo?.url);
  const publicUrl = `${API_URL}/artwork/${artwork.id}`;
  const price = `$${(artwork.listPriceCents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <View style={styles.container}>
      {/* Artwork photo */}
      {imgUrl ? (
        <Image
          source={{ uri: imgUrl }}
          style={styles.artworkImage}
          contentFit="contain"
          transition={200}
        />
      ) : (
        <View style={styles.placeholderImage}>
          <Text style={styles.placeholderEmoji}>🖼️</Text>
        </View>
      )}

      {/* Artwork info */}
      <Text style={styles.title}>{artwork.title}</Text>
      <Text style={styles.artist}>{artwork.artist?.name}</Text>
      {artwork.medium && <Text style={styles.medium}>{artwork.medium}</Text>}
      <Text style={styles.price}>{price}</Text>

      {/* QR Code */}
      <View style={styles.qrWrapper}>
        <QRCode
          value={publicUrl}
          size={220}
          backgroundColor="#FFFFFF"
          color="#000000"
          ecl="H"
        />
      </View>

      <Text style={styles.scanHint}>Scan for more details</Text>
      <Text style={styles.urlText} selectable>{publicUrl}</Text>

      {/* Close button */}
      <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
        <Text style={styles.closeText}>Close</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  loading: {
    fontSize: 16,
    color: "#999",
    marginTop: 100,
  },
  artworkImage: {
    width: SCREEN_WIDTH * 0.55,
    height: SCREEN_WIDTH * 0.55,
    borderRadius: 12,
  },
  placeholderImage: {
    width: SCREEN_WIDTH * 0.55,
    height: SCREEN_WIDTH * 0.55,
    borderRadius: 12,
    backgroundColor: "#F0F0F0",
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderEmoji: { fontSize: 60, opacity: 0.3 },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111",
    marginTop: 20,
    textAlign: "center",
  },
  artist: {
    fontSize: 16,
    color: "#666",
    marginTop: 4,
    textAlign: "center",
  },
  medium: {
    fontSize: 13,
    color: "#999",
    marginTop: 2,
  },
  price: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111",
    marginTop: 12,
  },
  qrWrapper: {
    marginTop: 24,
    padding: 16,
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  scanHint: {
    fontSize: 13,
    color: "#999",
    marginTop: 12,
  },
  closeButton: {
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 48,
    backgroundColor: "#111",
    borderRadius: 12,
  },
  closeText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFF",
  },
  urlText: {
    fontSize: 10,
    color: "#BBB",
    marginTop: 4,
    textAlign: "center" as const,
  },
});
