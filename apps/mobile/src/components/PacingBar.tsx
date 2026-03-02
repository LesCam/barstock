import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

interface PacingBarProps {
  elapsedMs: number;
  lineCount: number;
  targetItemsPerHour: number | null;
  breakAfterItems: number;
  breakAfterMinutes: number;
  fatigueDetected: boolean;
  lastBreakAt: { items: number; timeMs: number } | null;
  onDismissBreak: () => void;
}

export function PacingBar({
  elapsedMs,
  lineCount,
  targetItemsPerHour,
  breakAfterItems,
  breakAfterMinutes,
  fatigueDetected,
  lastBreakAt,
  onDismissBreak,
}: PacingBarProps) {
  // Current rate
  const hours = elapsedMs / 3600000;
  const currentRate = hours > 0 ? lineCount / hours : 0;

  // Rate color relative to target
  let rateColor = "#8899B2"; // muted when no target
  if (targetItemsPerHour != null && targetItemsPerHour > 0) {
    const ratio = currentRate / targetItemsPerHour;
    rateColor = ratio >= 1.0 ? "#22C55E" : ratio >= 0.8 ? "#E9B44C" : "#EF4444";
  }

  // Break tracking
  const itemsSinceBreak = lineCount - (lastBreakAt?.items ?? 0);
  const msSinceBreak = elapsedMs - (lastBreakAt?.timeMs ?? 0);
  const minutesSinceBreak = msSinceBreak / 60000;
  const breakProgress = Math.min(1, itemsSinceBreak / breakAfterItems);

  const itemBreakDue = itemsSinceBreak >= breakAfterItems;
  const timeBreakDue = minutesSinceBreak >= breakAfterMinutes;
  const breakDue = itemBreakDue || timeBreakDue;

  // Format elapsed
  const elapsedStr = elapsedMs >= 3600000
    ? `${Math.floor(elapsedMs / 3600000)}h ${Math.floor((elapsedMs % 3600000) / 60000)}m`
    : `${Math.floor(elapsedMs / 60000)}m`;

  return (
    <View style={s.container}>
      {/* Rate + elapsed row */}
      <View style={s.rateRow}>
        <View style={s.rateLeft}>
          <Text style={[s.rateText, { color: rateColor }]}>
            {currentRate.toFixed(1)}/hr
          </Text>
          {targetItemsPerHour != null && (
            <Text style={s.targetText}>Target: {targetItemsPerHour}/hr</Text>
          )}
          {targetItemsPerHour == null && lineCount === 0 && (
            <Text style={s.targetText}>No pace data</Text>
          )}
        </View>
        <Text style={s.elapsedText}>{elapsedStr}</Text>
      </View>

      {/* Break progress bar */}
      <View style={s.breakBarTrack}>
        <View
          style={[
            s.breakBarFill,
            {
              width: `${Math.min(100, breakProgress * 100)}%`,
              backgroundColor: breakDue ? "#F59E0B" : "#2BA8A0",
            },
          ]}
        />
      </View>
      <Text style={s.breakLabel}>
        {itemsSinceBreak}/{breakAfterItems} items since break
      </Text>

      {/* Break suggestion banner */}
      {breakDue && !fatigueDetected && (
        <View style={s.breakBanner}>
          <Text style={s.breakBannerText}>
            Consider a short break
            {timeBreakDue ? ` (${Math.round(minutesSinceBreak)}min)` : ""}
          </Text>
          <TouchableOpacity onPress={onDismissBreak} style={s.dismissBtn}>
            <Text style={s.dismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Fatigue alert */}
      {fatigueDetected && (
        <View style={s.fatigueBanner}>
          <Text style={s.fatigueBannerText}>
            Your accuracy may be declining. Take a 5-minute break?
          </Text>
          <TouchableOpacity onPress={onDismissBreak} style={s.dismissBtn}>
            <Text style={s.dismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: "rgba(15,29,46,0.6)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  rateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rateLeft: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  rateText: {
    fontSize: 15,
    fontWeight: "700",
  },
  targetText: {
    fontSize: 11,
    color: "rgba(136,153,178,0.7)",
  },
  elapsedText: {
    fontSize: 11,
    color: "#8899B2",
  },
  breakBarTrack: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 1.5,
    marginTop: 6,
    overflow: "hidden",
  },
  breakBarFill: {
    height: 3,
    borderRadius: 1.5,
  },
  breakLabel: {
    fontSize: 10,
    color: "rgba(136,153,178,0.5)",
    marginTop: 2,
  },
  breakBanner: {
    marginTop: 6,
    backgroundColor: "rgba(245,158,11,0.15)",
    borderRadius: 8,
    padding: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.3)",
  },
  breakBannerText: {
    fontSize: 12,
    color: "#F59E0B",
    flex: 1,
    fontWeight: "500",
  },
  fatigueBanner: {
    marginTop: 6,
    backgroundColor: "rgba(249,115,22,0.15)",
    borderRadius: 8,
    padding: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(249,115,22,0.3)",
  },
  fatigueBannerText: {
    fontSize: 12,
    color: "#F97316",
    flex: 1,
    fontWeight: "500",
  },
  dismissBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginLeft: 8,
  },
  dismissText: {
    fontSize: 11,
    color: "#EAF0FF",
    fontWeight: "600",
  },
});
