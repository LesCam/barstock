import { View, Text, TouchableOpacity } from "react-native";
import { Tabs, router } from "expo-router";
import { useAuth, usePermission } from "@/lib/auth-context";
import LocationPicker from "@/components/LocationPicker";
import { NotificationBell } from "@/components/NotificationBell";
import { VoiceButton } from "@/components/VoiceButton";
import { trpc } from "@/lib/trpc";
import { VoicePreferenceProvider, useVoicePreference } from "@/lib/voice-preference";

function TabsLayout() {
  const { user, selectedLocationId } = useAuth();
  const { data: capabilities } = trpc.settings.capabilities.useQuery(
    { businessId: user?.businessId ?? "" },
    { enabled: !!user?.businessId, staleTime: 5 * 60 * 1000 }
  );

  // Hooks must be called before early returns (Rules of Hooks)
  const canAccessSessions = usePermission("canAccessSessions");
  const canAccessArt = usePermission("canAccessArt");
  const canAccessInventory = usePermission("canAccessInventory");
  const canAccessGuide = usePermission("canAccessGuide");

  const { voiceUserEnabled } = useVoicePreference();

  // Multi-location user without a selection — show picker instead of tabs
  if (user && user.locationIds.length > 1 && !selectedLocationId) {
    return <LocationPicker />;
  }

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: "#0B1623" },
          headerTintColor: "#EAF0FF",
          headerTitleStyle: { fontWeight: "600" },
          tabBarStyle: { backgroundColor: "#0B1623", borderTopColor: "#1E3550" },
          tabBarActiveTintColor: "#E9B44C",
          tabBarInactiveTintColor: "#5A6A7A",
          headerRight: () => <NotificationBell />,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Sessions",
            tabBarLabel: "Sessions",
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 22, color }}>📋</Text>
            ),
            href: canAccessSessions ? undefined : null,
          }}
        />
        <Tabs.Screen
          name="art"
          options={{
            title: "Art",
            tabBarLabel: "Art",
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 22, color }}>🎨</Text>
            ),
            href: canAccessArt ? undefined : null,
          }}
        />
        <Tabs.Screen
          name="inventory"
          options={{
            title: "Inventory",
            tabBarLabel: "Inventory",
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 22, color }}>🍾</Text>
            ),
            href: canAccessInventory ? undefined : null,
          }}
        />
        <Tabs.Screen
          name="guide"
          options={{
            title: "Product Guide",
            tabBarLabel: "Guide",
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 22, color }}>🍸</Text>
            ),
            headerRight: () => (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <TouchableOpacity
                  onPress={() => router.push("/guide/qr")}
                  style={{ marginRight: 12, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: "#E9B44C" }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: "#E9B44C" }}>QR</Text>
                </TouchableOpacity>
                <NotificationBell />
              </View>
            ),
            href: canAccessGuide ? undefined : null,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: "Settings",
            tabBarLabel: "Settings",
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 22, color }}>⚙️</Text>
            ),
          }}
        />
      </Tabs>
      {capabilities?.voiceCommandsEnabled && voiceUserEnabled && <VoiceButton />}
    </View>
  );
}

function TabsLayoutWrapper() {
  return (
    <VoicePreferenceProvider>
      <TabsLayout />
    </VoicePreferenceProvider>
  );
}

export default TabsLayoutWrapper;
