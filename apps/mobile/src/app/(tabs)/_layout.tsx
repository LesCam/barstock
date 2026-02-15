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
    <Tabs>
      <Tabs.Screen
        name="index"
        options={{ title: "Sessions", tabBarLabel: "Sessions" }}
      />
      <Tabs.Screen
        name="inventory"
        options={{ title: "Inventory", tabBarLabel: "Inventory" }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: "Settings", tabBarLabel: "Settings" }}
      />
    </Tabs>
  );
}
