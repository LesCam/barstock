import { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Alert } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import * as Crypto from "expo-crypto";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";
import { useNetwork } from "@/lib/network-context";
import { enqueue } from "@/lib/offline-queue";
import { NumericKeypad } from "@/components/NumericKeypad";

interface TapEntry {
  tapLineId: string;
  tapName: string;
  barArea: string | null;
  productName: string;
  inventoryItemId: string;
  kegInstanceId: string;
  percentRemaining: string;
}

export default function DraftVerifyScreen() {
  const { id: sessionId, subAreaId, areaName } = useLocalSearchParams<{
    id: string;
    subAreaId?: string;
    areaName?: string;
  }>();
  const { selectedLocationId, user: authUser } = useAuth();
  const utils = trpc.useUtils();
  const { isOnline } = useNetwork();

  const { data: tapLines, isLoading } = trpc.draft.listTapLines.useQuery(
    { locationId: selectedLocationId! },
    { enabled: !!selectedLocationId }
  );

  const [entries, setEntries] = useState<Record<string, string>>({});
  const [expandedTapId, setExpandedTapId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const addLineMutation = trpc.sessions.addLine.useMutation();

  // Filter to taps with active keg assignment
  const assignedTaps: TapEntry[] = (tapLines ?? [])
    .filter((tap: any) => tap.tapAssignments?.length > 0 && tap.tapAssignments[0].kegInstance)
    .map((tap: any) => {
      const assignment = tap.tapAssignments[0];
      return {
        tapLineId: tap.id,
        tapName: tap.name,
        barArea: tap.barArea?.name ?? null,
        productName: assignment.kegInstance.inventoryItem.name,
        inventoryItemId: assignment.kegInstance.inventoryItemId,
        kegInstanceId: assignment.kegInstanceId,
        percentRemaining: entries[tap.id] ?? "",
      };
    });

  function updateEntry(tapLineId: string, value: string) {
    // Clamp to 100
    const num = parseInt(value, 10);
    if (value && num > 100) return;
    setEntries((prev) => ({ ...prev, [tapLineId]: value }));
  }

  function toggleExpand(tapLineId: string) {
    setExpandedTapId((prev) => (prev === tapLineId ? null : tapLineId));
  }

  const tapsWithData = assignedTaps.filter((t) => entries[t.tapLineId]?.length > 0);

  async function handleSubmitAll() {
    if (tapsWithData.length === 0) return;
    setSubmitting(true);

    if (!isOnline) {
      // Queue all tap entries for offline sync
      for (const tap of tapsWithData) {
        const tempId = Crypto.randomUUID();
        const input = {
          sessionId: sessionId!,
          inventoryItemId: tap.inventoryItemId,
          tapLineId: tap.tapLineId,
          kegInstanceId: tap.kegInstanceId,
          percentRemaining: parseInt(entries[tap.tapLineId], 10),
          isManual: false,
          subAreaId: subAreaId || undefined,
        };
        await enqueue("sessions.addLine", input, tempId);

        // Optimistic cache update
        utils.sessions.getById.setData({ id: sessionId! }, (old: any) => {
          if (!old) return old;
          return {
            ...old,
            lines: [...old.lines, {
              id: tempId,
              sessionId,
              inventoryItemId: tap.inventoryItemId,
              grossWeightGrams: null,
              countUnits: null,
              percentRemaining: parseInt(entries[tap.tapLineId], 10),
              isManual: false,
              subAreaId: subAreaId || null,
              countedBy: authUser?.userId ?? null,
              createdAt: new Date().toISOString(),
              inventoryItem: { name: tap.productName, barcode: null, baseUom: "", category: null },
              subArea: null,
              countedByUser: authUser ? { email: authUser.email, firstName: authUser.email.split("@")[0] } : null,
              _pendingSync: true,
            }],
          };
        });
      }
      setSubmitting(false);
      Alert.alert("Queued Offline", `${tapsWithData.length} tap(s) saved for sync.`, [
        { text: "OK", onPress: () => router.back() },
      ]);
      return;
    }

    try {
      await Promise.all(
        tapsWithData.map((tap) =>
          addLineMutation.mutateAsync({
            sessionId: sessionId!,
            inventoryItemId: tap.inventoryItemId,
            tapLineId: tap.tapLineId,
            kegInstanceId: tap.kegInstanceId,
            percentRemaining: parseInt(entries[tap.tapLineId], 10),
            isManual: false,
            subAreaId: subAreaId || undefined,
          })
        )
      );
      utils.sessions.getById.invalidate({ id: sessionId! });
      Alert.alert("Success", `${tapsWithData.length} tap(s) submitted.`, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert("Error", error.message ?? "Failed to submit tap data.");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Loading tap lines...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {areaName && (
        <View style={styles.areaBanner}>
          <Text style={styles.areaBannerText}>{areaName}</Text>
        </View>
      )}
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Draft Verify</Text>
        <Text style={styles.headerCount}>
          {assignedTaps.length} Tap{assignedTaps.length !== 1 ? "s" : ""} Assigned
        </Text>
      </View>

      <FlatList
        data={assignedTaps}
        keyExtractor={(t) => t.tapLineId}
        contentContainerStyle={styles.listContent}
        renderItem={({ item: tap }) => {
          const isExpanded = expandedTapId === tap.tapLineId;
          const value = entries[tap.tapLineId] ?? "";

          return (
            <View style={styles.tapCard}>
              <TouchableOpacity
                style={styles.tapHeader}
                onPress={() => toggleExpand(tap.tapLineId)}
                activeOpacity={0.7}
              >
                <View style={styles.tapInfo}>
                  <Text style={styles.tapName}>{tap.tapName}</Text>
                  {tap.barArea && (
                    <Text style={styles.tapArea}>{tap.barArea}</Text>
                  )}
                  <Text style={styles.tapProduct}>{tap.productName}</Text>
                </View>
                <View style={styles.tapValueBox}>
                  <Text style={[styles.tapValue, value ? styles.tapValueFilled : null]}>
                    {value ? `${value}%` : "—"}
                  </Text>
                </View>
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.tapExpanded}>
                  <View style={styles.percentDisplay}>
                    <Text style={styles.percentValue}>{value || "0"}</Text>
                    <Text style={styles.percentSign}>%</Text>
                  </View>
                  <NumericKeypad
                    value={value}
                    onChange={(v) => updateEntry(tap.tapLineId, v)}
                    maxLength={3}
                  />
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              No taps with active kegs assigned.
            </Text>
            <Text style={styles.emptySubtext}>
              Assign kegs to tap lines from the Draft management page.
            </Text>
          </View>
        }
      />

      {assignedTaps.length > 0 && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.submitBtn,
              (tapsWithData.length === 0 || submitting) && styles.submitBtnDisabled,
            ]}
            onPress={handleSubmitAll}
            disabled={tapsWithData.length === 0 || submitting}
          >
            <Text style={styles.submitBtnText}>
              {submitting
                ? "Submitting..."
                : `Submit All — ${tapsWithData.length} tap${tapsWithData.length !== 1 ? "s" : ""}`}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B1623",
  },
  loading: {
    textAlign: "center",
    color: "#5A6A7A",
    marginTop: 40,
    fontSize: 14,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    padding: 16,
    paddingBottom: 8,
  },
  heading: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#EAF0FF",
  },
  areaBanner: {
    backgroundColor: "#1E3550",
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
    marginBottom: 8,
  },
  areaBannerText: { color: "#E9B44C", fontSize: 14, fontWeight: "600" },
  headerCount: {
    fontSize: 14,
    color: "#E9B44C",
    fontWeight: "600",
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 100,
  },
  tapCard: {
    backgroundColor: "#16283F",
    borderRadius: 12,
    marginBottom: 10,
    overflow: "hidden",
  },
  tapHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  tapInfo: {
    flex: 1,
  },
  tapName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#EAF0FF",
  },
  tapArea: {
    fontSize: 12,
    color: "#5A6A7A",
    marginTop: 2,
  },
  tapProduct: {
    fontSize: 14,
    color: "#8899AA",
    marginTop: 4,
  },
  tapValueBox: {
    backgroundColor: "#1E3550",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 60,
    alignItems: "center",
  },
  tapValue: {
    fontSize: 16,
    color: "#5A6A7A",
    fontWeight: "600",
  },
  tapValueFilled: {
    color: "#E9B44C",
  },
  tapExpanded: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: "#1E3550",
  },
  percentDisplay: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    marginVertical: 16,
  },
  percentValue: {
    fontSize: 48,
    fontWeight: "bold",
    color: "#EAF0FF",
  },
  percentSign: {
    fontSize: 24,
    color: "#5A6A7A",
    marginLeft: 4,
  },
  emptyBox: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    color: "#5A6A7A",
    fontSize: 15,
    fontWeight: "500",
  },
  emptySubtext: {
    color: "#3D4F63",
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: "#0B1623",
    borderTopWidth: 1,
    borderTopColor: "#1E3550",
  },
  submitBtn: {
    backgroundColor: "#E9B44C",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    color: "#0B1623",
    fontSize: 17,
    fontWeight: "700",
  },
});
