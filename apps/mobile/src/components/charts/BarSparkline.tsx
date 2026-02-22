import { View, StyleSheet } from "react-native";

interface BarSparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function BarSparkline({
  data,
  width = 60,
  height = 24,
  color = "#4FC3F7",
}: BarSparklineProps) {
  if (!data.length) return null;

  const max = Math.max(...data, 1);
  const barWidth = Math.max(2, (width - (data.length - 1) * 2) / data.length);

  return (
    <View style={[styles.container, { width, height }]}>
      {data.map((value, i) => {
        const barHeight = Math.max(1, (value / max) * height);
        return (
          <View
            key={i}
            style={{
              width: barWidth,
              height: barHeight,
              backgroundColor: color,
              borderRadius: 1,
              marginLeft: i > 0 ? 2 : 0,
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
});
