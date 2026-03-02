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
import { useNetwork } from "@/lib/network-context";
import type { VarianceReason } from "@barstock/types";

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
  const { isOnline } = useNetwork();
  const [creating, setCreating] = useState<CountMethod | null>(null);

  const utils = trpc.useUtils();
  const createSession = trpc.sessions.create.useMutation();
  const closeMutation = trpc.sessions.close.useMutation({
    onSuccess() {
      Alert.alert("Session Closed", "Adjustments have been created.");
      utils.sessions.list.invalidate();
    },
    onError(error: { message: string }) {
      Alert.alert("Error", error.message);
    },
  });

  const { data: openSessions } = trpc.sessions.list.useQuery(
    { locationId: selectedLocationId!, openOnly: true },
    { enabled: !!selectedLocationId, refetchOnMount: "always" }
  );

  const handleSelect = async (_method: CountMethod) => {
    if (creating || !selectedLocationId) return;
    if (!isOnline) {
      Alert.alert("Offline", "Cannot start a new session while offline. Please reconnect first.");
      return;
    }
    setCreating(_method);
    try {
      const session = await createSession.mutateAsync({
        locationId: selectedLocationId,
        sessionType: "shift",
        startedTs: new Date(),
      });
      // Navigate to session detail — user picks area there before counting
      router.push(`/session/${session.id}`);
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

      <UpcomingAssignments />

      {openSessions && openSessions.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 32 }]}>
            Open Session
          </Text>
          <Text style={styles.openWarning}>
            Starting a new count will close the open session below.
          </Text>
          {openSessions.map((s: any) => (
            <View key={s.id} style={styles.resumeCard}>
              <TouchableOpacity
                style={{ flex: 1 }}
                activeOpacity={0.7}
                onPress={() => router.push(`/session/${s.id}`)}
              >
                <Text style={styles.resumeType}>
                  {s.sessionType === "receiving" ? "Receiving" : "Inventory Count"}
                </Text>
                <Text style={styles.resumeDate}>
                  {new Date(s.startedTs).toLocaleString()}
                </Text>
                <Text style={styles.resumeCount}>
                  {s._count.lines} items counted
                </Text>
              </TouchableOpacity>
              <View style={styles.resumeActions}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => router.push(`/session/${s.id}`)}
                >
                  <Text style={styles.resumeArrow}>Resume</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.7}
                  disabled={closeMutation.isPending}
                  onPress={() => {
                    if (!isOnline) {
                      Alert.alert("Offline", "Cannot close a session while offline. Please reconnect first.");
                      return;
                    }
                    Alert.alert(
                      "Close Session",
                      `Close this session with ${s._count.lines} items counted?`,
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Close",
                          style: "destructive",
                          onPress: () => closeMutation.mutate({ sessionId: s.id }),
                        },
                      ]
                    )
                  }}
                >
                  <Text style={styles.closeText}>
                    {closeMutation.isPending ? "Closing..." : "Close"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function UpcomingAssignments() {
  const { data: assignments } = trpc.sessions.myUpcomingAssignments.useQuery();
  const respondMut = trpc.sessions.respondAssignment.useMutation();
  const utils = trpc.useUtils();

  if (!assignments || assignments.length === 0) return null;

  return (
    <>
      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
        Upcoming Assignments
      </Text>
      {assignments.map((a: any) => (
        <View key={a.id} style={styles.assignmentCard}>
          <View style={[styles.accentBar, { backgroundColor: "#7C5CFC" }]} />
          <View style={styles.assignmentContent}>
            <Text style={styles.assignmentType}>
              {a.session.sessionType.charAt(0).toUpperCase() + a.session.sessionType.slice(1)} Session
            </Text>
            <Text style={styles.assignmentDate}>
              {a.session.plannedAt
                ? new Date(a.session.plannedAt).toLocaleString()
                : new Date(a.session.startedTs).toLocaleString()}
            </Text>
            {a.subArea && (
              <Text style={styles.assignmentArea}>
                Area: {a.subArea.barArea?.name} / {a.subArea.name}
              </Text>
            )}
            {a.focusItems?.length > 0 && (
              <Text style={styles.assignmentFocus}>
                {a.focusItems.length} focus item(s)
              </Text>
            )}
            <View style={styles.assignmentActions}>
              {a.status === "assigned" && (
                <>
                  <TouchableOpacity
                    onPress={() => {
                      respondMut.mutate(
                        { assignmentId: a.id, response: "accepted" },
                        { onSuccess: () => utils.sessions.myUpcomingAssignments.invalidate() }
                      );
                    }}
                    disabled={respondMut.isPending}
                  >
                    <Text style={styles.acceptText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      respondMut.mutate(
                        { assignmentId: a.id, response: "declined" },
                        { onSuccess: () => utils.sessions.myUpcomingAssignments.invalidate() }
                      );
                    }}
                    disabled={respondMut.isPending}
                  >
                    <Text style={styles.declineText}>Decline</Text>
                  </TouchableOpacity>
                </>
              )}
              {a.status === "accepted" && (
                <TouchableOpacity
                  onPress={() => router.push(`/session/${a.session.id}`)}
                >
                  <Text style={styles.startText}>Start</Text>
                </TouchableOpacity>
              )}
              <Text style={styles.statusBadge}>
                {a.status}
              </Text>
            </View>
          </View>
        </View>
      ))}
    </>
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
  resumeActions: {
    alignItems: "flex-end",
    gap: 12,
    marginLeft: 12,
  },
  resumeArrow: {
    fontSize: 14,
    fontWeight: "600",
    color: "#42A5F5",
  },
  closeText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#dc2626",
  },
  openWarning: {
    fontSize: 13,
    color: "#E9B44C",
    marginBottom: 12,
  },
  assignmentCard: {
    backgroundColor: "#152238",
    borderRadius: 12,
    overflow: "hidden",
    flexDirection: "row",
    marginBottom: 10,
  },
  assignmentContent: {
    flex: 1,
    padding: 16,
  },
  assignmentType: {
    fontSize: 15,
    fontWeight: "600",
    color: "#EAF0FF",
  },
  assignmentDate: {
    fontSize: 12,
    color: "#8899B2",
    marginTop: 2,
  },
  assignmentArea: {
    fontSize: 13,
    color: "#7C5CFC",
    marginTop: 4,
  },
  assignmentFocus: {
    fontSize: 12,
    color: "#6B7FA0",
    marginTop: 2,
  },
  assignmentActions: {
    flexDirection: "row",
    gap: 16,
    marginTop: 10,
    alignItems: "center",
  },
  acceptText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4CAF50",
  },
  declineText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#dc2626",
  },
  startText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#42A5F5",
  },
  statusBadge: {
    fontSize: 11,
    color: "#8899B2",
    textTransform: "capitalize",
    marginLeft: "auto",
  },
});
