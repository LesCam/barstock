import { useState, useMemo } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, Modal, StyleSheet } from "react-native";
import { trpc } from "@/lib/trpc";
import { BarcodeScanner } from "./BarcodeScanner";

interface InventoryItem {
  id: string;
  name: string;
  type: string;
  barcode: string | null;
  packSize: unknown;
  containerSize: unknown;
  baseUom: string;
}

interface ItemSearchBarProps {
  locationId: string;
  onItemSelected: (item: InventoryItem) => void;
  itemTypeFilter?: string[];
  placeholder?: string;
}

export function ItemSearchBar({
  locationId,
  onItemSelected,
  itemTypeFilter,
  placeholder = "Search items or scan barcode...",
}: ItemSearchBarProps) {
  const [query, setQuery] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);

  const { data: items } = trpc.inventory.list.useQuery(
    { locationId },
    { enabled: !!locationId }
  );

  const barcodeLookup = trpc.inventory.getByBarcode.useQuery(
    { locationId, barcode: "" },
    { enabled: false }
  );
  const utils = trpc.useUtils();

  const filteredItems = useMemo(() => {
    if (!items) return [];
    let list = items as InventoryItem[];
    if (itemTypeFilter?.length) {
      list = list.filter((i) => itemTypeFilter.includes(i.type));
    }
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.barcode && i.barcode.includes(q)) ||
        (i.containerSize != null && String(Number(i.containerSize)).includes(q))
    );
  }, [items, query, itemTypeFilter]);

  function handleSelect(item: InventoryItem) {
    setQuery("");
    setShowResults(false);
    setScanError(null);
    onItemSelected(item);
  }

  async function handleScan(barcode: string) {
    setShowScanner(false);
    setScanError(null);
    try {
      const item = await utils.inventory.getByBarcode.fetch({
        locationId,
        barcode,
      });
      if (item) {
        handleSelect(item as InventoryItem);
      } else {
        setScanError(`No item found for barcode ${barcode}`);
      }
    } catch {
      setScanError(`No item found for barcode ${barcode}`);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            setShowResults(true);
            setScanError(null);
          }}
          onFocus={() => setShowResults(true)}
          placeholder={placeholder}
          placeholderTextColor="#5A6A7A"
          returnKeyType="search"
        />
        <TouchableOpacity
          style={styles.scanBtn}
          onPress={() => setShowScanner(true)}
        >
          <Text style={styles.scanIcon}>⊞</Text>
        </TouchableOpacity>
      </View>

      {scanError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{scanError}</Text>
        </View>
      )}

      {showResults && query.trim().length > 0 && (
        <View style={styles.dropdown}>
          <FlatList
            data={filteredItems}
            keyExtractor={(i) => i.id}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.resultRow}
                onPress={() => handleSelect(item)}
              >
                <Text style={styles.resultName}>{item.name}</Text>
                <Text style={styles.resultMeta}>
                  {item.type.replace("_", " ")}
                  {item.containerSize != null ? ` · ${Number(item.containerSize)}ml` : ""}
                  {item.barcode ? ` · ${item.barcode}` : ""}
                </Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No matching items</Text>
            }
          />
        </View>
      )}

      <Modal visible={showScanner} animationType="slide">
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 10,
  },
  inputRow: {
    flexDirection: "row",
    gap: 8,
  },
  input: {
    flex: 1,
    height: 48,
    backgroundColor: "#16283F",
    borderRadius: 10,
    paddingHorizontal: 14,
    color: "#EAF0FF",
    fontSize: 15,
  },
  scanBtn: {
    width: 48,
    height: 48,
    backgroundColor: "#E9B44C",
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  scanIcon: {
    fontSize: 22,
    color: "#0B1623",
    fontWeight: "bold",
  },
  errorBox: {
    marginTop: 8,
    backgroundColor: "#3B1A1A",
    borderRadius: 8,
    padding: 10,
  },
  errorText: {
    color: "#F87171",
    fontSize: 13,
  },
  dropdown: {
    position: "absolute",
    top: 56,
    left: 0,
    right: 0,
    backgroundColor: "#16283F",
    borderRadius: 10,
    maxHeight: 240,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  list: {
    borderRadius: 10,
  },
  resultRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3550",
  },
  resultName: {
    color: "#EAF0FF",
    fontSize: 15,
    fontWeight: "500",
  },
  resultMeta: {
    color: "#5A6A7A",
    fontSize: 12,
    marginTop: 2,
    textTransform: "capitalize",
  },
  emptyText: {
    color: "#5A6A7A",
    textAlign: "center",
    padding: 16,
    fontSize: 13,
  },
});
