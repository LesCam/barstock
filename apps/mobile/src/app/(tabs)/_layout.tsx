import { Tabs } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import LocationPicker from "@/components/LocationPicker";

export default function TabsLayout() {
  const { user, selectedLocationId } = useAuth();

  // Multi-location user without a selection — show picker instead of tabs
  if (user && user.locationIds.length > 1 && !selectedLocationId) {
    return <LocationPicker />;
  }

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: "#0B1623" },
        headerTintColor: "#EAF0FF",
        headerTitleStyle: { fontWeight: "600" },
        tabBarStyle: { backgroundColor: "#0B1623", borderTopColor: "#1E3550" },
        tabBarActiveTintColor: "#E9B44C",
        tabBarInactiveTintColor: "#5A6A7A",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Sessions", tabBarLabel: "Sessions" }}
      />
      <Tabs.Screen
        name="inventory"
        options={{ title: "Inventory", tabBarLabel: "Inventory" }}
      />
      <Tabs.Screen
        name="guide"
        options={{ title: "Product Guide", tabBarLabel: "Guide" }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: "Settings", tabBarLabel: "Settings" }}
      />
    </Tabs>
  );
}
