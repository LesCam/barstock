import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Animated,
  Keyboard,
} from "react-native";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { trpc } from "@/lib/trpc";
import { useAuth, usePermission } from "@/lib/auth-context";
import { NumericKeypad } from "@/components/NumericKeypad";
import { CreateItemFromScanModal } from "@/components/CreateItemFromScanModal";
import { scaleManager, type ScaleReading } from "@/lib/scale/scale-manager";

type Phase =
  | "scanning"
  | "searching"
  | "looking_up"
  | "weighing"
  | "submitting"
  | "submitted"
  | "not_found"
  | "counting";

interface MatchedItem {
  id: string;
  name: string;
  barcode: string | null;
  baseUom: string;
  category?: { id: string; name: string; countingMethod: string; defaultDensity: unknown } | null;
}

export default function ScanWeighScreen() {
  const { id: sessionId, subAreaId, areaName } = useLocalSearchParams<{
    id: string;
    subAreaId?: string;
    areaName?: string;
  }>();
  const { selectedLocationId } = useAuth();
  const canTare = usePermission("canManageTareWeights");
  const utils = trpc.useUtils();

  const [phase, setPhase] = useState<Phase>("scanning");
  const [matchedItem, setMatchedItem] = useState<MatchedItem | null>(null);
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [scaleWeight, setScaleWeight] = useState<number | null>(null);
  const [scaleConnected, setScaleConnected] = useState(scaleManager.isConnected);
  const [manualWeight, setManualWeight] = useState("");
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [creatingFromScan, setCreatingFromScan] = useState<{ barcode: string } | null>(null);
  const [lastSubmittedName, setLastSubmittedName] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [unitCount, setUnitCount] = useState("");
  const searchInputRef = useRef<TextInput>(null);

  const successOpacity = useRef(new Animated.Value(0)).current;

  // Use refs so the scale listener closure always sees current values
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // Re-sync scale connection state when screen regains focus
  // (e.g. returning from connect-scale screen)
  useFocusEffect(
    useCallback(() => {
      setScaleConnected(scaleManager.isConnected);
    }, [])
  );

  // Session data for duplicate detection
  const { data: session } = trpc.sessions.getById.useQuery(
    { id: sessionId! },
    { enabled: !!sessionId }
  );

  // Inventory list for name search
  const { data: inventoryItems } = trpc.inventory.list.useQuery(
    { locationId: selectedLocationId! },
    { enabled: !!selectedLocationId }
  );

  const filteredSearchItems = useMemo(() => {
    if (!inventoryItems || !searchQuery.trim()) return [];
    const normalize = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const q = normalize(searchQuery);
    return (inventoryItems as MatchedItem[]).filter(
      (i) =>
        normalize(i.name).includes(q) ||
        normalize(i.category?.name ?? "").includes(q)
    );
  }, [inventoryItems, searchQuery]);

  // Templates for weight calculation
  const { data: templates } = trpc.scale.listTemplates.useQuery(
    { locationId: selectedLocationId! },
    { enabled: !!selectedLocationId }
  );

  const matchedTemplate = useMemo(() => {
    if (!matchedItem || !templates) return null;
    return templates.find((t: any) => t.inventoryItemId === matchedItem.id) ?? null;
  }, [matchedItem, templates]);

  const usingManual = showManualEntry || !scaleConnected || !matchedTemplate;
  const grossWeightG = usingManual
    ? (manualWeight ? parseInt(manualWeight, 10) : null)
    : scaleWeight;

  const calcQuery = trpc.scale.calculateLiquid.useQuery(
    { templateId: matchedTemplate?.id ?? "", grossWeightG: grossWeightG ?? 0 },
    { enabled: !!matchedTemplate && grossWeightG != null && grossWeightG > 0 }
  );

  const addLineMutation = trpc.sessions.addLine.useMutation();
  const recordMeasurementMutation = trpc.scale.recordMeasurement.useMutation();

  const [permission, requestPermission] = useCameraPermissions();

  // Scale listener — subscribe once, use refs for current state
  useEffect(() => {
    const unsubReading = scaleManager.onReading((reading: ScaleReading) => {
      setScaleConnected(true);
      if (reading.stable && phaseRef.current === "weighing") {
        setScaleWeight(reading.weightGrams);
      }
    });
    const unsubDisconnect = scaleManager.onDisconnect(() => {
      setScaleConnected(false);
    });
    return () => {
      unsubReading();
      unsubDisconnect();
    };
  }, []);

  // Handle barcode scan
  const handleBarcodeScan = useCallback(
    async (barcode: string) => {
      if (phaseRef.current !== "scanning") return;
      setScannedBarcode(barcode);
      setPhase("looking_up");
      setScaleWeight(null);
      setManualWeight("");
      setShowManualEntry(false);

      try {
        const item = await utils.inventory.getByBarcode.fetch({
          locationId: selectedLocationId!,
          barcode,
        });
        if (item) {
          const typedItem = item as MatchedItem;
          setMatchedItem(typedItem);
          if (typedItem.category?.countingMethod !== "weighable") {
            setPhase("counting");
          } else {
            setPhase("weighing");
          }
        } else {
          setPhase("not_found");
        }
      } catch {
        setPhase("not_found");
      }
    },
    [selectedLocationId, utils]
  );

  // Check if this item was already weighed with a similar value
  function checkForDuplicate(): { existingWeight: number } | null {
    if (!matchedItem || !session?.lines || grossWeightG == null) return null;
    for (const line of session.lines) {
      if ((line as any).inventoryItemId !== matchedItem.id) continue;
      const existing = Number((line as any).grossWeightGrams);
      if (!existing || existing <= 0) continue;
      const diff = Math.abs(existing - grossWeightG);
      // Flag if within 15% or 30g, whichever is larger
      const threshold = Math.max(existing * 0.15, 30);
      if (diff <= threshold) {
        return { existingWeight: existing };
      }
    }
    return null;
  }

  // Core submit logic (after duplicate check passes)
  async function doSubmit() {
    if (!matchedItem || grossWeightG == null || grossWeightG <= 0) return;
    setPhase("submitting");

    try {
      await addLineMutation.mutateAsync({
        sessionId: sessionId!,
        inventoryItemId: matchedItem.id,
        grossWeightGrams: grossWeightG,
        isManual: usingManual,
        subAreaId: subAreaId || undefined,
      });

      await recordMeasurementMutation.mutateAsync({
        locationId: selectedLocationId!,
        inventoryItemId: matchedItem.id,
        sessionId: sessionId!,
        grossWeightG,
        isManual: usingManual,
        confidenceLevel: usingManual ? "estimated" : "measured",
      });

      setSubmittedCount((c) => c + 1);
      setLastSubmittedName(matchedItem.name);
      utils.sessions.getById.invalidate({ id: sessionId! });

      // Flash success
      setPhase("submitted");
      Animated.sequence([
        Animated.timing(successOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.delay(800),
        Animated.timing(successOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        resetToScanning();
      });
    } catch (error: any) {
      Alert.alert("Error", error.message ?? "Failed to submit.");
      setPhase("weighing");
    }
  }

  // Submit with duplicate guard
  function handleSubmit() {
    if (!matchedItem || grossWeightG == null || grossWeightG <= 0) return;
    const dup = checkForDuplicate();
    if (dup) {
      Alert.alert(
        "Possible Duplicate",
        `${matchedItem.name} was already weighed at ${dup.existingWeight.toFixed(1)}g (now ${grossWeightG.toFixed(1)}g). Submit anyway?`,
        [
          { text: "Skip", style: "cancel", onPress: resetToScanning },
          { text: "Submit Anyway", onPress: doSubmit },
        ]
      );
    } else {
      doSubmit();
    }
  }

  function resetToScanning() {
    setPhase("scanning");
    setMatchedItem(null);
    setScannedBarcode(null);
    setScaleWeight(null);
    setManualWeight("");
    setShowManualEntry(false);
    setSearchQuery("");
    setUnitCount("");
  }

  function handleSearchSelect(item: MatchedItem) {
    Keyboard.dismiss();
    setSearchQuery("");
    setMatchedItem(item);
    if (item.category?.countingMethod !== "weighable") {
      setPhase("counting");
    } else {
      setScaleWeight(null);
      setManualWeight("");
      setShowManualEntry(false);
      setPhase("weighing");
    }
  }

  function handleSkipNotFound() {
    resetToScanning();
  }

  function handleCreateItem() {
    if (!scannedBarcode) return;
    setCreatingFromScan({ barcode: scannedBarcode });
  }

  async function handleUnitSubmit() {
    if (!matchedItem || !unitCount) return;
    const count = parseInt(unitCount, 10);
    if (isNaN(count) || count < 0) return;
    setPhase("submitting");

    try {
      await addLineMutation.mutateAsync({
        sessionId: sessionId!,
        inventoryItemId: matchedItem.id,
        countUnits: count,
        isManual: true,
        subAreaId: subAreaId || undefined,
      });

      setSubmittedCount((c) => c + 1);
      setLastSubmittedName(matchedItem.name);
      utils.sessions.getById.invalidate({ id: sessionId! });

      setPhase("submitted");
      Animated.sequence([
        Animated.timing(successOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.delay(800),
        Animated.timing(successOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        resetToScanning();
      });
    } catch (error: any) {
      Alert.alert("Error", error.message ?? "Failed to submit.");
      setPhase("counting");
    }
  }

  // Camera permission
  if (!permission) return null;
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>
          Camera permission is required to scan barcodes.
        </Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const hasTemplate = !!matchedTemplate;
  const canSubmit = grossWeightG != null && grossWeightG > 0;

  return (
    <View style={styles.container}>
      {/* Camera — always mounted */}
      <CameraView
        style={styles.camera}
        barcodeScannerSettings={{
          barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128"],
        }}
        onBarcodeScanned={
          phase === "scanning"
            ? ({ data }) => handleBarcodeScan(data)
            : undefined
        }
      />

      {/* Crosshair overlay — visible during scanning */}
      {phase === "scanning" && (
        <View style={styles.crosshairOverlay}>
          <View style={styles.crosshair} />
          <Text style={styles.crosshairText}>Scan barcode</Text>
          <TouchableOpacity
            style={styles.cantScanBtn}
            onPress={() => {
              setPhase("searching");
              setTimeout(() => searchInputRef.current?.focus(), 300);
            }}
          >
            <Text style={styles.cantScanBtnText}>Can't scan? Search by name</Text>
          </TouchableOpacity>
          {!scaleConnected && (
            <TouchableOpacity
              style={styles.manualScaleBanner}
              onPress={() =>
                router.replace(
                  `/session/${sessionId}/liquor?manual=1&subAreaId=${subAreaId ?? ""}&areaName=${encodeURIComponent(areaName ?? "")}` as any
                )
              }
            >
              <Text style={styles.manualScaleBannerText}>
                No BLE scale? Use Manual Scale
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.topBackBtn}>
          <Text style={styles.topBackText}>Back</Text>
        </TouchableOpacity>
        <View style={styles.topCenter}>
          {areaName && <Text style={styles.topAreaName}>{areaName}</Text>}
          {submittedCount > 0 && (
            <Text style={styles.topTally}>
              {submittedCount} weighed
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={[
            styles.scaleChip,
            scaleConnected ? styles.scaleChipConnected : styles.scaleChipDisconnected,
          ]}
          onPress={() => {
            if (!scaleConnected) {
              router.push(`/session/${sessionId}/connect-scale` as any);
            }
          }}
          activeOpacity={scaleConnected ? 1 : 0.7}
        >
          <Text
            style={[
              styles.scaleChipText,
              scaleConnected
                ? styles.scaleChipTextConnected
                : styles.scaleChipTextDisconnected,
            ]}
          >
            {scaleConnected ? "Scale" : "Connect"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Success flash */}
      <Animated.View
        style={[styles.successFlash, { opacity: successOpacity }]}
        pointerEvents="none"
      >
        <Text style={styles.successText}>Submitted</Text>
        {lastSubmittedName && (
          <Text style={styles.successItemName}>{lastSubmittedName}</Text>
        )}
      </Animated.View>

      {/* Looking up */}
      {phase === "looking_up" && (
        <View style={styles.bottomPanel}>
          <Text style={styles.panelText}>Looking up barcode...</Text>
        </View>
      )}

      {/* Search panel */}
      {phase === "searching" && (
        <View style={styles.searchPanel}>
          <View style={styles.searchHeader}>
            <Text style={styles.searchTitle}>Search by Name</Text>
            <TouchableOpacity onPress={resetToScanning}>
              <Text style={styles.searchCancel}>Back to Scan</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Type item name..."
            placeholderTextColor="#5A6A7A"
            returnKeyType="search"
            autoCorrect={false}
          />
          <ScrollView
            style={styles.searchResults}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {searchQuery.trim().length === 0 ? (
              <Text style={styles.searchHint}>Start typing to search</Text>
            ) : filteredSearchItems.length === 0 ? (
              <Text style={styles.searchHint}>No matching items</Text>
            ) : (
              filteredSearchItems.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.searchRow}
                  onPress={() => handleSearchSelect(item)}
                >
                  <Text style={styles.searchRowName}>{item.name}</Text>
                  <Text style={styles.searchRowMeta}>
                    {item.category?.name ?? "Uncategorized"}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      )}

      {/* Weighing panel */}
      {phase === "weighing" && matchedItem && (
        <View style={styles.bottomPanel}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <View style={styles.itemHeader}>
              <Text style={styles.itemName}>{matchedItem.name}</Text>
              <TouchableOpacity onPress={resetToScanning}>
                <Text style={styles.rescanLink}>Rescan</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.fullUnitsBtn}
              onPress={() => {
                setUnitCount("");
                setPhase("counting");
              }}
            >
              <Text style={styles.fullUnitsBtnText}>Count full units instead</Text>
            </TouchableOpacity>

            {!hasTemplate && (
              <View style={styles.noTemplateBox}>
                <Text style={styles.noTemplateText}>
                  No bottle template. Enter weight manually.
                </Text>
              </View>
            )}

            {/* Scale weight display */}
            {!showManualEntry && scaleConnected && hasTemplate && (
              <>
                <View style={styles.weightRow}>
                  <Text style={styles.weightLabel}>Scale</Text>
                  <Text style={styles.weightValue}>
                    {scaleWeight != null ? `${scaleWeight.toFixed(1)}g` : "Place on scale..."}
                  </Text>
                  <TouchableOpacity
                    style={styles.tareBtn}
                    onPress={() => {
                      scaleManager.tare();
                      setScaleWeight(null);
                    }}
                  >
                    <Text style={styles.tareBtnText}>Tare</Text>
                  </TouchableOpacity>
                </View>
                {scaleWeight != null && scaleWeight < 50 && (
                  <View style={styles.tareWarning}>
                    <Text style={styles.tareWarningText}>
                      Reading is very low — remove bottle, tap Tare to re-zero, then place bottle back.
                    </Text>
                  </View>
                )}
              </>
            )}

            {/* Manual weight entry — shown when no scale, user toggled, or no template */}
            {(!scaleConnected || showManualEntry || !hasTemplate) && (
              <View style={styles.manualSection}>
                <Text style={styles.weightLabel}>Weight (g)</Text>
                <View style={styles.manualDisplay}>
                  <Text style={styles.manualDisplayValue}>
                    {manualWeight || "0"}
                  </Text>
                  <Text style={styles.manualDisplayUnit}>g</Text>
                </View>
                <NumericKeypad
                  value={manualWeight}
                  onChange={setManualWeight}
                  maxLength={5}
                />
              </View>
            )}

            {/* Toggle between scale / manual */}
            {scaleConnected && hasTemplate && !showManualEntry && (
              <TouchableOpacity
                style={styles.modeToggle}
                onPress={() => setShowManualEntry(true)}
              >
                <Text style={styles.modeToggleText}>Enter manually instead</Text>
              </TouchableOpacity>
            )}
            {showManualEntry && scaleConnected && hasTemplate && (
              <TouchableOpacity
                style={styles.modeToggle}
                onPress={() => { setShowManualEntry(false); setManualWeight(""); }}
              >
                <Text style={styles.modeToggleText}>Use scale instead</Text>
              </TouchableOpacity>
            )}

            {/* Calculation display */}
            {calcQuery.data && (
              <View style={styles.calcRow}>
                <Text style={styles.calcText}>
                  ~{calcQuery.data.liquidOz} oz ({calcQuery.data.percentRemaining}% full)
                </Text>
              </View>
            )}

            {/* Submit */}
            <TouchableOpacity
              style={[
                styles.submitBtn,
                (!canSubmit || addLineMutation.isPending) && styles.submitBtnDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!canSubmit || addLineMutation.isPending}
            >
              <Text style={styles.submitBtnText}>
                {addLineMutation.isPending ? "Submitting..." : "Submit"}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* Not found panel */}
      {phase === "not_found" && (
        <View style={styles.bottomPanel}>
          <Text style={styles.notFoundTitle}>Barcode Not Found</Text>
          <Text style={styles.notFoundBarcode}>{scannedBarcode}</Text>
          <View style={styles.notFoundActions}>
            {canTare && (
              <TouchableOpacity style={styles.createBtn} onPress={handleCreateItem}>
                <Text style={styles.createBtnText}>Create Item</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.skipBtn} onPress={handleSkipNotFound}>
              <Text style={styles.skipBtnText}>Skip</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Unit count panel */}
      {phase === "counting" && matchedItem && (
        <View style={styles.bottomPanel}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
          <View style={styles.itemHeader}>
            <Text style={styles.itemName}>{matchedItem.name}</Text>
            <TouchableOpacity onPress={resetToScanning}>
              <Text style={styles.rescanLink}>Rescan</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.countingLabel}>
            {matchedItem.category?.name ?? "Unit Count"}
          </Text>
          <View style={styles.unitCountDisplay}>
            <Text style={styles.unitCountValue}>{unitCount || "0"}</Text>
            <Text style={styles.unitCountUnit}>
              {matchedItem.baseUom || "units"}
            </Text>
          </View>
          <NumericKeypad value={unitCount} onChange={setUnitCount} />
          {matchedItem.category?.countingMethod === "weighable" && (
            <TouchableOpacity
              style={styles.modeToggle}
              onPress={() => {
                setManualWeight("");
                setScaleWeight(null);
                setShowManualEntry(false);
                setPhase("weighing");
              }}
            >
              <Text style={styles.modeToggleText}>Weigh instead</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[
              styles.submitBtn,
              { marginTop: 8 },
              (unitCount === "" || addLineMutation.isPending) && styles.submitBtnDisabled,
            ]}
            onPress={handleUnitSubmit}
            disabled={unitCount === "" || addLineMutation.isPending}
          >
            <Text style={styles.submitBtnText}>
              {addLineMutation.isPending ? "Submitting..." : "Submit Count"}
            </Text>
          </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* Create item from scan modal */}
      {creatingFromScan && (
        <CreateItemFromScanModal
          barcode={creatingFromScan.barcode}
          locationId={selectedLocationId!}
          onSuccess={() => {
            utils.scale.listTemplates.invalidate({ locationId: selectedLocationId! });
            setCreatingFromScan(null);
            resetToScanning();
          }}
          onCancel={() => {
            setCreatingFromScan(null);
            resetToScanning();
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },

  // Permission screen
  permissionText: {
    color: "#fff",
    textAlign: "center",
    marginTop: 80,
    fontSize: 16,
    paddingHorizontal: 32,
  },
  permissionBtn: {
    backgroundColor: "#2BA8A0",
    margin: 20,
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  permissionBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  backBtn: { margin: 20, padding: 14, alignItems: "center" },
  backBtnText: { color: "#aaa", fontSize: 14 },

  // Crosshair
  crosshairOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  crosshair: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
    borderRadius: 12,
  },
  crosshairText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    marginTop: 12,
    fontWeight: "500",
  },
  cantScanBtn: {
    marginTop: 20,
    backgroundColor: "rgba(30,53,80,0.9)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#8899AA",
  },
  cantScanBtnText: {
    color: "#EAF0FF",
    fontSize: 14,
    fontWeight: "600",
  },
  manualScaleBanner: {
    marginTop: 24,
    backgroundColor: "rgba(30,53,80,0.9)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E9B44C",
  },
  manualScaleBannerText: {
    color: "#E9B44C",
    fontSize: 14,
    fontWeight: "600",
  },

  // Top bar
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "rgba(11,22,35,0.85)",
  },
  topBackBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  topBackText: {
    color: "#E9B44C",
    fontSize: 16,
    fontWeight: "600",
  },
  topCenter: {
    alignItems: "center",
    flex: 1,
  },
  topAreaName: {
    color: "#EAF0FF",
    fontSize: 14,
    fontWeight: "600",
  },
  topTally: {
    color: "#2BA8A0",
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  scaleChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  scaleChipConnected: {
    backgroundColor: "rgba(43,168,160,0.2)",
    borderColor: "#2BA8A0",
  },
  scaleChipDisconnected: {
    backgroundColor: "rgba(220,38,38,0.15)",
    borderColor: "#dc2626",
  },
  scaleChipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  scaleChipTextConnected: { color: "#2BA8A0" },
  scaleChipTextDisconnected: { color: "#dc2626" },

  // Success flash
  successFlash: {
    position: "absolute",
    top: "40%",
    alignSelf: "center",
    backgroundColor: "rgba(34,197,94,0.9)",
    paddingHorizontal: 32,
    paddingVertical: 20,
    borderRadius: 16,
    alignItems: "center",
  },
  successText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
  },
  successItemName: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    marginTop: 4,
  },

  // Bottom panel
  bottomPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#0B1623",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
    maxHeight: "65%",
  },
  panelText: {
    color: "#8899AA",
    fontSize: 15,
    textAlign: "center",
    paddingVertical: 20,
  },

  // Item header
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  itemName: {
    color: "#EAF0FF",
    fontSize: 18,
    fontWeight: "600",
    flex: 1,
  },
  rescanLink: {
    color: "#E9B44C",
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 12,
  },
  fullUnitsBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#2BA8A0",
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "rgba(43,168,160,0.1)",
  },
  fullUnitsBtnText: {
    color: "#2BA8A0",
    fontSize: 14,
    fontWeight: "600",
  },

  // No template
  noTemplateBox: {
    backgroundColor: "#3B2A1A",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#6B4C2A",
  },
  noTemplateText: {
    color: "#AA9070",
    fontSize: 13,
  },

  // Weight display
  weightRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  weightLabel: {
    color: "#8899AA",
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  weightValue: {
    color: "#E9B44C",
    fontSize: 24,
    fontWeight: "bold",
  },

  // Tare warning
  tareWarning: {
    backgroundColor: "#3B2A1A",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#6B4C2A",
  },
  tareWarningText: {
    color: "#E9B44C",
    fontSize: 13,
  },
  tareBtn: {
    backgroundColor: "#E9B44C",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tareBtnText: {
    color: "#0B1623",
    fontSize: 13,
    fontWeight: "700",
  },

  // Manual entry
  manualSection: {
    marginBottom: 10,
  },
  manualDisplay: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    marginBottom: 10,
  },
  manualDisplayValue: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#EAF0FF",
  },
  manualDisplayUnit: {
    fontSize: 18,
    fontWeight: "600",
    color: "#5A6A7A",
    marginLeft: 6,
  },
  modeToggle: {
    paddingVertical: 10,
    alignItems: "center",
    marginBottom: 6,
  },
  modeToggleText: {
    color: "#8899AA",
    fontSize: 14,
    fontWeight: "500",
    textDecorationLine: "underline",
  },

  // Calculation
  calcRow: {
    backgroundColor: "#16283F",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    alignItems: "center",
  },
  calcText: {
    color: "#EAF0FF",
    fontSize: 14,
    fontWeight: "500",
  },

  // Submit
  submitBtn: {
    backgroundColor: "#E9B44C",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: {
    color: "#0B1623",
    fontSize: 17,
    fontWeight: "700",
  },

  // Not found
  notFoundTitle: {
    color: "#E9B44C",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 6,
  },
  notFoundBarcode: {
    color: "#5A6A7A",
    fontSize: 14,
    fontFamily: "monospace",
    marginBottom: 16,
  },
  notFoundActions: {
    flexDirection: "row",
    gap: 10,
  },
  createBtn: {
    flex: 1,
    backgroundColor: "#2BA8A0",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  createBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  skipBtn: {
    flex: 1,
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  skipBtnText: {
    color: "#8899AA",
    fontSize: 15,
    fontWeight: "600",
  },

  // Unit counting
  countingLabel: {
    color: "#8899AA",
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  unitCountDisplay: {
    alignItems: "center",
    marginBottom: 14,
  },
  unitCountValue: {
    fontSize: 48,
    fontWeight: "bold",
    color: "#EAF0FF",
  },
  unitCountUnit: {
    color: "#5A6A7A",
    fontSize: 14,
    marginTop: 4,
  },

  // Search panel
  searchPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#0B1623",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
    maxHeight: "75%",
  },
  searchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  searchTitle: {
    color: "#EAF0FF",
    fontSize: 18,
    fontWeight: "600",
  },
  searchCancel: {
    color: "#E9B44C",
    fontSize: 14,
    fontWeight: "600",
  },
  searchInput: {
    height: 48,
    backgroundColor: "#16283F",
    borderRadius: 10,
    paddingHorizontal: 14,
    color: "#EAF0FF",
    fontSize: 15,
    marginBottom: 10,
  },
  searchResults: {
    flex: 1,
  },
  searchHint: {
    color: "#5A6A7A",
    textAlign: "center",
    padding: 20,
    fontSize: 14,
  },
  searchRow: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3550",
  },
  searchRowName: {
    color: "#EAF0FF",
    fontSize: 15,
    fontWeight: "500",
  },
  searchRowMeta: {
    color: "#5A6A7A",
    fontSize: 12,
    marginTop: 2,
    textTransform: "capitalize",
  },
});
