import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

interface NumericKeypadProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  showSublabels?: boolean;
}

const SUBLABELS: Record<string, string> = {
  "1": "",
  "2": "ABC",
  "3": "DEF",
  "4": "GHI",
  "5": "JKL",
  "6": "MNO",
  "7": "PQRS",
  "8": "TUV",
  "9": "WXYZ",
  "0": "",
};

const KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["C", "0", "⌫"],
];

export function NumericKeypad({ value, onChange, maxLength = 6, showSublabels = false }: NumericKeypadProps) {
  function handlePress(key: string) {
    if (key === "C") {
      onChange("");
    } else if (key === "⌫") {
      onChange(value.slice(0, -1));
    } else {
      if (value.length >= maxLength) return;
      // Don't allow leading zeros
      const next = value === "0" ? key : value + key;
      onChange(next);
    }
  }

  return (
    <View style={styles.container}>
      {KEYS.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((key) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.key,
                key === "C" && styles.keyAction,
                key === "⌫" && styles.keyAction,
              ]}
              onPress={() => handlePress(key)}
              activeOpacity={0.6}
            >
              <Text
                style={[
                  styles.keyText,
                  (key === "C" || key === "⌫") && styles.keyActionText,
                ]}
              >
                {key}
              </Text>
              {showSublabels && SUBLABELS[key] !== undefined && (
                <Text style={styles.sublabel}>{SUBLABELS[key]}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  key: {
    flex: 1,
    height: 70,
    backgroundColor: "#16283F",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  keyAction: {
    backgroundColor: "#1E3550",
  },
  keyText: {
    fontSize: 28,
    fontWeight: "600",
    color: "#EAF0FF",
  },
  keyActionText: {
    fontSize: 22,
    color: "#8899AA",
  },
  sublabel: {
    fontSize: 10,
    color: "#5A6A7A",
    fontWeight: "500",
    letterSpacing: 1.5,
    marginTop: 1,
    height: 14,
  },
});
