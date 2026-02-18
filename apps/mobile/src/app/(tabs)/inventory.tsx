import { View, Text, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { router } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";

function formatStock(
  qty: number | null,
  containerSize: unknown,
  baseUom: string,
  type: string
): string {
  if (qty === null || qty === 0) return "\u2014";

  if (type === "packaged_beer") {
    return `${qty} units`;
  }

  const size = containerSize ? Number(containerSize) : null;

  if (size && size > 0) {
    const full = Math.floor(qty);
    const partial = qty - full;
    const pct = Math.round(partial * 100);

    if (full > 0 && pct > 0) return `${full} full + ${pct}%`;
    if (full > 0) return `${full} full`;
    return `${pct}%`;
  }

  return `${qty} ${baseUom}`;
}

export default function InventoryTab() {
  const { selectedLocationId } = useAuth();
  const { data: items } = trpc.inventory.listWithStock.useQuery(
    { locationId: selectedLocationId! },
    { enabled: !!selectedLocationId }
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push(`/inventory/${item.id}` as any)}
            activeOpacity={0.7}
          >
            <View style={styles.info}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.type}>{item.type.replace("_", " ")}</Text>
            </View>
            <Text style={styles.stock}>
              {formatStock(
                item.onHandQty,
                item.containerSize,
                item.baseUom,
                item.type
              )}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No inventory items.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623" },
  row: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#16283F", padding: 16,
    borderBottomWidth: 1, borderBottomColor: "#1E3550",
  },
  info: { flex: 1, marginRight: 12 },
  name: { fontSize: 15, fontWeight: "500", color: "#EAF0FF" },
  type: { fontSize: 12, color: "#5A6A7A", marginTop: 2, textTransform: "capitalize" },
  stock: { fontSize: 14, fontWeight: "600", color: "#4FC3F7" },
  empty: { textAlign: "center", color: "#5A6A7A", marginTop: 40, fontSize: 14 },
});
