import { useState, useEffect } from "react";
import {
  View,
  Text,
  Switch,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
import { useAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";

const RULE_CONFIG = [
  {
    key: "lowStock" as const,
    label: "Low Stock",
    description: "Alert when item count falls at or below threshold",
    unit: "units",
  },
  {
    key: "staleCountDays" as const,
    label: "Stale Counts",
    description: "Alert when items not counted within threshold days",
    unit: "days",
  },
  {
    key: "kegNearEmpty" as const,
    label: "Keg Near Empty",
    description: "Alert when keg remaining % drops below threshold",
    unit: "%",
  },
  {
    key: "variancePercent" as const,
    label: "High Variance",
    description: "Alert when item variance exceeds threshold %",
    unit: "%",
  },
  {
    key: "largeAdjustment" as const,
    label: "Large Adjustment",
    description: "Alert on session close when item variance exceeds threshold %",
    unit: "%",
  },
  {
    key: "loginFailures" as const,
    label: "Login Failures",
    description: "Alert after threshold consecutive failed login attempts",
    unit: "attempts",
  },
  {
    key: "shrinkagePattern" as const,
    label: "Shrinkage Pattern",
    description: "Alert when item shows negative variance in threshold+ sessions",
    unit: "sessions",
  },
  {
    key: "parReorderAlert" as const,
    label: "Par / Reorder",
    description: "Alert when items hit min level or will stockout within threshold days",
    unit: "days",
  },
] as const;

type RuleKey = (typeof RULE_CONFIG)[number]["key"];
type RulesState = Record<RuleKey, { enabled: boolean; threshold: number; lastTriggeredAt?: string }>;

function formatTimeAgo(dateStr: string | undefined): string {
  if (!dateStr) return "Never";
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (secs < 60) return "Just now";
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function AlertSettingsScreen() {
  const { user } = useAuth();
  const businessId = user?.businessId ?? "";
  const utils = trpc.useUtils();

  const { data: settings, isLoading } = trpc.settings.get.useQuery(
    { businessId },
    { enabled: !!businessId },
  );

  const updateMutation = trpc.settings.update.useMutation({
    onSuccess: () => {
      utils.settings.get.invalidate({ businessId });
      utils.settings.alertRules.invalidate({ businessId });
    },
    onError: (err) => {
      Alert.alert("Error", err.message);
    },
  });

  const [localRules, setLocalRules] = useState<RulesState | null>(null);
  const lastAlertEvaluation = (settings as any)?.lastAlertEvaluation as string | undefined;

  useEffect(() => {
    if (settings?.alertRules && !localRules) {
      const rules = settings.alertRules as Record<
        string,
        { enabled: boolean; threshold: number; lastTriggeredAt?: string }
      >;
      const initial = {} as RulesState;
      for (const cfg of RULE_CONFIG) {
        initial[cfg.key] = {
          enabled: rules[cfg.key]?.enabled ?? false,
          threshold: rules[cfg.key]?.threshold ?? 0,
          lastTriggeredAt: rules[cfg.key]?.lastTriggeredAt,
        };
      }
      setLocalRules(initial);
    }
  }, [settings, localRules]);

  const hasChanges = (() => {
    if (!localRules || !settings?.alertRules) return false;
    const remote = settings.alertRules as Record<
      string,
      { enabled: boolean; threshold: number }
    >;
    for (const cfg of RULE_CONFIG) {
      const l = localRules[cfg.key];
      const r = remote[cfg.key];
      if (l.enabled !== r?.enabled || l.threshold !== r?.threshold) return true;
    }
    return false;
  })();

  const handleSave = () => {
    if (!localRules) return;
    updateMutation.mutate({
      businessId,
      alertRules: localRules,
    });
  };

  const updateRule = (key: RuleKey, field: "enabled" | "threshold", value: boolean | number) => {
    setLocalRules((prev) => {
      if (!prev) return prev;
      return { ...prev, [key]: { ...prev[key], [field]: value } };
    });
  };

  if (isLoading || !localRules) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#E9B44C" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.evalTimestamp}>
        Last evaluation: {formatTimeAgo(lastAlertEvaluation)}
      </Text>
      {RULE_CONFIG.map((cfg) => {
        const rule = localRules[cfg.key];
        return (
          <View key={cfg.key} style={styles.card}>
            <View style={styles.headerRow}>
              <View style={styles.labelCol}>
                <Text style={styles.ruleLabel}>{cfg.label}</Text>
                <Text style={styles.ruleDesc}>{cfg.description}</Text>
                <Text style={styles.lastTriggered}>
                  Last triggered: {formatTimeAgo(rule.lastTriggeredAt)}
                </Text>
              </View>
              <Switch
                value={rule.enabled}
                onValueChange={(v) => updateRule(cfg.key, "enabled", v)}
                trackColor={{ false: "#1E3550", true: "#E9B44C" }}
                thumbColor="#EAF0FF"
              />
            </View>
            {rule.enabled && (
              <View style={styles.thresholdRow}>
                <Text style={styles.thresholdLabel}>Threshold</Text>
                <View style={styles.inputGroup}>
                  <TextInput
                    style={styles.thresholdInput}
                    value={String(rule.threshold)}
                    onChangeText={(text) => {
                      const n = parseFloat(text);
                      if (!isNaN(n)) updateRule(cfg.key, "threshold", n);
                      else if (text === "") updateRule(cfg.key, "threshold", 0);
                    }}
                    keyboardType="numeric"
                    placeholderTextColor="#5A6A7A"
                  />
                  <Text style={styles.unitLabel}>{cfg.unit}</Text>
                </View>
              </View>
            )}
          </View>
        );
      })}

      {hasChanges && (
        <TouchableOpacity
          style={[styles.saveBtn, updateMutation.isPending && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={updateMutation.isPending}
        >
          {updateMutation.isPending ? (
            <ActivityIndicator size="small" color="#0B1623" />
          ) : (
            <Text style={styles.saveBtnText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623" },
  content: { padding: 16, paddingBottom: 32 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0B1623",
  },
  card: {
    backgroundColor: "#16283F",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1E3550",
    padding: 16,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  labelCol: { flex: 1, marginRight: 12 },
  ruleLabel: { fontSize: 15, fontWeight: "600", color: "#EAF0FF" },
  ruleDesc: { fontSize: 12, color: "#5A6A7A", marginTop: 2 },
  lastTriggered: { fontSize: 11, color: "#3A4A5A", marginTop: 2 },
  evalTimestamp: { fontSize: 12, color: "#3A4A5A", marginBottom: 12 },
  thresholdRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#1E3550",
  },
  thresholdLabel: { fontSize: 13, color: "#5A6A7A" },
  inputGroup: { flexDirection: "row", alignItems: "center", gap: 6 },
  thresholdInput: {
    backgroundColor: "#0B1623",
    borderWidth: 1,
    borderColor: "#1E3550",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: "#EAF0FF",
    fontSize: 15,
    fontWeight: "600",
    minWidth: 70,
    textAlign: "center",
  },
  unitLabel: { fontSize: 13, color: "#5A6A7A" },
  saveBtn: {
    backgroundColor: "#E9B44C",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 15, fontWeight: "700", color: "#0B1623" },
});
