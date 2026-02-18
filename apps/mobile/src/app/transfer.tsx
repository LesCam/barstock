import { useState, useMemo, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";
import { NumericKeypad } from "@/components/NumericKeypad";
import { ItemSearchBar } from "@/components/ItemSearchBar";

interface BarArea {
  id: string;
  name: string;
  subAreas: { id: string; name: string; sortOrder: number }[];
}

interface SelectedItem {
  id: string;
  name: string;
  type: string;
  barcode: string | null;
  packSize: unknown;
  containerSize: unknown;
  baseUom: string;
}

interface LoggedTransfer {
  id: string;
  itemName: string;
  from: string;
  to: string;
  quantity: number;
  uom: string;
}

export default function TransferScreen() {
  const { selectedLocationId } = useAuth();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [fromSubAreaId, setFromSubAreaId] = useState<string | null>(null);
  const [toSubAreaId, setToSubAreaId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [quantity, setQuantity] = useState("");
  const [loggedTransfers, setLoggedTransfers] = useState<LoggedTransfer[]>([]);
  const [showReview, setShowReview] = useState(false);
  const sessionCreating = useRef(false);

  const utils = trpc.useUtils();

  const { data: areas } = trpc.areas.listBarAreas.useQuery(
    { locationId: selectedLocationId! },
    { enabled: !!selectedLocationId }
  );

  // Create a transfer session on mount
  const createSession = trpc.sessions.create.useMutation();
  const closeSession = trpc.sessions.close.useMutation();
  const addLine = trpc.sessions.addLine.useMutation();

  useEffect(() => {
    if (!selectedLocationId || sessionCreating.current) return;
    sessionCreating.current = true;
    createSession.mutateAsync({
      locationId: selectedLocationId,
      sessionType: "shift" as any,
      startedTs: new Date(),
    }).then((s) => {
      setSessionId(s.id);
    }).catch((e: any) => {
      Alert.alert("Error", e.message ?? "Failed to create session");
      router.back();
    });
  }, [selectedLocationId]);

  const transferMutation = trpc.transfers.create.useMutation({
    async onSuccess(_data: any, variables: any) {
      // Add a session line to track it
      if (sessionId && selectedItem) {
        try {
          await addLine.mutateAsync({
            sessionId,
            inventoryItemId: selectedItem.id,
            countUnits: parseInt(quantity, 10),
            subAreaId: variables.toSubAreaId,
            notes: `Transfer from ${fromLabel} to ${toLabel}`,
          });
        } catch {
          // Non-critical
        }
      }
      setLoggedTransfers((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          itemName: selectedItem?.name ?? "Unknown",
          from: fromLabel,
          to: toLabel,
          quantity: parseInt(quantity, 10),
          uom: selectedItem?.baseUom ?? "",
        },
      ]);
      Alert.alert("Transfer Logged", "Ready for next transfer.");
      setSelectedItem(null);
      setQuantity("");
    },
    onError(error: { message: string }) {
      Alert.alert("Error", error.message);
    },
  });

  // Build flat list of sub-areas with parent area name
  const subAreaOptions = useMemo(() => {
    if (!areas) return [];
    return (areas as BarArea[]).flatMap((area) =>
      area.subAreas.map((sa) => ({
        id: sa.id,
        label: `${area.name} — ${sa.name}`,
        barAreaId: area.id,
      }))
    );
  }, [areas]);

  const fromLabel = subAreaOptions.find((o) => o.id === fromSubAreaId)?.label ?? "Select";
  const toLabel = subAreaOptions.find((o) => o.id === toSubAreaId)?.label ?? "Select";

  function handleSubmit() {
    if (!fromSubAreaId || !toSubAreaId || !selectedItem || !quantity) return;
    if (fromSubAreaId === toSubAreaId) {
      Alert.alert("Same Area", "Source and destination must be different.");
      return;
    }
    transferMutation.mutate({
      locationId: selectedLocationId!,
      inventoryItemId: selectedItem.id,
      fromSubAreaId,
      toSubAreaId,
      quantity: parseInt(quantity, 10),
    });
  }

  function handleDone() {
    if (sessionId) {
      closeSession.mutate(
        { sessionId },
        {
          onSuccess() {
            utils.sessions.list.invalidate();
            router.back();
          },
          onError() {
            utils.sessions.list.invalidate();
            router.back();
          },
        }
      );
    } else {
      router.back();
    }
  }

  function handleRemoveTransfer(id: string) {
    setLoggedTransfers((prev) => prev.filter((t) => t.id !== id));
  }

  const canSubmit =
    !!sessionId &&
    !!fromSubAreaId &&
    !!toSubAreaId &&
    fromSubAreaId !== toSubAreaId &&
    !!selectedItem &&
    !!quantity &&
    parseInt(quantity, 10) > 0 &&
    !transferMutation.isPending;

  if (!sessionId) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#E9B44C" />
        <Text style={{ color: "#8899AA", marginTop: 12 }}>Starting session...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>Transfer Items</Text>

        {/* From Area */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>From Area</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {subAreaOptions.map((sa) => (
              <TouchableOpacity
                key={sa.id}
                style={[
                  styles.areaPill,
                  fromSubAreaId === sa.id && styles.areaPillActive,
                ]}
                onPress={() => setFromSubAreaId(sa.id)}
              >
                <Text
                  style={[
                    styles.areaPillText,
                    fromSubAreaId === sa.id && styles.areaPillTextActive,
                  ]}
                >
                  {sa.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* To Area */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>To Area</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {subAreaOptions
              .filter((sa) => sa.id !== fromSubAreaId)
              .map((sa) => (
                <TouchableOpacity
                  key={sa.id}
                  style={[
                    styles.areaPill,
                    toSubAreaId === sa.id && styles.areaPillActive,
                  ]}
                  onPress={() => setToSubAreaId(sa.id)}
                >
                  <Text
                    style={[
                      styles.areaPillText,
                      toSubAreaId === sa.id && styles.areaPillTextActive,
                    ]}
                  >
                    {sa.label}
                  </Text>
                </TouchableOpacity>
              ))}
          </ScrollView>
        </View>

        {/* Transfer summary banner */}
        {fromSubAreaId && toSubAreaId && fromSubAreaId !== toSubAreaId && (
          <View style={styles.transferBanner}>
            <Text style={styles.transferBannerText}>
              {fromLabel} → {toLabel}
            </Text>
          </View>
        )}

        {/* Item Search */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Item</Text>
          <ItemSearchBar
            locationId={selectedLocationId!}
            onItemSelected={(item) => {
              setSelectedItem(item);
              setQuantity("");
            }}
            placeholder="Search item to transfer..."
          />
        </View>

        {selectedItem && (
          <>
            <View style={styles.itemCard}>
              <Text style={styles.itemName}>{selectedItem.name}</Text>
              <Text style={styles.itemType}>
                {selectedItem.type.replace("_", " ")}
              </Text>
            </View>

            {/* Quantity */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Quantity</Text>
              <View style={styles.quantityDisplay}>
                <Text style={styles.quantityValue}>{quantity || "0"}</Text>
                <Text style={styles.quantityUnit}>{selectedItem.baseUom}</Text>
              </View>
              <NumericKeypad value={quantity} onChange={setQuantity} />
            </View>
          </>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        {loggedTransfers.length > 0 && (
          <Text style={styles.loggedTally}>
            {loggedTransfers.length} transfer{loggedTransfers.length !== 1 ? "s" : ""} logged
          </Text>
        )}
        <TouchableOpacity
          style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          <Text style={styles.submitBtnText}>
            {transferMutation.isPending ? "Transferring..." : "Confirm Transfer"}
          </Text>
        </TouchableOpacity>
        <View style={styles.bottomRow}>
          <TouchableOpacity
            style={[styles.reviewBtn, loggedTransfers.length === 0 && styles.btnDisabled]}
            onPress={() => setShowReview(true)}
            disabled={loggedTransfers.length === 0}
          >
            <Text style={styles.reviewBtnText}>
              Review ({loggedTransfers.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.doneBtn}
            onPress={handleDone}
            disabled={closeSession.isPending}
          >
            <Text style={styles.doneBtnText}>
              {closeSession.isPending ? "Closing..." : "Done"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Review Modal */}
      <Modal visible={showReview} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Review Transfers</Text>
            <TouchableOpacity onPress={() => setShowReview(false)}>
              <Text style={styles.modalClose}>Close</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.reviewList}>
            {loggedTransfers.length === 0 ? (
              <Text style={styles.reviewEmpty}>No transfers logged yet.</Text>
            ) : (
              loggedTransfers.map((t) => (
                <View key={t.id} style={styles.reviewRow}>
                  <View style={styles.reviewInfo}>
                    <Text style={styles.reviewItemName}>{t.itemName}</Text>
                    <Text style={styles.reviewItemMeta}>
                      {t.from} → {t.to}
                    </Text>
                  </View>
                  <View style={styles.reviewActions}>
                    <Text style={styles.reviewQty}>
                      {t.quantity} {t.uom}
                    </Text>
                    <TouchableOpacity
                      onPress={() => handleRemoveTransfer(t.id)}
                    >
                      <Text style={styles.deleteIcon}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 140 },
  heading: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#EAF0FF",
    marginBottom: 16,
  },
  section: { marginBottom: 20 },
  sectionLabel: {
    color: "#8899AA",
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  areaPill: {
    backgroundColor: "#16283F",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  areaPillActive: {
    backgroundColor: "#1E3550",
    borderColor: "#E9B44C",
  },
  areaPillText: { color: "#8899AA", fontSize: 13, fontWeight: "500" },
  areaPillTextActive: { color: "#E9B44C" },
  transferBanner: {
    backgroundColor: "#1E3550",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    marginBottom: 16,
  },
  transferBannerText: { color: "#2BA8A0", fontSize: 15, fontWeight: "600" },
  itemCard: {
    backgroundColor: "#16283F",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  itemName: { fontSize: 18, fontWeight: "600", color: "#EAF0FF" },
  itemType: {
    fontSize: 13,
    color: "#5A6A7A",
    textTransform: "capitalize",
    marginTop: 4,
  },
  quantityDisplay: { alignItems: "center", marginBottom: 16 },
  quantityValue: { fontSize: 48, fontWeight: "bold", color: "#EAF0FF" },
  quantityUnit: { color: "#5A6A7A", fontSize: 14, marginTop: 4 },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingTop: 8,
    backgroundColor: "#0B1623",
    borderTopWidth: 1,
    borderTopColor: "#1E3550",
  },
  loggedTally: {
    color: "#2BA8A0",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 8,
  },
  submitBtn: {
    backgroundColor: "#E9B44C",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 10,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: "#0B1623", fontSize: 17, fontWeight: "700" },
  bottomRow: {
    flexDirection: "row",
    gap: 10,
  },
  reviewBtn: {
    flex: 1,
    backgroundColor: "#16283F",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E9B44C",
  },
  reviewBtnText: { color: "#E9B44C", fontSize: 16, fontWeight: "600" },
  doneBtn: {
    flex: 1,
    backgroundColor: "#16283F",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  doneBtnText: { color: "#8899AA", fontSize: 16, fontWeight: "600" },
  btnDisabled: { opacity: 0.4 },

  // Review modal
  modalContainer: { flex: 1, backgroundColor: "#0B1623", paddingTop: 60 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  modalTitle: { fontSize: 22, fontWeight: "bold", color: "#EAF0FF" },
  modalClose: { color: "#E9B44C", fontSize: 16, fontWeight: "600" },
  reviewList: { flex: 1, paddingHorizontal: 16 },
  reviewEmpty: { color: "#5A6A7A", textAlign: "center", marginTop: 40, fontSize: 15 },
  reviewRow: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  reviewInfo: { flex: 1, marginRight: 12 },
  reviewItemName: { color: "#EAF0FF", fontSize: 15, fontWeight: "600" },
  reviewItemMeta: {
    color: "#2BA8A0",
    fontSize: 12,
    marginTop: 2,
  },
  reviewActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  reviewQty: {
    color: "#E9B44C",
    fontSize: 16,
    fontWeight: "700",
    minWidth: 50,
    textAlign: "right",
  },
  deleteIcon: {
    color: "#dc2626",
    fontSize: 18,
    fontWeight: "700",
    paddingHorizontal: 4,
  },
});
