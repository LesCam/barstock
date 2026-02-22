import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { trpc } from "@/lib/trpc";
import { UsageChartCard } from "@/components/charts/UsageChartCard";
import { useParStatus } from "@/lib/use-par-status";

const PAR_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  red: { label: "Below Min", color: "#EF4444" },
  yellow: { label: "Below Par", color: "#FBBF24" },
  green: { label: "Above Par", color: "#4CAF50" },
};

function formatStock(
  qty: number | null,
  containerSize: unknown,
  baseUom: string,
  countingMethod: string
): string {
  if (qty === null || qty === 0) return "\u2014";

  if (countingMethod === "unit_count") {
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export default function InventoryItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: item, isLoading } = trpc.inventory.getById.useQuery({ id: id! });
  const { data: location } = trpc.inventory.lastLocation.useQuery(
    { inventoryItemId: id! },
    { enabled: !!id }
  );

  const { data: stockRows } = trpc.inventory.listWithStock.useQuery(
    { locationId: item?.locationId! },
    { enabled: !!item?.locationId }
  );

  const onHandQty = stockRows?.find((r) => r.id === id)?.onHandQty ?? null;
  const { parMap } = useParStatus(item?.locationId ?? null);
  const parInfo = id ? parMap.get(id) : undefined;

  if (isLoading || !item) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Loading...</Text>
      </View>
    );
  }

  const locationText = location
    ? `${location.areaName} \u203A ${location.subAreaName}`
    : "\u2014";

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{item.name}</Text>
      <Text style={styles.type}>{item.category?.name ?? "Uncategorized"}</Text>

      <View style={styles.card}>
        <DetailRow label="Category" value={item.category?.name ?? "Uncategorized"} />
        {item.barcode && <DetailRow label="Barcode" value={item.barcode} />}
        {item.containerSize && (
          <DetailRow
            label="Container"
            value={`${Number(item.containerSize)} ${item.containerUom ?? item.baseUom}`}
          />
        )}
        <DetailRow label="Base UOM" value={item.baseUom} />
      </View>

      <View style={styles.card}>
        <DetailRow
          label="On Hand"
          value={formatStock(onHandQty, item.containerSize, item.baseUom, item.category?.countingMethod ?? "unit_count")}
        />
        <DetailRow label="Last Location" value={locationText} />
      </View>

      <UsageChartCard itemId={id!} locationId={item.locationId} />

      {parInfo && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Par Status</Text>
          <DetailRow label="Par Level" value={String(parInfo.parLevel ?? "—")} />
          <DetailRow label="Min Level" value={String(parInfo.minLevel ?? "—")} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Status</Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: PAR_STATUS_LABELS[parInfo.status]?.color ?? "#5A6A7A" },
              ]}
            >
              <Text style={styles.statusBadgeText}>
                {PAR_STATUS_LABELS[parInfo.status]?.label ?? parInfo.status}
              </Text>
            </View>
          </View>
          {parInfo.daysToStockout !== null && (
            <DetailRow
              label="Days to Stockout"
              value={parInfo.daysToStockout <= 0 ? "Now" : `~${parInfo.daysToStockout}d`}
            />
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623", padding: 16 },
  loading: { textAlign: "center", color: "#5A6A7A", marginTop: 40 },
  title: { fontSize: 22, fontWeight: "bold", color: "#EAF0FF", marginBottom: 2 },
  type: { fontSize: 13, color: "#5A6A7A", textTransform: "capitalize", marginBottom: 20 },
  card: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3550",
  },
  detailLabel: { fontSize: 14, color: "#5A6A7A" },
  detailValue: { fontSize: 14, fontWeight: "500", color: "#EAF0FF" },
  cardTitle: { fontSize: 15, fontWeight: "600", color: "#EAF0FF", marginBottom: 8 },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusBadgeText: { fontSize: 12, fontWeight: "600", color: "#FFF" },
});
