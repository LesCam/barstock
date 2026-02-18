import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
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

  // Reservation form state
  const [showReserveForm, setShowReserveForm] = useState(false);
  const [reserveStatus, setReserveStatus] = useState<string>("");
  const [reserveName, setReserveName] = useState("");
  const [reserveContact, setReserveContact] = useState("");

  const updateStatus = trpc.artworks.updateStatus.useMutation({
    onSuccess: () => {
      utils.artworks.getById.invalidate({ id, businessId: user!.businessId });
      utils.artworks.list.invalidate();
      setShowReserveForm(false);
      setReserveName("");
      setReserveContact("");
    },
    onError: (err: any) => {
      Alert.alert("Error", err.message);
    },
  });

  function startReserve(newStatus: string) {
    setReserveStatus(newStatus);
    setReserveName("");
    setReserveContact("");
    setShowReserveForm(true);
  }

  function submitReserve() {
    updateStatus.mutate({
      id: id!,
      businessId: user!.businessId,
      status: reserveStatus as any,
      reservedForName: reserveName.trim() || undefined,
      reservedForContact: reserveContact.trim() || undefined,
    });
  }

  function confirmStatusChange(newStatus: string, label: string) {
    Alert.alert(
      label,
      `Change status to "${newStatus.replace(/_/g, " ")}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: () =>
            updateStatus.mutate({
              id: id!,
              businessId: user!.businessId,
              status: newStatus as any,
            }),
        },
      ]
    );
  }

  if (isLoading || !artwork) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#E9B44C" />
      </View>
    );
  }

  const statusColor = STATUS_COLORS[artwork.status] ?? "#6B7280";
  const photos = artwork.photos ?? [];

  // Reserve form overlay
  if (showReserveForm) {
    const statusLabel = reserveStatus === "reserved"
      ? "Reserve Artwork"
      : "Reserve (Pending Payment)";
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.reserveFormContent}>
          <Text style={styles.reserveFormTitle}>{statusLabel}</Text>
          <Text style={styles.reserveFormSubtitle}>{artwork.title}</Text>

          <View style={styles.reserveSection}>
            <Text style={styles.reserveLabel}>Buyer Name</Text>
            <TextInput
              style={styles.reserveInput}
              placeholder="Name of person reserving"
              placeholderTextColor="#5A6A7A"
              value={reserveName}
              onChangeText={setReserveName}
              autoFocus
            />
          </View>

          <View style={styles.reserveSection}>
            <Text style={styles.reserveLabel}>Contact (email or phone)</Text>
            <TextInput
              style={styles.reserveInput}
              placeholder="How to reach them"
              placeholderTextColor="#5A6A7A"
              value={reserveContact}
              onChangeText={setReserveContact}
            />
          </View>

          <TouchableOpacity
            style={[
              styles.reserveSubmitButton,
              updateStatus.isPending && styles.reserveSubmitDisabled,
            ]}
            onPress={submitReserve}
            disabled={updateStatus.isPending}
            activeOpacity={0.7}
          >
            {updateStatus.isPending ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.reserveSubmitText}>Confirm Reservation</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.reserveCancelButton}
            onPress={() => setShowReserveForm(false)}
            disabled={updateStatus.isPending}
          >
            <Text style={styles.reserveCancelText}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

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
        {artwork.reservedForName && (
          <InfoRow label="Reserved For" value={artwork.reservedForName} />
        )}
        {artwork.reservedForContact && (
          <InfoRow label="Buyer Contact" value={artwork.reservedForContact} />
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

      {/* Status actions */}
      <StatusActions
        status={artwork.status}
        artworkId={artwork.id}
        onStatusChange={confirmStatusChange}
        onReserve={startReserve}
        isPending={updateStatus.isPending}
      />

      {/* Sale info for sold artworks */}
      {artwork.status === "sold" && <SaleInfo artworkId={artwork.id} businessId={artwork.businessId} />}
    </ScrollView>
  );
}

function StatusActions({
  status,
  artworkId,
  onStatusChange,
  onReserve,
  isPending,
}: {
  status: string;
  artworkId: string;
  onStatusChange: (newStatus: string, label: string) => void;
  onReserve: (newStatus: string) => void;
  isPending: boolean;
}) {
  if (isPending) {
    return (
      <View style={styles.actionsRow}>
        <ActivityIndicator color="#E9B44C" />
      </View>
    );
  }

  switch (status) {
    case "on_wall":
      return (
        <View style={styles.actionsColumn}>
          <TouchableOpacity
            style={styles.sellButton}
            onPress={() =>
              router.push({
                pathname: "/art/sell" as any,
                params: { artworkId },
              })
            }
            activeOpacity={0.7}
          >
            <Text style={styles.sellButtonText}>Record Sale</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.reserveButton}
            onPress={() => onReserve("reserved")}
            activeOpacity={0.7}
          >
            <Text style={styles.reserveButtonText}>Reserve</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => onReserve("reserved_pending_payment")}
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryButtonText}>Reserve (Pending Payment)</Text>
          </TouchableOpacity>
        </View>
      );

    case "reserved_pending_payment":
      return (
        <View style={styles.actionsColumn}>
          <TouchableOpacity
            style={styles.reserveButton}
            onPress={() => onStatusChange("reserved", "Confirm Payment")}
            activeOpacity={0.7}
          >
            <Text style={styles.reserveButtonText}>Payment Confirmed</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() =>
              onStatusChange("pending_payment_issue", "Flag Payment Issue")
            }
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryButtonText}>Payment Issue</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => onStatusChange("on_wall", "Cancel Reservation")}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelButtonText}>Cancel Reservation</Text>
          </TouchableOpacity>
        </View>
      );

    case "reserved":
      return (
        <View style={styles.actionsColumn}>
          <TouchableOpacity
            style={styles.sellButton}
            onPress={() =>
              router.push({
                pathname: "/art/sell" as any,
                params: { artworkId },
              })
            }
            activeOpacity={0.7}
          >
            <Text style={styles.sellButtonText}>Record Sale</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => onStatusChange("on_wall", "Cancel Reservation")}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelButtonText}>Cancel Reservation</Text>
          </TouchableOpacity>
        </View>
      );

    case "pending_payment_issue":
      return (
        <View style={styles.actionsColumn}>
          <TouchableOpacity
            style={styles.reserveButton}
            onPress={() =>
              onStatusChange("reserved_pending_payment", "Back to Pending Payment")
            }
            activeOpacity={0.7}
          >
            <Text style={styles.reserveButtonText}>Retry Payment</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sellButton}
            onPress={() =>
              router.push({
                pathname: "/art/sell" as any,
                params: { artworkId },
              })
            }
            activeOpacity={0.7}
          >
            <Text style={styles.sellButtonText}>Record Sale</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => onStatusChange("on_wall", "Cancel & Return to Wall")}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelButtonText}>Cancel & Return to Wall</Text>
          </TouchableOpacity>
        </View>
      );

    case "removed":
    case "removed_not_sold":
      return (
        <View style={styles.actionsColumn}>
          <TouchableOpacity
            style={styles.reserveButton}
            onPress={() => onStatusChange("on_wall", "Return to Wall")}
            activeOpacity={0.7}
          >
            <Text style={styles.reserveButtonText}>Return to Wall</Text>
          </TouchableOpacity>
        </View>
      );

    default:
      return null;
  }
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
    { businessId, artworkId, limit: 1 },
    { enabled: !!businessId && !!artworkId }
  );

  const sale = data?.items?.[0];
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
      {sale.recordedBy && (
        <InfoRow
          label="Recorded By"
          value={
            [sale.recordedBy.firstName, sale.recordedBy.lastName].filter(Boolean).join(" ")
            || sale.recordedBy.email
          }
        />
      )}
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
  actionsColumn: {
    marginHorizontal: 16,
    marginTop: 16,
    gap: 10,
  },
  actionsRow: {
    marginHorizontal: 16,
    marginTop: 16,
    alignItems: "center",
    paddingVertical: 16,
  },
  sellButton: {
    backgroundColor: "#E9B44C",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  sellButtonText: { fontSize: 17, fontWeight: "700", color: "#0B1623" },
  reserveButton: {
    backgroundColor: "#3B82F6",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  reserveButtonText: { fontSize: 15, fontWeight: "700", color: "#FFF" },
  secondaryButton: {
    backgroundColor: "#16283F",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  secondaryButtonText: { fontSize: 15, fontWeight: "600", color: "#EAF0FF" },
  cancelButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelButtonText: { fontSize: 15, fontWeight: "600", color: "#EF4444" },
  // Reserve form
  reserveFormContent: { padding: 16, paddingTop: 24 },
  reserveFormTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#EAF0FF",
    marginBottom: 4,
  },
  reserveFormSubtitle: {
    fontSize: 15,
    color: "#8899AA",
    marginBottom: 24,
  },
  reserveSection: { marginBottom: 16 },
  reserveLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8899AA",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  reserveInput: {
    backgroundColor: "#16283F",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#EAF0FF",
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  reserveSubmitButton: {
    backgroundColor: "#3B82F6",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  reserveSubmitDisabled: { opacity: 0.6 },
  reserveSubmitText: { fontSize: 17, fontWeight: "700", color: "#FFF" },
  reserveCancelButton: {
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
  },
  reserveCancelText: { fontSize: 15, fontWeight: "600", color: "#5A6A7A" },
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
