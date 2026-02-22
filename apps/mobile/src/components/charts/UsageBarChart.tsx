import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

interface DataPoint {
  label: string;
  value: number;
}

interface UsageBarChartProps {
  data: DataPoint[];
  height?: number;
  barColor?: string;
  selectedColor?: string;
}

export function UsageBarChart({
  data,
  height = 160,
  barColor = "#2BA8A0",
  selectedColor = "#E9B44C",
}: UsageBarChartProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  if (!data.length) return null;

  const max = Math.max(...data.map((d) => d.value), 1);
  const chartHeight = height - 40; // room for labels + value tooltip

  return (
    <View style={{ height }}>
      {/* Selected value tooltip */}
      <View style={styles.tooltipRow}>
        {selectedIndex !== null && (
          <Text style={styles.tooltipText}>
            {data[selectedIndex].label}: {data[selectedIndex].value.toFixed(1)}
          </Text>
        )}
      </View>

      {/* Bars */}
      <View style={styles.barsContainer}>
        {data.map((d, i) => {
          const barHeight = Math.max(2, (d.value / max) * chartHeight);
          const isSelected = selectedIndex === i;
          return (
            <TouchableOpacity
              key={i}
              style={styles.barCol}
              activeOpacity={0.7}
              onPress={() => setSelectedIndex(isSelected ? null : i)}
            >
              <View style={[styles.barTrack, { height: chartHeight }]}>
                <View
                  style={{
                    width: "100%",
                    height: barHeight,
                    backgroundColor: isSelected ? selectedColor : barColor,
                    borderRadius: 3,
                  }}
                />
              </View>
              <Text
                style={[styles.xLabel, isSelected && styles.xLabelSelected]}
                numberOfLines={1}
              >
                {d.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tooltipRow: {
    height: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  tooltipText: {
    fontSize: 12,
    color: "#E9B44C",
    fontWeight: "600",
  },
  barsContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 4,
  },
  barCol: {
    flex: 1,
    alignItems: "center",
  },
  barTrack: {
    width: "100%",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 2,
  },
  xLabel: {
    fontSize: 9,
    color: "#5A6A7A",
    marginTop: 4,
    textAlign: "center",
  },
  xLabelSelected: {
    color: "#E9B44C",
  },
});
