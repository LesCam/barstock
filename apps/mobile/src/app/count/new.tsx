import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";

type CountMethod = "liquor" | "packaged" | "draft";

const METHODS = [
  {
    key: "liquor" as CountMethod,
    icon: "🥃",
    title: "Partial Count",
    subtitle: "By Weighing",
    accent: "#E9B44C",
  },
  {
    key: "packaged" as CountMethod,
    icon: "📦",
    title: "Full Container Count",
    subtitle: "Count full units",
    accent: "#4CAF50",
  },
  {
    key: "draft" as CountMethod,
    icon: "🍺",
    title: "Draft Tap Verify",
    subtitle: "Verify keg levels on tap",
    accent: "#42A5F5",
  },
] as const;

export default function NewCountScreen() {
  const { selectedLocationId } = useAuth();
  const [creating, setCreating] = useState<CountMethod | null>(null);

  const createSession = trpc.sessions.create.useMutation();

  const { data: openSessions } = trpc.sessions.list.useQuery(
    { locationId: selectedLocationId!, openOnly: true },
    { enabled: !!selectedLocationId }
  );

  const handleSelect = async (method: CountMethod) => {
    if (creating || !selectedLocationId) return;
    setCreating(method);
    try {
      const session = await createSession.mutateAsync({
        locationId: selectedLocationId,
        sessionType: "shift",
        startedTs: new Date(),
      });
      const route = method === "liquor"
        ? `/session/${session.id}/connect-scale`
        : `/session/${session.id}/${method}`;
      router.replace(route);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Failed to create session");
    } finally {
      setCreating(null);
    }
  };

  const disabled = creating !== null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Select Count Method</Text>

      <View style={styles.topRow}>
        {METHODS.slice(0, 2).map((m) => (
          <TouchableOpacity
            key={m.key}
            style={[styles.card, styles.halfCard, disabled && styles.cardDisabled]}
            activeOpacity={0.7}
            disabled={disabled}
            onPress={() => handleSelect(m.key)}
          >
            <View style={[styles.accentBar, { backgroundColor: m.accent }]} />
            <View style={styles.cardContent}>
              <Text style={styles.cardIcon}>{m.icon}</Text>
              <Text style={styles.cardTitle}>{m.title}</Text>
              <Text style={styles.cardSubtitle}>{m.subtitle}</Text>
              {creating === m.key && (
                <ActivityIndicator style={styles.spinner} color={m.accent} />
              )}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {(() => {
        const m = METHODS[2];
        return (
          <TouchableOpacity
            style={[styles.card, styles.fullCard, disabled && styles.cardDisabled]}
            activeOpacity={0.7}
            disabled={disabled}
            onPress={() => handleSelect(m.key)}
          >
            <View style={[styles.accentBar, { backgroundColor: m.accent }]} />
            <View style={styles.cardContent}>
              <Text style={styles.cardIcon}>{m.icon}</Text>
              <Text style={styles.cardTitle}>{m.title}</Text>
              <Text style={styles.cardSubtitle}>{m.subtitle}</Text>
              {creating === m.key && (
                <ActivityIndicator style={styles.spinner} color={m.accent} />
              )}
            </View>
          </TouchableOpacity>
        );
      })()}

      {openSessions && openSessions.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 32 }]}>
            Open Session
          </Text>
          <Text style={styles.openWarning}>
            Starting a new count will close the open session below.
          </Text>
          {openSessions.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={styles.resumeCard}
              activeOpacity={0.7}
              onPress={() => router.push(`/session/${s.id}`)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.resumeType}>{s.sessionType}</Text>
                <Text style={styles.resumeDate}>
                  {new Date(s.startedTs).toLocaleString()}
                </Text>
                <Text style={styles.resumeCount}>
                  {s._count.lines} items counted
                </Text>
              </View>
              <Text style={styles.resumeArrow}>Resume &gt;</Text>
            </TouchableOpacity>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623" },
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#8899B2",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  topRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  card: {
    backgroundColor: "#152238",
    borderRadius: 12,
    overflow: "hidden",
    flexDirection: "row",
  },
  halfCard: {
    flex: 1,
    minHeight: 140,
  },
  fullCard: {
    minHeight: 100,
  },
  cardDisabled: {
    opacity: 0.5,
  },
  accentBar: {
    width: 5,
  },
  cardContent: {
    flex: 1,
    padding: 16,
    justifyContent: "center",
  },
  cardIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#EAF0FF",
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 13,
    color: "#8899B2",
  },
  spinner: {
    marginTop: 10,
    alignSelf: "flex-start",
  },
  resumeCard: {
    backgroundColor: "#152238",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  resumeType: {
    fontSize: 15,
    fontWeight: "600",
    color: "#EAF0FF",
    textTransform: "capitalize",
  },
  resumeDate: {
    fontSize: 12,
    color: "#8899B2",
    marginTop: 2,
  },
  resumeCount: {
    fontSize: 13,
    color: "#6B7FA0",
    marginTop: 2,
  },
  resumeArrow: {
    fontSize: 14,
    fontWeight: "600",
    color: "#42A5F5",
  },
  openWarning: {
    fontSize: 13,
    color: "#E9B44C",
    marginBottom: 12,
  },
});
