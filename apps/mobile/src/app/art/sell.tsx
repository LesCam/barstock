import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, router } from "expo-router";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";
import { API_URL } from "@/lib/trpc";
import { NumericKeypad } from "@/components/NumericKeypad";

const PAYMENT_METHODS = [
  { label: "Cash", value: "cash" },
  { label: "Debit", value: "debit" },
  { label: "Credit", value: "credit" },
  { label: "E-Transfer", value: "etransfer" },
] as const;

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `${API_URL}${url}`;
}

export default function RecordSaleScreen() {
  const { artworkId } = useLocalSearchParams<{ artworkId: string }>();
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: artwork, isLoading } = trpc.artworks.getById.useQuery(
    { id: artworkId!, businessId: user!.businessId },
    { enabled: !!artworkId && !!user?.businessId }
  );

  const [priceCentsStr, setPriceCentsStr] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [buyerName, setBuyerName] = useState("");
  const [buyerContact, setBuyerContact] = useState("");
  const [notes, setNotes] = useState("");

  // Initialize price from artwork list price once loaded
  const effectivePrice = priceCentsStr
    ? parseInt(priceCentsStr, 10)
    : artwork?.listPriceCents ?? 0;

  const commissionPercent = artwork
    ? Number(artwork.commissionPubPercent)
    : 0;

  const split = useMemo(() => {
    const pubCut = Math.round(effectivePrice * commissionPercent / 100);
    const artistCut = effectivePrice - pubCut;
    return { pubCut, artistCut };
  }, [effectivePrice, commissionPercent]);

  const recordSale = trpc.artSales.recordSale.useMutation({
    onSuccess: () => {
      utils.artworks.list.invalidate();
      utils.artworks.getById.invalidate({ id: artworkId });
      Alert.alert("Sale Recorded", "The artwork has been marked as sold.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    },
    onError: (err) => {
      Alert.alert("Error", err.message);
    },
  });

  if (isLoading || !artwork) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#E9B44C" />
      </View>
    );
  }

  const photo = artwork.photos?.[0];
  const imgUrl = resolveImageUrl(photo?.thumbnailUrl ?? photo?.url);

  function handleConfirm() {
    if (effectivePrice <= 0) {
      Alert.alert("Invalid Price", "Please enter a sale price.");
      return;
    }

    Alert.alert(
      "Confirm Sale",
      `Sell "${artwork!.title}" for ${formatPrice(effectivePrice)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: () => {
            recordSale.mutate({
              businessId: user!.businessId,
              artworkId: artworkId!,
              salePriceCents: effectivePrice,
              paymentMethod: paymentMethod as any,
              buyerName: buyerName || undefined,
              buyerContact: buyerContact || undefined,
              notes: notes || undefined,
            });
          },
        },
      ]
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        {/* Artwork context */}
        <View style={styles.artworkContext}>
          {imgUrl ? (
            <Image
              source={{ uri: imgUrl }}
              style={styles.thumbnail}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
              <Text style={{ fontSize: 24, opacity: 0.3 }}>🖼️</Text>
            </View>
          )}
          <View style={styles.artworkInfo}>
            <Text style={styles.artworkTitle} numberOfLines={2}>
              {artwork.title}
            </Text>
            <Text style={styles.artworkArtist}>{artwork.artist?.name}</Text>
            <Text style={styles.listPrice}>
              List: {formatPrice(artwork.listPriceCents)}
            </Text>
          </View>
        </View>

        {/* Sale price */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Sale Price</Text>
          <Text style={styles.priceDisplay}>
            {formatPrice(effectivePrice)}
          </Text>
          <NumericKeypad
            value={priceCentsStr || String(artwork.listPriceCents)}
            onChange={setPriceCentsStr}
            maxLength={8}
          />
        </View>

        {/* Payment method */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Payment Method</Text>
          <View style={styles.paymentPills}>
            {PAYMENT_METHODS.map((pm) => (
              <TouchableOpacity
                key={pm.value}
                style={[
                  styles.paymentPill,
                  paymentMethod === pm.value && styles.paymentPillActive,
                ]}
                onPress={() => setPaymentMethod(pm.value)}
              >
                <Text
                  style={[
                    styles.paymentPillText,
                    paymentMethod === pm.value && styles.paymentPillTextActive,
                  ]}
                >
                  {pm.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Buyer info */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Buyer Info (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Buyer name"
            placeholderTextColor="#5A6A7A"
            value={buyerName}
            onChangeText={setBuyerName}
          />
          <TextInput
            style={styles.input}
            placeholder="Buyer contact (email or phone)"
            placeholderTextColor="#5A6A7A"
            value={buyerContact}
            onChangeText={setBuyerContact}
          />
          <TextInput
            style={[styles.input, styles.notesInput]}
            placeholder="Notes"
            placeholderTextColor="#5A6A7A"
            value={notes}
            onChangeText={setNotes}
            multiline
          />
        </View>

        {/* Commission split preview */}
        <View style={styles.splitPreview}>
          <Text style={styles.splitLabel}>Commission Split</Text>
          <View style={styles.splitRow}>
            <View style={styles.splitItem}>
              <Text style={styles.splitAmount}>
                {formatPrice(split.pubCut)}
              </Text>
              <Text style={styles.splitSub}>Pub ({commissionPercent}%)</Text>
            </View>
            <View style={styles.splitDivider} />
            <View style={styles.splitItem}>
              <Text style={styles.splitAmount}>
                {formatPrice(split.artistCut)}
              </Text>
              <Text style={styles.splitSub}>Artist</Text>
            </View>
          </View>
        </View>

        {/* Confirm button */}
        <TouchableOpacity
          style={[
            styles.confirmButton,
            recordSale.isPending && styles.confirmButtonDisabled,
          ]}
          onPress={handleConfirm}
          disabled={recordSale.isPending}
          activeOpacity={0.7}
        >
          {recordSale.isPending ? (
            <ActivityIndicator color="#0B1623" />
          ) : (
            <Text style={styles.confirmButtonText}>Confirm Sale</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623" },
  content: { padding: 16, paddingBottom: 40 },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0B1623",
  },
  artworkContext: {
    flexDirection: "row",
    backgroundColor: "#16283F",
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  thumbnail: { width: 64, height: 64, borderRadius: 8 },
  thumbnailPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1E3550",
  },
  artworkInfo: { marginLeft: 12, flex: 1, justifyContent: "center" },
  artworkTitle: { fontSize: 16, fontWeight: "600", color: "#EAF0FF" },
  artworkArtist: { fontSize: 13, color: "#5A6A7A", marginTop: 2 },
  listPrice: { fontSize: 13, color: "#8899AA", marginTop: 2 },
  section: { marginBottom: 20 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8899AA",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  priceDisplay: {
    fontSize: 36,
    fontWeight: "700",
    color: "#E9B44C",
    textAlign: "center",
    marginBottom: 12,
  },
  paymentPills: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  paymentPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#16283F",
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  paymentPillActive: {
    backgroundColor: "#E9B44C",
    borderColor: "#E9B44C",
  },
  paymentPillText: { fontSize: 14, fontWeight: "500", color: "#EAF0FF" },
  paymentPillTextActive: { color: "#0B1623" },
  input: {
    backgroundColor: "#16283F",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#EAF0FF",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  notesInput: { minHeight: 60, textAlignVertical: "top" },
  splitPreview: {
    backgroundColor: "#16283F",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  splitLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8899AA",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  splitRow: { flexDirection: "row", alignItems: "center" },
  splitItem: { flex: 1, alignItems: "center" },
  splitAmount: { fontSize: 20, fontWeight: "700", color: "#EAF0FF" },
  splitSub: { fontSize: 12, color: "#5A6A7A", marginTop: 2 },
  splitDivider: {
    width: 1,
    height: 36,
    backgroundColor: "#1E3550",
  },
  confirmButton: {
    backgroundColor: "#E9B44C",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  confirmButtonDisabled: { opacity: 0.6 },
  confirmButtonText: { fontSize: 17, fontWeight: "700", color: "#0B1623" },
});
