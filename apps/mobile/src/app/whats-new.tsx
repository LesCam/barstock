import { useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

const CURRENT_VERSION = "1.9.0";
const STORAGE_KEY = "@barstock/whatsNewSeen";

interface Feature {
  text: string;
  badge?: "new" | "improved" | "fixed";
}

interface ChangelogEntry {
  version: string;
  date: string;
  features: Feature[];
}

const BADGE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  new: { bg: "rgba(34, 197, 94, 0.15)", text: "#22c55e", label: "New" },
  improved: { bg: "rgba(59, 130, 246, 0.15)", text: "#3b82f6", label: "Improved" },
  fixed: { bg: "rgba(249, 115, 22, 0.15)", text: "#f97316", label: "Fixed" },
};

const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.9.0",
    date: "Mar 2026",
    features: [
      { text: "Offline conflict resolution — review and resolve sync conflicts", badge: "new" },
      { text: "Offline session close — queue session close while offline", badge: "new" },
      { text: "Session-scoped sync queue — entries grouped by session", badge: "improved" },
      { text: "Optimistic edit/delete markers — visual pending sync indicators", badge: "improved" },
      { text: "Role-filtered help sections — see only relevant docs for your role", badge: "new" },
      { text: "Help progress tracking — track which sections you've explored", badge: "new" },
      { text: "Curator and accounting onboarding paths", badge: "new" },
      { text: "Mobile What's New screen with version tracking", badge: "new" },
      { text: "PageTip sequencing — tips appear in logical order", badge: "improved" },
    ],
  },
  {
    version: "1.8.0",
    date: "Feb 2026",
    features: [
      { text: "In-app help tips on every dashboard page", badge: "new" },
      { text: "Quick-start onboarding checklist for new users", badge: "new" },
      { text: "7 new help sections: Draft, Alerts, Analytics, Transfers, Audit, Orders, Benchmarking" },
    ],
  },
  {
    version: "1.7.0",
    date: "Jan 2026",
    features: [
      { text: "Industry benchmarking with opt-in anonymized comparisons" },
      { text: "Demand forecasting with day-of-week patterns" },
      { text: "Purchase orders with vendor breakdown and trend analysis" },
      { text: "Forecast accuracy tracking across sessions" },
    ],
  },
  {
    version: "1.6.0",
    date: "Dec 2025",
    features: [
      { text: "Predictive analytics: anomaly detection, variance forecasts" },
      { text: "Alert dashboard with frequency charts" },
      { text: "SSE real-time notifications and alert rules engine" },
      { text: "User activity timeline on the audit page" },
    ],
  },
  {
    version: "1.5.0",
    date: "Nov 2025",
    features: [
      { text: "Multi-source expected inventory" },
      { text: "Dashboard KPI summary with variance trend chart" },
      { text: "Recipe-based depletion and split ratios" },
      { text: "Par levels with auto-suggest and lead time" },
    ],
  },
];

export default function WhatsNewScreen() {
  // Mark as seen on mount
  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, CURRENT_VERSION);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>What's New</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {CHANGELOG.map((entry, idx) => (
          <View key={entry.version} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.versionBadge, idx === 0 && styles.versionBadgeLatest]}>
                <Text style={[styles.versionText, idx === 0 && styles.versionTextLatest]}>
                  v{entry.version}
                </Text>
              </View>
              <Text style={styles.dateText}>{entry.date}</Text>
              {idx === 0 && (
                <View style={styles.latestBadge}>
                  <Text style={styles.latestBadgeText}>Latest</Text>
                </View>
              )}
            </View>

            {entry.features.map((feature, fi) => (
              <View key={fi} style={styles.featureRow}>
                <View style={styles.bullet} />
                <Text style={styles.featureText}>{feature.text}</Text>
                {feature.badge && (
                  <View style={[styles.featureBadge, { backgroundColor: BADGE_COLORS[feature.badge].bg }]}>
                    <Text style={[styles.featureBadgeText, { color: BADGE_COLORS[feature.badge].text }]}>
                      {BADGE_COLORS[feature.badge].label}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export const WHATS_NEW_VERSION = CURRENT_VERSION;
export const WHATS_NEW_STORAGE_KEY = STORAGE_KEY;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3550",
  },
  backBtn: { width: 60 },
  backText: { color: "#42A5F5", fontSize: 16 },
  title: { color: "#EAF0FF", fontSize: 18, fontWeight: "700" },
  content: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1E3550",
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  versionBadge: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  versionBadgeLatest: {
    backgroundColor: "rgba(233, 180, 76, 0.2)",
  },
  versionText: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(234, 240, 255, 0.6)",
  },
  versionTextLatest: {
    color: "#E9B44C",
  },
  dateText: {
    fontSize: 12,
    color: "rgba(234, 240, 255, 0.4)",
  },
  latestBadge: {
    backgroundColor: "rgba(233, 180, 76, 0.1)",
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  latestBadgeText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#E9B44C",
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 6,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(233, 180, 76, 0.6)",
    marginTop: 6,
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    color: "rgba(234, 240, 255, 0.7)",
    lineHeight: 20,
  },
  featureBadge: {
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginTop: 1,
  },
  featureBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
});
