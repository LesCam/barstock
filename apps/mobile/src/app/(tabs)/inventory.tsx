import { View, Text, FlatList, StyleSheet } from "react-native";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";

export default function InventoryTab() {
  const { selectedLocationId } = useAuth();
  const { data: items } = trpc.inventory.list.useQuery(
    { locationId: selectedLocationId! },
    { enabled: !!selectedLocationId }
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.type}>{item.type.replace("_", " ")}</Text>
            </View>
            <Text style={styles.uom}>{item.baseUom}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No inventory items.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  row: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#fff", padding: 16,
    borderBottomWidth: 1, borderBottomColor: "#e5e7eb",
  },
  name: { fontSize: 15, fontWeight: "500" },
  type: { fontSize: 12, color: "#666", marginTop: 2, textTransform: "capitalize" },
  uom: { fontSize: 13, color: "#999" },
  empty: { textAlign: "center", color: "#999", marginTop: 40, fontSize: 14 },
});
