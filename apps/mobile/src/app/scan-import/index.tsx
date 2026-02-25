import { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { router as navRouter, useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";
import { UOM } from "@barstock/types";

interface StagedItem {
  id: string;
  barcode: string;
  name: string;
  categoryId: string;
  categoryName: string;
  baseUom: string;
  containerSizeMl?: number;
  emptyBottleWeightG?: number;
  fullBottleWeightG?: number;
  densityGPerMl?: number;
  share: boolean;
  fromMasterDb: boolean;
}

type Phase = "scanning" | "form" | "prefilled" | "pairing";

const UOM_OPTIONS = Object.values(UOM);

export default function ScanImportScreen() {
  const { bridgeSession } = useLocalSearchParams<{ bridgeSession?: string }>();
  const { selectedLocationId, user } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const utils = trpc.useUtils();

  // Phase & scanning state
  const [phase, setPhase] = useState<Phase>("scanning");
  const [scanEnabled, setScanEnabled] = useState(true);
  const [lastBarcode, setLastBarcode] = useState<string | null>(null);

  // Staged items
  const [staged, setStaged] = useState<StagedItem[]>([]);
  const stagedBarcodes = useRef(new Set<string>());

  // Form fields (for both prefilled and manual)
  const [formBarcode, setFormBarcode] = useState("");
  const [formName, setFormName] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formBaseUom, setFormBaseUom] = useState("oz");
  const [formContainerSizeMl, setFormContainerSizeMl] = useState("");
  const [formEmptyWeight, setFormEmptyWeight] = useState("");
  const [formFullWeight, setFormFullWeight] = useState("");
  const [formDensity, setFormDensity] = useState("");
  const [formShare, setFormShare] = useState(true);
  const [masterMatch, setMasterMatch] = useState(false);

  // Importing
  const [importing, setImporting] = useState(false);

  // Bridge (Phase 2)
  const [bridgeSessionId, setBridgeSessionId] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState("");
  const [bridgeScanCount, setBridgeScanCount] = useState(0);

  // Auto-pair if arriving via deep link (once only)
  const didAutoPair = useRef(false);
  useEffect(() => {
    if (bridgeSession && !didAutoPair.current) {
      didAutoPair.current = true;
      setBridgeSessionId(bridgeSession);
      setScanEnabled(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Paired!", "Phone is now connected to the web form.", [
        { text: "OK", onPress: () => setScanEnabled(true) },
      ]);
    }
  }, [bridgeSession]);

  const addBridgeItemMutation = trpc.scanImport.addItem.useMutation();
  const removeBridgeItemMutation = trpc.scanImport.removeItem.useMutation();
  const scanBarcodeMut = trpc.scanImport.scanBarcode.useMutation();

  // Queries
  const { data: categories } = trpc.itemCategories.list.useQuery(
    { businessId: user?.businessId!, activeOnly: true },
    { enabled: !!user?.businessId }
  );

  const { data: settings } = trpc.settings.get.useQuery(
    { businessId: user?.businessId! },
    { enabled: !!user?.businessId }
  );

  const sharingEnabled = settings?.masterProductSharing?.optedIn ?? false;

  const bulkCreateMutation = trpc.inventory.bulkCreate.useMutation();
  const contributeMutation = trpc.masterProducts.contribute.useMutation();

  // Category helpers
  const categoryMap = new Map(
    (categories ?? []).map((c) => [c.id, c])
  );
  const categoryByNameLower = new Map(
    (categories ?? []).map((c) => [c.name.toLowerCase(), c])
  );

  // Handle pairing
  const handlePairWithCode = (code: string) => {
    const trimmed = code.trim();
    if (trimmed.length < 6) return;

    // Check if it's a full deep link
    const deepLinkMatch = trimmed.match(/^barstock:\/\/scan-import\/(.+)$/);
    if (deepLinkMatch) {
      setBridgeSessionId(deepLinkMatch[1]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPhase("scanning");
      setScanEnabled(true);
      setPairingCode("");
      return;
    }

    // Otherwise treat as 6-char pairing code — not enough info to reconstruct full UUID
    // The user should scan the QR code instead
    Alert.alert("Use QR Code", "Please scan the QR code shown on your computer to pair.");
    setPairingCode("");
  };

  // Handle barcode scan
  const handleBarcodeScan = useCallback(
    async (barcode: string) => {
      if (!selectedLocationId || !scanEnabled) return;

      // Check for pairing QR code
      const pairingMatch = barcode.match(/^barstock:\/\/scan-import\/(.+)$/);
      if (pairingMatch) {
        if (bridgeSessionId === pairingMatch[1]) return; // Already paired
        setBridgeSessionId(pairingMatch[1]);
        setScanEnabled(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Paired!", "Phone is now connected to the web import page.", [
          { text: "OK", onPress: () => setScanEnabled(true) },
        ]);
        return;
      }

      // Bridge mode: fire to web, brief pause, auto-resume
      // No permanent dedup — the web handles duplicates
      if (bridgeSessionId) {
        scanBarcodeMut.mutate({ scanSessionId: bridgeSessionId, barcode });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setBridgeScanCount((c) => c + 1);
        setScanEnabled(false);
        setTimeout(() => setScanEnabled(true), 1500);
        return;
      }

      // Already staged?
      if (stagedBarcodes.current.has(barcode)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert("Already Staged", `"${barcode}" is already in your import list.`);
        return;
      }

      setScanEnabled(false);
      setLastBarcode(barcode);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      try {
        // Check local inventory first
        const localItem = await utils.client.inventory.getByBarcode.query({
          locationId: selectedLocationId,
          barcode,
        });

        if (localItem) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          Alert.alert("Already in Inventory", `"${localItem.name}" already exists.`, [
            { text: "OK", onPress: () => setScanEnabled(true) },
          ]);
          return;
        }

        // Check master DB
        const masterProduct = await utils.client.masterProducts.lookup.query({ barcode });

        if (masterProduct) {
          // Pre-fill form
          setFormBarcode(barcode);
          setFormName(masterProduct.name);
          setFormBaseUom(masterProduct.baseUom);
          setFormContainerSizeMl(masterProduct.containerSizeMl ? String(Number(masterProduct.containerSizeMl)) : "");
          setFormEmptyWeight(masterProduct.emptyBottleWeightG ? String(Number(masterProduct.emptyBottleWeightG)) : "");
          setFormFullWeight(masterProduct.fullBottleWeightG ? String(Number(masterProduct.fullBottleWeightG)) : "");
          setFormDensity(masterProduct.densityGPerMl ? String(Number(masterProduct.densityGPerMl)) : "");

          // Try to match category hint
          if (masterProduct.categoryHint) {
            const match = categoryByNameLower.get(masterProduct.categoryHint.toLowerCase());
            if (match) setFormCategoryId(match.id);
            else setFormCategoryId("");
          } else {
            setFormCategoryId("");
          }

          setMasterMatch(true);
          setPhase("prefilled");
        } else {
          // No match — show empty form
          setFormBarcode(barcode);
          setFormName("");
          setFormCategoryId("");
          setFormBaseUom("oz");
          setFormContainerSizeMl("");
          setFormEmptyWeight("");
          setFormFullWeight("");
          setFormDensity("");
          setMasterMatch(false);
          setPhase("form");
        }
      } catch {
        // Network error — show manual form
        setFormBarcode(barcode);
        setFormName("");
        setFormCategoryId("");
        setMasterMatch(false);
        setPhase("form");
      }
    },
    [selectedLocationId, scanEnabled, utils, categoryByNameLower]
  );

  // Add item to staging
  const handleAddToStaging = () => {
    if (!formName.trim() || !formCategoryId) {
      Alert.alert("Missing Fields", "Name and Category are required.");
      return;
    }

    const cat = categoryMap.get(formCategoryId);
    const item: StagedItem = {
      id: `${Date.now()}-${formBarcode}`,
      barcode: formBarcode,
      name: formName.trim(),
      categoryId: formCategoryId,
      categoryName: cat?.name ?? "Unknown",
      baseUom: formBaseUom,
      containerSizeMl: formContainerSizeMl ? Number(formContainerSizeMl) : undefined,
      emptyBottleWeightG: formEmptyWeight ? Number(formEmptyWeight) : undefined,
      fullBottleWeightG: formFullWeight ? Number(formFullWeight) : undefined,
      densityGPerMl: formDensity ? Number(formDensity) : undefined,
      share: formShare && sharingEnabled,
      fromMasterDb: masterMatch,
    };

    setStaged((prev) => [...prev, item]);
    stagedBarcodes.current.add(formBarcode);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Push to web bridge if paired
    if (bridgeSessionId) {
      addBridgeItemMutation.mutate({
        scanSessionId: bridgeSessionId,
        barcode: item.barcode,
        name: item.name,
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        baseUom: item.baseUom,
        containerSizeMl: item.containerSizeMl,
        emptyBottleWeightG: item.emptyBottleWeightG,
        fullBottleWeightG: item.fullBottleWeightG,
        densityGPerMl: item.densityGPerMl,
      });
    }

    // Reset to scanning
    setPhase("scanning");
    setScanEnabled(true);
    resetForm();
  };

  const resetForm = () => {
    setFormBarcode("");
    setFormName("");
    setFormCategoryId("");
    setFormBaseUom("oz");
    setFormContainerSizeMl("");
    setFormEmptyWeight("");
    setFormFullWeight("");
    setFormDensity("");
    setFormShare(true);
    setMasterMatch(false);
  };

  const handleRemoveStaged = (id: string) => {
    setStaged((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) {
        stagedBarcodes.current.delete(item.barcode);
        // Notify bridge
        if (bridgeSessionId) {
          removeBridgeItemMutation.mutate({
            scanSessionId: bridgeSessionId,
            barcode: item.barcode,
          });
        }
      }
      return prev.filter((i) => i.id !== id);
    });
  };

  const handleCancelForm = () => {
    setPhase("scanning");
    setScanEnabled(true);
    resetForm();
  };

  // Import all staged items
  const handleImport = async () => {
    if (!selectedLocationId || staged.length === 0) return;
    setImporting(true);

    try {
      const items = staged.map((s) => ({
        name: s.name,
        categoryId: s.categoryId,
        barcode: s.barcode,
        baseUom: s.baseUom as any,
        containerSizeMl: s.containerSizeMl,
        emptyBottleWeightG: s.emptyBottleWeightG,
        fullBottleWeightG: s.fullBottleWeightG,
        densityGPerMl: s.densityGPerMl,
      }));

      const result = await bulkCreateMutation.mutateAsync({
        locationId: selectedLocationId,
        items,
      });

      // Contribute to master DB in background for items with share flag
      const toContribute = staged.filter((s) => s.share && !s.fromMasterDb);
      for (const item of toContribute) {
        try {
          await contributeMutation.mutateAsync({
            barcode: item.barcode,
            name: item.name,
            categoryHint: item.categoryName,
            baseUom: item.baseUom as any,
            containerSizeMl: item.containerSizeMl,
            emptyBottleWeightG: item.emptyBottleWeightG,
            fullBottleWeightG: item.fullBottleWeightG,
            densityGPerMl: item.densityGPerMl,
          });
        } catch {
          // Silently fail — contribution is best-effort
        }
      }

      utils.inventory.listWithStock.invalidate();
      utils.inventory.list.invalidate();

      Alert.alert(
        "Import Complete",
        `Created ${result.created} items${result.skipped > 0 ? `, skipped ${result.skipped} duplicates` : ""}.`,
        [{ text: "OK", onPress: () => navRouter.back() }]
      );
    } catch (err: any) {
      Alert.alert("Import Failed", err.message || "An error occurred.");
    } finally {
      setImporting(false);
    }
  };

  // Permission handling
  if (!permission) return null;
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionBox}>
          <Text style={styles.permissionText}>
            Camera permission is required to scan barcodes.
          </Text>
          <TouchableOpacity style={styles.grantButton} onPress={requestPermission}>
            <Text style={styles.grantButtonText}>Grant Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navRouter.back()}>
            <Text style={styles.cancelText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navRouter.back()}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan to Import</Text>
        <View style={styles.headerRight}>
          {bridgeSessionId ? (
            <View style={styles.pairedChip}>
              <View style={styles.pairedDot} />
              <Text style={styles.pairedText}>Paired</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.pairButton}
              onPress={() => {
                setPhase("pairing");
                setScanEnabled(false);
              }}
            >
              <Text style={styles.pairButtonText}>Pair Web</Text>
            </TouchableOpacity>
          )}
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{staged.length}</Text>
          </View>
        </View>
      </View>

      {/* Camera */}
      <View style={styles.cameraWrap}>
        <CameraView
          style={styles.camera}
          barcodeScannerSettings={{
            barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "qr"],
          }}
          onBarcodeScanned={
            (phase === "scanning" && scanEnabled) || phase === "pairing"
              ? ({ data }) => handleBarcodeScan(data)
              : undefined
          }
        />
        <View style={styles.overlay}>
          <View style={styles.crosshair} />
          {phase === "scanning" && (
            <Text style={styles.scanHint}>
              {bridgeSessionId
                ? `Scanning to web (${bridgeScanCount} sent)`
                : "Point camera at a barcode"}
            </Text>
          )}
        </View>
      </View>

      {/* Bottom panel */}
      {(phase === "form" || phase === "prefilled") && (
        <ScrollView
          style={styles.formPanel}
          contentContainerStyle={styles.formContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>
              {masterMatch ? "Found in Master DB" : "New Product"}
            </Text>
            <Text style={styles.formBarcode}>{formBarcode}</Text>
          </View>

          {/* Name */}
          <View style={styles.field}>
            <Text style={styles.label}>Name *</Text>
            <TextInput
              style={styles.input}
              value={formName}
              onChangeText={setFormName}
              placeholder="Product name"
              placeholderTextColor="#5A6A7A"
              autoFocus={!masterMatch}
            />
          </View>

          {/* Category */}
          <View style={styles.field}>
            <Text style={styles.label}>Category *</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryRow}
            >
              {(categories ?? []).map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.categoryChip,
                    formCategoryId === cat.id && styles.categoryChipActive,
                  ]}
                  onPress={() => setFormCategoryId(cat.id)}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      formCategoryId === cat.id && styles.categoryChipTextActive,
                    ]}
                  >
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* UOM */}
          <View style={styles.field}>
            <Text style={styles.label}>Base UOM</Text>
            <View style={styles.uomRow}>
              {UOM_OPTIONS.map((u) => (
                <TouchableOpacity
                  key={u}
                  style={[styles.uomChip, formBaseUom === u && styles.uomChipActive]}
                  onPress={() => setFormBaseUom(u)}
                >
                  <Text
                    style={[styles.uomChipText, formBaseUom === u && styles.uomChipTextActive]}
                  >
                    {u}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Weight fields (optional) */}
          <View style={styles.fieldRow}>
            <View style={styles.fieldHalf}>
              <Text style={styles.label}>Container (ml)</Text>
              <TextInput
                style={styles.input}
                value={formContainerSizeMl}
                onChangeText={setFormContainerSizeMl}
                placeholder="e.g. 750"
                placeholderTextColor="#5A6A7A"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.fieldHalf}>
              <Text style={styles.label}>Empty Weight (g)</Text>
              <TextInput
                style={styles.input}
                value={formEmptyWeight}
                onChangeText={setFormEmptyWeight}
                placeholder="e.g. 350"
                placeholderTextColor="#5A6A7A"
                keyboardType="numeric"
              />
            </View>
          </View>

          {/* Share toggle */}
          {sharingEnabled && !masterMatch && (
            <TouchableOpacity
              style={styles.shareRow}
              onPress={() => setFormShare(!formShare)}
            >
              <View style={[styles.checkbox, formShare && styles.checkboxActive]} />
              <Text style={styles.shareText}>Share to master product database</Text>
            </TouchableOpacity>
          )}

          {/* Buttons */}
          <View style={styles.formButtons}>
            <TouchableOpacity style={styles.cancelFormButton} onPress={handleCancelForm}>
              <Text style={styles.cancelFormText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.addButton, (!formName.trim() || !formCategoryId) && styles.addButtonDisabled]}
              onPress={handleAddToStaging}
              disabled={!formName.trim() || !formCategoryId}
            >
              <Text style={styles.addButtonText}>Add to List</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* Staged items list (below camera when scanning) */}
      {phase === "scanning" && staged.length > 0 && (
        <View style={styles.stagedPanel}>
          <FlatList
            data={staged}
            keyExtractor={(i) => i.id}
            style={styles.stagedList}
            renderItem={({ item }) => (
              <View style={styles.stagedRow}>
                <View style={styles.stagedInfo}>
                  <Text style={styles.stagedName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.stagedMeta}>{item.categoryName} | {item.barcode}</Text>
                </View>
                <TouchableOpacity onPress={() => handleRemoveStaged(item.id)}>
                  <Text style={styles.removeText}>Remove</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        </View>
      )}

      {/* Pairing overlay */}
      {phase === "pairing" && (
        <View style={styles.pairingPanel}>
          <Text style={styles.pairingTitle}>Pair with Web</Text>
          <Text style={styles.pairingDesc}>
            Scan the QR code shown on the web import page, or point your camera at it.
          </Text>
          <Text style={styles.pairingHint}>
            The camera above will detect the QR code automatically.
          </Text>
          <TouchableOpacity
            style={styles.pairingCancel}
            onPress={() => {
              setPhase("scanning");
              setScanEnabled(true);
            }}
          >
            <Text style={styles.pairingCancelText}>Cancel</Text>
          </TouchableOpacity>
          {bridgeSessionId && (
            <TouchableOpacity
              style={styles.unpairButton}
              onPress={() => {
                setBridgeSessionId(null);
                setPhase("scanning");
                setScanEnabled(true);
              }}
            >
              <Text style={styles.unpairText}>Disconnect</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Import bar */}
      {staged.length > 0 && phase === "scanning" && (
        <TouchableOpacity
          style={[styles.importBar, importing && styles.importBarDisabled]}
          onPress={handleImport}
          disabled={importing}
        >
          <Text style={styles.importBarText}>
            {importing ? "Importing..." : `Import ${staged.length} Item${staged.length !== 1 ? "s" : ""}`}
          </Text>
        </TouchableOpacity>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623" },
  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 10,
    backgroundColor: "#0B1623",
  },
  backText: { color: "#4FC3F7", fontSize: 15, fontWeight: "500" },
  headerTitle: { color: "#EAF0FF", fontSize: 17, fontWeight: "600" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  badge: {
    backgroundColor: "#E9B44C",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: { color: "#0B1623", fontSize: 12, fontWeight: "700" },
  pairButton: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  pairButtonText: { color: "#EAF0FF", fontSize: 12, opacity: 0.7 },
  pairedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(76,175,80,0.15)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  pairedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#4CAF50" },
  pairedText: { color: "#4CAF50", fontSize: 12, fontWeight: "600" },
  // Camera
  cameraWrap: { height: 260, position: "relative" },
  camera: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  crosshair: {
    width: 240,
    height: 120,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
    borderRadius: 10,
  },
  scanHint: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    marginTop: 12,
  },
  // Form panel
  formPanel: {
    flex: 1,
    backgroundColor: "#16283F",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  formContent: { padding: 16, paddingBottom: 40 },
  formHeader: { marginBottom: 16 },
  formTitle: { color: "#E9B44C", fontSize: 15, fontWeight: "600" },
  formBarcode: { color: "#5A6A7A", fontSize: 12, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", marginTop: 2 },
  field: { marginBottom: 14 },
  fieldRow: { flexDirection: "row", gap: 12, marginBottom: 14 },
  fieldHalf: { flex: 1 },
  label: { color: "#EAF0FF", fontSize: 12, fontWeight: "500", marginBottom: 4, opacity: 0.7 },
  input: {
    backgroundColor: "#0B1623",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#EAF0FF",
    fontSize: 14,
  },
  categoryRow: { gap: 8 },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: "#0B1623",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  categoryChipActive: {
    backgroundColor: "#E9B44C",
    borderColor: "#E9B44C",
  },
  categoryChipText: { color: "#EAF0FF", fontSize: 13 },
  categoryChipTextActive: { color: "#0B1623", fontWeight: "600" },
  uomRow: { flexDirection: "row", gap: 8 },
  uomChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: "#0B1623",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  uomChipActive: { backgroundColor: "#4FC3F7", borderColor: "#4FC3F7" },
  uomChipText: { color: "#EAF0FF", fontSize: 13 },
  uomChipTextActive: { color: "#0B1623", fontWeight: "600" },
  shareRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
  },
  checkboxActive: { backgroundColor: "#E9B44C", borderColor: "#E9B44C" },
  shareText: { color: "#EAF0FF", fontSize: 13, opacity: 0.7 },
  formButtons: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelFormButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
  },
  cancelFormText: { color: "#EAF0FF", fontSize: 14, opacity: 0.6 },
  addButton: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#E9B44C",
    alignItems: "center",
  },
  addButtonDisabled: { opacity: 0.4 },
  addButtonText: { color: "#0B1623", fontSize: 14, fontWeight: "700" },
  // Staged items
  stagedPanel: { flex: 1 },
  stagedList: { paddingHorizontal: 12 },
  stagedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#16283F",
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  stagedInfo: { flex: 1, marginRight: 12 },
  stagedName: { color: "#EAF0FF", fontSize: 14, fontWeight: "500" },
  stagedMeta: { color: "#5A6A7A", fontSize: 11, marginTop: 2 },
  removeText: { color: "#EF4444", fontSize: 12, fontWeight: "500" },
  // Pairing panel
  pairingPanel: {
    flex: 1,
    backgroundColor: "#16283F",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    alignItems: "center",
  },
  pairingTitle: { color: "#E9B44C", fontSize: 18, fontWeight: "700", marginBottom: 12 },
  pairingDesc: { color: "#EAF0FF", fontSize: 14, textAlign: "center", opacity: 0.7, marginBottom: 8 },
  pairingHint: { color: "#5A6A7A", fontSize: 12, textAlign: "center", marginBottom: 24 },
  pairingCancel: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  pairingCancelText: { color: "#EAF0FF", fontSize: 14, opacity: 0.6 },
  unpairButton: { marginTop: 16 },
  unpairText: { color: "#EF4444", fontSize: 13 },
  // Import bar
  importBar: {
    backgroundColor: "#E9B44C",
    paddingVertical: 16,
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: Platform.OS === "ios" ? 34 : 16,
    borderRadius: 12,
  },
  importBarDisabled: { opacity: 0.5 },
  importBarText: { color: "#0B1623", fontSize: 16, fontWeight: "700" },
  // Permission
  permissionBox: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  permissionText: { color: "#EAF0FF", fontSize: 16, textAlign: "center", marginBottom: 20 },
  grantButton: { backgroundColor: "#E9B44C", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  grantButtonText: { color: "#0B1623", fontSize: 15, fontWeight: "600" },
  cancelText: { color: "#5A6A7A", fontSize: 14, marginTop: 16 },
});
