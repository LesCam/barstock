import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

export interface ActivityEvent {
  id: string;
  text: string;
  displayName: string;
  timestamp: number;
}

const AVATAR_COLORS = [
  "#2BA8A0", "#E9B44C", "#7C5CFC", "#EF4444",
  "#3B82F6", "#22C55E", "#F97316", "#EC4899",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatRelativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 10) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function SessionActivityFeed({ events }: { events: ActivityEvent[] }) {
  const [expanded, setExpanded] = useState(false);

  if (events.length === 0) return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <Text style={styles.headerText}>
          Activity ({events.length})
        </Text>
        <Text style={styles.chevron}>{expanded ? "▲" : "▼"}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.list}>
          {events.map((event) => {
            const color = getAvatarColor(event.displayName);
            return (
              <View key={event.id} style={styles.row}>
                <View style={[styles.avatar, { backgroundColor: color }]}>
                  <Text style={styles.avatarText}>
                    {event.displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.eventText} numberOfLines={1}>
                  {event.text}
                </Text>
                <Text style={styles.time}>
                  {formatRelativeTime(event.timestamp)}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#12293E",
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerText: {
    color: "#8899AA",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chevron: {
    color: "#5A6A7A",
    fontSize: 10,
  },
  list: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    gap: 8,
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  eventText: {
    flex: 1,
    color: "rgba(234,240,255,0.6)",
    fontSize: 12,
  },
  time: {
    color: "#5A6A7A",
    fontSize: 10,
  },
});
